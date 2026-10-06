const express = require('express');
const request = require('supertest');

let mockUser = null;

jest.mock('../middleware/auth', () => {
  const actual = jest.requireActual('../middleware/auth');
  return {
    ...actual,
    authenticateToken: (req, res, next) => {
      if (!mockUser) return res.status(401).json({ error: 'Access token required' });
      req.user = mockUser;
      return next();
    }
  };
});
jest.mock('../config/database', () => ({ getClient: jest.fn() }));

const { getClient } = require('../config/database');
const clusterRouter = require('../routes/clusters');

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const CLUSTER_A = '11111111-1111-4111-8111-111111111111';
const CLUSTER_B = '22222222-2222-4222-8222-222222222222';

const report = (overrides = {}) => ({
  id: 'r-1',
  cluster_id: null,
  organization_id: ORG,
  assigned_team_id: null,
  reported_by: 'citizen-1',
  type: 'fire',
  description: 'Smoke visible',
  location: 'Main Street',
  latitude: 10.379143,
  longitude: 124.7503911,
  priority: 'medium',
  status: 'pending',
  created_at: '2026-10-05T01:00:00.000Z',
  ...overrides
});

let queries;
let acknowledgementRows;
let reportQuery;
let acknowledgementQuery;
let acknowledgementWritePending;
const mockReports = (rows, error = null) => {
  queries = [];
  acknowledgementRows = [];
  acknowledgementWritePending = false;
  reportQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    then: (resolve, reject) => Promise.resolve({ data: rows, error }).then(resolve, reject)
  };
  acknowledgementQuery = {
    select: jest.fn(() => {
      acknowledgementWritePending = false;
      return acknowledgementQuery;
    }),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    insert: jest.fn((row) => {
      acknowledgementWritePending = true;
      acknowledgementRows.push({ ...row, acknowledged_at: '2026-10-06T00:00:00.000Z' });
      return acknowledgementQuery;
    }),
    then: (resolve, reject) => {
      const write = acknowledgementWritePending;
      acknowledgementWritePending = false;
      return Promise.resolve({ data: write ? null : acknowledgementRows, error: null }).then(resolve, reject);
    }
  };
  getClient.mockReturnValue({
    from: jest.fn((table) => {
      queries.push(table);
      return table === 'emergency_reports' ? reportQuery : acknowledgementQuery;
    })
  });
  return reportQuery;
};

const app = () => {
  const instance = express();
  instance.use(express.json());
  instance.use('/clusters', clusterRouter);
  return instance;
};

const list = async (rows, user = { id: 'admin-1', role: 'admin', organization_id: ORG }) => {
  mockUser = user;
  mockReports(rows);
  return request(app()).get('/clusters/operational');
};

describe('GET /clusters/operational', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = null;
  });

  describe('authorization', () => {
    test('unauthenticated callers receive 401', async () => {
      const response = await request(app()).get('/clusters/operational');
      expect(response.status).toBe(401);
    });

    test('citizens receive 403 and no query is made', async () => {
      const response = await list([], { id: 'c-1', role: 'citizen', organization_id: ORG });
      expect(response.status).toBe(403);
      expect(getClient).not.toHaveBeenCalled();
    });

    test('admin and responder without organization receive 400', async () => {
      for (const role of ['admin', 'responder']) {
        const response = await list([], { id: 'u-1', role, organization_id: null });
        expect(response.status).toBe(400);
      }
      expect(getClient).not.toHaveBeenCalled();
    });

    test('admin and responder with an organization can list', async () => {
      for (const role of ['admin', 'responder']) {
        const response = await list([], { id: 'u-1', role, organization_id: ORG });
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ data: [] });
      }
    });

    test('scope comes from the authenticated user, not client input', async () => {
      mockUser = { id: 'admin-1', role: 'admin', organization_id: ORG };
      const query = mockReports([]);
      const response = await request(app())
        .get('/clusters/operational')
        .query({ organizationId: OTHER_ORG, organization_id: OTHER_ORG });
      expect(response.status).toBe(200);
      expect(query.eq).toHaveBeenCalledTimes(1);
      expect(query.eq).toHaveBeenCalledWith('organization_id', ORG);
      expect(queries).toEqual(['emergency_reports']);
    });

    test('/operational is not interpreted as a cluster id', async () => {
      const response = await list([]);
      expect(response.status).toBe(200);
      expect(response.body.error).toBeUndefined();
    });

    test('database failure returns a generic 500', async () => {
      mockUser = { id: 'admin-1', role: 'admin', organization_id: ORG };
      mockReports(null, { message: 'secret db detail' });
      const response = await request(app()).get('/clusters/operational');
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('secret');
    });
  });

  describe('grouping', () => {
    test('two same-cluster same-org reports become one operational item', async () => {
      const response = await list([
        report({ id: CLUSTER_A, cluster_id: CLUSTER_A }),
        report({ id: 'r-2', cluster_id: CLUSTER_A, reported_by: 'citizen-2', created_at: '2026-10-05T02:00:00.000Z' })
      ]);
      expect(response.body.data).toHaveLength(1);
      const [item] = response.body.data;
      expect(item.operationalId).toBe(CLUSTER_A);
      expect(item.clusterId).toBe(CLUSTER_A);
      expect(item.reportCount).toBe(2);
      expect(item.corroborated).toBe(true);
      expect(item.acknowledged).toBe(false);
      expect(item.memberReports.map((member) => member.id)).toEqual([CLUSTER_A, 'r-2']);
    });

    test('unclustered report is its own single-report item', async () => {
      const response = await list([report({ id: 'solo-1', cluster_id: null })]);
      expect(response.body.data).toHaveLength(1);
      const [item] = response.body.data;
      expect(item.operationalId).toBe('solo-1');
      expect(item.clusterId).toBeNull();
      expect(item.reportCount).toBe(1);
      expect(item.corroborated).toBe(false);
      expect(item.memberReports).toHaveLength(1);
      expect(item.location).toBe('Main Street');
    });

    test('two unclustered reports remain two items', async () => {
      const response = await list([report({ id: 'solo-1' }), report({ id: 'solo-2' })]);
      expect(response.body.data.map((item) => item.operationalId).sort()).toEqual(['solo-1', 'solo-2']);
    });

    test('separate clusters produce separate items, newest activity first', async () => {
      const response = await list([
        report({ id: CLUSTER_A, cluster_id: CLUSTER_A, created_at: '2026-10-05T01:00:00.000Z' }),
        report({ id: CLUSTER_B, cluster_id: CLUSTER_B, created_at: '2026-10-05T05:00:00.000Z' })
      ]);
      expect(response.body.data.map((item) => item.operationalId)).toEqual([CLUSTER_B, CLUSTER_A]);
    });

    test('a resolved operational incident remains listable', async () => {
      const response = await list([
        report({ id: CLUSTER_A, cluster_id: CLUSTER_A, status: 'resolved', reported_by: 'citizen-1' }),
        report({ id: 'r-2', cluster_id: CLUSTER_A, status: 'resolved', reported_by: 'citizen-2' })
      ]);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('resolved');
      expect(response.body.data[0].corroborated).toBe(true);
    });
  });

  describe('aggregation', () => {
    test('reportCount counts members and distinctReporterCount counts unique reporters', async () => {
      const same = await list([
        report({ id: CLUSTER_A, cluster_id: CLUSTER_A, reported_by: 'citizen-1' }),
        report({ id: 'r-2', cluster_id: CLUSTER_A, reported_by: 'citizen-1' })
      ]);
      expect(same.body.data[0].reportCount).toBe(2);
      expect(same.body.data[0].distinctReporterCount).toBe(1);
      expect(same.body.data[0].corroborated).toBe(false);

      const different = await list([
        report({ id: CLUSTER_A, cluster_id: CLUSTER_A, reported_by: 'citizen-1' }),
        report({ id: 'r-2', cluster_id: CLUSTER_A, reported_by: 'citizen-2' })
      ]);
      expect(different.body.data[0].distinctReporterCount).toBe(2);
      expect(different.body.data[0].corroborated).toBe(true);
    });

    test('priority alone and repeated reports from one reporter are not corroborated', async () => {
      const high = await list([report({ id: CLUSTER_A, cluster_id: CLUSTER_A, priority: 'high' })]);
      expect(high.body.data[0]).toMatchObject({ reportCount: 1, priority: 'high', corroborated: false });

      const threeSame = await list([
        report({ id: CLUSTER_A, cluster_id: CLUSTER_A, reported_by: 'citizen-1' }),
        report({ id: 'r-2', cluster_id: CLUSTER_A, reported_by: 'citizen-1' }),
        report({ id: 'r-3', cluster_id: CLUSTER_A, reported_by: 'citizen-1' })
      ]);
      expect(threeSame.body.data[0]).toMatchObject({
        reportCount: 3, distinctReporterCount: 1, corroborated: false
      });
    });

    test('null and empty reporter ids are excluded from the distinct count', async () => {
      const response = await list([
        report({ id: CLUSTER_A, cluster_id: CLUSTER_A, reported_by: null }),
        report({ id: 'r-2', cluster_id: CLUSTER_A, reported_by: '' }),
        report({ id: 'r-3', cluster_id: CLUSTER_A, reported_by: 'citizen-1' })
      ]);
      expect(response.body.data[0].reportCount).toBe(3);
      expect(response.body.data[0].distinctReporterCount).toBe(1);
    });

    test('status aggregates: all resolved, otherwise responding > dispatched > pending, unknown is pending', async () => {
      const statusOf = async (statuses) => {
        const rows = statuses.map((status, index) => report({
          id: index === 0 ? CLUSTER_A : `r-${index}`,
          cluster_id: CLUSTER_A,
          status
        }));
        return (await list(rows)).body.data[0].status;
      };
      expect(await statusOf(['resolved', 'resolved'])).toBe('resolved');
      expect(await statusOf(['resolved', 'pending'])).toBe('pending');
      expect(await statusOf(['pending', 'dispatched'])).toBe('dispatched');
      expect(await statusOf(['dispatched', 'responding', 'pending'])).toBe('responding');
      expect(await statusOf([null, 'pending'])).toBe('pending');
      expect(await statusOf(['bogus', 'resolved'])).toBe('pending');
      expect(await statusOf(['resolved', 'dispatched', null])).toBe('dispatched');
    });

    test('priority is the highest canonical value and unknown never outranks', async () => {
      const priorityOf = async (priorities) => (await list(priorities.map((priority, index) => report({
        id: index === 0 ? CLUSTER_A : `r-${index}`,
        cluster_id: CLUSTER_A,
        priority
      })))).body.data[0].priority;
      expect(await priorityOf(['low', 'critical', 'high'])).toBe('critical');
      expect(await priorityOf(['low', 'urgent'])).toBe('low');
      expect(await priorityOf([null, 'bogus'])).toBeNull();
    });

    test('Unknown location sentinel is unavailable and a usable member location is used', async () => {
      const response = await list([
        report({ id: CLUSTER_A, cluster_id: CLUSTER_A, location: '  UNKNOWN LOCATION ' }),
        report({ id: 'r-2', cluster_id: CLUSTER_A, location: 'Real Street' })
      ]);
      expect(response.body.data[0].location).toBe('Real Street');

      const unavailable = await list([
        report({ id: 'solo', location: 'Unknown location' })
      ]);
      expect(unavailable.body.data[0].location).toBeNull();
      expect((await list([report({ id: 'solo', location: '   ' })])).body.data[0].location).toBeNull();
    });

    test('first and latest report times derive from member created_at', async () => {
      const response = await list([
        report({ id: 'r-2', cluster_id: CLUSTER_A, created_at: '2026-10-05T03:00:00.000Z' }),
        report({ id: CLUSTER_A, cluster_id: CLUSTER_A, created_at: '2026-10-05T01:00:00.000Z' })
      ]);
      expect(response.body.data[0].firstReportedAt).toBe('2026-10-05T01:00:00.000Z');
      expect(response.body.data[0].latestReportedAt).toBe('2026-10-05T03:00:00.000Z');
    });

    test('assigned teams are deduplicated ids only', async () => {
      const response = await list([
        report({ id: CLUSTER_A, cluster_id: CLUSTER_A, assigned_team_id: 'team-1' }),
        report({ id: 'r-2', cluster_id: CLUSTER_A, assigned_team_id: 'team-1' }),
        report({ id: 'r-3', cluster_id: CLUSTER_A, assigned_team_id: null })
      ]);
      expect(response.body.data[0].assignedTeams).toEqual([{ id: 'team-1' }]);
    });
  });

  describe('representative coordinates', () => {
    test('anchor flat coordinates are preferred, zero is valid', async () => {
      const response = await list([
        report({ id: CLUSTER_A, cluster_id: CLUSTER_A, latitude: 0, longitude: 0 }),
        report({ id: 'r-2', cluster_id: CLUSTER_A, latitude: 5, longitude: 6 })
      ]);
      const [item] = response.body.data;
      expect(item.coordinates).toEqual({ latitude: 0, longitude: 0 });
      expect(item.latitude).toBe(0);
      expect(item.longitude).toBe(0);
    });

    test('an invalid anchor falls back to the first valid member', async () => {
      const response = await list([
        report({ id: CLUSTER_A, cluster_id: CLUSTER_A, latitude: 91, longitude: 6 }),
        report({ id: 'r-2', cluster_id: CLUSTER_A, latitude: 5, longitude: 6 })
      ]);
      expect(response.body.data[0].coordinates).toEqual({ latitude: 5, longitude: 6 });
    });

    test('nested, evidence and device coordinates never become representative', async () => {
      const response = await list([
        report({
          id: 'solo',
          latitude: null,
          longitude: null,
          coordinates: { latitude: 10.1, longitude: 124.1 },
          captureLocation: { latitude: 10.2, longitude: 124.2 },
          capture_latitude: 10.3,
          capture_longitude: 124.3,
          deviceLocation: { latitude: 10.4, longitude: 124.4 }
        })
      ]);
      const [item] = response.body.data;
      expect(item.latitude).toBeNull();
      expect(item.longitude).toBeNull();
      expect(item.coordinates).toBeNull();
    });

    test('canonical flat coordinates win over conflicting fallback-like data', async () => {
      const response = await list([
        report({
          id: 'solo',
          latitude: 10.379143,
          longitude: 124.7503911,
          coordinates: { latitude: 1, longitude: 2 },
          captureLocation: { latitude: 3, longitude: 4 },
          deviceLocation: { latitude: 5, longitude: 6 }
        })
      ]);
      expect(response.body.data[0].coordinates).toEqual({ latitude: 10.379143, longitude: 124.7503911 });
    });
  });

  describe('cross-organization safety', () => {
    test('foreign members are excluded and aggregates use only caller members', async () => {
      const response = await list([
        report({ id: CLUSTER_A, cluster_id: CLUSTER_A, organization_id: OTHER_ORG, priority: 'critical', status: 'responding', reported_by: 'foreign-1', location: 'Foreign Place', latitude: 1, longitude: 2 }),
        report({ id: 'own-1', cluster_id: CLUSTER_A, priority: 'low', status: 'pending', reported_by: 'citizen-1', location: 'Own Street', latitude: 10, longitude: 124 })
      ]);
      expect(response.body.data).toHaveLength(1);
      const [item] = response.body.data;
      expect(item.reportCount).toBe(1);
      expect(item.distinctReporterCount).toBe(1);
      expect(item.corroborated).toBe(false);
      expect(item.priority).toBe('low');
      expect(item.status).toBe('pending');
      expect(item.location).toBe('Own Street');
      expect(item.coordinates).toEqual({ latitude: 10, longitude: 124 });
      expect(item.memberReports.map((member) => member.id)).toEqual(['own-1']);
      expect(item.assignedTeams).toEqual([]);
      expect(JSON.stringify(response.body)).not.toMatch(/foreign|org-2|Foreign Place/i);
    });

    test('a cluster with only foreign members is not listed', async () => {
      const response = await list([report({ id: CLUSTER_A, cluster_id: CLUSTER_A, organization_id: OTHER_ORG })]);
      expect(response.body.data).toEqual([]);
    });
  });

  describe('data minimization', () => {
    const sensitive = () => report({
      id: CLUSTER_A,
      cluster_id: CLUSTER_A,
      reporter: { name: 'Jane Citizen', phone: '09170000000' },
      reporter_name: 'Jane Citizen',
      reporter_phone: '09170000000',
      evidence_photos: [{ url: 'https://signed.example/x?token=abc' }],
      storage_path: 'private/bucket/path.jpg',
      signedUrl: 'https://signed.example/x?token=abc',
      incidents: [{ id: 'raw' }],
      subscribers: ['s'],
      updates: [{ message: 'u' }],
      contact_number: '09170000000'
    });

    test('items expose only the operational contract keys', async () => {
      const response = await list([sensitive()]);
      expect(Object.keys(response.body.data[0]).sort()).toEqual([
        'acknowledged', 'assignedTeams', 'clusterId', 'coordinates', 'corroborated',
        'distinctReporterCount', 'firstReportedAt', 'latestReportedAt', 'latitude', 'location',
        'longitude', 'memberReports', 'operationalId', 'priority', 'reportCount', 'status', 'type'
      ]);
    });

    test('memberReports contain only the minimized keys', async () => {
      const response = await list([sensitive()]);
      expect(Object.keys(response.body.data[0].memberReports[0]).sort()).toEqual([
        'assigned_team_id', 'coordinates', 'created_at', 'description', 'id', 'latitude',
        'longitude', 'organization_id', 'priority', 'status', 'type'
      ]);
    });

    test('no reporter identity, raw incidents, evidence or signed urls are serialized', async () => {
      const response = await list([sensitive()]);
      const body = JSON.stringify(response.body);
      for (const forbidden of ['Jane Citizen', '09170000000', 'citizen-1', 'reported_by', 'incidents', 'subscribers', 'updates', 'signed.example', 'storage', 'token=abc', 'reporter']) {
        expect(body).not.toContain(forbidden);
      }
    });

    test('the query never selects reporter profile joins or evidence', async () => {
      const query = mockReports([]);
      mockUser = { id: 'admin-1', role: 'admin', organization_id: ORG };
      await request(app()).get('/clusters/operational');
      const selection = query.select.mock.calls[0][0];
      expect(selection).not.toMatch(/users|reporter|\*|evidence|storage/);
      expect(queries).toEqual(['emergency_reports']);
    });
  });
});

describe('POST /clusters/operational/:operationalId/acknowledge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = null;
  });

  const acknowledge = async (rows, user, body) => {
    mockUser = user;
    mockReports(rows);
    return request(app())
      .post(`/clusters/operational/${CLUSTER_A}/acknowledge`)
      .send(body || {});
  };

  const corroboratedReports = [
    report({ id: CLUSTER_A, cluster_id: CLUSTER_A, reported_by: 'citizen-1' }),
    report({ id: 'r-2', cluster_id: CLUSTER_A, reported_by: 'citizen-2' })
  ];

  test('an organization admin can acknowledge an active corroborated incident without trusting client organization data', async () => {
    const response = await acknowledge(corroboratedReports, {
      id: 'admin-1', role: 'admin', organization_id: ORG
    }, { organization_id: OTHER_ORG });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      operationalId: CLUSTER_A,
      acknowledged: true
    });
    expect(reportQuery.eq).toHaveBeenCalledWith('organization_id', ORG);
    expect(acknowledgementQuery.insert).toHaveBeenCalledWith({
      organization_id: ORG,
      operational_id: CLUSTER_A,
      acknowledged_by: 'admin-1'
    });
    expect(reportQuery).not.toHaveProperty('update');
    expect(reportQuery).not.toHaveProperty('insert');
  });

  test('responders cannot acknowledge', async () => {
    const response = await acknowledge(corroboratedReports, {
      id: 'responder-1', role: 'responder', organization_id: ORG
    });
    expect(response.status).toBe(403);
    expect(getClient).not.toHaveBeenCalled();
  });

  test('cross-organization admins cannot acknowledge another organization incident', async () => {
    const response = await acknowledge(corroboratedReports, {
      id: 'admin-2', role: 'admin', organization_id: OTHER_ORG
    });
    expect(response.status).toBe(404);
    expect(acknowledgementQuery.insert).not.toHaveBeenCalled();
  });

  test('repeated acknowledgement is idempotent and preserves the first audit record', async () => {
    const user = { id: 'admin-1', role: 'admin', organization_id: ORG };
    const first = await acknowledge(corroboratedReports, user);
    const second = await request(app())
      .post(`/clusters/operational/${CLUSTER_A}/acknowledge`)
      .send({});

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(acknowledgementQuery.insert).toHaveBeenCalledTimes(1);
    expect(second.body.data.acknowledged).toBe(first.body.data.acknowledged);
  });

  test('non-corroborated and resolved incidents cannot be acknowledged', async () => {
    const single = await acknowledge([report({ id: CLUSTER_A, cluster_id: CLUSTER_A })], {
      id: 'admin-1', role: 'admin', organization_id: ORG
    });
    expect(single.status).toBe(409);

    const resolved = await acknowledge(corroboratedReports.map(item => ({ ...item, status: 'resolved' })), {
      id: 'admin-1', role: 'admin', organization_id: ORG
    });
    expect(resolved.status).toBe(409);
  });
});
