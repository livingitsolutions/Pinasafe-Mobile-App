const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validateEmergencyReport, validateUUID, validatePagination } = require('../middleware/validation');
const clusteringService = require('../services/incidentClusteringService');

const router = express.Router();

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
        console.error('Get reports error:', error);
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
        console.error('Get reports error:', error);
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
        console.error('Get organization reports error:', error);
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

    const formattedReports = filteredReports.map(report => ({
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
    console.error('Get reports error:', error);
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
      useAIClassification
    } = req.body;

    const reportId = uuidv4();
    const title = `${type.charAt(0).toUpperCase() + type.slice(1)} Emergency`;
    const supabase = getClient();

    const { data: report, error } = await supabase
      .from('emergency_reports')
      .insert({
        id: reportId,
        reported_by: req.user.id,
        type,
        title,
        description,
        location,
        latitude: coordinates?.latitude || null,
        longitude: coordinates?.longitude || null,
        contact_number: contactNumber || null,
        priority,
        evidence_photos: evidence?.photos || [],
        ai_classification: aiClassification || null,
        use_ai_classification: useAIClassification || false
      })
      .select()
      .single();

    if (error) {
      console.error('Create report error:', error);
      return res.status(500).json({ error: 'Failed to create emergency report' });
    }

    try {
      const existingClusterId = await clusteringService.findMatchingCluster(report);

      if (existingClusterId) {
        await clusteringService.addToCluster(existingClusterId, report.id, req.user.id);
        report.cluster_id = existingClusterId;

        await clusteringService.notifyClusterSubscribers(
          existingClusterId,
          `New ${type} incident reported in ${location}`,
          'pending',
          req.user.id
        );
      } else {
        const clusterId = await clusteringService.createCluster(report.id, req.user.id);
        report.cluster_id = clusterId;
      }
    } catch (clusterError) {
      console.error('Clustering error:', clusterError);
    }

    res.status(201).json({
      message: 'Emergency report created successfully',
      data: report
    });

  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({ error: 'Failed to create emergency report' });
  }
});

router.put('/:id', authenticateToken, requireRole(['responder', 'admin']), validateUUID('id'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const supabase = getClient();

    const validStatuses = ['pending', 'dispatched', 'responding', 'resolved'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updateData = {
      status,
      responder_id: req.user.id,
      notes: notes || null,
      updated_at: new Date().toISOString()
    };

    if (status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data: updatedReport, error } = await supabase
      .from('emergency_reports')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !updatedReport) {
      return res.status(404).json({ error: 'Emergency report not found' });
    }

    if (updatedReport.cluster_id) {
      try {
        await clusteringService.notifyClusterSubscribers(
          updatedReport.cluster_id,
          notes || `Incident status updated to ${status}`,
          status,
          req.user.id
        );
      } catch (notifyError) {
        console.error('Error notifying cluster subscribers:', notifyError);
      }
    }

    res.json({
      message: 'Emergency report updated successfully',
      data: updatedReport
    });

  } catch (error) {
    console.error('Update report error:', error);
    res.status(500).json({ error: 'Failed to update emergency report' });
  }
});

// Assign team to emergency report
router.post('/:id/assign-team', authenticateToken, requireRole(['admin', 'responder']), validateUUID('id'), async (req, res) => {
  try {
    const { id } = req.params;
    const { teamId } = req.body;
    const { user } = req;
    const supabase = getClient();

    if (!teamId) {
      return res.status(400).json({ error: 'Team ID is required' });
    }

    // Verify the team exists and belongs to user's organization
    const { data: team, error: teamError } = await supabase
      .from('rescue_teams')
      .select('*')
      .eq('id', teamId)
      .eq('organization_id', user.organization_id)
      .eq('is_active', true)
      .maybeSingle();

    if (teamError || !team) {
      return res.status(404).json({ error: 'Team not found or not in your organization' });
    }

    // Update the report with team assignment and change status to dispatched
    const { data: updatedReport, error } = await supabase
      .from('emergency_reports')
      .update({
        assigned_team_id: teamId,
        assigned_by: user.id,
        assigned_at: new Date().toISOString(),
        status: 'dispatched',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', user.organization_id)
      .select(`
        *,
        reporter:users!reported_by(name, phone),
        responder:users!responder_id(name),
        assigned_team:rescue_teams(id, name, team_leader:users!team_leader_id(id, name))
      `)
      .single();

    if (error || !updatedReport) {
      console.error('Assign team error:', error);
      return res.status(404).json({ error: 'Emergency report not found' });
    }

    res.json({
      message: 'Team assigned successfully',
      data: updatedReport
    });

  } catch (error) {
    console.error('Assign team error:', error);
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

    const formattedReport = {
      ...report,
      reporter_name: report.reporter?.name,
      reporter_phone: report.reporter?.phone,
      responder_name: report.responder?.name,
      reporter: undefined,
      responder: undefined
    };

    res.json({ data: formattedReport });

  } catch (error) {
    console.error('Get report error:', error);
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
      console.error('Log call error:', error);
      return res.status(500).json({ error: 'Failed to log emergency call' });
    }

    res.status(201).json({
      message: 'Emergency call logged successfully',
      data: call
    });

  } catch (error) {
    console.error('Log call error:', error);
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
      console.error('Get calls error:', error);
      return res.status(500).json({ error: 'Failed to fetch emergency calls' });
    }

    res.json({ data: calls });

  } catch (error) {
    console.error('Get calls error:', error);
    res.status(500).json({ error: 'Failed to fetch emergency calls' });
  }
});

module.exports = router;
