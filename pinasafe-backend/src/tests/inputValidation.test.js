const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  canAccessOrganization: (user, organizationId) => user.organization_id === organizationId
}));

jest.mock('../config/database', () => ({
  getClient: jest.fn()
}));

jest.mock('../services/incidentClusteringService', () => ({
  findMatchingCluster: jest.fn().mockResolvedValue(null),
  createCluster: jest.fn().mockResolvedValue('cluster-1'),
  addToCluster: jest.fn(),
  notifyClusterSubscribers: jest.fn()
}));

const { getClient } = require('../config/database');
const emergencyRouter = require('../routes/emergency');
const locationTrackingRouter = require('../routes/location-tracking');
const {
  validateEmergencyStatusUpdate,
  validateLocationTracking,
  validateProfileUpdate,
  validatePersonnelUpdate,
  validateTeamAssignment,
  validateTeamMember,
  validateTeamUpdate,
  validateClusterUpdate
} = require('../middleware/validation');

const validUUID = '123e4567-e89b-12d3-a456-426614174000';

const buildQuery = (payload) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue(payload),
  single: jest.fn().mockResolvedValue(payload)
});

const buildValidationApp = (validators) => {
  const app = express();
  app.use(express.json());
  app.post('/input', validators, (req, res) => res.json({ data: req.body }));
  return app;
};

const expectRejected = async (validators, payload) => {
  const response = await request(buildValidationApp(validators)).post('/input').send(payload);
  expect(response.status).toBe(400);
  return response;
};

describe('A.5.5I input and range validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('accepts zero latitude and longitude and preserves them through emergency persistence', async () => {
    const reportQuery = buildQuery({
      data: {
        id: 'report-1',
        latitude: 0,
        longitude: 0,
        cluster_id: null
      },
      error: null
    });
    getClient.mockReturnValue({ from: jest.fn(() => reportQuery) });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'citizen-1', role: 'citizen', organization_id: null };
      next();
    });
    app.use('/emergency-reports', emergencyRouter);

    const response = await request(app)
      .post('/emergency-reports')
      .send({
        type: 'road',
        description: 'A valid emergency description',
        location: 'A valid location',
        coordinates: { latitude: 0, longitude: 0 },
        priority: 'high'
      });

    expect(response.status).toBe(201);
    expect(reportQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      latitude: 0,
      longitude: 0
    }));
  });

  test('accepts zero location telemetry values and preserves them in the insert', async () => {
    const insertQuery = buildQuery({ data: { id: 'tracking-1', latitude: 0, longitude: 0 }, error: null });
    const queries = [
      buildQuery({ data: { id: validUUID, organization_id: 'org-1', assigned_team_id: 'team-1' }, error: null }),
      buildQuery({ data: { id: 'team-1', organization_id: 'org-1', team_leader_id: 'responder-1' }, error: null }),
      buildQuery({ data: null, error: null }),
      buildQuery({ data: null, error: null }),
      insertQuery
    ];
    getClient.mockReturnValue({ from: jest.fn(() => queries.shift()) });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'responder-1', role: 'responder', organization_id: 'org-1' };
      next();
    });
    app.use('/location-tracking', locationTrackingRouter);

    const response = await request(app)
      .post(`/location-tracking/start/${validUUID}`)
      .send({ latitude: 0, longitude: 0, accuracy: 0 });

    expect(response.status).toBe(201);
    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      latitude: 0,
      longitude: 0,
      accuracy: 0
    }));
  });

  test('preserves zero values through location tracking update persistence', async () => {
    const updateQuery = buildQuery({
      data: { id: 'tracking-1' },
      error: null
    });
    const queries = [
      buildQuery({ data: { id: validUUID, organization_id: 'org-1' }, error: null }),
      buildQuery({ data: { id: 'tracking-1', team_id: 'team-1', emergency_report_id: validUUID }, error: null }),
      buildQuery({ data: { id: 'team-1', organization_id: 'org-1' }, error: null }),
      updateQuery
    ];
    getClient.mockReturnValue({ from: jest.fn(() => queries.shift()) });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'responder-1', role: 'responder', organization_id: 'org-1' };
      next();
    });
    app.use('/location-tracking', locationTrackingRouter);

    const response = await request(app)
      .put(`/location-tracking/update/${validUUID}`)
      .send({
        latitude: 0,
        longitude: 0,
        speed: 0,
        heading: 0,
        accuracy: 0,
        eta_minutes: 0
      });

    expect(response.status).toBe(200);
    expect(updateQuery.update).toHaveBeenCalledWith({
      latitude: 0,
      longitude: 0,
      speed: 0,
      heading: 0,
      accuracy: 0,
      eta_minutes: 0,
      updated_at: expect.any(String)
    });
  });

  test.each([
    [{ latitude: -90.01, longitude: 0 }],
    [{ latitude: 90.01, longitude: 0 }],
    [{ latitude: 0, longitude: -180.01 }],
    [{ latitude: 0, longitude: 180.01 }],
    [{ latitude: 0, longitude: 0, accuracy: -1 }],
    [{ latitude: 0, longitude: 0, speed: -1 }],
    [{ latitude: 0, longitude: 0, heading: -1 }],
    [{ latitude: 0, longitude: 0, heading: 360 }],
    [{ latitude: 0, longitude: 0, eta_minutes: -1 }],
    [{ latitude: 0, longitude: 0, eta_minutes: 1.5 }]
  ])('rejects invalid location boundary input %j', async (payload) => {
    await expectRejected(validateLocationTracking, payload);
  });

  test('rejects notes over 2000 characters', async () => {
    await expectRejected(validateEmergencyStatusUpdate, {
      status: 'responding',
      notes: 'x'.repeat(2001)
    });
  });

  test('rejects malformed team assignment UUID', async () => {
    await expectRejected(validateTeamAssignment, { teamId: 'not-a-uuid' });
  });

  test('rejects malformed team member user UUID', async () => {
    await expectRejected(validateTeamMember, { userId: 'not-a-uuid' });
  });

  test('rejects invalid boolean mutation fields', async () => {
    await expectRejected(validatePersonnelUpdate, { isActive: 'true' });
    await expectRejected(validateTeamUpdate, { isActive: 'false' });
  });

  test('rejects conflicting personnel role aliases', async () => {
    await expectRejected(validatePersonnelUpdate, {
      personnelRole: 'staff',
      personnel_role: 'rescue_member'
    });
  });

  test('accepts matching personnel role aliases', async () => {
    const response = await request(buildValidationApp(validatePersonnelUpdate))
      .post('/input')
      .send({ personnelRole: 'staff', personnel_role: 'staff' });

    expect(response.status).toBe(200);
  });

  test('rejects conflicting active-state aliases', async () => {
    await expectRejected(validatePersonnelUpdate, {
      isActive: true,
      is_active: false
    });
  });

  test('accepts matching active-state aliases', async () => {
    const response = await request(buildValidationApp(validatePersonnelUpdate))
      .post('/input')
      .send({ isActive: true, is_active: true });

    expect(response.status).toBe(200);
  });

  test('rejects oversized cluster messages', async () => {
    await expectRejected(validateClusterUpdate, {
      message: 'x'.repeat(1001),
      status: 'pending'
    });
  });

  test('rejects oversized profile fields', async () => {
    await expectRejected(validateProfileUpdate, {
      name: 'A'.repeat(101)
    });
    await expectRejected(validateProfileUpdate, {
      address: 'A'.repeat(501)
    });
  });

  test('accepts valid existing request shapes', async () => {
    const response = await request(buildValidationApp(validateLocationTracking))
      .post('/input')
      .send({ latitude: 14.6, longitude: 120.98, accuracy: 5, speed: 20, heading: 359.9, eta_minutes: 10 });

    expect(response.status).toBe(200);
    expect(response.body.data.latitude).toBe(14.6);

    const profileResponse = await request(buildValidationApp(validateProfileUpdate))
      .post('/input')
      .send({ name: 'Valid Name', phone: '09171234567', address: 'Valid address' });

    expect(profileResponse.status).toBe(200);
  });
});
