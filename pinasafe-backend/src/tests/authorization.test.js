const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => next(),
  requireRole: (roles) => (req, res, next) => {
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    if (!allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  },
  canAccessOrganization: (user, organizationId) => {
    if (!user || !organizationId) return false;
    if (user.role !== 'admin' && user.role !== 'responder') return false;
    return user.organization_id === organizationId;
  }
}));

jest.mock('../config/database', () => ({
  getClient: jest.fn()
}));

const { getClient } = require('../config/database');
const organizationsRouter = require('../routes/organizations');
const emergencyRouter = require('../routes/emergency');
const personnelRouter = require('../routes/personnel');
const locationTrackingRouter = require('../routes/location-tracking');
const clustersRouter = require('../routes/clusters');
const statsRouter = require('../routes/stats');
const usersRouter = require('../routes/users');
const alertsRouter = require('../routes/alerts');

const buildQuery = (payload) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue(payload),
  single: jest.fn().mockResolvedValue(payload),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis()
});

describe('Authorization boundary checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('denies access to personnel outside the admin organization', async () => {
    const mockQuery = buildQuery({ data: [{ id: 'person-1', organization_id: 'org-2' }], error: null });
    const mockSupabase = { from: jest.fn(() => mockQuery) };
    getClient.mockReturnValue(mockSupabase);

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'admin-1', role: 'admin', organization_id: 'org-1' };
      next();
    });
    app.use('/organizations', organizationsRouter);

    const response = await request(app).get('/organizations/org-2/personnel');

    expect(response.status).toBe(403);
  });

  test('legacy organization personnel mutation is unavailable', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'admin-1', role: 'admin', organization_id: 'org-1' };
      next();
    });
    app.use('/organizations', organizationsRouter);

    const response = await request(app)
      .put('/organizations/personnel/123e4567-e89b-12d3-a456-426614174014')
      .send({ is_active: false });

    expect(response.status).toBe(404);
    expect(getClient).not.toHaveBeenCalled();
  });

  test('denies access to emergency reports outside the responder organization', async () => {
    const mockReport = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      organization_id: 'org-2',
      status: 'pending',
      reported_by: 'user-2',
      reporter: { name: 'Alice', phone: '123' },
      responder: null
    };

    const mockQuery = buildQuery({ data: mockReport, error: null });
    const mockSupabase = { from: jest.fn(() => mockQuery) };
    getClient.mockReturnValue(mockSupabase);

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'responder-1', role: 'responder', organization_id: 'org-1' };
      next();
    });
    app.use('/emergency', emergencyRouter);

    const response = await request(app).get('/emergency/123e4567-e89b-12d3-a456-426614174000');

    expect(response.status).toBe(403);
  });

  test('constrains emergency updates by report id and organization id', async () => {
    const reportId = '123e4567-e89b-12d3-a456-426614174015';
    const reportQuery = buildQuery({
      data: { id: reportId, organization_id: 'org-1' },
      error: null
    });
    const updateQuery = buildQuery({
      data: { id: reportId, organization_id: 'org-1', status: 'responding' },
      error: null
    });
    const mockSupabase = {
      from: jest.fn()
        .mockReturnValueOnce(reportQuery)
        .mockReturnValueOnce(updateQuery)
    };
    getClient.mockReturnValue(mockSupabase);

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'responder-1', role: 'responder', organization_id: 'org-1' };
      next();
    });
    app.use('/emergency', emergencyRouter);

    const response = await request(app)
      .put(`/emergency/${reportId}`)
      .send({ status: 'responding' });

    expect(response.status).toBe(200);
    expect(updateQuery.eq).toHaveBeenCalledWith('id', reportId);
    expect(updateQuery.eq).toHaveBeenCalledWith('organization_id', 'org-1');
  });

  test('denies citizen access to another user personnel record', async () => {
    const mockQuery = buildQuery({ data: { id: 'person-9', user_id: 'other-user', organization_id: 'org-2' }, error: null });
    const mockSupabase = { from: jest.fn(() => mockQuery) };
    getClient.mockReturnValue(mockSupabase);

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'citizen-1', role: 'citizen', organization_id: null };
      next();
    });
    app.use('/personnel', personnelRouter);

    const response = await request(app).get('/personnel/by-user/other-user');

    expect(response.status).toBe(403);
  });

  test('denies responder access to team tracking outside the organization', async () => {
    const teamQuery = buildQuery({ data: { id: '123e4567-e89b-12d3-a456-426614174011', organization_id: 'org-2' }, error: null });
    const mockSupabase = { from: jest.fn(() => teamQuery) };
    getClient.mockReturnValue(mockSupabase);

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'responder-1', role: 'responder', organization_id: 'org-1' };
      next();
    });
    app.use('/location-tracking', locationTrackingRouter);

    const response = await request(app).get('/location-tracking/team/123e4567-e89b-12d3-a456-426614174011');

    expect(response.status).toBe(403);
  });

  test('denies responder access to a cluster with no organization report', async () => {
    const subscriptionQuery = buildQuery({ data: null, error: null });
    const reportQuery = buildQuery({ data: [], error: null });
    const mockSupabase = {
      from: jest.fn((table) => table === 'incident_cluster_subscribers'
        ? subscriptionQuery
        : reportQuery)
    };
    getClient.mockReturnValue(mockSupabase);

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'responder-1', role: 'responder', organization_id: 'org-1' };
      next();
    });
    app.use('/clusters', clustersRouter);

    const response = await request(app).get('/clusters/123e4567-e89b-12d3-a456-426614174012/info');

    expect(response.status).toBe(403);
  });

  test('denies tenant admin access to platform system statistics', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'admin-1', role: 'admin', organization_id: 'org-1' };
      next();
    });
    app.use('/stats', statsRouter);

    const response = await request(app).get('/stats/system');

    expect(response.status).toBe(403);
    expect(getClient).not.toHaveBeenCalled();
  });

  test('does not introduce super_admin access to platform system statistics', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'platform-admin-1', role: 'super_admin', organization_id: null };
      next();
    });
    app.use('/stats', statsRouter);

    const response = await request(app).get('/stats/system');

    expect(response.status).toBe(403);
    expect(getClient).not.toHaveBeenCalled();
  });

  test('denies tenant admin role changes across organizations', async () => {
    const targetUserQuery = buildQuery({
      data: { id: 'user-2', organization_id: 'org-2', role: 'citizen' },
      error: null
    });
    const mockSupabase = { from: jest.fn(() => targetUserQuery) };
    getClient.mockReturnValue(mockSupabase);

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'admin-1', role: 'admin', organization_id: 'org-1' };
      next();
    });
    app.use('/users', usersRouter);

    const response = await request(app)
      .put('/users/user-2/role')
      .send({ role: 'responder' });

    expect(response.status).toBe(403);
  });

  test('denies citizens permission to dismiss system alerts', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'citizen-1', role: 'citizen', organization_id: null };
      next();
    });
    app.use('/alerts', alertsRouter);

    const response = await request(app)
      .put('/alerts/123e4567-e89b-12d3-a456-426614174013/dismiss');

    expect(response.status).toBe(403);
  });
});
