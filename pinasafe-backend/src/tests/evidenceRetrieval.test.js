const express = require('express');
const request = require('supertest');

jest.mock('../config/database', () => ({
  getClient: jest.fn(),
  getEvidenceStorageBucket: jest.fn(() => 'test-evidence-bucket')
}));

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  canAccessOrganization: (user, organizationId) =>
    user && user.organization_id === organizationId
}));

const { getClient, getEvidenceStorageBucket } = require('../config/database');
const evidenceRouter = require('../routes/evidence');

const REPORT_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_REPORT_ID = '123e4567-e89b-12d3-a456-426614174001';
const ORG_ID = 'org-1';
const OTHER_ORG_ID = 'org-2';
const TEAM_ID = '123e4567-e89b-12d3-a456-426614174002';
const SESSION_ID = '123e4567-e89b-12d3-a456-426614174003';
const EVIDENCE_ID = '123e4567-e89b-12d3-a456-426614174004';

const citizen = { id: 'citizen-1', role: 'citizen', organization_id: null };
const otherCitizen = { id: 'citizen-2', role: 'citizen', organization_id: null };
const admin = { id: 'admin-1', role: 'admin', organization_id: ORG_ID };
const otherOrgAdmin = { id: 'admin-2', role: 'admin', organization_id: OTHER_ORG_ID };
const responder = { id: 'responder-1', role: 'responder', organization_id: ORG_ID };
const teamLeader = { id: 'leader-1', role: 'responder', organization_id: ORG_ID };
const crossOrgResponder = { id: 'responder-2', role: 'responder', organization_id: OTHER_ORG_ID };
const superAdmin = { id: 'super-1', role: 'super_admin', organization_id: null };

const buildQuery = (payload) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue(payload)
});

const buildEvidenceQuery = (rows) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  data: rows,
  error: null
});

const buildStorage = (signedUrl) => ({
  from: jest.fn(() => ({
    createSignedUrl: jest.fn().mockResolvedValue({
      data: { signedUrl },
      error: null
    })
  }))
});

const mockFromSequence = (queries, storageOverride) => {
  const remaining = [...queries];
  const from = jest.fn(() => {
    const next = remaining.shift();
    if (!next) throw new Error('Unexpected extra supabase .from() call');
    return next;
  });
  getClient.mockReturnValue({
    from,
    storage: storageOverride || buildStorage('https://signed.example.test/evidence.jpg')
  });
  return from;
};

const buildApp = (user) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use('/evidence', evidenceRouter);
  return app;
};

const reportRow = (overrides = {}) => ({
  id: REPORT_ID,
  reported_by: citizen.id,
  organization_id: ORG_ID,
  assigned_team_id: TEAM_ID,
  status: 'dispatched',
  ...overrides
});

const evidenceRow = (overrides = {}) => ({
  id: EVIDENCE_ID,
  upload_session_id: SESSION_ID,
  storage_path: `evidence/${SESSION_ID}/${EVIDENCE_ID}.jpg`,
  mime_type: 'image/jpeg',
  byte_size: 8123,
  width: 1280,
  height: 720,
  classification_label: 'fire',
  classification_confidence: 0.94,
  classification_caption: null,
  created_at: '2026-09-29T00:00:00.000Z',
  ...overrides
});

describe('GET /evidence/reports/:reportId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getEvidenceStorageBucket.mockReturnValue('test-evidence-bucket');
  });

  test('1. citizen can retrieve evidence for own report', async () => {
    const reportQuery = buildQuery({ data: reportRow(), error: null });
    const evidenceQuery = buildEvidenceQuery([evidenceRow()]);
  mockFromSequence([reportQuery, evidenceQuery]);

    const response = await request(buildApp(citizen))
      .get(`/evidence/reports/${REPORT_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  test('2. citizen denied evidence for another citizen report', async () => {
    const reportQuery = buildQuery({ data: reportRow({ reported_by: otherCitizen.id }), error: null });
    mockFromSequence([reportQuery]);

    const response = await request(buildApp(citizen))
      .get(`/evidence/reports/${REPORT_ID}`);

    expect(response.status).toBe(403);
  });

  test('3. admin can retrieve evidence for same-organization report', async () => {
    const reportQuery = buildQuery({ data: reportRow(), error: null });
    const evidenceQuery = buildEvidenceQuery([evidenceRow()]);
    mockFromSequence([reportQuery, evidenceQuery]);

    const response = await request(buildApp(admin))
      .get(`/evidence/reports/${REPORT_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  test('4. admin denied evidence for other organization report', async () => {
    const reportQuery = buildQuery({ data: reportRow({ organization_id: ORG_ID }), error: null });
    mockFromSequence([reportQuery]);

    const response = await request(buildApp(otherOrgAdmin))
      .get(`/evidence/reports/${REPORT_ID}`);

    expect(response.status).toBe(403);
  });

  test('5. assigned-team responder member can retrieve evidence', async () => {
    const reportQuery = buildQuery({ data: reportRow(), error: null });
    const teamQuery = buildQuery({ data: { id: TEAM_ID, team_leader_id: teamLeader.id }, error: null });
    const membershipQuery = buildQuery({ data: { id: 'member-1' }, error: null });
    const evidenceQuery = buildEvidenceQuery([evidenceRow()]);
    mockFromSequence([reportQuery, teamQuery, membershipQuery, evidenceQuery]);

    const response = await request(buildApp(responder))
      .get(`/evidence/reports/${REPORT_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  test('6. assigned-team leader can retrieve evidence without ordinary membership', async () => {
    const reportQuery = buildQuery({ data: reportRow(), error: null });
    const teamQuery = buildQuery({ data: { id: TEAM_ID, team_leader_id: teamLeader.id }, error: null });
    const evidenceQuery = buildEvidenceQuery([evidenceRow()]);
    mockFromSequence([reportQuery, teamQuery, evidenceQuery]);

    const response = await request(buildApp(teamLeader))
      .get(`/evidence/reports/${REPORT_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  test('7. unrelated same-org responder denied', async () => {
    const reportQuery = buildQuery({ data: reportRow(), error: null });
    const teamQuery = buildQuery({ data: { id: TEAM_ID, team_leader_id: teamLeader.id }, error: null });
    const membershipQuery = buildQuery({ data: null, error: null });
    mockFromSequence([reportQuery, teamQuery, membershipQuery]);

    const response = await request(buildApp({ id: 'responder-3', role: 'responder', organization_id: ORG_ID }))
      .get(`/evidence/reports/${REPORT_ID}`);

    expect(response.status).toBe(403);
  });

  test('8. cross-org responder denied', async () => {
    const reportQuery = buildQuery({ data: reportRow(), error: null });
    mockFromSequence([reportQuery]);

    const response = await request(buildApp(crossOrgResponder))
      .get(`/evidence/reports/${REPORT_ID}`);

    expect(response.status).toBe(403);
  });

  test('9. report with no evidence returns safe empty result', async () => {
    const reportQuery = buildQuery({ data: reportRow(), error: null });
    const evidenceQuery = buildEvidenceQuery([]);
    mockFromSequence([reportQuery, evidenceQuery]);

    const response = await request(buildApp(admin))
      .get(`/evidence/reports/${REPORT_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  test('10. missing report fails safely with 404', async () => {
    const reportQuery = buildQuery({ data: null, error: null });
    mockFromSequence([reportQuery]);

    const response = await request(buildApp(admin))
      .get(`/evidence/reports/${REPORT_ID}`);

    expect(response.status).toBe(404);
  });

  test('11. accepted bound evidence receives a signed URL', async () => {
    const reportQuery = buildQuery({ data: reportRow(), error: null });
    const evidenceQuery = buildEvidenceQuery([evidenceRow()]);
    mockFromSequence([reportQuery, evidenceQuery]);

    const response = await request(buildApp(admin))
      .get(`/evidence/reports/${REPORT_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].url).toBe('https://signed.example.test/evidence.jpg');
  });

  test('12. signing expiration is exactly 300 seconds', async () => {
    const createSignedUrlMock = jest.fn().mockResolvedValue({
      data: { signedUrl: 'https://signed.example.test/evidence.jpg' },
      error: null
    });
    const storageFromMock = { createSignedUrl: createSignedUrlMock };
    const storageMock = { from: jest.fn(() => storageFromMock) };

    const reportQuery = buildQuery({ data: reportRow(), error: null });
    const evidenceQuery = buildEvidenceQuery([evidenceRow()]);
    mockFromSequence([reportQuery, evidenceQuery], storageMock);

    await request(buildApp(admin))
      .get(`/evidence/reports/${REPORT_ID}`);

    expect(createSignedUrlMock).toHaveBeenCalledWith(
      `evidence/${SESSION_ID}/${EVIDENCE_ID}.jpg`,
      300
    );
  });

  test('13. forbidden request performs zero Storage signing', async () => {
    const reportQuery = buildQuery({ data: reportRow({ reported_by: otherCitizen.id }), error: null });
    const storage = buildStorage('https://signed.example.test/evidence.jpg');
    mockFromSequence([reportQuery], storage);

    await request(buildApp(citizen))
      .get(`/evidence/reports/${REPORT_ID}`);

    expect(storage.from).not.toHaveBeenCalled();
  });

  test('14. response does not expose storage_bucket', async () => {
    const reportQuery = buildQuery({ data: reportRow(), error: null });
    const evidenceQuery = buildEvidenceQuery([evidenceRow()]);
    mockFromSequence([reportQuery, evidenceQuery]);

    const response = await request(buildApp(admin))
      .get(`/evidence/reports/${REPORT_ID}`);

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain('storage_bucket');
    expect(JSON.stringify(response.body)).not.toContain('test-evidence-bucket');
  });

  test('15. response does not expose storage_path', async () => {
    const reportQuery = buildQuery({ data: reportRow(), error: null });
    const evidenceQuery = buildEvidenceQuery([evidenceRow()]);
    mockFromSequence([reportQuery, evidenceQuery]);

    const response = await request(buildApp(admin))
      .get(`/evidence/reports/${REPORT_ID}`);

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain('storage_path');
    expect(JSON.stringify(response.body)).not.toContain('evidence/');
  });

  test('16. response contains frontend-compatible url field', async () => {
    const reportQuery = buildQuery({ data: reportRow(), error: null });
    const evidenceQuery = buildEvidenceQuery([evidenceRow()]);
    mockFromSequence([reportQuery, evidenceQuery]);

    const response = await request(buildApp(admin))
      .get(`/evidence/reports/${REPORT_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toHaveProperty('url');
    expect(response.body.data[0]).toHaveProperty('mimeType', 'image/jpeg');
    expect(response.body.data[0]).toHaveProperty('byteSize');
    expect(response.body.data[0]).toHaveProperty('width');
    expect(response.body.data[0]).toHaveProperty('height');
    expect(response.body.data[0]).toHaveProperty('classification');
    expect(response.body.data[0]).toHaveProperty('createdAt');
    expect(response.body.data[0]).toHaveProperty('expiresIn', 300);
  });

  test('17. super-admin can retrieve evidence for any report', async () => {
    const reportQuery = buildQuery({ data: reportRow(), error: null });
    const evidenceQuery = buildEvidenceQuery([evidenceRow()]);
    mockFromSequence([reportQuery, evidenceQuery]);

    const response = await request(buildApp(superAdmin))
      .get(`/evidence/reports/${REPORT_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });
});
