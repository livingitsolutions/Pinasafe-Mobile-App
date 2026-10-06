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

jest.mock('../config/database', () => ({ getClient: jest.fn() }));

jest.mock('../services/incidentClusteringService', () => ({
  findMatchingCluster: jest.fn(),
  createCluster: jest.fn(),
  addToCluster: jest.fn(),
  notifyClusterSubscribers: jest.fn().mockResolvedValue(undefined)
}));

const { getClient } = require('../config/database');
const emergencyRouter = require('../routes/emergency');

const REPORT_ID = '123e4567-e89b-12d3-a456-426614174020';
const TEAM_ID = '123e4567-e89b-12d3-a456-426614174021';
const OTHER_TEAM_ID = '123e4567-e89b-12d3-a456-426614174022';
const ORG_ID = 'org-1';
const OTHER_ORG_ID = 'org-2';

const admin = { id: 'admin-1', role: 'admin', organization_id: ORG_ID };
const responder = { id: 'responder-1', role: 'responder', organization_id: ORG_ID };
const otherResponder = { id: 'responder-2', role: 'responder', organization_id: ORG_ID };
const crossOrgResponder = { id: 'responder-3', role: 'responder', organization_id: OTHER_ORG_ID };
const leaderResponder = { id: 'leader-1', role: 'responder', organization_id: ORG_ID };

const buildQuery = (payload) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue(payload),
  single: jest.fn().mockResolvedValue(payload),
  limit: jest.fn().mockResolvedValue(payload)
});

// Supplies mocked `.from()` query builders in call order; throws if the route
// makes more Supabase calls than the test expects.
const mockFromSequence = (queries, rpcResponse = {
  data: {
    status: 'assigned',
    report: {
      id: REPORT_ID,
      organization_id: ORG_ID,
      status: 'dispatched',
      assigned_team_id: TEAM_ID
    }
  },
  error: null
}) => {
  const remaining = [...queries];
  const from = jest.fn(() => {
    const next = remaining.shift();
    if (!next) {
      throw new Error('Unexpected extra supabase .from() call');
    }
    return next;
  });
  const rpc = jest.fn().mockResolvedValue(rpcResponse);
  getClient.mockReturnValue({ from, rpc });
  return { from, rpc };
};

const buildApp = (user) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use('/emergency-reports', emergencyRouter);
  return app;
};

const pendingReport = (overrides = {}) => ({
  id: REPORT_ID,
  organization_id: ORG_ID,
  status: 'pending',
  ...overrides
});

const dispatchedReport = (overrides = {}) => ({
  id: REPORT_ID,
  organization_id: ORG_ID,
  assigned_team_id: TEAM_ID,
  status: 'dispatched',
  responder_id: null,
  ...overrides
});

const teamRecord = (overrides = {}) => ({
  id: TEAM_ID,
  organization_id: ORG_ID,
  team_leader_id: leaderResponder.id,
  ...overrides
});

describe('Emergency dispatch and response lifecycle (B6.12)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /emergency-reports/:id/assign-team', () => {
    test('A. admin assigns active same-org team with rescue members to pending report', async () => {
      const reportQuery = buildQuery({ data: pendingReport(), error: null });
      const teamQuery = buildQuery({ data: { id: TEAM_ID }, error: null });
      const personnelQuery = buildQuery({ data: [{ id: 'personnel-1' }], error: null });
      const { rpc } = mockFromSequence([reportQuery, teamQuery, personnelQuery]);

      const response = await request(buildApp(admin))
        .post(`/emergency-reports/${REPORT_ID}/assign-team`)
        .send({ teamId: TEAM_ID });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('dispatched');
      expect(rpc).toHaveBeenCalledWith('assign_emergency_report_team_atomic', {
        p_report_id: REPORT_ID,
        p_team_id: TEAM_ID,
        p_organization_id: ORG_ID,
        p_assigned_by: admin.id
      });
    });

    test('concurrent sibling assignments serialize and leave the losing report pending', async () => {
        const reports = [
          { id: REPORT_ID, organization_id: ORG_ID, cluster_id: 'cluster-1', status: 'pending', assigned_team_id: null },
          { id: '123e4567-e89b-12d3-a456-426614174023', organization_id: ORG_ID, cluster_id: 'cluster-1', status: 'pending', assigned_team_id: null },
          { id: '123e4567-e89b-12d3-a456-426614174024', organization_id: ORG_ID, cluster_id: 'cluster-2', status: 'pending', assigned_team_id: null },
          { id: '123e4567-e89b-12d3-a456-426614174025', organization_id: ORG_ID, cluster_id: null, status: 'pending', assigned_team_id: null }
        ];
        let rpcTail = Promise.resolve();
        const rpc = jest.fn((_name, parameters) => {
          const operation = rpcTail.then(() => {
            const target = reports.find(report => report.id === parameters.p_report_id);
            const operationalId = target.cluster_id || target.id;
            if (reports.some(report => report.organization_id === target.organization_id
              && (report.cluster_id || report.id) === operationalId
              && report.assigned_team_id)) {
              return { status: 'operational_assignment_exists' };
            }
            if (target.status !== 'pending' || target.assigned_team_id) {
              return { status: 'report_not_pending' };
            }
            target.assigned_team_id = parameters.p_team_id;
            target.status = 'dispatched';
            return { status: 'assigned', report: { ...target } };
          });
          rpcTail = operation.then(() => undefined);
          return operation.then(data => ({ data, error: null }));
        });
        const client = {
          from: jest.fn(table => {
            let filters = {};
            const query = {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn((field, value) => {
                filters = { ...filters, [field]: value };
                return query;
              }),
              maybeSingle: jest.fn(async () => {
                if (table === 'emergency_reports') {
                  return { data: reports.find(report => report.id === filters.id) || null, error: null };
                }
                return { data: { id: TEAM_ID, name: 'Team Alpha' }, error: null };
              }),
              limit: jest.fn(async () => ({ data: [{ id: 'personnel-1' }], error: null }))
            };
            return query;
          }),
          rpc
        };
        getClient.mockReturnValue(client);

        const siblingId = reports[1].id;
        const [first, second] = await Promise.all([
          request(buildApp(admin)).post(`/emergency-reports/${REPORT_ID}/assign-team`).send({ teamId: TEAM_ID }),
          request(buildApp(admin)).post(`/emergency-reports/${siblingId}/assign-team`).send({ teamId: TEAM_ID })
        ]);

        expect([first.status, second.status].filter(status => status === 200)).toHaveLength(1);
        expect([first.status, second.status].filter(status => status === 409)).toHaveLength(1);
        expect(reports.filter(report => report.cluster_id === 'cluster-1' && report.assigned_team_id)).toHaveLength(1);
        expect(reports.filter(report => report.cluster_id === 'cluster-1' && report.status === 'pending')).toHaveLength(1);

        const differentIncident = await request(buildApp(admin))
          .post(`/emergency-reports/${reports[2].id}/assign-team`)
          .send({ teamId: TEAM_ID });
        const unclusteredReport = await request(buildApp(admin))
          .post(`/emergency-reports/${reports[3].id}/assign-team`)
          .send({ teamId: TEAM_ID });

        expect(differentIncident.status).toBe(200);
        expect(unclusteredReport.status).toBe(200);
        expect(rpc).toHaveBeenCalledTimes(4);
    });

    test('B. responder cannot assign team', async () => {
      mockFromSequence([]);

      const response = await request(buildApp(responder))
        .post(`/emergency-reports/${REPORT_ID}/assign-team`)
        .send({ teamId: TEAM_ID });

      expect(response.status).toBe(403);
    });

    test('C. cross-org team assignment denied', async () => {
      const reportQuery = buildQuery({ data: pendingReport(), error: null });
      const teamQuery = buildQuery({ data: null, error: null });
      mockFromSequence([reportQuery, teamQuery]);

      const response = await request(buildApp(admin))
        .post(`/emergency-reports/${REPORT_ID}/assign-team`)
        .send({ teamId: OTHER_TEAM_ID });

      expect(response.status).toBe(404);
    });

    test('C2. report outside the admin organization is denied before RPC', async () => {
      const reportQuery = buildQuery({ data: pendingReport({ organization_id: OTHER_ORG_ID }), error: null });
      const { rpc } = mockFromSequence([reportQuery]);

      const response = await request(buildApp(admin))
        .post(`/emergency-reports/${REPORT_ID}/assign-team`)
        .send({ teamId: TEAM_ID });

      expect(response.status).toBe(403);
      expect(rpc).not.toHaveBeenCalled();
    });

    test('D. inactive team denied', async () => {
      const reportQuery = buildQuery({ data: pendingReport(), error: null });
      const teamQuery = buildQuery({ data: null, error: null });
      mockFromSequence([reportQuery, teamQuery]);

      const response = await request(buildApp(admin))
        .post(`/emergency-reports/${REPORT_ID}/assign-team`)
        .send({ teamId: TEAM_ID });

      expect(response.status).toBe(404);
    });

    test('E. non-pending assignment/reassignment denied', async () => {
      const reportQuery = buildQuery({ data: pendingReport({ status: 'dispatched' }), error: null });
      mockFromSequence([reportQuery]);

      const response = await request(buildApp(admin))
        .post(`/emergency-reports/${REPORT_ID}/assign-team`)
        .send({ teamId: TEAM_ID });

      expect(response.status).toBe(409);
    });

    test('F. assignment update constrained by pending state fails safely on concurrent change', async () => {
      const reportQuery = buildQuery({ data: pendingReport(), error: null });
      const teamQuery = buildQuery({ data: { id: TEAM_ID }, error: null });
      const personnelQuery = buildQuery({ data: [{ id: 'personnel-1' }], error: null });
      const { rpc } = mockFromSequence([reportQuery, teamQuery, personnelQuery], {
        data: { status: 'report_not_pending' },
        error: null
      });

      const response = await request(buildApp(admin))
        .post(`/emergency-reports/${REPORT_ID}/assign-team`)
        .send({ teamId: TEAM_ID });

      expect(response.status).toBe(409);
      expect(rpc).toHaveBeenCalledTimes(1);
    });

    test('F2. assignment already made on a sibling report returns a non-sensitive conflict', async () => {
      const reportQuery = buildQuery({ data: pendingReport(), error: null });
      const teamQuery = buildQuery({ data: { id: TEAM_ID }, error: null });
      const personnelQuery = buildQuery({ data: [{ id: 'personnel-1' }], error: null });
      mockFromSequence([reportQuery, teamQuery, personnelQuery], {
        data: { status: 'operational_assignment_exists' },
        error: null
      });

      const response = await request(buildApp(admin))
        .post(`/emergency-reports/${REPORT_ID}/assign-team`)
        .send({ teamId: TEAM_ID });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already assigned');
      expect(JSON.stringify(response.body)).not.toMatch(/cluster|database|sql|internal/i);
    });

    test('G2. team with no rescue members denied with 409', async () => {
      const reportQuery = buildQuery({ data: pendingReport(), error: null });
      const teamQuery = buildQuery({ data: { id: TEAM_ID }, error: null });
      const personnelQuery = buildQuery({ data: [], error: null });
      mockFromSequence([reportQuery, teamQuery, personnelQuery]);

      const response = await request(buildApp(admin))
        .post(`/emergency-reports/${REPORT_ID}/assign-team`)
        .send({ teamId: TEAM_ID });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('rescue members');
    });

    test('G3. team with only inactive rescue members denied with 409', async () => {
      const reportQuery = buildQuery({ data: pendingReport(), error: null });
      const teamQuery = buildQuery({ data: { id: TEAM_ID }, error: null });
      const personnelQuery = buildQuery({ data: [], error: null });
      mockFromSequence([reportQuery, teamQuery, personnelQuery]);

      const response = await request(buildApp(admin))
        .post(`/emergency-reports/${REPORT_ID}/assign-team`)
        .send({ teamId: TEAM_ID });

      expect(response.status).toBe(409);
    });

    test('G4. team with only non-rescue personnel denied with 409', async () => {
      const reportQuery = buildQuery({ data: pendingReport(), error: null });
      const teamQuery = buildQuery({ data: { id: TEAM_ID }, error: null });
      const personnelQuery = buildQuery({ data: [], error: null });
      mockFromSequence([reportQuery, teamQuery, personnelQuery]);

      const response = await request(buildApp(admin))
        .post(`/emergency-reports/${REPORT_ID}/assign-team`)
        .send({ teamId: TEAM_ID });

      expect(response.status).toBe(409);
    });
  });

  describe('PUT /emergency-reports/:id operational transitions', () => {
    test('G. assigned-team responder dispatched -> responding', async () => {
      const reportQuery = buildQuery({ data: dispatchedReport(), error: null });
      const teamQuery = buildQuery({ data: teamRecord(), error: null });
      const membershipQuery = buildQuery({ data: { id: 'member-1' }, error: null });
      const updateQuery = buildQuery({
        data: { id: REPORT_ID, organization_id: ORG_ID, status: 'responding', responder_id: responder.id },
        error: null
      });
      mockFromSequence([reportQuery, teamQuery, membershipQuery, updateQuery]);

      const response = await request(buildApp(responder))
        .put(`/emergency-reports/${REPORT_ID}`)
        .send({ status: 'responding' });

      expect(response.status).toBe(200);
      expect(response.body.data.responder_id).toBe(responder.id);
      expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({ responder_id: responder.id }));
      expect(updateQuery.eq).toHaveBeenCalledWith('id', REPORT_ID);
      expect(updateQuery.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
      expect(updateQuery.eq).toHaveBeenCalledWith('assigned_team_id', TEAM_ID);
      expect(updateQuery.eq).toHaveBeenCalledWith('status', 'dispatched');
    });

    test('H. unrelated same-org responder denied', async () => {
      const reportQuery = buildQuery({ data: dispatchedReport(), error: null });
      const teamQuery = buildQuery({ data: teamRecord(), error: null });
      const membershipQuery = buildQuery({ data: null, error: null });
      mockFromSequence([reportQuery, teamQuery, membershipQuery]);

      const response = await request(buildApp(otherResponder))
        .put(`/emergency-reports/${REPORT_ID}`)
        .send({ status: 'responding' });

      expect(response.status).toBe(403);
    });

    test('I. cross-org responder denied', async () => {
      const reportQuery = buildQuery({ data: dispatchedReport(), error: null });
      mockFromSequence([reportQuery]);

      const response = await request(buildApp(crossOrgResponder))
        .put(`/emergency-reports/${REPORT_ID}`)
        .send({ status: 'responding' });

      expect(response.status).toBe(403);
    });

    test('J. admin cannot perform generic operational transitions', async () => {
      mockFromSequence([]);

      const response = await request(buildApp(admin))
        .put(`/emergency-reports/${REPORT_ID}`)
        .send({ status: 'responding' });

      expect(response.status).toBe(403);
    });

    test.each([
      ['K. dispatched -> resolved rejected', dispatchedReport(), 'resolved'],
      ['L. pending -> responding rejected', dispatchedReport({ status: 'pending' }), 'responding'],
      ['M. pending -> resolved rejected', dispatchedReport({ status: 'pending' }), 'resolved'],
      ['N. responding -> dispatched rejected', dispatchedReport({ status: 'responding' }), 'dispatched'],
      ['O. resolved -> pending rejected', dispatchedReport({ status: 'resolved' }), 'pending'],
      ['O. resolved -> dispatched rejected', dispatchedReport({ status: 'resolved' }), 'dispatched'],
      ['O. resolved -> responding rejected', dispatchedReport({ status: 'resolved' }), 'responding'],
      ['O. resolved -> resolved rejected', dispatchedReport({ status: 'resolved' }), 'resolved'],
      ['P. dispatched -> dispatched (same-state) rejected', dispatchedReport({ status: 'dispatched' }), 'dispatched'],
      ['P. responding -> responding (same-state) rejected', dispatchedReport({ status: 'responding' }), 'responding']
    ])('%s', async (_name, report, targetStatus) => {
      const reportQuery = buildQuery({ data: report, error: null });
      const teamQuery = buildQuery({ data: teamRecord(), error: null });
      const membershipQuery = buildQuery({ data: { id: 'member-1' }, error: null });
      mockFromSequence([reportQuery, teamQuery, membershipQuery]);

      const response = await request(buildApp(responder))
        .put(`/emergency-reports/${REPORT_ID}`)
        .send({ status: targetStatus });

      expect(response.status).toBe(409);
    });

    test('Q. assigned-team responder responding -> resolved', async () => {
      const report = dispatchedReport({ status: 'responding', responder_id: responder.id });
      const reportQuery = buildQuery({ data: report, error: null });
      const teamQuery = buildQuery({ data: teamRecord(), error: null });
      const membershipQuery = buildQuery({ data: { id: 'member-1' }, error: null });
      const updateQuery = buildQuery({
        data: {
          id: REPORT_ID,
          organization_id: ORG_ID,
          status: 'resolved',
          responder_id: responder.id,
          resolved_at: '2026-09-28T00:00:00.000Z'
        },
        error: null
      });
      mockFromSequence([reportQuery, teamQuery, membershipQuery, updateQuery]);

      const response = await request(buildApp(responder))
        .put(`/emergency-reports/${REPORT_ID}`)
        .send({ status: 'resolved' });

      expect(response.status).toBe(200);
      expect(response.body.data.resolved_at).toBeTruthy();
      expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({ resolved_at: expect.any(String) }));
    });

    test('R. resolution preserves original responder_id instead of the resolver', async () => {
      const originalResponderId = 'responder-original';
      const report = dispatchedReport({ status: 'responding', responder_id: originalResponderId });
      const reportQuery = buildQuery({ data: report, error: null });
      const teamQuery = buildQuery({ data: teamRecord(), error: null });
      const membershipQuery = buildQuery({ data: { id: 'member-1' }, error: null });
      const updateQuery = buildQuery({
        data: { id: REPORT_ID, organization_id: ORG_ID, status: 'resolved', responder_id: originalResponderId },
        error: null
      });
      mockFromSequence([reportQuery, teamQuery, membershipQuery, updateQuery]);

      const response = await request(buildApp(otherResponder))
        .put(`/emergency-reports/${REPORT_ID}`)
        .send({ status: 'resolved' });

      expect(response.status).toBe(200);
      expect(response.body.data.responder_id).toBe(originalResponderId);
      expect(updateQuery.update.mock.calls[0][0]).not.toHaveProperty('responder_id');
    });

    test('S. responder mutation constrained by id, organization_id, assigned_team_id, and expected previous status', async () => {
      const report = dispatchedReport({ status: 'responding', responder_id: responder.id });
      const reportQuery = buildQuery({ data: report, error: null });
      const teamQuery = buildQuery({ data: teamRecord(), error: null });
      const membershipQuery = buildQuery({ data: { id: 'member-1' }, error: null });
      const updateQuery = buildQuery({ data: null, error: null });
      mockFromSequence([reportQuery, teamQuery, membershipQuery, updateQuery]);

      const response = await request(buildApp(responder))
        .put(`/emergency-reports/${REPORT_ID}`)
        .send({ status: 'resolved' });

      expect(response.status).toBe(409);
      expect(updateQuery.eq).toHaveBeenCalledWith('id', REPORT_ID);
      expect(updateQuery.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
      expect(updateQuery.eq).toHaveBeenCalledWith('assigned_team_id', TEAM_ID);
      expect(updateQuery.eq).toHaveBeenCalledWith('status', 'responding');
    });

    test('T. assigned-team leader authorized through leadership without ordinary membership', async () => {
      const reportQuery = buildQuery({ data: dispatchedReport(), error: null });
      const teamQuery = buildQuery({ data: teamRecord(), error: null });
      const membershipQuery = buildQuery({ data: null, error: null });
      const updateQuery = buildQuery({
        data: { id: REPORT_ID, organization_id: ORG_ID, status: 'responding', responder_id: leaderResponder.id },
        error: null
      });
      mockFromSequence([reportQuery, teamQuery, membershipQuery, updateQuery]);

      const response = await request(buildApp(leaderResponder))
        .put(`/emergency-reports/${REPORT_ID}`)
        .send({ status: 'responding' });

      expect(response.status).toBe(200);
      expect(response.body.data.responder_id).toBe(leaderResponder.id);
    });

    test('fails closed when the report has no assigned team', async () => {
      const reportQuery = buildQuery({ data: dispatchedReport({ assigned_team_id: null }), error: null });
      mockFromSequence([reportQuery]);

      const response = await request(buildApp(responder))
        .put(`/emergency-reports/${REPORT_ID}`)
        .send({ status: 'responding' });

      expect(response.status).toBe(404);
    });

    test('fails closed resolving a responding report with no responder_id', async () => {
      const report = dispatchedReport({ status: 'responding', responder_id: null });
      const reportQuery = buildQuery({ data: report, error: null });
      const teamQuery = buildQuery({ data: teamRecord(), error: null });
      const membershipQuery = buildQuery({ data: { id: 'member-1' }, error: null });
      mockFromSequence([reportQuery, teamQuery, membershipQuery]);

      const response = await request(buildApp(responder))
        .put(`/emergency-reports/${REPORT_ID}`)
        .send({ status: 'resolved' });

      expect(response.status).toBe(409);
    });

    test('cross-org assigned team is denied even if report organization matches', async () => {
      const reportQuery = buildQuery({ data: dispatchedReport(), error: null });
      const teamQuery = buildQuery({ data: teamRecord({ organization_id: OTHER_ORG_ID }), error: null });
      mockFromSequence([reportQuery, teamQuery]);

      const response = await request(buildApp(responder))
        .put(`/emergency-reports/${REPORT_ID}`)
        .send({ status: 'responding' });

      expect(response.status).toBe(403);
    });
  });
});
