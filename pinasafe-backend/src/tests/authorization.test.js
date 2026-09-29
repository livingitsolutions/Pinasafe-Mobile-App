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
  insert: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis()
});

const buildApp = (user, mockSupabase) => {
  getClient.mockReturnValue(mockSupabase);
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use('/alerts', alertsRouter);
  return app;
};

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

  test('constrains emergency updates by report id, organization id, assigned team, and expected status', async () => {
    const reportId = '123e4567-e89b-12d3-a456-426614174015';
    const teamId = '123e4567-e89b-12d3-a456-426614174016';
    const reportQuery = buildQuery({
      data: {
        id: reportId,
        organization_id: 'org-1',
        assigned_team_id: teamId,
        status: 'dispatched',
        responder_id: null
      },
      error: null
    });
    const teamQuery = buildQuery({
      data: { id: teamId, organization_id: 'org-1', team_leader_id: 'responder-1' },
      error: null
    });
    const membershipQuery = buildQuery({ data: null, error: null });
    const updateQuery = buildQuery({
      data: { id: reportId, organization_id: 'org-1', status: 'responding' },
      error: null
    });
    const mockSupabase = {
      from: jest.fn()
        .mockReturnValueOnce(reportQuery)
        .mockReturnValueOnce(teamQuery)
        .mockReturnValueOnce(membershipQuery)
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
    expect(updateQuery.eq).toHaveBeenCalledWith('assigned_team_id', teamId);
    expect(updateQuery.eq).toHaveBeenCalledWith('status', 'dispatched');
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

  // --- Organization-type alert scope tests ---

  describe('Organization-type alert scope', () => {
    const ALERT_ID = '123e4567-e89b-12d3-a456-426614174013';

    function buildOrgQuery(orgType) {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: { type: orgType }, error: null }),
      };
    }

    function buildAlertFetchQuery(alertRow) {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: alertRow, error: null }),
      };
    }

    function buildInsertQuery(result) {
      return {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(result),
      };
    }

    test('1. fire admin can create fire alert', async () => {
      const insertQuery = buildInsertQuery({ data: { id: 'new-alert', type: 'fire' }, error: null });
      const mockSupabase = {
        from: jest.fn()
          .mockReturnValueOnce(buildOrgQuery('fire'))
          .mockReturnValueOnce(insertQuery),
      };
      const app = buildApp({ id: 'admin-1', role: 'admin', organization_id: 'fire-org-1' }, mockSupabase);

      const response = await request(app)
        .post('/alerts')
        .send({ type: 'fire', title: 'Wildfire warning', description: 'Hillside fire spreading', priority: 'high', location: 'Brgy. San Roque' });

      expect(response.status).toBe(201);
      expect(insertQuery.insert).toHaveBeenCalled();
    });

    test('2. fire admin cannot create safety alert and INSERT is not called', async () => {
      const insertQuery = buildInsertQuery({ data: { id: 'new-alert', type: 'safety' }, error: null });
      const mockSupabase = {
        from: jest.fn()
          .mockReturnValueOnce(buildOrgQuery('fire'))
          .mockReturnValueOnce(insertQuery),
      };
      const app = buildApp({ id: 'admin-1', role: 'admin', organization_id: 'fire-org-1' }, mockSupabase);

      const response = await request(app)
        .post('/alerts')
        .send({ type: 'safety', title: 'Flood warning', description: 'River rising rapidly', priority: 'high', location: 'Brgy. San Roque' });

      expect(response.status).toBe(403);
      expect(insertQuery.insert).not.toHaveBeenCalled();
    });

    test('3. rescue/MDRRMO admin can create safety alert', async () => {
      const insertQuery = buildInsertQuery({ data: { id: 'new-alert', type: 'safety' }, error: null });
      const mockSupabase = {
        from: jest.fn()
          .mockReturnValueOnce(buildOrgQuery('rescue'))
          .mockReturnValueOnce(insertQuery),
      };
      const app = buildApp({ id: 'admin-1', role: 'admin', organization_id: 'rescue-org-1' }, mockSupabase);

      const response = await request(app)
        .post('/alerts')
        .send({ type: 'safety', title: 'Flood warning', description: 'River rising rapidly', priority: 'high', location: 'Brgy. San Roque' });

      expect(response.status).toBe(201);
      expect(insertQuery.insert).toHaveBeenCalled();
    });

    test('4. rescue/MDRRMO admin cannot create fire alert and INSERT is not called', async () => {
      const insertQuery = buildInsertQuery({ data: { id: 'new-alert', type: 'fire' }, error: null });
      const mockSupabase = {
        from: jest.fn()
          .mockReturnValueOnce(buildOrgQuery('rescue'))
          .mockReturnValueOnce(insertQuery),
      };
      const app = buildApp({ id: 'admin-1', role: 'admin', organization_id: 'rescue-org-1' }, mockSupabase);

      const response = await request(app)
        .post('/alerts')
        .send({ type: 'fire', title: 'Wildfire warning', description: 'Hillside fire spreading', priority: 'high', location: 'Brgy. San Roque' });

      expect(response.status).toBe(403);
      expect(insertQuery.insert).not.toHaveBeenCalled();
    });

    test('5. matching organization-type user can dismiss matching alert', async () => {
      const alertRow = { id: ALERT_ID, type: 'fire', is_active: true };
      const updateResult = { error: null };
      const updateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue(updateResult),
      };
      const mockSupabase = {
        from: jest.fn()
          .mockReturnValueOnce(buildAlertFetchQuery(alertRow))
          .mockReturnValueOnce(buildOrgQuery('fire'))
          .mockReturnValueOnce(updateQuery),
      };
      const app = buildApp({ id: 'admin-1', role: 'admin', organization_id: 'fire-org-1' }, mockSupabase);

      const response = await request(app).put(`/alerts/${ALERT_ID}/dismiss`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Alert dismissed successfully');
    });

    test('6. mismatched organization-type user receives 403 and UPDATE is not called', async () => {
      const alertRow = { id: ALERT_ID, type: 'fire', is_active: true };
      const updateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      const mockSupabase = {
        from: jest.fn()
          .mockReturnValueOnce(buildAlertFetchQuery(alertRow))
          .mockReturnValueOnce(buildOrgQuery('rescue'))
          .mockReturnValueOnce(updateQuery),
      };
      const app = buildApp({ id: 'admin-1', role: 'admin', organization_id: 'rescue-org-1' }, mockSupabase);

      const response = await request(app).put(`/alerts/${ALERT_ID}/dismiss`);

      expect(response.status).toBe(403);
      expect(updateQuery.update).not.toHaveBeenCalled();
    });

    test('7. matching organization-type user can GET matching alert by ID', async () => {
      const alertRow = { id: ALERT_ID, type: 'safety', is_active: true, title: 'Flood warning' };
      const mockSupabase = {
        from: jest.fn()
          .mockReturnValueOnce(buildAlertFetchQuery(alertRow))
          .mockReturnValueOnce(buildOrgQuery('rescue')),
      };
      const app = buildApp({ id: 'admin-1', role: 'admin', organization_id: 'rescue-org-1' }, mockSupabase);

      const response = await request(app).get(`/alerts/${ALERT_ID}`);

      expect(response.status).toBe(200);
      expect(response.body.data.type).toBe('safety');
    });

    test('8. mismatched organization-type user cannot GET alert by ID', async () => {
      const alertRow = { id: ALERT_ID, type: 'fire', is_active: true, title: 'Wildfire warning' };
      const mockSupabase = {
        from: jest.fn()
          .mockReturnValueOnce(buildAlertFetchQuery(alertRow))
          .mockReturnValueOnce(buildOrgQuery('rescue')),
      };
      const app = buildApp({ id: 'admin-1', role: 'admin', organization_id: 'rescue-org-1' }, mockSupabase);

      const response = await request(app).get(`/alerts/${ALERT_ID}`);

      expect(response.status).toBe(403);
    });

    test('9. missing organization assignment fails before mutation', async () => {
      const alertRow = { id: ALERT_ID, type: 'fire', is_active: true };
      const updateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      const mockSupabase = {
        from: jest.fn()
          .mockReturnValueOnce(buildAlertFetchQuery(alertRow))
          .mockReturnValueOnce(updateQuery),
      };
      const app = buildApp({ id: 'admin-1', role: 'admin', organization_id: null }, mockSupabase);

      const response = await request(app).put(`/alerts/${ALERT_ID}/dismiss`);

      expect(response.status).toBe(400);
      expect(updateQuery.update).not.toHaveBeenCalled();
    });

    test('10. nonexistent alert dismissal remains non-mutating', async () => {
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };
      const app = buildApp({ id: 'admin-1', role: 'admin', organization_id: 'fire-org-1' }, mockSupabase);

      const response = await request(app).put(`/alerts/${ALERT_ID}/dismiss`);

      expect(response.status).toBe(404);
      expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    });

    test('11. unsupported organization type fails closed', async () => {
      const alertRow = { id: ALERT_ID, type: 'fire', is_active: true };
      const updateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      const mockSupabase = {
        from: jest.fn()
          .mockReturnValueOnce(buildAlertFetchQuery(alertRow))
          .mockReturnValueOnce(buildOrgQuery('unknown_type'))
          .mockReturnValueOnce(updateQuery),
      };
      const app = buildApp({ id: 'admin-1', role: 'admin', organization_id: 'unknown-org-1' }, mockSupabase);

      const response = await request(app).put(`/alerts/${ALERT_ID}/dismiss`);

      expect(response.status).toBe(403);
      expect(updateQuery.update).not.toHaveBeenCalled();
    });
  });
});
