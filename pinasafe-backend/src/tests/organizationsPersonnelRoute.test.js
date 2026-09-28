const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  canAccessOrganization: (user, organizationId) => user.organization_id === organizationId
}));

jest.mock('../config/database', () => ({ getClient: jest.fn() }));

const { getClient } = require('../config/database');
const organizationsRouter = require('../routes/organizations');

const ORG_ID = '123e4567-e89b-12d3-a456-426614174001';
const OTHER_ORG_ID = '123e4567-e89b-12d3-a456-426614174002';

const buildApp = (user) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use('/organizations', organizationsRouter);
  return app;
};

const setupPersonnelQuery = (data, error = null) => {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data, error })
  };
  const from = jest.fn().mockReturnValue(query);
  getClient.mockReturnValue({ from });
  return { from, query };
};

describe('GET /organizations/:id/personnel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with an empty personnel array for an own-organization request', async () => {
    const { from } = setupPersonnelQuery([]);
    const app = buildApp({ id: 'user-1', role: 'admin', organization_id: ORG_ID });

    const response = await request(app).get(`/organizations/${ORG_ID}/personnel`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
    expect(from).toHaveBeenCalledWith('personnel');
  });

  it('returns 403 for a cross-organization request without querying the database', async () => {
    const { from } = setupPersonnelQuery([]);
    const app = buildApp({ id: 'user-1', role: 'admin', organization_id: OTHER_ORG_ID });

    const response = await request(app).get(`/organizations/${ORG_ID}/personnel`);

    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it('returns a sanitized 500 error without exposing database error details', async () => {
    setupPersonnelQuery(null, { message: 'relation "personnel" leaked details' });
    const app = buildApp({ id: 'user-1', role: 'admin', organization_id: ORG_ID });

    const response = await request(app).get(`/organizations/${ORG_ID}/personnel`);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to fetch personnel' });
    expect(JSON.stringify(response.body)).not.toContain('leaked details');
  });
});
