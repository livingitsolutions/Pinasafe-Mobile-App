const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Access token required' })),
  requireRole: (roles) => (req, res, next) => (roles.includes(req.user?.role)
    ? next()
    : res.status(403).json({ error: 'Insufficient permissions' })),
  canAccessOrganization: (user, organizationId) => Boolean(user && organizationId)
    && (user.role === 'admin' || user.role === 'responder')
    && user.organization_id === organizationId
}));

jest.mock('../config/database', () => ({ getClient: jest.fn() }));

const { getClient } = require('../config/database');
const { createResponseNavigationRouter } = require('../routes/response-navigation');
const { createResponseRouteService } = require('../services/responseRouteService');

const OP_ID = '123e4567-e89b-12d3-a456-4266141740aa';
const SIBLING_ID = '123e4567-e89b-12d3-a456-4266141740bb';
const OTHER_ID = '123e4567-e89b-12d3-a456-4266141740dd';
const NOW = Date.parse('2026-10-06T10:00:00.000Z');
const FRESH_AT = '2026-10-06T09:59:55.000Z';
const STALE_AT = '2026-10-06T09:58:00.000Z';

const owner = { id: 'citizen-1', role: 'citizen', organization_id: null };
const siblingOwner = { id: 'citizen-2', role: 'citizen', organization_id: null };
const stranger = { id: 'citizen-9', role: 'citizen', organization_id: null };
const responder = { id: 'responder-1', role: 'responder', organization_id: 'org-1' };
const otherOrgResponder = { id: 'responder-7', role: 'responder', organization_id: 'org-2' };

const anchor = (overrides = {}) => ({
  id: OP_ID, cluster_id: OP_ID, organization_id: 'org-1', assigned_team_id: 'team-1', reported_by: 'citizen-1',
  latitude: 14.6, longitude: 121.0, status: 'responding', created_at: '2026-10-06T09:00:00.000Z', ...overrides
});
const sibling = (overrides = {}) => ({
  id: SIBLING_ID, cluster_id: OP_ID, organization_id: 'org-1', assigned_team_id: null, reported_by: 'citizen-2',
  latitude: 14.601, longitude: 121.001, status: 'responding', created_at: '2026-10-06T09:05:00.000Z', ...overrides
});
const locationRow = (overrides = {}) => ({
  data: { latitude: 14.55, longitude: 121.05, captured_at: FRESH_AT, ...overrides }, error: null
});

const buildQuery = (payload) => {
  const query = {};
  ['select', 'eq', 'or', 'order', 'limit'].forEach(method => { query[method] = jest.fn().mockReturnValue(query); });
  query.maybeSingle = jest.fn().mockResolvedValue(payload);
  query.then = (resolve, reject) => Promise.resolve(payload).then(resolve, reject);
  return query;
};

const mockFromSequence = (queries) => {
  const remaining = [...queries];
  const from = jest.fn((table) => {
    if (!remaining.length) throw new Error(`Unexpected query on ${table}`);
    return remaining.shift();
  });
  getClient.mockReturnValue({ from });
  return from;
};

const ROUTE = { geometry: [[14.55, 121.05], [14.58, 121.02], [14.6, 121.0]], distance_meters: 6400, duration_seconds: 780 };

const buildApp = (user, provider = { getRoute: jest.fn().mockResolvedValue(ROUTE) }) => {
  const routeService = createResponseRouteService({ provider, now: () => NOW });
  const app = express();
  app.use((req, res, next) => { if (user) req.user = user; next(); });
  app.use('/nav', createResponseNavigationRouter({ routeService, now: () => NOW }));
  return { app, provider };
};

const citizenUrl = (id = OP_ID) => `/nav/citizen/reports/${id}`;
const navUrl = (id = OP_ID) => `/nav/reports/${id}/navigation`;

const citizenSequence = (own, members, location) => [
  buildQuery({ data: own, error: null }),
  buildQuery({ data: members, error: null }),
  ...(location ? [buildQuery(location)] : [])
];

const FORBIDDEN_KEYS = ['responder_id', 'responder_name', 'team_name', 'team_id', 'assigned_team_id', 'user_id', 'reported_by',
  'organization_id', 'id', 'report_id', 'accuracy_meters', 'received_at', 'history', 'cluster_id', 'operational_id', 'members'];
const collectKeys = (value, keys = new Set()) => {
  if (Array.isArray(value)) value.forEach(item => collectKeys(item, keys));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => { keys.add(key); collectKeys(child, keys); });
  return keys;
};

describe('V3.6C.1 citizen-safe response tracking', () => {
  beforeEach(() => jest.clearAllMocks());

  test('1. owning citizen reads the projection while responding', async () => {
    const from = mockFromSequence(citizenSequence(anchor(), [anchor(), sibling()], locationRow()));
    const { app } = buildApp(owner);
    const response = await request(app).get(citizenUrl());
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      status: 'responding',
      response_team_assigned: true,
      tracking_active: true,
      response_complete: false,
      incident_location: { latitude: 14.6, longitude: 121.0 },
      responder_location: { latitude: 14.55, longitude: 121.05, captured_at: FRESH_AT, freshness: 'fresh' },
      route_status: 'available',
      route: ROUTE.geometry,
      distance_meters: 6400,
      duration_seconds: 780,
      calculated_at: new Date(NOW).toISOString()
    });
    expect(from.mock.calls.map(call => call[0])).toEqual(['emergency_reports', 'emergency_reports', 'incident_response_locations']);
  });

  test('2. unrelated citizen is denied without reading members or locations', async () => {
    const from = mockFromSequence(citizenSequence(anchor(), [anchor()]));
    const response = await request(buildApp(stranger).app).get(citizenUrl());
    expect(response.status).toBe(404);
    expect(from).toHaveBeenCalledTimes(1);
  });

  test('3. sibling-report citizen sees the response team routed to their own report location', async () => {
    mockFromSequence(citizenSequence(sibling(), [anchor(), sibling()], locationRow()));
    const { app, provider } = buildApp(siblingOwner);
    const response = await request(app).get(citizenUrl(SIBLING_ID));
    expect(response.status).toBe(200);
    expect(response.body.data.tracking_active).toBe(true);
    expect(response.body.data.incident_location).toEqual({ latitude: 14.601, longitude: 121.001 });
    expect(provider.getRoute).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 14.55, longitude: 121.05 }),
      { latitude: 14.601, longitude: 121.001 }
    );
  });

  test('4. a citizen cannot read another incident by id', async () => {
    mockFromSequence(citizenSequence({ ...anchor({ id: OTHER_ID, cluster_id: null, reported_by: 'citizen-5' }) }, []));
    const response = await request(buildApp(owner).app).get(citizenUrl(OTHER_ID));
    expect(response.status).toBe(404);
  });

  test('5. unauthenticated request is denied', async () => {
    const from = mockFromSequence([]);
    const response = await request(buildApp(null).app).get(citizenUrl());
    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  test('6a. members from another organization never contribute a team or location', async () => {
    const foreignTeam = anchor({ id: OTHER_ID, organization_id: 'org-2', assigned_team_id: 'team-x' });
    mockFromSequence(citizenSequence(sibling(), [sibling({ status: 'responding' }), foreignTeam]));
    const response = await request(buildApp(siblingOwner).app).get(citizenUrl(SIBLING_ID));
    expect(response.status).toBe(200);
    expect(response.body.data.tracking_active).toBe(false);
    expect(response.body.data.responder_location).toBeNull();
  });

  test('6b. cross-organization responder cannot read navigation', async () => {
    mockFromSequence([buildQuery({ data: { id: OP_ID, organization_id: 'org-1', assigned_team_id: 'team-1', status: 'responding', cluster_id: OP_ID }, error: null })]);
    const response = await request(buildApp(otherOrgResponder).app).get(navUrl());
    expect(response.status).toBe(403);
  });

  test('6c. responders and admins cannot use the citizen projection', async () => {
    const from = mockFromSequence([]);
    const response = await request(buildApp(responder).app).get(citizenUrl());
    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  test('7-10. projection excludes identities, ids, accuracy and history', async () => {
    mockFromSequence(citizenSequence(anchor(), [anchor(), sibling()], {
      data: { latitude: 14.55, longitude: 121.05, captured_at: FRESH_AT, responder_id: 'responder-1', accuracy_meters: 5, id: 'row-1', organization_id: 'org-1' },
      error: null
    }));
    const response = await request(buildApp(owner).app).get(citizenUrl());
    const keys = collectKeys(response.body.data);
    FORBIDDEN_KEYS.forEach(key => expect(keys.has(key)).toBe(false));
    expect(JSON.stringify(response.body)).not.toMatch(/responder-1|org-1|team-1|row-1|citizen-2/);
    expect(Array.isArray(response.body.data.responder_location)).toBe(false);
  });

  test('11. resolved incident shows no active tracking or ETA', async () => {
    const from = mockFromSequence(citizenSequence(anchor({ status: 'resolved' }), [anchor({ status: 'resolved' }), sibling({ status: 'resolved' })]));
    const { app, provider } = buildApp(owner);
    const response = await request(app).get(citizenUrl());
    expect(response.body.data).toMatchObject({ status: 'resolved', response_complete: true, tracking_active: false, responder_location: null, duration_seconds: null, distance_meters: null, route: null });
    expect(from).toHaveBeenCalledTimes(2);
    expect(provider.getRoute).not.toHaveBeenCalled();
  });

  test('12. pending incident shows no tracking', async () => {
    mockFromSequence(citizenSequence(anchor({ status: 'pending', assigned_team_id: null }), [anchor({ status: 'pending', assigned_team_id: null })]));
    const response = await request(buildApp(owner).app).get(citizenUrl());
    expect(response.body.data).toMatchObject({ status: 'pending', response_team_assigned: false, tracking_active: false, responder_location: null });
  });

  test('13. dispatched before Respond shows an assigned team but no tracking', async () => {
    mockFromSequence(citizenSequence(anchor({ status: 'dispatched' }), [anchor({ status: 'dispatched' })]));
    const { app, provider } = buildApp(owner);
    const response = await request(app).get(citizenUrl());
    expect(response.body.data).toMatchObject({ status: 'dispatched', response_team_assigned: true, tracking_active: false, responder_location: null, route_status: 'not_applicable' });
    expect(provider.getRoute).not.toHaveBeenCalled();
  });

  test('14. responding with no published location gives a waiting state and no route call', async () => {
    mockFromSequence(citizenSequence(anchor(), [anchor()], { data: null, error: null }));
    const { app, provider } = buildApp(owner);
    const response = await request(app).get(citizenUrl());
    expect(response.body.data).toMatchObject({ tracking_active: true, responder_location: null, route_status: 'not_applicable', duration_seconds: null });
    expect(provider.getRoute).not.toHaveBeenCalled();
  });

  test('15. stale location is marked stale', async () => {
    mockFromSequence(citizenSequence(anchor(), [anchor()], locationRow({ captured_at: STALE_AT })));
    const response = await request(buildApp(owner).app).get(citizenUrl());
    expect(response.body.data.responder_location.freshness).toBe('stale');
  });

  test('16-18. provider receives real coordinates; ETA and distance are the provider values', async () => {
    mockFromSequence(citizenSequence(anchor(), [anchor()], locationRow()));
    const provider = { getRoute: jest.fn().mockResolvedValue({ geometry: [[1, 2], [3, 4]], distance_meters: 1234.5, duration_seconds: 321 }) };
    const response = await request(buildApp(owner, provider).app).get(citizenUrl());
    expect(provider.getRoute).toHaveBeenCalledWith(
      { latitude: 14.55, longitude: 121.05, captured_at: FRESH_AT, freshness: 'fresh' },
      { latitude: 14.6, longitude: 121.0 }
    );
    expect(response.body.data.duration_seconds).toBe(321);
    expect(response.body.data.distance_meters).toBe(1234.5);
  });

  test('19. routing failure returns an unavailable route while tracking continues', async () => {
    mockFromSequence(citizenSequence(anchor(), [anchor()], locationRow()));
    const provider = { getRoute: jest.fn().mockRejectedValue(new Error('down')) };
    const response = await request(buildApp(owner, provider).app).get(citizenUrl());
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ tracking_active: true, route_status: 'unavailable', route: null, distance_meters: null, duration_seconds: null });
    expect(response.body.data.responder_location).not.toBeNull();
  });

  test('24. report without coordinates gets no destination and no route', async () => {
    mockFromSequence(citizenSequence(anchor({ latitude: null, longitude: null }), [anchor({ latitude: null, longitude: null })], locationRow()));
    const { app, provider } = buildApp(owner);
    const response = await request(app).get(citizenUrl());
    expect(response.body.data.incident_location).toBeNull();
    expect(response.body.data.route_status).toBe('not_applicable');
    expect(provider.getRoute).not.toHaveBeenCalled();
  });
});

describe('V3.6C.1 responder navigation', () => {
  beforeEach(() => jest.clearAllMocks());

  const reportRow = (overrides = {}) => ({ data: { id: SIBLING_ID, organization_id: 'org-1', assigned_team_id: 'team-1', status: 'responding', cluster_id: OP_ID, ...overrides }, error: null });
  const teamRow = { data: { id: 'team-1', organization_id: 'org-1', team_leader_id: 'responder-1', is_active: true }, error: null };

  test('21-22. route goes from the responder\'s own position to the canonical operational coordinate', async () => {
    const location = buildQuery(locationRow());
    mockFromSequence([buildQuery(reportRow()), buildQuery(teamRow), buildQuery({ data: [sibling({ assigned_team_id: 'team-1' }), anchor()], error: null }), location]);
    const { app, provider } = buildApp(responder);
    const response = await request(app).get(navUrl(SIBLING_ID));
    expect(response.status).toBe(200);
    expect(response.body.data.destination).toEqual({ latitude: 14.6, longitude: 121.0 });
    expect(response.body.data.responder_location).toMatchObject({ latitude: 14.55, longitude: 121.05 });
    expect(location.eq).toHaveBeenCalledWith('responder_id', 'responder-1');
    expect(provider.getRoute).toHaveBeenCalledWith(expect.objectContaining({ latitude: 14.55, longitude: 121.05 }), { latitude: 14.6, longitude: 121.0 });
    expect(response.body.data).toMatchObject({ route_status: 'available', distance_meters: 6400, duration_seconds: 780 });
  });

  test('destination falls back to the earliest member with coordinates when the anchor has none', async () => {
    mockFromSequence([buildQuery(reportRow()), buildQuery(teamRow), buildQuery({ data: [anchor({ latitude: null, longitude: null }), sibling()], error: null }), buildQuery(locationRow())]);
    const response = await request(buildApp(responder).app).get(navUrl(SIBLING_ID));
    expect(response.body.data.destination).toEqual({ latitude: 14.601, longitude: 121.001 });
  });

  test('no responder location: destination only, never substituted as the responder position', async () => {
    mockFromSequence([buildQuery(reportRow()), buildQuery(teamRow), buildQuery({ data: [anchor()], error: null }), buildQuery({ data: null, error: null })]);
    const { app, provider } = buildApp(responder);
    const response = await request(app).get(navUrl(SIBLING_ID));
    expect(response.body.data.responder_location).toBeNull();
    expect(response.body.data.destination).toEqual({ latitude: 14.6, longitude: 121.0 });
    expect(provider.getRoute).not.toHaveBeenCalled();
  });

  test('wrong-team responder is denied', async () => {
    mockFromSequence([buildQuery(reportRow()), buildQuery({ data: { ...teamRow.data, team_leader_id: 'x' }, error: null }), buildQuery({ data: null, error: null })]);
    const response = await request(buildApp(responder).app).get(navUrl(SIBLING_ID));
    expect(response.status).toBe(403);
  });

  test('resolved report returns no tracking and no route', async () => {
    mockFromSequence([buildQuery(reportRow({ status: 'resolved' })), buildQuery(teamRow), buildQuery({ data: [anchor({ status: 'resolved' })], error: null })]);
    const { app, provider } = buildApp(responder);
    const response = await request(app).get(navUrl(SIBLING_ID));
    expect(response.body.data).toMatchObject({ response_complete: true, tracking_active: false, responder_location: null, route: null });
    expect(provider.getRoute).not.toHaveBeenCalled();
  });
});

describe('V3.6C.1 source boundaries', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/response-navigation.js'), 'utf8');

  test('citizen projection never selects identity or accuracy columns from the location table', () => {
    expect(source).not.toMatch(/accuracy_meters|received_at|users!responder_id|rescue_teams!team_id/);
  });

  test('no straight-line distance or speed-based ETA', () => {
    expect(source).not.toMatch(/calculateDistance|haversine|speed/i);
  });

  test('frozen V3.6A resolution RPC is untouched by this router', () => {
    expect(source).not.toMatch(/resolve_operational_incident_atomic|\.update\(|\.insert\(|\.delete\(/);
  });
});
