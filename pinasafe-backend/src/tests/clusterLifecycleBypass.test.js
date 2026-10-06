const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  canAccessOrganization: (user, organizationId) =>
    user && user.organization_id === organizationId
}));

jest.mock('../config/database', () => ({ getClient: jest.fn() }));

jest.mock('../services/incidentClusteringService', () => ({
  findMatchingCluster: jest.fn(),
  createCluster: jest.fn(),
  addToCluster: jest.fn(),
  notifyClusterSubscribers: jest.fn().mockResolvedValue({
    update: { id: 'update-1', message: 'test', status: 'responding' },
    notifiedUsers: [{ id: 'user-1' }]
  }),
  getClusterInfo: jest.fn(),
  getClusterUpdates: jest.fn(),
  getUserClusters: jest.fn()
}));

const { getClient } = require('../config/database');
const clusterRouter = require('../routes/clusters');

const CLUSTER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ORG_ID = 'org-1';
const responder = { id: 'responder-1', role: 'responder', organization_id: ORG_ID };

const buildQuery = (payload) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue(payload),
  limit: jest.fn().mockResolvedValue(payload),
  then: (resolve, reject) => Promise.resolve(payload).then(resolve, reject)
});

const buildApp = (user) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use('/clusters', clusterRouter);
  return app;
};

describe('Cluster lifecycle bypass prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('cluster update does not mutate emergency_reports status', async () => {
    const updateMock = jest.fn().mockReturnThis();
    const orgReportsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      update: updateMock,
      then: (resolve, reject) => Promise.resolve({ data: [{ id: 'report-1', organization_id: ORG_ID }], error: null }).then(resolve, reject),
      limit: jest.fn().mockResolvedValue({ data: [{ id: 'report-1' }], error: null })
    };
    const from = jest.fn(() => orgReportsQuery);
    getClient.mockReturnValue({ from });

    const response = await request(buildApp(responder))
      .post(`/clusters/${CLUSTER_ID}/updates`)
      .send({ message: 'On scene', status: 'responding' });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Cluster update sent successfully');

    expect(updateMock).not.toHaveBeenCalled();
  });

  test('cluster update does not set responder_id on emergency_reports', async () => {
    const updateMock = jest.fn().mockReturnThis();
    const orgReportsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      update: updateMock,
      then: (resolve, reject) => Promise.resolve({ data: [{ id: 'report-1', organization_id: ORG_ID }], error: null }).then(resolve, reject),
      limit: jest.fn().mockResolvedValue({ data: [{ id: 'report-1' }], error: null })
    };
    const from = jest.fn(() => orgReportsQuery);
    getClient.mockReturnValue({ from });

    await request(buildApp(responder))
      .post(`/clusters/${CLUSTER_ID}/updates`)
      .send({ message: 'En route', status: 'dispatched' });

    expect(updateMock).not.toHaveBeenCalled();
  });

  test('cluster update still sends notification to subscribers', async () => {
    const orgReportsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve, reject) => Promise.resolve({ data: [{ id: 'report-1', organization_id: ORG_ID }], error: null }).then(resolve, reject),
      limit: jest.fn().mockResolvedValue({ data: [{ id: 'report-1' }], error: null })
    };
    const from = jest.fn(() => orgReportsQuery);
    getClient.mockReturnValue({ from });

    const response = await request(buildApp(responder))
      .post(`/clusters/${CLUSTER_ID}/updates`)
      .send({ message: 'Resolved on scene', status: 'resolved' });

    expect(response.status).toBe(201);
    expect(response.body.data.notifiedUsers).toBe(1);
  });

  test('cluster update denied for responder outside the organization', async () => {
    const orgReportsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
      limit: jest.fn().mockResolvedValue({ data: [], error: null })
    };
    const from = jest.fn(() => orgReportsQuery);
    getClient.mockReturnValue({ from });

    const response = await request(buildApp(responder))
      .post(`/clusters/${CLUSTER_ID}/updates`)
      .send({ message: 'test', status: 'responding' });

    expect(response.status).toBe(403);
  });

  test('cluster read remains denied to a citizen without an existing subscription', async () => {
    const ownedReportsQuery = buildQuery({ data: [], error: null });
    getClient.mockReturnValue({ from: jest.fn(() => ownedReportsQuery) });

    const response = await request(buildApp({
      id: 'citizen-1',
      role: 'citizen',
      organization_id: null
    })).get(`/clusters/${CLUSTER_ID}/info`);

    expect(response.status).toBe(403);
    expect(require('../services/incidentClusteringService').getClusterInfo)
      .not.toHaveBeenCalled();
  });

  test('cluster read remains denied to an operations user without a same-organization report', async () => {
    const organizationReportsQuery = buildQuery({ data: [], error: null });
    getClient.mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(organizationReportsQuery)
    });

    const response = await request(buildApp(responder))
      .get(`/clusters/${CLUSTER_ID}/info`);

    expect(response.status).toBe(403);
    expect(require('../services/incidentClusteringService').getClusterInfo)
      .not.toHaveBeenCalled();
  });

  test('cluster read rejects a malformed foreign-organization report row', async () => {
    const organizationReportsQuery = buildQuery({
      data: [{ id: 'foreign-report', organization_id: 'org-2', reported_by: 'citizen-2' }],
      error: null
    });
    getClient.mockReturnValue({ from: jest.fn(() => organizationReportsQuery) });

    const response = await request(buildApp(responder))
      .get(`/clusters/${CLUSTER_ID}/info`);

    expect(organizationReportsQuery.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
    expect(response.status).toBe(403);
    expect(require('../services/incidentClusteringService').getClusterInfo)
      .not.toHaveBeenCalled();
  });

  test('citizen cluster read requires a subscription to one of their own reports', async () => {
    const ownedReportsQuery = buildQuery({
      data: [{ id: 'owned-report', organization_id: 'org-1', reported_by: 'citizen-1' }],
      error: null
    });
    const malformedSubscriptionQuery = buildQuery({
      data: { user_id: 'citizen-1', incident_id: 'foreign-report' },
      error: null
    });
    getClient.mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(ownedReportsQuery)
        .mockReturnValueOnce(malformedSubscriptionQuery)
    });

    const response = await request(buildApp({
      id: 'citizen-1',
      role: 'citizen',
      organization_id: null
    })).get(`/clusters/${CLUSTER_ID}/info`);

    expect(malformedSubscriptionQuery.in).toHaveBeenCalledWith('incident_id', ['owned-report']);
    expect(response.status).toBe(403);
    expect(require('../services/incidentClusteringService').getClusterInfo)
      .not.toHaveBeenCalled();
  });
});
