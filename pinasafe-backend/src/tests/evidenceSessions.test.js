const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Access token required' });
    next();
  },
  requireRole: (roles) => (req, res, next) => {
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    if (!allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  }
}));

jest.mock('../config/database', () => ({
  getClient: jest.fn()
}));

const { getClient } = require('../config/database');
const evidenceRouter = require('../routes/evidence');

const sessionId = '123e4567-e89b-12d3-a456-426614174000';
const citizen = { id: '123e4567-e89b-12d3-a456-426614174001', role: 'citizen' };

const buildQuery = ({ data = null, error = null } = {}) => {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data, error }),
    maybeSingle: jest.fn().mockResolvedValue({ data, error })
  };
  return query;
};

const buildApp = (user = null) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (user) req.user = user;
    next();
  });
  app.use('/api/evidence', evidenceRouter);
  return app;
};

describe('evidence upload session endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST requires authentication', async () => {
    const response = await request(buildApp()).post('/api/evidence/sessions').send({});

    expect(response.status).toBe(401);
    expect(getClient).not.toHaveBeenCalled();
  });

  test('POST permits a citizen and creates an active session owned by that citizen', async () => {
    const query = buildQuery({
      data: { id: sessionId, status: 'active', expires_at: '2026-09-27T00:00:00.000Z' }
    });
    getClient.mockReturnValue({ from: jest.fn(() => query) });

    const response = await request(buildApp(citizen)).post('/api/evidence/sessions').send({});

    expect(response.status).toBe(201);
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      owner_user_id: citizen.id,
      status: 'active',
      expires_at: expect.any(String),
      id: expect.any(String)
    }));
    expect(query.insert.mock.calls[0][0]).not.toHaveProperty('emergency_report_id');
    expect(response.body).toEqual({
      data: { id: sessionId, status: 'active', expiresAt: '2026-09-27T00:00:00.000Z' }
    });
  });

  test.each(['responder', 'admin', 'super_admin'])('POST rejects %s role', async (role) => {
    const response = await request(buildApp({ id: citizen.id, role }))
      .post('/api/evidence/sessions')
      .send({});

    expect(response.status).toBe(403);
    expect(getClient).not.toHaveBeenCalled();
  });

  test.each([
    'owner_user_id', 'ownerUserId', 'status', 'expires_at', 'expiresAt',
    'emergency_report_id', 'emergencyReportId', 'report_id', 'reportId', 'bound_at', 'boundAt'
  ])('POST rejects client-controlled %s', async (field) => {
    const response = await request(buildApp(citizen))
      .post('/api/evidence/sessions')
      .send({ [field]: 'client-value' });

    expect(response.status).toBe(400);
    expect(getClient).not.toHaveBeenCalled();
  });

  test('POST sets expiry exactly 24 hours after server time', async () => {
    const query = buildQuery({ data: { id: sessionId, status: 'active', expires_at: '' } });
    getClient.mockReturnValue({ from: jest.fn(() => query) });
    const before = Date.now();

    await request(buildApp(citizen)).post('/api/evidence/sessions').send({});

    const insertedExpiry = Date.parse(query.insert.mock.calls[0][0].expires_at);
    const after = Date.now();
    expect(insertedExpiry - before).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
    expect(insertedExpiry - after).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  test('GET requires authentication', async () => {
    const response = await request(buildApp()).get(`/api/evidence/sessions/${sessionId}`);

    expect(response.status).toBe(401);
    expect(getClient).not.toHaveBeenCalled();
  });

  test('GET rejects malformed UUIDs', async () => {
    const response = await request(buildApp(citizen)).get('/api/evidence/sessions/not-a-uuid');

    expect(response.status).toBe(400);
    expect(getClient).not.toHaveBeenCalled();
  });

  test('GET scopes its database query by session ID and owner ID', async () => {
    const query = buildQuery({
      data: { id: sessionId, status: 'active', expires_at: new Date(Date.now() + 60000).toISOString() }
    });
    getClient.mockReturnValue({ from: jest.fn(() => query) });

    const response = await request(buildApp(citizen)).get(`/api/evidence/sessions/${sessionId}`);

    expect(response.status).toBe(200);
    expect(query.eq).toHaveBeenNthCalledWith(1, 'id', sessionId);
    expect(query.eq).toHaveBeenNthCalledWith(2, 'owner_user_id', citizen.id);
    expect(response.body.data).toEqual(expect.objectContaining({ id: sessionId, status: 'active' }));
    expect(response.body.data).not.toHaveProperty('owner_user_id');
    expect(response.body.data).not.toHaveProperty('emergency_report_id');
  });

  test.each([
    ['another user session', null],
    ['nonexistent session', null]
  ])('GET makes %s unavailable', async () => {
    const query = buildQuery({ data: null });
    getClient.mockReturnValue({ from: jest.fn(() => query) });

    const response = await request(buildApp(citizen)).get(`/api/evidence/sessions/${sessionId}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Evidence upload session not found' });
    expect(query.eq).toHaveBeenCalledWith('owner_user_id', citizen.id);
  });

  test.each([
    ['active past expiry', { id: sessionId, status: 'active', expires_at: '2000-01-01T00:00:00.000Z' }],
    ['expired status', { id: sessionId, status: 'expired', expires_at: '2099-01-01T00:00:00.000Z' }]
  ])('GET does not expose %s as usable or mutate it', async (_, data) => {
    const query = buildQuery({ data });
    const from = jest.fn(() => query);
    getClient.mockReturnValue({ from });

    const response = await request(buildApp(citizen)).get(`/api/evidence/sessions/${sessionId}`);

    expect(response.status).toBe(404);
    expect(query.insert).not.toHaveBeenCalled();
    expect(query.update).toBeUndefined();
    expect(from).toHaveBeenCalledTimes(1);
  });

  test('GET does not disclose raw provider errors', async () => {
    const query = buildQuery({ error: new Error('provider SQL secret') });
    getClient.mockReturnValue({ from: jest.fn(() => query) });

    const response = await request(buildApp(citizen)).get(`/api/evidence/sessions/${sessionId}`);

    expect(response.status).toBe(500);
    expect(response.text).not.toContain('provider SQL secret');
    expect(response.text).not.toContain('stack');
  });
});