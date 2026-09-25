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

const { getClient } = require('../config/database');
const usersRouter = require('../routes/users');
const personnelRouter = require('../routes/personnel');
const teamsRouter = require('../routes/teams');
const locationTrackingRouter = require('../routes/location-tracking');

const buildQuery = (payload) => {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(payload),
    single: jest.fn().mockResolvedValue(payload)
  };
  query.then = (resolve, reject) => Promise.resolve(payload).then(resolve, reject);
  return query;
};

const buildApp = (path, router, user = { id: 'admin-1', role: 'admin', organization_id: 'org-1' }) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use(path, router);
  return app;
};

describe('mutation integrity predicates and field allowlists', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('user role update constrains the final update by organization', async () => {
    const targetQuery = buildQuery({ data: { id: 'user-2', organization_id: 'org-1' }, error: null });
    const updateQuery = buildQuery({ data: { id: 'user-2' }, error: null });
    getClient.mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(targetQuery)
        .mockReturnValueOnce(updateQuery)
    });

    const response = await request(buildApp('/users', usersRouter))
      .put('/users/user-2/role')
      .send({ role: 'responder', organization_id: 'org-2', verified: true });

    expect(response.status).toBe(200);
    expect(updateQuery.eq).toHaveBeenCalledWith('id', 'user-2');
    expect(updateQuery.eq).toHaveBeenCalledWith('organization_id', 'org-1');
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({ role: 'responder' }));
    expect(updateQuery.update.mock.calls[0][0]).not.toHaveProperty('organization_id');
    expect(updateQuery.update.mock.calls[0][0]).not.toHaveProperty('verified');
  });

  test('existing-user personnel assignment constrains a previously unassigned user', async () => {
    const userQuery = buildQuery({ data: { id: 'user-2', organization_id: null }, error: null });
    const assignmentQuery = buildQuery({ error: null });
    const personnelQuery = buildQuery({ data: { id: 'person-1' }, error: null });
    getClient.mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(userQuery)
        .mockReturnValueOnce(assignmentQuery)
        .mockReturnValueOnce(personnelQuery)
    });

    const response = await request(buildApp('/personnel', personnelRouter))
      .post('/personnel')
      .send({
        userId: 'user-2',
        name: 'Responder',
        contactNumber: '09171234567',
        personnelRole: 'rescue_member',
        organization_id: 'org-2',
        role: 'admin'
      });

    expect(response.status).toBe(201);
    expect(assignmentQuery.is).toHaveBeenCalledWith('organization_id', null);
    expect(assignmentQuery.update.mock.calls[0][0]).toEqual({
      organization_id: 'org-1',
      role: 'responder'
    });
  });

  test('personnel update constrains the final write and ignores injected ownership fields', async () => {
    const existingQuery = buildQuery({ data: { id: 'person-1', organization_id: 'org-1', user_id: 'user-1' }, error: null });
    const updateQuery = buildQuery({ data: { id: 'person-1' }, error: null });
    const fetchQuery = buildQuery({ data: { id: 'person-1' }, error: null });
    getClient.mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(existingQuery)
        .mockReturnValueOnce(updateQuery)
        .mockReturnValueOnce(fetchQuery)
    });

    const response = await request(buildApp('/personnel', personnelRouter))
      .put('/personnel/123e4567-e89b-12d3-a456-426614174001')
      .send({
        contactNumber: '09171234567',
        organization_id: 'org-2',
        user_id: 'user-2',
        password_hash: 'injected'
      });

    expect(response.status).toBe(200);
    expect(updateQuery.eq).toHaveBeenCalledWith('id', '123e4567-e89b-12d3-a456-426614174001');
    expect(updateQuery.eq).toHaveBeenCalledWith('organization_id', 'org-1');
    expect(updateQuery.update.mock.calls[0][0]).toEqual({ contact_number: '09171234567' });
  });

  test('team update constrains the final write by organization and ignores injected ownership', async () => {
    const existingQuery = buildQuery({ data: { id: 'team-1', organization_id: 'org-1', team_leader_id: null }, error: null });
    const updateQuery = buildQuery({ data: { id: 'team-1' }, error: null });
    getClient.mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(existingQuery)
        .mockReturnValueOnce(updateQuery)
    });

    const response = await request(buildApp('/teams', teamsRouter))
      .put('/teams/123e4567-e89b-12d3-a456-426614174002')
      .send({ name: 'Updated', organization_id: 'org-2', created_by: 'other-user' });

    expect(response.status).toBe(200);
    expect(updateQuery.eq).toHaveBeenCalledWith('id', '123e4567-e89b-12d3-a456-426614174002');
    expect(updateQuery.eq).toHaveBeenCalledWith('organization_id', 'org-1');
    expect(updateQuery.update.mock.calls[0][0]).toEqual(expect.objectContaining({ name: 'Updated' }));
    expect(updateQuery.update.mock.calls[0][0]).not.toHaveProperty('organization_id');
    expect(updateQuery.update.mock.calls[0][0]).not.toHaveProperty('created_by');
  });

  test('location update constrains the tracking write by its authorized relationships', async () => {
    const reportQuery = buildQuery({ data: { id: 'report-1', organization_id: 'org-1' }, error: null });
    const trackingQuery = buildQuery({ data: { id: 'track-1', team_id: 'team-1', emergency_report_id: 'report-1' }, error: null });
    const teamQuery = buildQuery({ data: { id: 'team-1', organization_id: 'org-1' }, error: null });
    const updateQuery = buildQuery({ data: { id: 'track-1' }, error: null });
    getClient.mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(reportQuery)
        .mockReturnValueOnce(trackingQuery)
        .mockReturnValueOnce(teamQuery)
        .mockReturnValueOnce(updateQuery)
    });

    const response = await request(buildApp(
      '/location-tracking',
      locationTrackingRouter,
      { id: 'responder-1', role: 'responder', organization_id: 'org-1' }
    ))
      .put('/location-tracking/update/123e4567-e89b-12d3-a456-426614174003')
      .send({ latitude: 14, longitude: 121, user_id: 'other-user', organization_id: 'org-2' });

    expect(response.status).toBe(200);
    expect(updateQuery.eq).toHaveBeenCalledWith('id', 'track-1');
    expect(updateQuery.eq).toHaveBeenCalledWith('team_id', 'team-1');
    expect(updateQuery.eq).toHaveBeenCalledWith('user_id', 'responder-1');
    expect(updateQuery.eq).toHaveBeenCalledWith('emergency_report_id', '123e4567-e89b-12d3-a456-426614174003');
    expect(updateQuery.eq).toHaveBeenCalledWith('is_active', true);
    expect(updateQuery.update.mock.calls[0][0]).not.toHaveProperty('organization_id');
    expect(updateQuery.update.mock.calls[0][0]).not.toHaveProperty('user_id');
  });
});
