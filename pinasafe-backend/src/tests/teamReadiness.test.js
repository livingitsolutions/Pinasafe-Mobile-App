const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  canAccessOrganization: (user, organizationId) => user.organization_id === organizationId
}));

jest.mock('../middleware/validation', () => ({
  validateTeamCreate: (req, res, next) => next(),
  validateTeamUpdate: (req, res, next) => next(),
  validateTeamMember: (req, res, next) => next(),
  validateUUID: () => (req, res, next) => next(),
}));

jest.mock('../config/database', () => ({
  getClient: jest.fn()
}));

const { getClient } = require('../config/database');
const teamsRouter = require('../routes/teams');

const buildQuery = (payload) => {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(payload),
    single: jest.fn().mockResolvedValue(payload)
  };
  query.then = (resolve, reject) => Promise.resolve(payload).then(resolve, reject);
  return query;
};

const buildApp = (user = { id: 'admin-1', role: 'admin', organization_id: 'org-1' }) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use('/teams', teamsRouter);
  return app;
};

const UUID_1 = '123e4567-e89b-12d3-a456-426614174001';
const UUID_2 = '123e4567-e89b-12d3-a456-426614174002';

describe('team list enrichment with personnel data', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /teams enriches members with personnel_role and is_active', async () => {
    const teamPayload = {
      data: [{ id: 'team-1', name: 'Team A', is_active: true, organization_id: 'org-1', team_leader_id: UUID_1 }],
      error: null
    };
    const membersPayload = {
      data: [{ id: 'tm-1', team_id: 'team-1', user_id: UUID_1, position: 'Team Leader' }],
      error: null
    };
    const personnelPayload = {
      data: [{ user_id: UUID_1, personnel_role: 'rescue_member', is_active: true }],
      error: null
    };

    const teamQuery = buildQuery(teamPayload);
    const memberQuery = buildQuery(membersPayload);
    const personnelQuery = buildQuery(personnelPayload);

    getClient.mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(teamQuery)
        .mockReturnValueOnce(memberQuery)
        .mockReturnValueOnce(personnelQuery)
    });

    const response = await request(buildApp()).get('/teams');

    expect(response.status).toBe(200);
    const team = response.body.data[0];
    expect(team.members).toHaveLength(1);
    expect(team.members[0].personnel_role).toBe('rescue_member');
    expect(team.members[0].is_active).toBe(true);
  });

  test('GET /teams handles team with no members', async () => {
    const teamPayload = {
      data: [{ id: 'team-1', name: 'Empty Team', is_active: true, organization_id: 'org-1' }],
      error: null
    };
    const membersPayload = { data: [], error: null };

    const teamQuery = buildQuery(teamPayload);
    const memberQuery = buildQuery(membersPayload);

    getClient.mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(teamQuery)
        .mockReturnValueOnce(memberQuery)
    });

    const response = await request(buildApp()).get('/teams');

    expect(response.status).toBe(200);
    expect(response.body.data[0].members).toEqual([]);
  });

  test('GET /teams/:id enriches single team members with personnel data', async () => {
    const teamPayload = {
      data: { id: 'team-1', name: 'Team A', is_active: true, organization_id: 'org-1' },
      error: null
    };
    const membersPayload = {
      data: [
        { id: 'tm-1', team_id: 'team-1', user_id: UUID_1 },
        { id: 'tm-2', team_id: 'team-1', user_id: UUID_2 }
      ],
      error: null
    };
    const personnelPayload = {
      data: [
        { user_id: UUID_1, personnel_role: 'rescue_member', is_active: true },
        { user_id: UUID_2, personnel_role: 'staff', is_active: false }
      ],
      error: null
    };

    const teamQuery = buildQuery(teamPayload);
    const memberQuery = buildQuery(membersPayload);
    const personnelQuery = buildQuery(personnelPayload);

    getClient.mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(teamQuery)
        .mockReturnValueOnce(memberQuery)
        .mockReturnValueOnce(personnelQuery)
    });

    const response = await request(buildApp()).get('/teams/team-1');

    expect(response.status).toBe(200);
    const members = response.body.data.members;
    expect(members).toHaveLength(2);
    expect(members[0].personnel_role).toBe('rescue_member');
    expect(members[0].is_active).toBe(true);
    expect(members[1].personnel_role).toBe('staff');
    expect(members[1].is_active).toBe(false);
  });
});

describe('team creation persists leader and members', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /teams with teamLeaderId sets team_leader_id and updates personnel', async () => {
    const leaderPersonnelPayload = {
      data: { id: 'person-1', user_id: UUID_1, personnel_role: 'rescue_member', organization_id: 'org-1' },
      error: null
    };
    const teamInsertPayload = {
      data: { id: 'team-1', name: 'Team A', is_active: true, team_leader_id: UUID_1, organization_id: 'org-1' },
      error: null
    };
    const personnelUpdatePayload = { error: null };

    const leaderQuery = buildQuery(leaderPersonnelPayload);
    const insertQuery = buildQuery(teamInsertPayload);
    const updateQuery = buildQuery(personnelUpdatePayload);

    getClient.mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(leaderQuery)
        .mockReturnValueOnce(insertQuery)
        .mockReturnValueOnce(updateQuery)
    });

    const response = await request(buildApp())
      .post('/teams')
      .send({ name: 'Team A', teamLeaderId: UUID_1 });

    expect(response.status).toBe(201);
    expect(response.body.data.team_leader_id).toBe(UUID_1);
    expect(response.body.data.members).toEqual([]);
    expect(updateQuery.update).toHaveBeenCalledWith({ team_id: expect.any(String), team_position: 'Team Leader' });
    expect(updateQuery.eq).toHaveBeenCalledWith('user_id', UUID_1);
  });

  test('POST /teams without teamLeaderId creates team with null leader', async () => {
    const teamInsertPayload = {
      data: { id: 'team-1', name: 'Team A', is_active: true, team_leader_id: null, organization_id: 'org-1' },
      error: null
    };

    const insertQuery = buildQuery(teamInsertPayload);

    getClient.mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(insertQuery)
    });

    const response = await request(buildApp())
      .post('/teams')
      .send({ name: 'Team A' });

    expect(response.status).toBe(201);
    expect(response.body.data.team_leader_id).toBeNull();
  });

  test('POST /teams rejects invalid leader who is not a rescue_member', async () => {
    const leaderPersonnelPayload = { data: null, error: null };

    const leaderQuery = buildQuery(leaderPersonnelPayload);

    getClient.mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(leaderQuery)
    });

    const response = await request(buildApp())
      .post('/teams')
      .send({ name: 'Team A', teamLeaderId: UUID_1 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Team leader must be a rescue member');
  });
});

describe('team member addition validates rescue_member eligibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /teams/:id/members rejects non-rescue_member personnel', async () => {
    const teamPayload = {
      data: { id: 'team-1', organization_id: 'org-1', is_active: true },
      error: null
    };
    const personnelPayload = { data: null, error: null };

    const teamQuery = buildQuery(teamPayload);
    const personnelQuery = buildQuery(personnelPayload);

    getClient.mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(teamQuery)
        .mockReturnValueOnce(personnelQuery)
    });

    const response = await request(buildApp())
      .post('/teams/team-1/members')
      .send({ userId: UUID_2 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('active rescue member');
  });

  test('POST /teams/:id/members adds rescue_member and updates personnel team_id', async () => {
    const teamPayload = {
      data: { id: 'team-1', organization_id: 'org-1', is_active: true },
      error: null
    };
    const personnelPayload = {
      data: { id: 'person-1', user_id: UUID_1, personnel_role: 'rescue_member', is_active: true, organization_id: 'org-1' },
      error: null
    };
    const memberInsertPayload = {
      data: { id: 'tm-1', team_id: 'team-1', user_id: UUID_1, position: 'Member' },
      error: null
    };
    const personnelUpdatePayload = { error: null };

    const teamQuery = buildQuery(teamPayload);
    const personnelQuery = buildQuery(personnelPayload);
    const insertQuery = buildQuery(memberInsertPayload);
    const updateQuery = buildQuery(personnelUpdatePayload);

    getClient.mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(teamQuery)
        .mockReturnValueOnce(personnelQuery)
        .mockReturnValueOnce(insertQuery)
        .mockReturnValueOnce(updateQuery)
    });

    const response = await request(buildApp())
      .post('/teams/team-1/members')
      .send({ userId: UUID_1 });

    expect(response.status).toBe(201);
    expect(updateQuery.update).toHaveBeenCalledWith({ team_id: 'team-1', team_position: 'Member' });
  });
});
