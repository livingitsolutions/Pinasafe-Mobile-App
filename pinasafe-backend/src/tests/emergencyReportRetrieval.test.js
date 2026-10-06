const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  canAccessOrganization: (user, organizationId) => user.organization_id === organizationId
}));

jest.mock('../config/database', () => ({ getClient: jest.fn() }));

jest.mock('../services/incidentClusteringService', () => ({
  findMatchingCluster: jest.fn(),
  createCluster: jest.fn(),
  addToCluster: jest.fn(),
  notifyClusterSubscribers: jest.fn()
}));

const { getClient } = require('../config/database');
const emergencyRouter = require('../routes/emergency');

const REPORT_ID = '123e4567-e89b-12d3-a456-426614174030';
const TEAM_ID = '123e4567-e89b-12d3-a456-426614174031';
const ORG_ID = 'organization-1';
const reporter = { id: 'reporter-1', role: 'citizen', organization_id: null };
const responder = { id: 'responder-1', role: 'responder', organization_id: ORG_ID };
const admin = { id: 'admin-1', role: 'admin', organization_id: ORG_ID };

const reportWith = (overrides = {}) => ({
  id: REPORT_ID,
  organization_id: ORG_ID,
  reported_by: reporter.id,
  type: 'road',
  description: 'Synthetic incident report',
  location: 'Synthetic location',
  latitude: 10.1,
  longitude: 124.8,
  status: 'pending',
  priority: 'high',
  ...overrides
});

const query = (payload) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  range: jest.fn().mockResolvedValue(payload),
  maybeSingle: jest.fn().mockResolvedValue(payload),
  update: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue(payload)
});

const setupQueries = (queries, rpcResponse = {
  data: {
    status: 'assigned',
    report: reportWith({ status: 'dispatched', assigned_team_id: TEAM_ID })
  },
  error: null
}) => {
  const remaining = [...queries];
  const from = jest.fn(() => {
    const next = remaining.shift();
    if (!next) throw new Error('Unexpected extra database query');
    return next;
  });
  getClient.mockReturnValue({
    from,
    rpc: jest.fn().mockResolvedValue(rpcResponse)
  });
  return from;
};

const buildApp = (user = reporter) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use('/emergency-reports', emergencyRouter);
  return app;
};

const listReports = (reports, user = reporter) => {
  const listQuery = query({ data: reports, error: null });
  setupQueries([listQuery]);
  return request(buildApp(user)).get('/emergency-reports');
};

describe('emergency report coordinate response contract', () => {
  beforeEach(() => jest.clearAllMocks());

  test.each([
    ['valid numeric pair', 10.25, 124.75, { latitude: 10.25, longitude: 124.75 }],
    ['zero pair', 0, 0, { latitude: 0, longitude: 0 }],
    ['inclusive boundaries', -90, 180, { latitude: -90, longitude: 180 }],
    ['supported decimal and exponent strings', ' +12.5 ', '1.248e2', { latitude: 12.5, longitude: 124.8 }]
  ])('normalizes %s through the real list route', async (_label, latitude, longitude, expected) => {
    const response = await listReports([reportWith({ latitude, longitude })]);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      latitude,
      longitude,
      coordinates: expected
    });
  });

  test.each([
    ['null pair', null, null],
    ['missing pair', undefined, undefined],
    ['partial pair', 10, undefined],
    ['empty strings', '', ''],
    ['whitespace strings', ' ', '\t '],
    ['malformed strings', '12north', '124.8'],
    ['hexadecimal strings', '0x10', '124.8'],
    ['NaN', NaN, 124.8],
    ['positive infinity', Infinity, 124.8],
    ['negative infinity', -Infinity, 124.8],
    ['conversion overflow', '1e999', 124.8],
    ['boolean', true, 124.8],
    ['array', [10], 124.8],
    ['object', { value: 10 }, 124.8],
    ['out-of-range latitude', 90.0001, 124.8],
    ['out-of-range longitude', 10, -180.0001]
  ])('returns null nested coordinates for %s', async (_label, latitude, longitude) => {
    const response = await listReports([reportWith({
      latitude,
      longitude,
      coordinates: { latitude: 45, longitude: 90 },
      evidence: [{ captureLocation: { latitude: 1, longitude: 2 } }],
      deviceLocation: { latitude: 3, longitude: 4 }
    })]);

    expect(response.status).toBe(200);
    expect(response.body.data[0].coordinates).toBeNull();
  });

  test('list response preserves flat fields and reporter, responder, and team metadata', async () => {
    const report = reportWith({
      reporter: { name: 'Synthetic Reporter', phone: '0000000000' },
      responder: { name: 'Synthetic Responder' },
      assigned_team: { id: TEAM_ID, name: 'Synthetic Team', team_leader: { id: 'leader-1', name: 'Synthetic Leader' } }
    });

    const response = await listReports([report]);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      latitude: 10.1,
      longitude: 124.8,
      coordinates: { latitude: 10.1, longitude: 124.8 },
      reporter_name: 'Synthetic Reporter',
      reporter_phone: '0000000000',
      responder_name: 'Synthetic Responder',
      assigned_team: report.assigned_team
    });
  });

  test('preexisting nested coordinates and unrelated location metadata cannot override missing flat fields', async () => {
    const report = reportWith({
      latitude: undefined,
      longitude: undefined,
      coordinates: { latitude: 4, longitude: 5 },
      location: 'Unknown location',
      address: 'Synthetic address',
      evidence: [{ captureLocation: { latitude: 6, longitude: 7 } }],
      deviceLocation: { latitude: 8, longitude: 9 },
      organization: { latitude: 10, longitude: 11 }
    });

    const response = await listReports([report]);

    expect(response.status).toBe(200);
    expect(response.body.data[0].coordinates).toBeNull();
  });

  test('preexisting nested coordinates cannot override a valid canonical flat pair', async () => {
    const response = await listReports([reportWith({
      latitude: 10.1,
      longitude: 124.8,
      coordinates: { latitude: 40, longitude: 50 }
    })]);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      latitude: 10.1,
      longitude: 124.8,
      coordinates: { latitude: 10.1, longitude: 124.8 }
    });
  });

  test('citizen detail preserves ownership scope and does not expose the assigned team relation', async () => {
    const report = reportWith({
      reporter: { name: 'Synthetic Reporter', phone: '0000000000' },
      responder: { name: 'Synthetic Responder' },
      assigned_team_id: TEAM_ID,
      assigned_team: { id: TEAM_ID, name: 'Synthetic Team' }
    });
    const originalReporter = { ...report.reporter };
    const detailQuery = query({ data: report, error: null });
    const from = setupQueries([detailQuery]);

    const response = await request(buildApp())
      .get(`/emergency-reports/${REPORT_ID}`);

    expect(response.status).toBe(200);
    expect(detailQuery.eq).toHaveBeenCalledWith('reported_by', reporter.id);
    expect(detailQuery.select.mock.calls[0][0]).not.toContain('assigned_team:');
    expect(response.body.data).toMatchObject({
      latitude: 10.1,
      longitude: 124.8,
      coordinates: { latitude: 10.1, longitude: 124.8 },
      reporter_name: 'Synthetic Reporter',
      reporter_phone: '0000000000',
      responder_name: 'Synthetic Responder'
    });
    expect(response.body.data).not.toHaveProperty('assigned_team');
    expect(from).toHaveBeenCalledTimes(1);
    expect(report.reporter).toEqual(originalReporter);
    expect(report).not.toHaveProperty('reporter_name');
    expect(report).not.toHaveProperty('coordinates');
  });

  test('citizens cannot retrieve another citizen report', async () => {
    const detailQuery = query({ data: null, error: null });
    setupQueries([detailQuery]);

    const response = await request(buildApp())
      .get(`/emergency-reports/${REPORT_ID}`);

    expect(response.status).toBe(404);
    expect(detailQuery.eq).toHaveBeenCalledWith('reported_by', reporter.id);
    expect(response.body.data).toBeUndefined();
  });

  test('responder detail exposes only the team retained by the report assignment', async () => {
    const report = reportWith({
      assigned_team_id: TEAM_ID,
      assigned_team: { id: TEAM_ID, name: 'Retained Team' }
    });
    const detailQuery = query({ data: report, error: null });
    const from = setupQueries([detailQuery]);

    const response = await request(buildApp(responder))
      .get(`/emergency-reports/${REPORT_ID}`);

    expect(response.status).toBe(200);
    expect(detailQuery.select.mock.calls[0][0]).toContain(
      'assigned_team:rescue_teams!assigned_team_id(id, name)'
    );
    expect(detailQuery.eq).toHaveBeenCalledWith('id', REPORT_ID);
    expect(response.body.data.assigned_team).toEqual({
      id: TEAM_ID,
      name: 'Retained Team'
    });
    expect(Object.keys(response.body.data.assigned_team).sort()).toEqual(['id', 'name']);
    expect(from).toHaveBeenCalledTimes(1);
  });

  test('formats status-update response', async () => {
    setupQueries([
      query({ data: { id: REPORT_ID, organization_id: ORG_ID, assigned_team_id: TEAM_ID, status: 'dispatched', responder_id: null }, error: null }),
      query({ data: { id: TEAM_ID, organization_id: ORG_ID, team_leader_id: responder.id }, error: null }),
      query({ data: null, error: null }),
      query({ data: reportWith({ status: 'responding', latitude: 0, longitude: -180 }), error: null })
    ]);

    const response = await request(buildApp(responder))
      .put(`/emergency-reports/${REPORT_ID}`)
      .send({ status: 'responding' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      latitude: 0,
      longitude: -180,
      coordinates: { latitude: 0, longitude: -180 }
    });
  });

  test('formats team-assignment response', async () => {
    setupQueries([
      query({ data: { id: REPORT_ID, organization_id: ORG_ID, status: 'pending' }, error: null }),
      query({ data: { id: TEAM_ID }, error: null }),
      query({ data: [{ id: 'personnel-1' }], error: null }),
      query({ data: reportWith({ status: 'dispatched', latitude: '90', longitude: '-180' }), error: null })
    ], {
      data: {
        status: 'assigned',
        report: reportWith({ status: 'dispatched', assigned_team_id: TEAM_ID, latitude: '90', longitude: '-180' })
      },
      error: null
    });

    const response = await request(buildApp(admin))
      .post(`/emergency-reports/${REPORT_ID}/assign-team`)
      .send({ teamId: TEAM_ID });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      latitude: '90',
      longitude: '-180',
      coordinates: { latitude: 90, longitude: -180 }
    });
  });
});
