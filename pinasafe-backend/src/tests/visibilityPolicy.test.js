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
  canAccessOrganization: (user, organizationId) => user.organization_id === organizationId
}));

jest.mock('../config/database', () => ({
  getClient: jest.fn()
}));

const { getClient } = require('../config/database');
const organizationsRouter = require('../routes/organizations');
const alertsRouter = require('../routes/alerts');
const statsRouter = require('../routes/stats');

const buildQuery = (payload) => {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(payload)
  };
  query.then = (resolve, reject) => Promise.resolve(payload).then(resolve, reject);
  return query;
};

const buildApp = (mountPath, router, user) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use(mountPath, router);
  return app;
};

describe('visibility policy boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('citizens cannot use organization discovery', async () => {
    const response = await request(buildApp('/organizations', organizationsRouter, {
      id: 'citizen-1', role: 'citizen', organization_id: null
    })).get('/organizations');

    expect(response.status).toBe(403);
    expect(getClient).not.toHaveBeenCalled();
  });

  test.each(['responder', 'admin'])('%s can use cross-organization discovery with minimized fields', async (role) => {
    const query = buildQuery({
      data: [{
        id: 'org-1',
        name: 'Rescue One',
        type: 'rescue',
        contact_number: '09000000000',
        email: 'ops@example.test',
        coverage_areas: ['Zone A'],
        is_active: true
      }],
      error: null
    });
    getClient.mockReturnValue({ from: jest.fn(() => query) });

    const response = await request(buildApp('/organizations', organizationsRouter, {
      id: `${role}-1`, role, organization_id: 'org-1'
    })).get('/organizations');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(query.select).toHaveBeenCalledWith(
      'id, name, type, contact_number, email, coverage_areas, is_active'
    );
    expect(query.eq).toHaveBeenCalledWith('is_active', true);
  });

  test('super_admin does not receive new organization discovery access', async () => {
    const response = await request(buildApp('/organizations', organizationsRouter, {
      id: 'platform-1', role: 'super_admin', organization_id: null
    })).get('/organizations');

    expect(response.status).toBe(403);
    expect(getClient).not.toHaveBeenCalled();
  });

  test('organization readiness remains scoped to the authenticated organization', async () => {
    const query = buildQuery({ data: [], error: null });
    getClient.mockReturnValue({ from: jest.fn(() => query) });

    const response = await request(buildApp('/organizations', organizationsRouter, {
      id: 'admin-1', role: 'admin', organization_id: 'org-1'
    })).get('/organizations/readiness');

    expect(response.status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith('id', 'org-1');
  });

  test('organization alerts remain tenant-scoped', async () => {
    const response = await request(buildApp('/organizations', organizationsRouter, {
      id: 'admin-1', role: 'admin', organization_id: 'org-1'
    })).get('/organizations/organization/org-2/alerts');

    expect(response.status).toBe(403);
  });

  test('system alert dismissal remains a global is_active mutation', async () => {
    const query = buildQuery({ data: { id: 'alert-1' }, error: null });
    getClient.mockReturnValue({ from: jest.fn(() => query) });

    const response = await request(buildApp('/alerts', alertsRouter, {
      id: 'admin-1', role: 'admin', organization_id: 'org-1'
    })).put('/alerts/123e4567-e89b-12d3-a456-426614174001/dismiss');

    expect(response.status).toBe(200);
    expect(query.update).toHaveBeenCalledWith({ is_active: false });
    expect(query.eq).toHaveBeenCalledWith('id', '123e4567-e89b-12d3-a456-426614174001');
    expect(query.eq).not.toHaveBeenCalledWith('user_id', expect.anything());
    expect(query.eq).not.toHaveBeenCalledWith('organization_id', expect.anything());
  });

  test('system statistics remain disabled for super_admin', async () => {
    const response = await request(buildApp('/stats', statsRouter, {
      id: 'platform-1', role: 'super_admin', organization_id: null
    })).get('/stats/system');

    expect(response.status).toBe(403);
    expect(getClient).not.toHaveBeenCalled();
  });
});
