const express = require('express');
const fs = require('fs');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Access token required' });
    next();
  },
  requireRole: (roles) => (req, res, next) => {
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    if (!allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  }
}));

jest.mock('../config/database', () => ({
  getClient: jest.fn()
}));

jest.mock('../services/evidenceStorageService', () => ({
  MAX_EVIDENCE_BYTES: 5 * 1024 * 1024,
  uploadEvidenceObject: jest.fn(),
  deleteEvidenceObject: jest.fn()
}));

jest.mock('../services/aiClassificationService', () => ({
  classifyEvidenceImage: jest.fn()
}));

const { getClient } = require('../config/database');
const evidenceStorageService = require('../services/evidenceStorageService');
const { classifyEvidenceImage } = require('../services/aiClassificationService');
const evidenceRouter = require('../routes/evidence');

const sessionId = '123e4567-e89b-12d3-a456-426614174000';
const citizen = { id: '123e4567-e89b-12d3-a456-426614174001', role: 'citizen' };
const MAX_EVIDENCE_BYTES = evidenceStorageService.MAX_EVIDENCE_BYTES;
const acceptedClassification = {
  accepted: true,
  label: 'fire',
  confidence: 0.9,
  status: 'valid',
  action: 'accept',
  reason: 'Fire confirmed',
  caption: 'Smoke visible'
};

const buildSessionQuery = ({ data, error = null } = {}) => {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data, error })
  };
  const from = jest.fn(() => query);
  getClient.mockReturnValue({ from });
  return { query, from };
};

const buildApp = (user = citizen) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (user) req.user = user;
    next();
  });
  app.use('/api/evidence', evidenceRouter);
  return app;
};

const validJpeg = (size = 8) => {
  const buffer = Buffer.alloc(size, 0x11);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[buffer.length - 2] = 0xff;
  buffer[buffer.length - 1] = 0xd9;
  return buffer;
};

const activeSession = () => ({
  id: sessionId,
  status: 'active',
  expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
});

const attachImage = (app, { field = 'image', buffer = validJpeg(), mimeType = 'image/jpeg', filename = 'private-original-name.jpg' } = {}) =>
  request(app)
    .post(`/api/evidence/sessions/${sessionId}/image`)
    .attach(field, buffer, { filename, contentType: mimeType });

describe('strict evidence multipart ingestion boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    classifyEvidenceImage.mockResolvedValue(acceptedClassification);
  });

  test('rejects unauthenticated requests before database lookup', async () => {
    const response = await attachImage(buildApp(null));

    expect(response.status).toBe(401);
    expect(getClient).not.toHaveBeenCalled();
  });

  test.each(['responder', 'admin', 'super_admin'])('rejects %s before database lookup', async (role) => {
    const response = await attachImage(buildApp({ id: citizen.id, role }));

    expect(response.status).toBe(403);
    expect(getClient).not.toHaveBeenCalled();
  });

  test('rejects malformed session UUID before database lookup', async () => {
    const response = await request(buildApp())
      .post('/api/evidence/sessions/not-a-uuid/image')
      .attach('image', validJpeg(), { filename: 'x.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(400);
    expect(getClient).not.toHaveBeenCalled();
  });

  test('citizen session lookup constrains both id and owner before parsing', async () => {
    const { query } = buildSessionQuery({ data: activeSession() });
    const response = await attachImage(buildApp());

    expect(response.status).toBe(200);
    expect(query.eq).toHaveBeenNthCalledWith(1, 'id', sessionId);
    expect(query.eq).toHaveBeenNthCalledWith(2, 'owner_user_id', citizen.id);
    expect(classifyEvidenceImage).toHaveBeenCalledWith(expect.any(Buffer));
  });

  test.each([
    ['nonexistent or another user session', null],
    ['expired active session', { ...activeSession(), expires_at: '2000-01-01T00:00:00.000Z' }],
    ['explicitly expired session', { ...activeSession(), status: 'expired' }],
    ['bound session', { ...activeSession(), status: 'bound' }],
    ['malformed expiration', { ...activeSession(), expires_at: 'not-a-date' }]
  ])('does not parse image for %s', async (_, data) => {
    const { query } = buildSessionQuery({ data });
    const response = await attachImage(buildApp());

    expect(response.status).toBe(404);
    expect(query.eq).toHaveBeenCalledWith('owner_user_id', citizen.id);
  });

  test('rejects non-multipart requests', async () => {
    buildSessionQuery({ data: activeSession() });
    const response = await request(buildApp())
      .post(`/api/evidence/sessions/${sessionId}/image`)
      .send({ image: Buffer.from('base64').toString('base64') });

    expect(response.status).toBe(400);
  });

  test('rejects missing image', async () => {
    buildSessionQuery({ data: activeSession() });
    const response = await request(buildApp())
      .post(`/api/evidence/sessions/${sessionId}/image`)
      .field('ignored', 'not-allowed');

    expect(response.status).toBe(400);
  });

  test('rejects an unexpected file field', async () => {
    buildSessionQuery({ data: activeSession() });
    const response = await attachImage(buildApp(), { field: 'photo' });

    expect(response.status).toBe(400);
  });

  test('rejects multiple image files', async () => {
    buildSessionQuery({ data: activeSession() });
    const response = request(buildApp())
      .post(`/api/evidence/sessions/${sessionId}/image`)
      .attach('image', validJpeg(), { filename: 'one.jpg', contentType: 'image/jpeg' })
      .attach('image', validJpeg(), { filename: 'two.jpg', contentType: 'image/jpeg' });

    expect((await response).status).toBe(400);
  });

  test('rejects an extra file field', async () => {
    buildSessionQuery({ data: activeSession() });
    const response = request(buildApp())
      .post(`/api/evidence/sessions/${sessionId}/image`)
      .attach('image', validJpeg(), { filename: 'one.jpg', contentType: 'image/jpeg' })
      .attach('other', validJpeg(), { filename: 'two.jpg', contentType: 'image/jpeg' });

    expect((await response).status).toBe(400);
  });

  test('rejects text fields', async () => {
    buildSessionQuery({ data: activeSession() });
    const response = await request(buildApp())
      .post(`/api/evidence/sessions/${sessionId}/image`)
      .field('classification', 'fire')
      .attach('image', validJpeg(), { filename: 'one.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(400);
    expect(response.text).not.toContain('fire');
  });

  test('accepts one valid image/jpeg Buffer and returns minimal metadata only', async () => {
    const { from } = buildSessionQuery({ data: activeSession() });
    const image = validJpeg();
    const response = await attachImage(buildApp(), { buffer: image });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: acceptedClassification });
    expect(response.text).not.toContain('private-original-name.jpg');
    expect(response.text).not.toContain(image.toString('base64'));
    expect(classifyEvidenceImage).toHaveBeenCalledWith(image);
    expect(evidenceStorageService.uploadEvidenceObject).not.toHaveBeenCalled();
    expect(evidenceStorageService.deleteEvidenceObject).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('evidence_upload_sessions');
  });

  test('rejects non-JPEG MIME types', async () => {
    buildSessionQuery({ data: activeSession() });
    const response = await attachImage(buildApp(), { mimeType: 'image/png' });

    expect(response.status).toBe(400);
  });

  test('rejects JPEG MIME metadata without JPEG markers', async () => {
    buildSessionQuery({ data: activeSession() });
    const response = await attachImage(buildApp(), { buffer: Buffer.from('not a jpeg') });

    expect(response.status).toBe(400);
  });

  test('rejects empty image files', async () => {
    buildSessionQuery({ data: activeSession() });
    const response = await attachImage(buildApp(), { buffer: Buffer.alloc(0) });

    expect(response.status).toBe(400);
  });

  test('accepts a valid JPEG exactly 5 MiB', async () => {
    buildSessionQuery({ data: activeSession() });
    const image = validJpeg(MAX_EVIDENCE_BYTES);
    const response = await attachImage(buildApp(), { buffer: image });

    expect(response.status).toBe(200);
    expect(classifyEvidenceImage).toHaveBeenCalledWith(image);
  });

  test('application explicitly checks the buffer size before JPEG signatures', () => {
    const routeSource = fs.readFileSync(require.resolve('../routes/evidence'), 'utf8');
    const nonEmptyBufferCheck = routeSource.indexOf('req.file.buffer.length === 0');
    const maximumBufferCheck = routeSource.indexOf('req.file.buffer.length > MAX_EVIDENCE_BYTES');
    const jpegSignatureCheck = routeSource.indexOf('imageBuffer.length < 4');

    expect(nonEmptyBufferCheck).toBeGreaterThanOrEqual(0);
    expect(maximumBufferCheck).toBeGreaterThan(nonEmptyBufferCheck);
    expect(jpegSignatureCheck).toBeGreaterThan(maximumBufferCheck);
  });

  test('returns 413 for images larger than 5 MiB without leaking parser details', async () => {
    buildSessionQuery({ data: activeSession() });
    const image = validJpeg(MAX_EVIDENCE_BYTES + 1);
    const response = await attachImage(buildApp(), { buffer: image });

    expect(response.status).toBe(413);
    expect(response.text).not.toContain('LIMIT_FILE_SIZE');
    expect(response.text).not.toContain('private-original-name.jpg');
  });

  test('does not mutate sessions or persist evidence', async () => {
    const { query, from } = buildSessionQuery({ data: activeSession() });
    await attachImage(buildApp());

    expect(query.insert).toBeUndefined();
    expect(query.update).toBeUndefined();
    expect(from).toHaveBeenCalledTimes(1);
    expect(evidenceStorageService.uploadEvidenceObject).not.toHaveBeenCalled();
    expect(evidenceStorageService.deleteEvidenceObject).not.toHaveBeenCalled();
  });

  test.each([
    ['unsupported label', { accepted: false, label: 'other', confidence: 0.4, status: 'valid', action: 'accept', reason: null, caption: null }],
    ['invalid status', { accepted: false, label: 'fire', confidence: 0.9, status: 'invalid', action: 'accept', reason: null, caption: null }],
    ['reject action', { accepted: false, label: 'fire', confidence: 0.9, status: 'valid', action: 'reject', reason: null, caption: null }],
    ['uncertain action', { accepted: false, label: 'fire', confidence: 0.9, status: 'valid', action: 'uncertain', reason: null, caption: null }]
  ])('returns HTTP 200 for legitimate model rejection: %s', async (_, rejectedClassification) => {
    buildSessionQuery({ data: activeSession() });
    classifyEvidenceImage.mockResolvedValue(rejectedClassification);

    const response = await attachImage(buildApp());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: rejectedClassification });
  });

  test('returns a generic 503 when classification infrastructure fails', async () => {
    buildSessionQuery({ data: activeSession() });
    classifyEvidenceImage.mockRejectedValue(new Error('provider URL and body secret'));

    const response = await attachImage(buildApp());

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Classification service unavailable' });
    expect(response.text).not.toContain('provider URL');
    expect(response.text).not.toContain('secret');
  });

  test('returns only generic 503 for invalid provider decision fields', async () => {
    buildSessionQuery({ data: activeSession() });
    classifyEvidenceImage.mockRejectedValue(Object.assign(
      new Error('private provider field value'),
      { code: 'AI_CLASSIFIER_INVALID_RESPONSE' }
    ));

    const response = await attachImage(buildApp());

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Classification service unavailable' });
    expect(response.text).not.toContain('private provider field value');
    expect(response.text).not.toContain('AI_CLASSIFIER_INVALID_RESPONSE');
  });

  test('client multipart classification metadata cannot influence the server result', async () => {
    buildSessionQuery({ data: activeSession() });
    const response = await request(buildApp())
      .post(`/api/evidence/sessions/${sessionId}/image`)
      .field('label', 'road')
      .field('confidence', '1')
      .attach('image', validJpeg(), { filename: 'client.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(400);
    expect(classifyEvidenceImage).not.toHaveBeenCalled();
  });

  test('normalizes parser failures without returning internals', async () => {
    buildSessionQuery({ data: activeSession() });
    const response = await request(buildApp())
      .post(`/api/evidence/sessions/${sessionId}/image`)
      .set('Content-Type', 'multipart/form-data; boundary=broken')
      .send('malformed multipart payload');

    expect(response.status).toBe(400);
    expect(response.text).not.toContain('MulterError');
    expect(response.text).not.toContain('stack');
  });
});