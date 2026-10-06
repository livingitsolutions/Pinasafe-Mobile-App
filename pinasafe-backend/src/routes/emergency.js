const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../config/database');
const { authenticateToken, requireRole, canAccessOrganization } = require('../middleware/auth');
const {
  validateEmergencyReport,
  validateEmergencyStatusUpdate,
  validateTeamAssignment,
  validateUUID,
  validatePagination
} = require('../middleware/validation');
const {
  EmergencyReportBindingError,
  createEmergencyReportWithEvidence
} = require('../services/emergencyReportBindingService');
const clusteringService = require('../services/incidentClusteringService');
const safeLogger = require('../utils/safeLogger');

const router = express.Router();
const BINDING_ERROR_RESPONSES = {
  INVALID_REPORT: [400, 'Invalid emergency report or evidence'],
  INVALID_REPORT_ID: [400, 'Invalid emergency report or evidence'],
  INVALID_REPORTER_ID: [400, 'Invalid emergency report or evidence'],
  INVALID_CLASSIFICATION: [400, 'Invalid emergency report or evidence'],
  CLASSIFICATION_MISMATCH: [400, 'Invalid emergency report or evidence'],
  PRIMARY_EVIDENCE_INVALID: [400, 'A valid primary evidence image is required'],
  SUPPLEMENTARY_EVIDENCE_INVALID: [400, 'Supplementary evidence is invalid'],
  EVIDENCE_CAPACITY_INVALID: [400, 'Invalid emergency report or evidence'],
  SESSION_UNAVAILABLE: [404, 'Evidence upload session unavailable'],
  SESSION_EXPIRED: [409, 'Emergency report conflicts with evidence session'],
  SESSION_ALREADY_BOUND: [409, 'Emergency report conflicts with evidence session'],
  UPLOAD_IN_PROGRESS: [409, 'Emergency report conflicts with evidence session'],
  EXPIRED_EVIDENCE_PRESENT: [409, 'Emergency report conflicts with evidence session'],
  EVIDENCE_OWNER_MISMATCH: [409, 'Emergency report conflicts with evidence session'],
  EVIDENCE_ALREADY_BOUND: [409, 'Emergency report conflicts with evidence session'],
  NO_ACCEPTED_EVIDENCE: [409, 'Emergency report conflicts with evidence session'],
  REPORT_ID_CONFLICT: [409, 'Emergency report conflicts with evidence session']
};
const REPORT_FETCH_ATTEMPTS = 3;
const DECIMAL_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

const normalizeCoordinate = (value, minimum, maximum) => {
  let coordinate;

  if (typeof value === 'number') {
    coordinate = value;
  } else if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (!trimmedValue || !DECIMAL_NUMBER_PATTERN.test(trimmedValue)) return null;
    coordinate = Number(trimmedValue);
  } else {
    return null;
  }

  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null;
};

const formatEmergencyReport = (report) => {
  const latitude = normalizeCoordinate(report.latitude, -90, 90);
  const longitude = normalizeCoordinate(report.longitude, -180, 180);

  return {
    ...report,
    coordinates: latitude !== null && longitude !== null
      ? { latitude, longitude }
      : null
  };
};

const fetchPersistedReport = async (reportId) => {
  for (let attempt = 0; attempt < REPORT_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const { data, error } = await getClient()
        .from('emergency_reports')
        .select('*')
        .eq('id', reportId)
        .maybeSingle();

      if (!error && data) return data;
    } catch (error) {
      // Retry this read only; report creation has already completed.
    }
  }

  return null;
};

const getBoundReportId = async (uploadSessionId, reporterId) => {
  try {
    const { data, error } = await getClient()
      .from('evidence_upload_sessions')
      .select('emergency_report_id')
      .eq('id', uploadSessionId)
      .eq('owner_user_id', reporterId)
      .maybeSingle();

    return error ? null : data?.emergency_report_id || null;
  } catch (error) {
    return null;
  }
};

router.get('/', authenticateToken, validatePagination, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, priority } = req.query;
    const offset = (page - 1) * limit;
    const { user } = req;
    const supabase = getClient();

    let reports = [];

    if (user.role === 'citizen') {
      const { data, error } = await supabase
        .from('emergency_reports')
        .select(`
          *,
          reporter:users!reported_by(name, phone),
          responder:users!responder_id(name),
          assigned_team:rescue_teams(
            id,
            name,
            team_leader:users!team_leader_id(id, name)
          )
        `)
        .eq('reported_by', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + parseInt(limit) - 1);

      if (error) {
        safeLogger.error('emergency.reports_list_failed');
        return res.status(500).json({ error: 'Failed to fetch emergency reports' });
      }
      reports = data || [];
    } else if (user.role === 'super_admin') {
      const { data, error } = await supabase
        .from('emergency_reports')
        .select(`
          *,
          reporter:users!reported_by(name, phone),
          responder:users!responder_id(name)
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + parseInt(limit) - 1);

      if (error) {
        safeLogger.error('emergency.reports_list_failed');
        return res.status(500).json({ error: 'Failed to fetch emergency reports' });
      }
      reports = data || [];
    } else if (user.role === 'responder' || user.role === 'admin') {
      if (!user.organization_id) {
        return res.status(400).json({ error: 'User not assigned to an organization' });
      }

      // Filter reports by organization_id directly
      const { data, error } = await supabase
        .from('emergency_reports')
        .select(`
          *,
          reporter:users!reported_by(name, phone),
          responder:users!responder_id(name),
          organization:organizations(id, name, type),
          assigned_team:rescue_teams(
            id,
            name,
            team_leader:users!team_leader_id(id, name)
          )
        `)
        .eq('organization_id', user.organization_id)
        .order('created_at', { ascending: false })
        .range(offset, offset + parseInt(limit) - 1);

      if (error) {
        safeLogger.error('emergency.organization_reports_list_failed');
        return res.status(500).json({ error: 'Failed to fetch organization reports' });
      }

      reports = data || [];
    }

    let filteredReports = reports;
    if (status) {
      filteredReports = filteredReports.filter(r => r.status === status);
    }
    if (type) {
      filteredReports = filteredReports.filter(r => r.type === type);
    }
    if (priority) {
      filteredReports = filteredReports.filter(r => r.priority === priority);
    }

    const formattedReports = filteredReports.map(report => formatEmergencyReport({
      ...report,
      reporter_name: report.reporter?.name,
      reporter_phone: report.reporter?.phone,
      responder_name: report.responder?.name,
      reporter: undefined,
      responder: undefined
    }));

    res.json({
      data: formattedReports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: formattedReports.length
      }
    });

  } catch (error) {
    safeLogger.error('emergency.reports_list_failed');
    res.status(500).json({ error: 'Failed to fetch emergency reports' });
  }
});

router.post('/', authenticateToken, validateEmergencyReport, async (req, res) => {
  try {
    const {
      type,
      description,
      location,
      coordinates,
      contactNumber,
      priority,
      evidence,
      aiClassification,
      useAIClassification,
      uploadSessionId
    } = req.body;

    const reportId = uuidv4();
    const normalizedUploadSessionId = uploadSessionId || null;
    const result = await createEmergencyReportWithEvidence({
      type,
      description,
      location,
      coordinates,
      contactNumber,
      priority,
      uploadSessionId: normalizedUploadSessionId,
      evidencePhotos: normalizedUploadSessionId ? [] : (evidence?.photos || []),
      aiClassification,
      useAIClassification
    }, req.user.id, reportId);

    let report = await fetchPersistedReport(reportId);

    if (!report && normalizedUploadSessionId) {
      const boundReportId = await getBoundReportId(normalizedUploadSessionId, req.user.id);
      if (boundReportId === reportId) {
        report = await fetchPersistedReport(boundReportId);
      }
    }

    if (!report) {
      safeLogger.error('emergency.report_create_failed');
      return res.status(500).json({ error: 'Failed to create emergency report' });
    }

    if (
      (result.outcome === 'CREATED' || result.outcome === 'REPLAYED')
      && !report.cluster_id
    ) {
      try {
        const existingClusterId = await clusteringService.findMatchingCluster(report);

        if (existingClusterId) {
          await clusteringService.addToCluster(
            existingClusterId,
            report.id,
            req.user.id,
            report.organization_id
          );
          report.cluster_id = existingClusterId;

          await clusteringService.notifyClusterSubscribers(
            existingClusterId,
            `New ${type} incident reported in ${location}`,
            'pending',
            req.user.id,
            report.organization_id
          );
        } else {
          const clusterId = await clusteringService.createCluster(
            report.id,
            req.user.id,
            report.organization_id
          );
          report.cluster_id = clusterId;
        }
      } catch (clusterError) {
        safeLogger.error(clusterError.code === 'assignment_conflict'
          ? 'emergency.report_clustering_assignment_conflict'
          : 'emergency.report_clustering_failed');
      }
    }

    res.status(201).json({
      message: 'Emergency report created successfully',
      data: formatEmergencyReport(report)
    });

  } catch (error) {
    if (error instanceof EmergencyReportBindingError) {
      const [status, message] = BINDING_ERROR_RESPONSES[error.code] || [
        500,
        'Failed to create emergency report'
      ];
      safeLogger.error('emergency.report_create_failed');
      return res.status(status).json({ error: message });
    }

    safeLogger.error('emergency.report_create_failed');
    res.status(500).json({ error: 'Failed to create emergency report' });
  }
});

// Operational transitions allowed through PUT /:id, keyed by current status.
const OPERATIONAL_TRANSITIONS = {
  dispatched: 'responding',
  responding: 'resolved'
};

router.put('/:id', authenticateToken, requireRole(['responder']), validateUUID('id'), validateEmergencyStatusUpdate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const { user } = req;
    const supabase = getClient();

    if (!user.organization_id) {
      return res.status(400).json({ error: 'User not assigned to an organization' });
    }

    const { data: existingReport, error: fetchError } = await supabase
      .from('emergency_reports')
      .select('id, organization_id, assigned_team_id, status, responder_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !existingReport) {
      return res.status(404).json({ error: 'Emergency report not found' });
    }

    if (!existingReport.assigned_team_id) {
      return res.status(404).json({ error: 'Emergency report has no assigned team' });
    }

    if (!canAccessOrganization(user, existingReport.organization_id)) {
      return res.status(403).json({ error: 'Access denied for this organization' });
    }

    const { data: team, error: teamError } = await supabase
      .from('rescue_teams')
      .select('id, organization_id, team_leader_id')
      .eq('id', existingReport.assigned_team_id)
      .maybeSingle();

    if (teamError || !team || !canAccessOrganization(user, team.organization_id)) {
      return res.status(403).json({ error: 'Assigned team is not in your organization' });
    }

    const { data: membership } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', existingReport.assigned_team_id)
      .eq('user_id', user.id)
      .maybeSingle();

    const isAuthorized = Boolean(membership) || team.team_leader_id === user.id;

    if (!isAuthorized) {
      return res.status(403).json({ error: 'You are not a member of the assigned team' });
    }

    const expectedPreviousStatus = existingReport.status;
    if (OPERATIONAL_TRANSITIONS[expectedPreviousStatus] !== status) {
      return res.status(409).json({ error: `Invalid status transition from ${expectedPreviousStatus} to ${status}` });
    }

    const updateData = {
      status,
      notes: notes ?? null,
      updated_at: new Date().toISOString()
    };

    if (expectedPreviousStatus === 'dispatched') {
      updateData.responder_id = user.id;
    } else {
      if (!existingReport.responder_id) {
        return res.status(409).json({ error: 'Report has no assigned responder to resolve' });
      }
      updateData.resolved_at = new Date().toISOString();
    }

    const { data: updatedReport, error } = await supabase
      .from('emergency_reports')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', user.organization_id)
      .eq('assigned_team_id', existingReport.assigned_team_id)
      .eq('status', expectedPreviousStatus)
      .select()
      .maybeSingle();

    if (error || !updatedReport) {
      return res.status(409).json({ error: 'Emergency report state changed; please retry' });
    }

    if (updatedReport.cluster_id) {
      try {
        await clusteringService.notifyClusterSubscribers(
          updatedReport.cluster_id,
          notes || `Incident status updated to ${status}`,
          status,
          req.user.id,
          updatedReport.organization_id
        );
      } catch (notifyError) {
        safeLogger.error('emergency.cluster_notification_failed');
      }
    }

    res.json({
      message: 'Emergency report updated successfully',
      data: formatEmergencyReport(updatedReport)
    });

  } catch (error) {
    safeLogger.error('emergency.report_update_failed');
    res.status(500).json({ error: 'Failed to update emergency report' });
  }
});

// Assign team to emergency report (admin only, pending reports only)
router.post('/:id/assign-team', authenticateToken, requireRole(['admin']), validateUUID('id'), validateTeamAssignment, async (req, res) => {
  try {
    const { id } = req.params;
    const { teamId } = req.body;
    const { user } = req;
    const supabase = getClient();

    if (!user.organization_id) {
      return res.status(400).json({ error: 'User not assigned to an organization' });
    }

    const { data: existingReport, error: fetchError } = await supabase
      .from('emergency_reports')
      .select('id, organization_id, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !existingReport) {
      return res.status(404).json({ error: 'Emergency report not found' });
    }

    if (!canAccessOrganization(user, existingReport.organization_id)) {
      return res.status(403).json({ error: 'Access denied for this organization' });
    }

    if (existingReport.status !== 'pending') {
      return res.status(409).json({ error: 'Emergency report is not pending assignment' });
    }

    // Verify the team exists, is active, and belongs to the admin's organization
    const { data: team, error: teamError } = await supabase
      .from('rescue_teams')
      .select('id, name, team_leader:users!team_leader_id(id, name)')
      .eq('id', teamId)
      .eq('organization_id', user.organization_id)
      .eq('is_active', true)
      .maybeSingle();

    if (teamError || !team) {
      return res.status(404).json({ error: 'Team not found or not in your organization' });
    }

    const { data: eligibleMembers, error: memberError } = await supabase
      .from('personnel')
      .select('id')
      .eq('organization_id', user.organization_id)
      .eq('personnel_role', 'rescue_member')
      .eq('is_active', true)
      .eq('team_id', teamId)
      .limit(1);

    if (memberError || !eligibleMembers || eligibleMembers.length === 0) {
      return res.status(409).json({ error: 'Team has no active rescue members available for dispatch' });
    }

    const { data: assignment, error } = await supabase.rpc(
      'assign_emergency_report_team_atomic',
      {
        p_report_id: id,
        p_team_id: teamId,
        p_organization_id: user.organization_id,
        p_assigned_by: user.id
      }
    );

    if (error || !assignment || typeof assignment.status !== 'string') {
      safeLogger.error('emergency.team_assignment_failed');
      return res.status(500).json({ error: 'Failed to assign team' });
    }

    if (assignment.status === 'operational_assignment_exists') {
      return res.status(409).json({
        error: 'A response team is already assigned to this operational incident'
      });
    }
    if (assignment.status === 'report_not_pending') {
      return res.status(409).json({ error: 'Emergency report is no longer pending assignment' });
    }
    if (assignment.status === 'team_unavailable') {
      return res.status(404).json({ error: 'Team not found or not in your organization' });
    }
    if (assignment.status === 'team_not_ready') {
      return res.status(409).json({ error: 'Team has no active rescue members available for dispatch' });
    }
    if (assignment.status === 'organization_mismatch') {
      return res.status(403).json({ error: 'Access denied for this organization' });
    }
    if (assignment.status === 'not_found') {
      return res.status(404).json({ error: 'Emergency report not found' });
    }
    if (assignment.status !== 'assigned' || !assignment.report) {
      safeLogger.error('emergency.team_assignment_failed');
      return res.status(500).json({ error: 'Failed to assign team' });
    }

    const updatedReport = {
      ...assignment.report,
      assigned_team: team
    };
    res.json({
      message: 'Team assigned successfully',
      data: formatEmergencyReport(updatedReport)
    });

  } catch (error) {
    safeLogger.error('emergency.team_assignment_failed');
    res.status(500).json({ error: 'Failed to assign team' });
  }
});

router.get('/:id', authenticateToken, validateUUID('id'), async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req;
    const supabase = getClient();

    let query = supabase
      .from('emergency_reports')
      .select(`
        *,
        reporter:users!reported_by(name, phone),
        responder:users!responder_id(name)
      `)
      .eq('id', id);

    if (user.role === 'citizen') {
      query = query.eq('reported_by', user.id);
    }

    const { data: report, error } = await query.maybeSingle();

    if (!report) {
      return res.status(404).json({ error: 'Emergency report not found' });
    }

    if (user.role !== 'citizen') {
      if (!user.organization_id) {
        return res.status(400).json({ error: 'User not assigned to an organization' });
      }

      if (!canAccessOrganization(user, report.organization_id)) {
        return res.status(403).json({ error: 'Access denied for this organization' });
      }
    }

    const formattedReport = formatEmergencyReport({
      ...report,
      reporter_name: report.reporter?.name,
      reporter_phone: report.reporter?.phone,
      responder_name: report.responder?.name,
      reporter: undefined,
      responder: undefined
    });

    res.json({ data: formattedReport });

  } catch (error) {
    safeLogger.error('emergency.report_get_failed');
    res.status(500).json({ error: 'Failed to fetch emergency report' });
  }
});

router.post('/calls', authenticateToken, async (req, res) => {
  try {
    const {
      serviceName,
      serviceNumber,
      callDate,
      callTime,
      duration,
      status,
      location,
      outcome
    } = req.body;

    const callId = uuidv4();
    const supabase = getClient();

    const { data: call, error } = await supabase
      .from('emergency_calls')
      .insert({
        id: callId,
        caller_id: req.user.id,
        service_name: serviceName,
        service_number: serviceNumber,
        call_date: callDate,
        call_time: callTime,
        duration: duration || null,
        status,
        location: location || null,
        outcome: outcome || null
      })
      .select()
      .single();

    if (error) {
      safeLogger.error('emergency.call_log_failed');
      return res.status(500).json({ error: 'Failed to log emergency call' });
    }

    res.status(201).json({
      message: 'Emergency call logged successfully',
      data: call
    });

  } catch (error) {
    safeLogger.error('emergency.call_log_failed');
    res.status(500).json({ error: 'Failed to log emergency call' });
  }
});

router.get('/calls/user', authenticateToken, async (req, res) => {
  try {
    const supabase = getClient();

    const { data: calls, error } = await supabase
      .from('emergency_calls')
      .select('*')
      .eq('caller_id', req.user.id)
      .order('call_date', { ascending: false })
      .order('call_time', { ascending: false });

    if (error) {
      safeLogger.error('emergency.calls_list_failed');
      return res.status(500).json({ error: 'Failed to fetch emergency calls' });
    }

    res.json({ data: calls });

  } catch (error) {
    safeLogger.error('emergency.calls_list_failed');
    res.status(500).json({ error: 'Failed to fetch emergency calls' });
  }
});

module.exports = router;
