const express = require('express');
const { getClient } = require('../config/database');
const { authenticateToken, requireRole, canAccessOrganization } = require('../middleware/auth');
const { validateUUID } = require('../middleware/validation');
const safeLogger = require('../utils/safeLogger');
const clusteringService = require('../services/incidentClusteringService');
const { createOsrmRouteProvider } = require('../services/routeProvider');
const { createResponseRouteService } = require('../services/responseRouteService');
const { loadReport, isAssignedTeamResponder, LOCATION_TABLE } = require('./location-tracking');

const STALE_AFTER_MS = 30000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEMBER_COLUMNS = 'id, cluster_id, organization_id, assigned_team_id, reported_by, latitude, longitude, status, created_at';

const freshnessOf = (capturedAt, nowMs) => (
  nowMs - Date.parse(capturedAt) > STALE_AFTER_MS ? 'stale' : 'fresh'
);

const toPosition = (row, nowMs) => {
  const point = row ? clusteringService.getCoordinates(row) : null;
  return point ? { ...point, captured_at: row.captured_at, freshness: freshnessOf(row.captured_at, nowMs) } : null;
};

const loadOperationalMembers = async (supabase, report) => {
  const operationalId = report.cluster_id || report.id;
  if (!UUID_PATTERN.test(operationalId)) return { operationalId, members: [] };
  const { data, error } = await supabase
    .from('emergency_reports')
    .select(MEMBER_COLUMNS)
    .eq('organization_id', report.organization_id)
    .or(`id.eq.${operationalId},cluster_id.eq.${operationalId}`);
  if (error) throw error;
  const members = (data || []).filter((member) => (
    member.organization_id === report.organization_id && (member.cluster_id || member.id) === operationalId
  ));
  return { operationalId, members };
};

const byCreatedThenId = (left, right) => (
  String(left.created_at).localeCompare(String(right.created_at)) || String(left.id).localeCompare(String(right.id))
);

const routeFields = (route) => (route.status === 'available'
  ? {
    route_status: 'available',
    route: route.geometry,
    distance_meters: route.distance_meters,
    duration_seconds: route.duration_seconds,
    calculated_at: route.calculated_at
  }
  : { route_status: 'unavailable', route: null, distance_meters: null, duration_seconds: null, calculated_at: null });

const NO_ROUTE = { route_status: 'not_applicable', route: null, distance_meters: null, duration_seconds: null, calculated_at: null };

// Assignment is stored on one operational member; prefer an active assignment, else the historical one.
const findAssignedMember = (members) => {
  const assigned = members.filter((member) => member.assigned_team_id).sort(byCreatedThenId);
  return assigned.find((member) => member.status !== 'resolved') || assigned[0] || null;
};

// Only the display name leaves the server, and only for a team in the incident's own organization.
const loadCitizenResponseTeam = async (supabase, assignedMember, organizationId) => {
  if (!assignedMember) return null;
  const { data: team, error } = await supabase
    .from('rescue_teams')
    .select('id, name, organization_id')
    .eq('id', assignedMember.assigned_team_id)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!team || team.id !== assignedMember.assigned_team_id || team.organization_id !== organizationId) return null;
  const name = typeof team.name === 'string' ? team.name.trim() : '';
  return name ? { name } : null;
};

const createResponseNavigationRouter = ({ routeService = createResponseRouteService({ provider: createOsrmRouteProvider() }), now = Date.now } = {}) => {
  const router = express.Router();

  const latestLocation = async (supabase, report, responderId) => {
    let query = supabase
      .from(LOCATION_TABLE)
      .select('latitude, longitude, captured_at')
      .eq('report_id', report.id)
      .eq('organization_id', report.organization_id)
      .eq('team_id', report.assigned_team_id);
    if (responderId) query = query.eq('responder_id', responderId);
    const { data, error } = await query.order('captured_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  };

  const routeBetween = async (key, origin, destination) => (
    origin && destination ? routeFields(await routeService.getRoute(key, origin, destination)) : NO_ROUTE
  );

  // Responder (assigned team) or same-organization admin: route to the operational incident destination.
  router.get('/reports/:reportId/navigation', authenticateToken, requireRole(['admin', 'responder']), validateUUID('reportId'), async (req, res) => {
    try {
      const { user } = req;
      if (user.role !== 'admin' && user.role !== 'responder') return res.status(403).json({ error: 'Access denied' });

      const supabase = getClient();
      const { data: report, error: reportError } = await loadReport(supabase, req.params.reportId);
      if (reportError) throw reportError;
      if (!report) return res.status(404).json({ error: 'Emergency report not found' });
      if (!canAccessOrganization(user, report.organization_id)) return res.status(403).json({ error: 'Access denied' });
      if (user.role === 'responder' && (!report.assigned_team_id || !(await isAssignedTeamResponder(supabase, user, report)))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { operationalId, members } = await loadOperationalMembers(supabase, report);
      const destination = clusteringService.summarizeOperationalMembers(operationalId, members).coordinates;
      const active = report.status === 'responding' && Boolean(report.assigned_team_id);
      const base = {
        report_id: report.id,
        status: report.status,
        tracking_active: active,
        response_complete: report.status === 'resolved',
        destination: destination ? { latitude: destination.latitude, longitude: destination.longitude } : null,
        responder_location: null,
        ...NO_ROUTE
      };
      if (!active) return res.json({ data: base });

      const nowMs = now();
      const origin = toPosition(await latestLocation(supabase, report, user.role === 'responder' ? user.id : null), nowMs);
      const key = `navigation:${report.id}:${user.role === 'responder' ? user.id : 'team'}`;
      res.json({ data: { ...base, responder_location: origin, ...(await routeBetween(key, origin, destination)) } });
    } catch (error) {
      safeLogger.error('Get response navigation error:', error);
      res.status(500).json({ error: 'Failed to fetch response navigation' });
    }
  });

  // Citizen-safe projection: only for the owner of a report in the operational incident.
  router.get('/citizen/reports/:reportId', authenticateToken, requireRole(['citizen']), validateUUID('reportId'), async (req, res) => {
    try {
      const { user } = req;
      if (user.role !== 'citizen') return res.status(403).json({ error: 'Access denied' });

      const supabase = getClient();
      const { data: ownReport, error: reportError } = await supabase
        .from('emergency_reports')
        .select(MEMBER_COLUMNS)
        .eq('id', req.params.reportId)
        .maybeSingle();
      if (reportError) throw reportError;
      if (!ownReport || ownReport.reported_by !== user.id) return res.status(404).json({ error: 'Emergency report not found' });

      const { operationalId, members } = await loadOperationalMembers(supabase, ownReport);
      const summary = clusteringService.summarizeOperationalMembers(operationalId, members.length ? members : [ownReport]);
      const teamReport = members
        .filter((member) => member.status === 'responding' && member.assigned_team_id)
        .sort(byCreatedThenId)[0];
      const ownPoint = clusteringService.getCoordinates(ownReport);
      const responseTeam = await loadCitizenResponseTeam(supabase, findAssignedMember(members), ownReport.organization_id);
      const base = {
        status: summary.status,
        response_team_assigned: members.some((member) => member.assigned_team_id && member.status !== 'resolved'),
        response_team: responseTeam,
        tracking_active: false,
        response_complete: summary.status === 'resolved',
        incident_location: ownPoint,
        responder_location: null,
        ...NO_ROUTE
      };
      if (summary.status !== 'responding' || !teamReport) return res.json({ data: base });

      const nowMs = now();
      const origin = toPosition(await latestLocation(supabase, teamReport, null), nowMs);
      const tracked = { ...base, tracking_active: true, responder_location: origin };
      res.json({ data: { ...tracked, ...(await routeBetween(`citizen:${teamReport.id}:${ownReport.id}`, origin, ownPoint)) } });
    } catch (error) {
      safeLogger.error('Get citizen response tracking error:', error);
      res.status(500).json({ error: 'Failed to fetch response tracking' });
    }
  });

  return router;
};

module.exports = createResponseNavigationRouter();
module.exports.createResponseNavigationRouter = createResponseNavigationRouter;
