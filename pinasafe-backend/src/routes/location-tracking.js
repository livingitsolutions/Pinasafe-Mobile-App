const express = require('express');
const { getClient } = require('../config/database');
const { authenticateToken, requireRole, canAccessOrganization } = require('../middleware/auth');
const { validateUUID } = require('../middleware/validation');
const safeLogger = require('../utils/safeLogger');

const router = express.Router();

const LOCATION_TABLE = 'incident_response_locations';
const CAPTURE_FUTURE_SKEW_MS = 2 * 60 * 1000;
const CAPTURE_MAX_AGE_MS = 2 * 60 * 1000;

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const parseLocationBody = (body, nowMs) => {
  const { latitude, longitude, accuracy, captured_at: capturedAt } = body || {};
  if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) {
    return { error: 'Latitude must be a finite number between -90 and 90' };
  }
  if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) {
    return { error: 'Longitude must be a finite number between -180 and 180' };
  }
  if (accuracy !== undefined && accuracy !== null && (!isFiniteNumber(accuracy) || accuracy < 0)) {
    return { error: 'Accuracy must be a finite, non-negative number' };
  }

  let capturedMs = nowMs;
  if (capturedAt !== undefined && capturedAt !== null) {
    capturedMs = typeof capturedAt === 'string' ? Date.parse(capturedAt) : NaN;
    if (!Number.isFinite(capturedMs)) {
      return { error: 'captured_at must be a valid ISO timestamp' };
    }
    if (capturedMs > nowMs + CAPTURE_FUTURE_SKEW_MS) {
      return { error: 'captured_at is in the future' };
    }
    if (capturedMs < nowMs - CAPTURE_MAX_AGE_MS) {
      return { error: 'captured_at is too old', stale: true };
    }
  }

  return {
    value: {
      latitude,
      longitude,
      accuracy_meters: accuracy ?? null,
      captured_at: new Date(capturedMs).toISOString()
    }
  };
};

const loadReport = (supabase, reportId) => supabase
  .from('emergency_reports')
  .select('id, organization_id, assigned_team_id, status, cluster_id')
  .eq('id', reportId)
  .maybeSingle();

// Responders are authorized only as an active member or leader of the report's assigned team.
const isAssignedTeamResponder = async (supabase, user, report) => {
  const { data: team, error: teamError } = await supabase
    .from('rescue_teams')
    .select('id, organization_id, team_leader_id, is_active')
    .eq('id', report.assigned_team_id)
    .maybeSingle();

  if (teamError || !team || team.organization_id !== report.organization_id
    || !canAccessOrganization(user, team.organization_id) || team.is_active === false) {
    return false;
  }
  if (team.team_leader_id === user.id) return true;

  const { data: membership, error: membershipError } = await supabase
    .from('team_members')
    .select('id')
    .eq('team_id', team.id)
    .eq('user_id', user.id)
    .maybeSingle();

  return !membershipError && Boolean(membership);
};

router.put('/reports/:reportId/location', authenticateToken, requireRole(['responder']), validateUUID('reportId'), async (req, res) => {
  try {
    const { reportId } = req.params;
    const { user } = req;

    if (user.role !== 'responder') {
      return res.status(403).json({ error: 'Only assigned responders can share live location' });
    }

    const parsed = parseLocationBody(req.body, Date.now());
    if (parsed.error) {
      return res.status(parsed.stale ? 409 : 400).json({ error: parsed.error });
    }

    const supabase = getClient();
    const { data: report, error: reportError } = await loadReport(supabase, reportId);
    if (reportError) throw reportError;
    if (!report) {
      return res.status(404).json({ error: 'Emergency report not found' });
    }
    if (!canAccessOrganization(user, report.organization_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!report.assigned_team_id) {
      return res.status(403).json({ error: 'This report has no assigned team' });
    }
    if (!(await isAssignedTeamResponder(supabase, user, report))) {
      return res.status(403).json({ error: 'You are not a member of the assigned team' });
    }
    if (report.status !== 'responding') {
      return res.status(409).json({ error: 'Live location can only be shared while responding', code: 'not_responding', status: report.status });
    }

    const record = {
      ...parsed.value,
      organization_id: report.organization_id,
      operational_id: report.cluster_id || report.id,
      report_id: report.id,
      team_id: report.assigned_team_id,
      responder_id: user.id,
      received_at: new Date().toISOString()
    };

    const { data: existing, error: existingError } = await supabase
      .from(LOCATION_TABLE)
      .select('id, captured_at')
      .eq('report_id', report.id)
      .eq('responder_id', user.id)
      .maybeSingle();
    if (existingError) throw existingError;

    let saved;
    if (existing) {
      if (Date.parse(existing.captured_at) >= Date.parse(record.captured_at)) {
        return res.status(409).json({ error: 'Location update is older than the latest recorded position', code: 'out_of_order' });
      }
      // The captured_at predicate keeps a concurrent older write from overwriting a newer one.
      const { data, error } = await supabase
        .from(LOCATION_TABLE)
        .update(record)
        .eq('id', existing.id)
        .eq('responder_id', user.id)
        .lt('captured_at', record.captured_at)
        .select('captured_at, received_at')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return res.status(409).json({ error: 'Location update is older than the latest recorded position', code: 'out_of_order' });
      }
      saved = data;
    } else {
      const { data, error } = await supabase
        .from(LOCATION_TABLE)
        .insert(record)
        .select('captured_at, received_at')
        .maybeSingle();
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'A newer location was recorded concurrently', code: 'out_of_order' });
      }
      if (error) throw error;
      saved = data;
    }

    res.json({ data: { captured_at: saved?.captured_at ?? record.captured_at, received_at: saved?.received_at ?? record.received_at } });
  } catch (error) {
    safeLogger.error('Publish responder location error:', error);
    res.status(500).json({ error: 'Failed to record location' });
  }
});

router.get('/reports/:reportId/location', authenticateToken, requireRole(['admin', 'responder']), validateUUID('reportId'), async (req, res) => {
  try {
    const { reportId } = req.params;
    const { user } = req;

    if (user.role !== 'admin' && user.role !== 'responder') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const supabase = getClient();
    const { data: report, error: reportError } = await loadReport(supabase, reportId);
    if (reportError) throw reportError;
    if (!report) {
      return res.status(404).json({ error: 'Emergency report not found' });
    }
    if (!canAccessOrganization(user, report.organization_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (user.role === 'responder' && (!report.assigned_team_id || !(await isAssignedTeamResponder(supabase, user, report)))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const base = {
      report_id: report.id,
      status: report.status,
      tracking_active: report.status === 'responding',
      response_complete: report.status === 'resolved',
      location: null
    };

    if (!report.assigned_team_id || report.status !== 'responding') {
      return res.json({ data: base });
    }

    const { data: latest, error: latestError } = await supabase
      .from(LOCATION_TABLE)
      .select('latitude, longitude, accuracy_meters, captured_at, received_at, responder:users!responder_id(name), team:rescue_teams!team_id(name)')
      .eq('report_id', report.id)
      .eq('organization_id', report.organization_id)
      .eq('team_id', report.assigned_team_id)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;

    res.json({
      data: {
        ...base,
        location: latest ? {
          latitude: latest.latitude,
          longitude: latest.longitude,
          accuracy_meters: latest.accuracy_meters,
          captured_at: latest.captured_at,
          received_at: latest.received_at,
          responder_name: latest.responder?.name ?? null,
          team_name: latest.team?.name ?? null
        } : null
      }
    });
  } catch (error) {
    safeLogger.error('Get responder location error:', error);
    res.status(500).json({ error: 'Failed to fetch responder location' });
  }
});

module.exports = router;
module.exports.parseLocationBody = parseLocationBody;
module.exports.loadReport = loadReport;
module.exports.isAssignedTeamResponder = isAssignedTeamResponder;
module.exports.LOCATION_TABLE = LOCATION_TABLE;
