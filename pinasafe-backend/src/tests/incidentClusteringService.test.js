jest.mock('../config/database', () => ({ getClient: jest.fn() }));

const { getClient } = require('../config/database');
const clusteringService = require('../services/incidentClusteringService');

const REPORT_ID = 'report-1';
const CLUSTER_ID = REPORT_ID;
const CREATED_AT = '2026-10-05T12:00:00.000Z';

const incident = (overrides = {}) => ({
  id: REPORT_ID,
  cluster_id: CLUSTER_ID,
  reported_by: 'reporter-1',
  organization_id: 'organization-1',
  assigned_team_id: 'team-1',
  type: 'fire',
  description: 'Smoke from the second floor',
  location: 'Main Street',
  latitude: 10,
  longitude: 20,
  priority: 'medium',
  status: 'pending',
  created_at: CREATED_AT,
  ...overrides
});

const buildQuery = (result) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  neq: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
});

const configureClient = (queries) => {
  const from = jest.fn((table) => {
    const query = queries.shift();
    if (!query) throw new Error(`Unexpected query for ${table}`);
    return query;
  });
  getClient.mockReturnValue({ from });
  return from;
};

const clusterRead = async (reports) => {
  configureClient([
    buildQuery({ data: reports, error: null }),
    buildQuery({ data: [], error: null }),
    buildQuery({ data: [], error: null })
  ]);
  return clusteringService.getClusterInfo(CLUSTER_ID);
};

describe('incident clustering service', () => {
  beforeEach(() => jest.clearAllMocks());

  test('first report establishes its own cluster and subscriber', async () => {
    const reportQuery = buildQuery({ error: null });
    const subscriberQuery = buildQuery({ error: null });
    const from = configureClient([reportQuery, subscriberQuery]);

    await expect(clusteringService.createCluster(REPORT_ID, 'reporter-1'))
      .resolves.toBe(REPORT_ID);

    expect(from.mock.calls.map(([table]) => table)).toEqual([
      'emergency_reports',
      'incident_cluster_subscribers'
    ]);
    expect(reportQuery.update).toHaveBeenCalledWith({ cluster_id: REPORT_ID });
    expect(subscriberQuery.insert).toHaveBeenCalledWith({
      cluster_id: REPORT_ID,
      user_id: 'reporter-1',
      incident_id: REPORT_ID
    });
  });

  test('matching active same-type nearby report selects the anchor cluster without ordering candidates', async () => {
    const candidatesQuery = buildQuery({ data: [incident()], error: null });
    configureClient([candidatesQuery]);

    await expect(clusteringService.findMatchingCluster(incident({
      id: 'report-2',
      latitude: 10.001,
      longitude: 20.001
    }))).resolves.toBe(CLUSTER_ID);

    expect(candidatesQuery.neq).toHaveBeenCalledWith('status', 'resolved');
    expect(candidatesQuery.order).not.toHaveBeenCalled();
  });

  test('resolved candidates cannot match and a new report can establish a new cluster', async () => {
    const candidatesQuery = buildQuery({
      data: [incident({ status: 'resolved' })],
      error: null
    });
    const newReportUpdate = buildQuery({ error: null });
    const subscriberInsert = buildQuery({ error: null });
    configureClient([candidatesQuery, newReportUpdate, subscriberInsert]);

    const newReport = incident({
      id: 'report-after-resolution',
      created_at: CREATED_AT,
      latitude: 10,
      longitude: 20
    });
    await expect(clusteringService.findMatchingCluster(newReport)).resolves.toBeNull();
    await expect(clusteringService.createCluster(newReport.id, 'reporter-2'))
      .resolves.toBe(newReport.id);

    expect(candidatesQuery.neq).toHaveBeenCalledWith('status', 'resolved');
    expect(newReportUpdate.update).toHaveBeenCalledWith({ cluster_id: newReport.id });
  });

  test('an active member keeps a mixed-status cluster eligible for matching', async () => {
    const candidatesQuery = buildQuery({
      data: [
        incident({ status: 'resolved' }),
        incident({ id: 'report-2', status: 'responding' })
      ],
      error: null
    });
    configureClient([candidatesQuery]);

    await expect(clusteringService.findMatchingCluster(incident({
      id: 'report-3',
      latitude: 10.001,
      longitude: 20.001
    }))).resolves.toBe(CLUSTER_ID);
  });

  test('same-type requirement is exact', () => {
    expect(clusteringService.shouldCluster(incident(), incident({ type: 'Fire' }))).toBe(false);
  });

  test('same-day reports may cluster and different-day reports do not', () => {
    expect(clusteringService.shouldCluster(
      incident(),
      incident({ id: 'report-2', created_at: '2026-10-05T23:59:00.000Z' })
    )).toBe(true);
    expect(clusteringService.shouldCluster(
      incident(),
      incident({ id: 'report-2', created_at: '2026-10-06T00:00:00.000Z' })
    )).toBe(false);
  });

  test('valid nearby coordinates are compared using the existing distance calculation', () => {
    const calculateDistance = jest.spyOn(clusteringService, 'calculateDistance');

    expect(clusteringService.shouldCluster(
      incident({ latitude: 10, longitude: 20 }),
      incident({ id: 'report-2', latitude: 10.001, longitude: 20.001 })
    )).toBe(true);
    expect(calculateDistance).toHaveBeenCalledWith(10, 20, 10.001, 20.001);
    calculateDistance.mockRestore();
  });

  test('distance greater than 500m does not cluster', () => {
    const calculateDistance = jest.spyOn(clusteringService, 'calculateDistance')
      .mockReturnValue(500.01);

    expect(clusteringService.shouldCluster(
      incident(),
      incident({ id: 'report-2', latitude: 10.001, longitude: 20.001 })
    )).toBe(false);
    calculateDistance.mockRestore();
  });

  test('exactly 500m clusters inclusively', () => {
    const calculateDistance = jest.spyOn(clusteringService, 'calculateDistance')
      .mockReturnValue(500);

    expect(clusteringService.shouldCluster(
      incident(),
      incident({ id: 'report-2', latitude: 10.001, longitude: 20.001 })
    )).toBe(true);
    calculateDistance.mockRestore();
  });

  test.each([
    ['zero numeric coordinate', 0, 20, 10, 20, 'Same place', false],
    ['zero string coordinate', '0', 20, 10, 20, 'Same place', true],
    ['missing coordinate', null, 20, 10, 20, 'Same place', false],
    ['partial coordinate pair', 10, null, 10, 20, 'Same place', false],
    ['falsy zero pair', 0, 0, 10, 20, 'Same place', false]
  ])('preserves original location fallback for %s', (
    _label,
    latitude1,
    longitude1,
    latitude2,
    longitude2,
    location,
    expectDistance
  ) => {
    const calculateDistance = jest.spyOn(clusteringService, 'calculateDistance')
      .mockReturnValue(100);
    const first = incident({ latitude: latitude1, longitude: longitude1, location });
    const second = incident({
      id: 'report-2',
      latitude: latitude2,
      longitude: longitude2,
      location: 'Same place'
    });

    expect(clusteringService.shouldCluster(first, second)).toBe(true);
    expect(calculateDistance).toHaveBeenCalledTimes(expectDistance ? 1 : 0);
    calculateDistance.mockRestore();
  });

  test('location fallback retains the original bidirectional substring behavior', () => {
    expect(clusteringService.shouldCluster(
      incident({ latitude: null, longitude: null, location: 'Main Street' }),
      incident({ id: 'report-2', latitude: null, longitude: null, location: 'Main' })
    )).toBe(true);
    expect(clusteringService.shouldCluster(
      incident({ latitude: null, longitude: null, location: 'North Avenue' }),
      incident({ id: 'report-2', latitude: null, longitude: null, location: 'South Road' })
    )).toBe(false);
  });

  test('two reports by the same reporter count as two reports and one reporter', async () => {
    const result = await clusterRead([
      incident(),
      incident({ id: 'report-2', reported_by: 'reporter-1' })
    ]);

    expect(result.reportCount).toBe(2);
    expect(result.distinctReporterCount).toBe(1);
  });

  test('distinct reporter counts exclude null and empty reporter IDs', async () => {
    const result = await clusterRead([
      incident(),
      incident({ id: 'report-2', reported_by: null }),
      incident({ id: 'report-3', reported_by: '' })
    ]);

    expect(result.reportCount).toBe(3);
    expect(result.distinctReporterCount).toBe(1);
  });

  test('two different reporters are counted independently', async () => {
    const result = await clusterRead([
      incident(),
      incident({ id: 'report-2', reported_by: 'reporter-2' })
    ]);

    expect(result.reportCount).toBe(2);
    expect(result.distinctReporterCount).toBe(2);
  });

  test('keeps each member ID and description attributable and aggregates timestamps and team IDs', async () => {
    const result = await clusterRead([
      incident({
        description: 'First report details',
        created_at: '2026-10-05T12:00:00.000Z',
        assigned_team_id: 'team-1'
      }),
      incident({
        id: 'report-2',
        description: 'Second report details',
        created_at: '2026-10-05T13:00:00.000Z',
        assigned_team_id: 'team-2'
      }),
      incident({
        id: 'report-3',
        created_at: '2026-10-05T14:00:00.000Z',
        assigned_team_id: 'team-1'
      })
    ]);

    expect(result.memberReports.map(({ id, description, created_at }) => ({
      id,
      description,
      created_at
    }))).toEqual([
      {
        id: REPORT_ID,
        description: 'First report details',
        created_at: '2026-10-05T12:00:00.000Z'
      },
      {
        id: 'report-2',
        description: 'Second report details',
        created_at: '2026-10-05T13:00:00.000Z'
      },
      {
        id: 'report-3',
        description: 'Smoke from the second floor',
        created_at: '2026-10-05T14:00:00.000Z'
      }
    ]);
    expect(result.firstReportedAt).toBe('2026-10-05T12:00:00.000Z');
    expect(result.latestReportedAt).toBe('2026-10-05T14:00:00.000Z');
    expect(result.assignedTeams).toEqual([{ id: 'team-1' }, { id: 'team-2' }]);
  });

  test.each([
    ['pending + pending', ['pending', 'pending'], 'pending'],
    ['pending + dispatched', ['pending', 'dispatched'], 'dispatched'],
    ['pending + responding', ['pending', 'responding'], 'responding'],
    ['dispatched + responding', ['dispatched', 'responding'], 'responding'],
    ['responding + resolved', ['responding', 'resolved'], 'responding'],
    ['pending + resolved', ['pending', 'resolved'], 'pending'],
    ['resolved + resolved', ['resolved', 'resolved'], 'resolved'],
    ['null + pending', [null, 'pending'], 'pending'],
    ['pending + null', ['pending', null], 'pending'],
    ['null + dispatched', [null, 'dispatched'], 'dispatched'],
    ['null-only', [null], 'pending'],
    ['missing-only', [undefined], 'pending'],
    ['unknown-value-only', ['unknown'], 'pending']
  ])('aggregates lifecycle statuses deterministically for %s', async (_label, statuses, expected) => {
    const reports = statuses.map((status, index) => {
      const report = incident({ id: `report-${index + 1}`, status });
      if (status === undefined) delete report.status;
      return report;
    });
    const result = await clusterRead(reports);

    expect(result.status).toBe(expected);
  });

  test('selects highest canonical priority and ignores unknown priorities', async () => {
    const cases = [
      [['low', 'high'], 'high'],
      [['medium', 'high'], 'high'],
      [['high', 'low'], 'high'],
      [['medium', 'critical'], 'critical'],
      [[null, 'unknown'], null]
    ];

    for (const [priorities, expected] of cases) {
      const result = await clusterRead(priorities.map((priority, index) => incident({
        id: `report-${index + 1}`,
        priority
      })));
      expect(result.priority).toBe(expected);
    }
  });

  test('selects readable representative location and rejects the unknown sentinel', async () => {
    await expect(clusterRead([
      incident({ location: 'Unknown location' }),
      incident({ id: 'report-2', location: 'Barangay San Roque' })
    ])).resolves.toMatchObject({ location: 'Barangay San Roque' });

    await expect(clusterRead([
      incident({ location: 'Unknown location' }),
      incident({ id: 'report-2', location: ' unknown LOCATION ' })
    ])).resolves.toMatchObject({ location: null });

    await expect(clusterRead([
      incident({ location: '   ' })
    ])).resolves.toMatchObject({ location: null });

    await expect(clusterRead([
      incident({ location: 'Anchor readable address' }),
      incident({ id: 'report-2', location: 'Other readable address' })
    ])).resolves.toMatchObject({ location: 'Anchor readable address' });
  });

  test('chooses validated representative coordinates without fallback fabrication', async () => {
    const result = await clusterRead([
      incident({ latitude: null, longitude: 20 }),
      incident({ id: 'report-2', latitude: 0, longitude: 0 })
    ]);
    expect(result.coordinates).toEqual({ latitude: 0, longitude: 0 });

    const invalids = [
      [null, 20],
      [NaN, 20],
      [Infinity, 20],
      [90.1, 20],
      [10, -180.1]
    ];
    for (const [latitude, longitude] of invalids) {
      const invalidResult = await clusterRead([
        incident({ latitude, longitude })
      ]);
      expect(invalidResult.coordinates).toBeNull();
    }
  });

  test('prefers valid anchor coordinates and uses a valid member when anchor coordinates are invalid', async () => {
    await expect(clusterRead([
      incident({ latitude: 1, longitude: 2 }),
      incident({ id: 'report-2', latitude: 3, longitude: 4 })
    ])).resolves.toMatchObject({ coordinates: { latitude: 1, longitude: 2 } });

    await expect(clusterRead([
      incident({ latitude: 91, longitude: 2 }),
      incident({ id: 'report-2', latitude: 3, longitude: 4 })
    ])).resolves.toMatchObject({ coordinates: { latitude: 3, longitude: 4 } });
  });

  const nestedPair = { latitude: 10.379143, longitude: 124.7503911 };
  const forbiddenSources = () => ({
    coordinates: { ...nestedPair },
    evidence: [{ latitude: 10.1, longitude: 124.1, capture_metadata: { latitude: 10.2, longitude: 124.2 } }],
    evidence_photos: [{ capture_latitude: 10.3, capture_longitude: 124.3 }],
    capture_latitude: 10.4,
    capture_longitude: 124.4,
    device_location: { latitude: 10.5, longitude: 124.5 },
    deviceLocation: { lat: 10.6, lng: 124.6 },
    location_data: { latitude: 10.7, longitude: 124.7 }
  });

  test('nested coordinates never become representative coordinates', async () => {
    const result = await clusterRead([
      incident({ latitude: null, longitude: null, coordinates: { ...nestedPair } })
    ]);
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
    expect(result.coordinates).toBeNull();
    expect(result.memberReports[0].coordinates).toBeNull();
  });

  test('evidence and capture coordinates never become representative coordinates', async () => {
    const result = await clusterRead([
      incident({
        latitude: null,
        longitude: null,
        evidence: [{ latitude: 10.379143, longitude: 124.7503911, capture_metadata: { latitude: 10.379143, longitude: 124.7503911 } }],
        evidence_photos: [{ capture_latitude: 10.379143, capture_longitude: 124.7503911 }],
        capture_latitude: 10.379143,
        capture_longitude: 124.7503911
      })
    ]);
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
    expect(result.coordinates).toBeNull();
  });

  test('device and location objects never become representative coordinates', async () => {
    const result = await clusterRead([
      incident({
        latitude: null,
        longitude: null,
        device_location: { ...nestedPair },
        deviceLocation: { lat: 10.379143, lng: 124.7503911 },
        location_data: { ...nestedPair }
      })
    ]);
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
    expect(result.coordinates).toBeNull();
  });

  test('canonical flat coordinates win over conflicting fallback-like data', async () => {
    const result = await clusterRead([
      incident({ latitude: 10.379143, longitude: 124.7503911, ...forbiddenSources() }),
      incident({ id: 'report-2', latitude: null, longitude: null, ...forbiddenSources() })
    ]);
    expect(result.latitude).toBe(10.379143);
    expect(result.longitude).toBe(124.7503911);
    expect(result.coordinates).toEqual({ latitude: 10.379143, longitude: 124.7503911 });
    expect(result.memberReports[0].coordinates).toEqual({ latitude: 10.379143, longitude: 124.7503911 });
  });

  test('member reports are minimized while legacy incidents retain the original selected rows', async () => {
    const legacyIncident = incident({
      evidence_photos: [{ url: 'existing-legacy-value' }],
      contact_number: 'existing-contact-field',
      reporter: { name: 'Existing reporter', phone: '0000000000' },
      notes: 'existing legacy note',
      ai_classification: { label: 'fire' }
    });
    const reportQuery = buildQuery({ data: [legacyIncident], error: null });
    configureClient([
      reportQuery,
      buildQuery({ data: [], error: null }),
      buildQuery({ data: [], error: null })
    ]);

    const result = await clusteringService.getClusterInfo(CLUSTER_ID);

    expect(reportQuery.select.mock.calls[0][0]).toContain('*');
    expect(reportQuery.select.mock.calls[0][0])
      .toContain('reporter:users!reported_by(name, phone)');
    expect(result.incidents).toEqual([legacyIncident]);
    expect(result.totalReports).toBe(1);
    expect(result.memberReports[0]).toEqual({
      id: REPORT_ID,
      organization_id: 'organization-1',
      assigned_team_id: 'team-1',
      type: 'fire',
      description: 'Smoke from the second floor',
      latitude: 10,
      longitude: 20,
      priority: 'medium',
      status: 'pending',
      created_at: CREATED_AT,
      coordinates: { latitude: 10, longitude: 20 }
    });
    expect(result.memberReports[0]).not.toHaveProperty('reported_by');
    expect(result.memberReports[0]).not.toHaveProperty('reporter');
    expect(result.memberReports[0]).not.toHaveProperty('evidence_photos');
    expect(result.memberReports[0]).not.toHaveProperty('assigned_team');
    expect(result.memberReports[0]).not.toHaveProperty('organization');
    expect(result).not.toHaveProperty('signedUrl');
  });
});
