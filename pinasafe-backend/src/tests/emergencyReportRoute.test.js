const express = require('express');
const request = require('supertest');

jest.mock('uuid', () => ({
  v4: jest.fn(() => '123e4567-e89b-12d3-a456-426614174099'),
  validate: jest.fn((value) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value))
}));

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  canAccessOrganization: (user, organizationId) => user.organization_id === organizationId
}));

jest.mock('../config/database', () => ({ getClient: jest.fn() }));

jest.mock('../services/emergencyReportBindingService', () => ({
  EmergencyReportBindingError: class EmergencyReportBindingError extends Error {
    constructor(code, reportId) {
      super('private database error detail');
      this.name = 'EmergencyReportBindingError';
      this.code = code;
      this.reportId = reportId;
    }
  },
  createEmergencyReportWithEvidence: jest.fn()
}));

jest.mock('../services/incidentClusteringService', () => ({
  findMatchingCluster: jest.fn(),
  createCluster: jest.fn(),
  addToCluster: jest.fn(),
  notifyClusterSubscribers: jest.fn()
}));

const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../middleware/auth');
const { getClient } = require('../config/database');
const {
  EmergencyReportBindingError,
  createEmergencyReportWithEvidence
} = require('../services/emergencyReportBindingService');
const clusteringService = require('../services/incidentClusteringService');
const emergencyRouter = require('../routes/emergency');

const REPORT_ID = '123e4567-e89b-12d3-a456-426614174099';
const REPORTER_ID = '123e4567-e89b-12d3-a456-426614174001';
const SESSION_ID = '123e4567-e89b-12d3-a456-426614174002';

const requestBody = (overrides = {}) => ({
  type: 'road',
  description: 'A valid emergency description',
  location: 'A valid incident location',
  coordinates: { latitude: 10.1, longitude: 124.8 },
  contactNumber: '+639171234567',
  priority: 'high',
  ...overrides
});

const persistedReport = (overrides = {}) => ({
  id: REPORT_ID,
  reported_by: REPORTER_ID,
  type: 'road',
  title: 'Road Emergency',
  description: 'A valid emergency description',
  location: 'A valid incident location',
  latitude: 10.1,
  longitude: 124.8,
  contact_number: '+639171234567',
  priority: 'high',
  status: 'pending',
  evidence_photos: [],
  cluster_id: null,
  created_at: '2026-09-27T00:00:00.000Z',
  ...overrides
});

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: REPORTER_ID, role: 'citizen', organization_id: null };
    next();
  });
  app.use('/emergency-reports', emergencyRouter);
  return app;
};

const setupReportFetch = (report = persistedReport(), error = null) => {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: report, error }),
    insert: jest.fn()
  };
  const from = jest.fn().mockReturnValue(query);
  getClient.mockReturnValue({ from });
  return { from, query };
};

const setupReportFetchResponses = (reportResponses, sessionResponse = null) => {
  const tableIndexes = new Map();
  const queries = [];
  const from = jest.fn((table) => {
    const index = tableIndexes.get(table) || 0;
    tableIndexes.set(table, index + 1);

    let response;
    if (table === 'emergency_reports') {
      response = reportResponses[Math.min(index, reportResponses.length - 1)];
    } else if (table === 'evidence_upload_sessions') {
      response = sessionResponse || { data: null, error: null };
    } else {
      response = { data: null, error: null };
    }

    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue(response),
      insert: jest.fn()
    };
    queries.push({ table, query });
    return query;
  });
  getClient.mockReturnValue({ from });
  return { from, queries };
};

const postReport = (body) => request(buildApp())
  .post('/emergency-reports')
  .send(body);

describe('POST /api/emergency-reports B4 integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createEmergencyReportWithEvidence.mockResolvedValue({
      reportId: REPORT_ID,
      outcome: 'CREATED'
    });
    clusteringService.findMatchingCluster.mockResolvedValue(null);
    clusteringService.createCluster.mockResolvedValue('cluster-1');
    clusteringService.addToCluster.mockResolvedValue('existing-cluster');
    clusteringService.notifyClusterSubscribers.mockResolvedValue(undefined);
  });

  test('keeps POST creation behind authenticateToken', () => {
    const postRoute = emergencyRouter.stack.find(layer => (
      layer.route?.path === '/' && layer.route.methods.post
    ));

    expect(postRoute.route.stack[0].handle).toBe(authenticateToken);
  });

  test('creates a legacy no-session report through B4 and preserves the response contract', async () => {
    const legacyPhotos = ['file:///local/photo.jpg'];
    const report = persistedReport({ evidence_photos: legacyPhotos });
    const { from, query } = setupReportFetch(report);

    const response = await postReport(requestBody({
      evidence: { photos: legacyPhotos },
      reported_by: '123e4567-e89b-12d3-a456-426614174099',
      reporterId: '123e4567-e89b-12d3-a456-426614174098',
      userId: '123e4567-e89b-12d3-a456-426614174097'
    }));

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      message: 'Emergency report created successfully',
      data: { ...report, cluster_id: 'cluster-1', coordinates: { latitude: 10.1, longitude: 124.8 } }
    });
    expect(createEmergencyReportWithEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadSessionId: null,
        evidencePhotos: legacyPhotos,
        coordinates: { latitude: 10.1, longitude: 124.8 }
      }),
      REPORTER_ID,
      REPORT_ID
    );
    expect(uuidv4).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('emergency_reports');
    expect(query.insert).not.toHaveBeenCalled();
  });

  test('durable mode passes the session, ignores client evidence photos and identity', async () => {
    const report = persistedReport({ cluster_id: 'cluster-existing' });
    const { from } = setupReportFetch(report);

    const response = await postReport(requestBody({
      uploadSessionId: SESSION_ID,
      evidence: { photos: ['file:///local/photo.jpg'] },
      aiClassification: { label: 'road', status: 'valid', action: 'accept' },
      reported_by: '123e4567-e89b-12d3-a456-426614174099',
      reporterId: '123e4567-e89b-12d3-a456-426614174098',
      userId: '123e4567-e89b-12d3-a456-426614174097'
    }));

    expect(response.status).toBe(201);
    expect(createEmergencyReportWithEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadSessionId: SESSION_ID,
        evidencePhotos: [],
        aiClassification: { label: 'road', status: 'valid', action: 'accept' }
      }),
      REPORTER_ID,
      REPORT_ID
    );
    expect(createEmergencyReportWithEvidence.mock.calls[0][0]).not.toHaveProperty('reported_by');
    expect(createEmergencyReportWithEvidence.mock.calls[0][0]).not.toHaveProperty('organization_id');
    expect(from).toHaveBeenCalledWith('emergency_reports');
    expect(clusteringService.findMatchingCluster).not.toHaveBeenCalled();
    expect(clusteringService.createCluster).not.toHaveBeenCalled();
    expect(clusteringService.addToCluster).not.toHaveBeenCalled();
  });

  test('accepts generic classifier URL, path, and storage content for durable requests', async () => {
    setupReportFetch(persistedReport({ cluster_id: 'cluster-existing' }));
    const classification = {
      label: 'road',
      url: 'https://classifier.invalid/result',
      path: 'classifier/category/road',
      storage: 'classifier state, not evidence identity'
    };

    const response = await postReport(requestBody({
      uploadSessionId: SESSION_ID,
      aiClassification: classification
    }));

    expect(response.status).toBe(201);
    expect(createEmergencyReportWithEvidence.mock.calls[0][0].aiClassification)
      .toEqual(classification);
  });

  test('returns the fetched report for CREATED and clusters it normally', async () => {
    const report = persistedReport();
    setupReportFetch(report);

    const response = await postReport(requestBody());

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe(REPORT_ID);
    expect(clusteringService.findMatchingCluster).toHaveBeenCalledWith(report);
    expect(clusteringService.createCluster).toHaveBeenCalledWith(REPORT_ID, REPORTER_ID);
  });

  test('returns the fetched report for REPLAYED without repeating completed clustering', async () => {
    const report = persistedReport({ cluster_id: 'cluster-existing' });
    setupReportFetch(report);
    createEmergencyReportWithEvidence.mockResolvedValue({
      reportId: REPORT_ID,
      outcome: 'REPLAYED'
    });

    const response = await postReport(requestBody({ uploadSessionId: SESSION_ID }));

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      message: 'Emergency report created successfully',
      data: { ...report, coordinates: { latitude: 10.1, longitude: 124.8 } }
    });
    expect(clusteringService.findMatchingCluster).not.toHaveBeenCalled();
    expect(clusteringService.createCluster).not.toHaveBeenCalled();
    expect(clusteringService.addToCluster).not.toHaveBeenCalled();
    expect(clusteringService.notifyClusterSubscribers).not.toHaveBeenCalled();
  });

  test.each([
    ['SESSION_UNAVAILABLE', 404, 'Evidence upload session unavailable'],
    ['SESSION_EXPIRED', 409, 'Emergency report conflicts with evidence session'],
    ['UPLOAD_IN_PROGRESS', 409, 'Emergency report conflicts with evidence session'],
    ['CLASSIFICATION_MISMATCH', 400, 'Invalid emergency report or evidence'],
    ['REPORT_ID_CONFLICT', 409, 'Emergency report conflicts with evidence session'],
    ['REPORT_CREATE_FAILED', 500, 'Failed to create emergency report']
  ])('maps %s to a safe HTTP response', async (code, status, message) => {
    createEmergencyReportWithEvidence.mockRejectedValue(
      new EmergencyReportBindingError(code, REPORT_ID)
    );

    const response = await postReport(requestBody({ uploadSessionId: SESSION_ID }));

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: message });
    expect(JSON.stringify(response.body)).not.toContain('private database error detail');
  });

  test('returns a safe 500 for unexpected service failures', async () => {
    createEmergencyReportWithEvidence.mockRejectedValue(
      new Error('private Supabase details')
    );

    const response = await postReport(requestBody());

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to create emergency report' });
    expect(JSON.stringify(response.body)).not.toContain('private Supabase details');
  });

  test('rejects invalid upload session IDs before calling B4', async () => {
    const response = await postReport(requestBody({ uploadSessionId: 'not-a-uuid' }));

    expect(response.status).toBe(400);
    expect(createEmergencyReportWithEvidence).not.toHaveBeenCalled();
  });

  test('rejects non-string values that coerce to UUID text', async () => {
    const response = await postReport(requestBody({ uploadSessionId: [SESSION_ID] }));

    expect(response.status).toBe(400);
    expect(createEmergencyReportWithEvidence).not.toHaveBeenCalled();
  });

  test('rejects supplied falsey non-string session IDs but treats empty string as legacy mode', async () => {
    const invalidResponse = await postReport(requestBody({ uploadSessionId: 0 }));

    expect(invalidResponse.status).toBe(400);
    expect(createEmergencyReportWithEvidence).not.toHaveBeenCalled();

    const { from } = setupReportFetch(persistedReport());
    const emptyResponse = await postReport(requestBody({ uploadSessionId: '' }));

    expect(emptyResponse.status).toBe(201);
    expect(createEmergencyReportWithEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ uploadSessionId: null }),
      REPORTER_ID,
      REPORT_ID
    );
    expect(from).toHaveBeenCalledWith('emergency_reports');
  });

  test.each([
    ['evidence', { photos: ['file:///local/photo.jpg'], storagePath: 'private/object.jpg' }],
    ['evidence', { photos: [], bucketName: 'private-bucket' }],
    ['evidence', { photos: [], evidence_id: '123e4567-e89b-12d3-a456-426614174003' }],
    ['evidence', { photos: [], signed_url: 'https://storage.invalid/object' }],
    ['aiClassification', { label: 'road', signedUrl: 'https://storage.invalid/object' }]
  ])('rejects client Storage metadata in durable %s fields', async (field, value) => {
    const response = await postReport(requestBody({
      uploadSessionId: SESSION_ID,
      [field]: value
    }));

    expect(response.status).toBe(400);
    expect(createEmergencyReportWithEvidence).not.toHaveBeenCalled();
  });

  test('fails safely when the successful B4 report cannot be fetched', async () => {
    setupReportFetch(null, { message: 'private query error' });

    const response = await postReport(requestBody());

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to create emergency report' });
    expect(JSON.stringify(response.body)).not.toContain('private query error');
    expect(createEmergencyReportWithEvidence).toHaveBeenCalledTimes(1);
  });

  test('retries no-row reads a bounded number of times without another creation', async () => {
    const { from } = setupReportFetch(null, null);

    const response = await postReport(requestBody());

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to create emergency report' });
    expect(from.mock.calls.filter(([table]) => table === 'emergency_reports')).toHaveLength(3);
    expect(createEmergencyReportWithEvidence).toHaveBeenCalledTimes(1);
    expect(uuidv4).toHaveBeenCalledTimes(1);
  });

  test('recovers a transient persisted-report read with the same report ID', async () => {
    const report = persistedReport();
    const { from, queries } = setupReportFetchResponses([
      { data: null, error: { message: 'temporary read failure' } },
      { data: report, error: null }
    ]);

    const response = await postReport(requestBody());

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe(REPORT_ID);
    expect(from.mock.calls.filter(([table]) => table === 'emergency_reports')).toHaveLength(2);
    expect(queries.map(({ query }) => query.eq.mock.calls[0])).toEqual([
      ['id', REPORT_ID],
      ['id', REPORT_ID]
    ]);
    expect(createEmergencyReportWithEvidence).toHaveBeenCalledTimes(1);
    expect(uuidv4).toHaveBeenCalledTimes(1);
  });

  test('recovers durable creation through the authenticated owner-scoped session binding', async () => {
    const report = persistedReport({ cluster_id: 'cluster-existing' });
    const readError = { message: 'temporary read failure' };
    const { from, queries } = setupReportFetchResponses([
      { data: null, error: readError },
      { data: null, error: readError },
      { data: null, error: readError },
      { data: report, error: null }
    ], { data: { emergency_report_id: REPORT_ID }, error: null });

    const response = await postReport(requestBody({ uploadSessionId: SESSION_ID }));

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe(REPORT_ID);
    expect(from.mock.calls.map(([table]) => table)).toEqual([
      'emergency_reports',
      'emergency_reports',
      'emergency_reports',
      'evidence_upload_sessions',
      'emergency_reports'
    ]);
    const sessionQuery = queries.find(({ table }) => table === 'evidence_upload_sessions').query;
    expect(sessionQuery.eq.mock.calls).toEqual([
      ['id', SESSION_ID],
      ['owner_user_id', REPORTER_ID]
    ]);
    expect(queries.filter(({ table }) => table === 'emergency_reports')
      .every(({ query }) => query.eq.mock.calls[0][1] === REPORT_ID)).toBe(true);
    expect(createEmergencyReportWithEvidence).toHaveBeenCalledTimes(1);
    expect(uuidv4).toHaveBeenCalledTimes(1);
  });

  test('does not insert organization alerts from the route', async () => {
    const { from, query } = setupReportFetch(persistedReport());

    const response = await postReport(requestBody());

    expect(response.status).toBe(201);
    expect(from.mock.calls.map(([table]) => table)).toEqual(['emergency_reports']);
    expect(query.insert).not.toHaveBeenCalled();
  });

  test('keeps matching-cluster work and notifications best-effort', async () => {
    const report = persistedReport();
    setupReportFetch(report);
    clusteringService.findMatchingCluster.mockResolvedValue('cluster-match');

    const response = await postReport(requestBody());

    expect(response.status).toBe(201);
    expect(clusteringService.addToCluster).toHaveBeenCalledWith(
      'cluster-match',
      REPORT_ID,
      REPORTER_ID
    );
    expect(clusteringService.notifyClusterSubscribers).toHaveBeenCalledWith(
      'cluster-match',
      'New road incident reported in A valid incident location',
      'pending',
      REPORTER_ID
    );
  });

  test('keeps clustering failures from failing report creation', async () => {
    setupReportFetch(persistedReport());
    clusteringService.createCluster.mockRejectedValue(new Error('cluster failure'));

    const response = await postReport(requestBody());

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe(REPORT_ID);
  });
});