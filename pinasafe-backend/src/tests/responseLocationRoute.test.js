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
const locationRouter = require('../routes/location-tracking');

const REPORT_ID = '123e4567-e89b-12d3-a456-426614174000';
const CLUSTER_ID = '123e4567-e89b-12d3-a456-4266141740cc';
const responder = { id: 'responder-1', role: 'responder', organization_id: 'org-1' };
const admin = { id: 'admin-1', role: 'admin', organization_id: 'org-1' };
const citizen = { id: 'citizen-1', role: 'citizen', organization_id: null };

const buildQuery = (payload) => {
  const query = {};
  ['select', 'eq', 'lt', 'order', 'limit', 'update', 'insert'].forEach(method => {
    query[method] = jest.fn().mockReturnValue(query);
  });
  query.maybeSingle = jest.fn().mockResolvedValue(payload);
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

const buildApp = (user) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { if (user) req.user = user; next(); });
  app.use('/location-tracking', locationRouter);
  return app;
};

const reportRow = (overrides = {}) => ({
  data: { id: REPORT_ID, organization_id: 'org-1', assigned_team_id: 'team-1', status: 'responding', cluster_id: CLUSTER_ID, ...overrides },
  error: null
});
const teamRow = (overrides = {}) => ({
  data: { id: 'team-1', organization_id: 'org-1', team_leader_id: 'leader-9', is_active: true, ...overrides },
  error: null
});
const member = { data: { id: 'membership-1' }, error: null };
const none = { data: null, error: null };
const validBody = (overrides = {}) => ({ latitude: 14.5995, longitude: 120.9842, accuracy: 8, captured_at: new Date().toISOString(), ...overrides });
const url = `/location-tracking/reports/${REPORT_ID}/location`;

describe('V3.6C responder location publishing', () => {
  beforeEach(() => jest.clearAllMocks());

  const publishHappyPath = () => {
    const insert = buildQuery({ data: { captured_at: 'c', received_at: 'r' }, error: null });
    const from = mockFromSequence([buildQuery(reportRow()), buildQuery(teamRow()), buildQuery(member), buildQuery(none), insert]);
    return { insert, from };
  };

  test('1. assigned responder can publish while responding', async () => {
    const { insert, from } = publishHappyPath();
    const response = await request(buildApp(responder)).put(url).send(validBody());
    expect(response.status).toBe(200);
    expect(from.mock.calls.map(call => call[0])).toEqual(['emergency_reports', 'rescue_teams', 'team_members', 'incident_response_locations', 'incident_response_locations']);
    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ latitude: 14.5995, longitude: 120.9842, accuracy_meters: 8 }));
  });

  test('team leader can publish without a team_members row', async () => {
    const insert = buildQuery({ data: {}, error: null });
    mockFromSequence([buildQuery(reportRow()), buildQuery(teamRow({ team_leader_id: 'responder-1' })), buildQuery(none), insert]);
    const response = await request(buildApp(responder)).put(url).send(validBody());
    expect(response.status).toBe(200);
  });

  test('2. citizen cannot publish', async () => {
    const from = mockFromSequence([]);
    const response = await request(buildApp(citizen)).put(url).send(validBody());
    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  test('4a. unauthenticated cannot publish', async () => {
    const from = mockFromSequence([]);
    const response = await request(buildApp(null)).put(url).send(validBody());
    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  test('6. wrong-team responder cannot publish', async () => {
    mockFromSequence([buildQuery(reportRow()), buildQuery(teamRow()), buildQuery(none)]);
    const response = await request(buildApp(responder)).put(url).send(validBody());
    expect(response.status).toBe(403);
  });

  test('inactive assigned team cannot publish', async () => {
    mockFromSequence([buildQuery(reportRow()), buildQuery(teamRow({ is_active: false }))]);
    const response = await request(buildApp(responder)).put(url).send(validBody());
    expect(response.status).toBe(403);
  });

  test('7. cross-org responder cannot publish', async () => {
    mockFromSequence([buildQuery(reportRow())]);
    const response = await request(buildApp({ ...responder, organization_id: 'org-2' })).put(url).send(validBody());
    expect(response.status).toBe(403);
  });

  test('report without an assigned team cannot publish', async () => {
    mockFromSequence([buildQuery(reportRow({ assigned_team_id: null }))]);
    const response = await request(buildApp(responder)).put(url).send(validBody());
    expect(response.status).toBe(403);
  });

  test.each([
    ['9. dispatched (before Respond)', 'dispatched'],
    ['10. pending', 'pending'],
    ['11. resolved', 'resolved']
  ])('%s report cannot publish', async (_label, status) => {
    const from = mockFromSequence([buildQuery(reportRow({ status })), buildQuery(teamRow()), buildQuery(member)]);
    const response = await request(buildApp(responder)).put(url).send(validBody());
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('not_responding');
    expect(from).toHaveBeenCalledTimes(3);
  });

  test.each([
    ['12. latitude above range', { latitude: 90.01 }],
    ['12. latitude below range', { latitude: -90.01 }],
    ['12. latitude as string', { latitude: '14.5' }],
    ['12. latitude missing', { latitude: undefined }],
    ['13. longitude above range', { longitude: 180.01 }],
    ['13. longitude below range', { longitude: -180.01 }],
    ['13. longitude null', { longitude: null }],
    ['14. negative accuracy', { accuracy: -1 }],
    ['14. non-numeric accuracy', { accuracy: 'high' }],
    ['invalid timestamp', { captured_at: 'not-a-date' }],
    ['future timestamp', { captured_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() }]
  ])('%s is rejected before any database access', async (_label, overrides) => {
    const from = mockFromSequence([]);
    const response = await request(buildApp(responder)).put(url).send(validBody(overrides));
    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  test('non-finite numbers are rejected by the parser', () => {
    const now = Date.now();
    expect(locationRouter.parseLocationBody({ latitude: Infinity, longitude: 0 }, now).error).toBeTruthy();
    expect(locationRouter.parseLocationBody({ latitude: 0, longitude: NaN }, now).error).toBeTruthy();
    expect(locationRouter.parseLocationBody({ latitude: 0, longitude: 0, accuracy: Infinity }, now).error).toBeTruthy();
    expect(locationRouter.parseLocationBody({ latitude: 0, longitude: 0, accuracy: 0 }, now).value).toEqual(expect.objectContaining({ latitude: 0, longitude: 0, accuracy_meters: 0 }));
  });

  test('15a. stale update (captured long ago) is rejected', async () => {
    const from = mockFromSequence([]);
    const response = await request(buildApp(responder)).put(url).send(validBody({ captured_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() }));
    expect(response.status).toBe(409);
    expect(from).not.toHaveBeenCalled();
  });

  test('15b. out-of-order update is rejected without writing', async () => {
    const newer = new Date(Date.now() + 1000).toISOString();
    const existing = buildQuery({ data: { id: 'loc-1', captured_at: newer }, error: null });
    mockFromSequence([buildQuery(reportRow()), buildQuery(teamRow()), buildQuery(member), existing]);
    const response = await request(buildApp(responder)).put(url).send(validBody());
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('out_of_order');
    expect(existing.update).not.toHaveBeenCalled();
  });

  test('15c. newer update replaces the latest position with a captured_at guard', async () => {
    const existing = buildQuery({ data: { id: 'loc-1', captured_at: new Date(Date.now() - 30000).toISOString() }, error: null });
    const update = buildQuery({ data: { captured_at: 'c', received_at: 'r' }, error: null });
    mockFromSequence([buildQuery(reportRow()), buildQuery(teamRow()), buildQuery(member), existing, update]);
    const body = validBody();
    const response = await request(buildApp(responder)).put(url).send(body);
    expect(response.status).toBe(200);
    expect(update.eq).toHaveBeenCalledWith('id', 'loc-1');
    expect(update.lt).toHaveBeenCalledWith('captured_at', body.captured_at);
  });

  test('15d. concurrent newer write makes the guarded update a 409', async () => {
    const existing = buildQuery({ data: { id: 'loc-1', captured_at: new Date(Date.now() - 30000).toISOString() }, error: null });
    mockFromSequence([buildQuery(reportRow()), buildQuery(teamRow()), buildQuery(member), existing, buildQuery(none)]);
    const response = await request(buildApp(responder)).put(url).send(validBody());
    expect(response.status).toBe(409);
  });

  test('16-18. server derives responder, team, organization and operational identity', async () => {
    const { insert } = publishHappyPath();
    const response = await request(buildApp(responder)).put(url).send(validBody({
      responder_id: 'attacker', user_id: 'attacker', team_id: 'team-evil', organization_id: 'org-evil', operational_id: 'op-evil', report_id: 'r-evil'
    }));
    expect(response.status).toBe(200);
    const record = insert.insert.mock.calls[0][0];
    expect(record).toEqual(expect.objectContaining({
      responder_id: 'responder-1',
      team_id: 'team-1',
      organization_id: 'org-1',
      operational_id: CLUSTER_ID,
      report_id: REPORT_ID
    }));
    expect(record).not.toHaveProperty('user_id');
  });

  test('operational identity falls back to the report id when unclustered', async () => {
    const insert = buildQuery({ data: {}, error: null });
    mockFromSequence([buildQuery(reportRow({ cluster_id: null })), buildQuery(teamRow()), buildQuery(member), buildQuery(none), insert]);
    await request(buildApp(responder)).put(url).send(validBody());
    expect(insert.insert.mock.calls[0][0].operational_id).toBe(REPORT_ID);
  });
});

describe('V3.6C responder location reading', () => {
  beforeEach(() => jest.clearAllMocks());

  const latestRow = {
    data: { latitude: 14.6, longitude: 121, accuracy_meters: 5, captured_at: 'c', received_at: 'r', responder: { name: 'R. Cruz' }, team: { name: 'Team Alpha' } },
    error: null
  };

  test('19. same-org command center reads the latest position', async () => {
    const latest = buildQuery(latestRow);
    mockFromSequence([buildQuery(reportRow()), latest]);
    const response = await request(buildApp(admin)).get(url);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(expect.objectContaining({ tracking_active: true, response_complete: false }));
    expect(response.body.data.location).toEqual({
      latitude: 14.6, longitude: 121, accuracy_meters: 5, captured_at: 'c', received_at: 'r', responder_name: 'R. Cruz', team_name: 'Team Alpha'
    });
    expect(latest.eq).toHaveBeenCalledWith('organization_id', 'org-1');
    expect(latest.eq).toHaveBeenCalledWith('team_id', 'team-1');
  });

  test('assigned responder can read their own team position', async () => {
    mockFromSequence([buildQuery(reportRow()), buildQuery(teamRow()), buildQuery(member), buildQuery(latestRow)]);
    const response = await request(buildApp(responder)).get(url);
    expect(response.status).toBe(200);
    expect(response.body.data.location.latitude).toBe(14.6);
  });

  test('3. citizen / report owner cannot read', async () => {
    const from = mockFromSequence([]);
    const response = await request(buildApp({ ...citizen, id: 'reporter-1' })).get(url);
    expect(response.status).toBe(403);
    expect(response.body).not.toHaveProperty('data');
    expect(from).not.toHaveBeenCalled();
  });

  test('4b. unauthenticated cannot read', async () => {
    const response = await request(buildApp(null)).get(url);
    expect(response.status).toBe(401);
  });

  test('5. unrelated same-org responder cannot read', async () => {
    const from = mockFromSequence([buildQuery(reportRow()), buildQuery(teamRow()), buildQuery(none)]);
    const response = await request(buildApp(responder)).get(url);
    expect(response.status).toBe(403);
    expect(from).toHaveBeenCalledTimes(3);
  });

  test('8. cross-org admin cannot read', async () => {
    const from = mockFromSequence([buildQuery(reportRow())]);
    const response = await request(buildApp({ ...admin, organization_id: 'org-2' })).get(url);
    expect(response.status).toBe(403);
    expect(from).toHaveBeenCalledTimes(1);
  });

  test('resolved response reports completion and withholds coordinates', async () => {
    const from = mockFromSequence([buildQuery(reportRow({ status: 'resolved' }))]);
    const response = await request(buildApp(admin)).get(url);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(expect.objectContaining({ response_complete: true, tracking_active: false, location: null }));
    expect(from).toHaveBeenCalledTimes(1);
  });

  test('no location yet returns a null location, never incident coordinates', async () => {
    mockFromSequence([buildQuery(reportRow()), buildQuery(none)]);
    const response = await request(buildApp(admin)).get(url);
    expect(response.status).toBe(200);
    expect(response.body.data.location).toBeNull();
  });
});

describe('V3.6C citizen privacy surface', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

  test('28. citizen and report serializers never read responder location tables', () => {
    ['routes/emergency.js', 'routes/clusters.js', 'routes/stats.js', 'routes/alerts.js', 'routes/users.js'].forEach(file => {
      const source = read(file);
      expect(source).not.toMatch(/incident_response_locations|team_location_tracking/);
    });
  });

  test('28. tracking routes have no citizen or reporter read branch', () => {
    const source = read('routes/location-tracking.js');
    expect(source).not.toMatch(/reported_by|'citizen'|team_location_tracking/);
    expect(locationRouter.stack.map(layer => `${Object.keys(layer.route.methods)[0]} ${layer.route.path}`)).toEqual([
      'put /reports/:reportId/location',
      'get /reports/:reportId/location'
    ]);
  });
});
