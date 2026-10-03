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

jest.mock('../services/evidencePersistenceService', () => ({
  persistEvidenceImage: jest.fn()
}));

const { getClient } = require('../config/database');
const evidenceStorageService = require('../services/evidenceStorageService');
const { persistEvidenceImage } = require('../services/evidencePersistenceService');
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
const captureFields = {
  captureLatitude: '10.5',
  captureLongitude: '124.9',
  capturedAt: '2026-10-02T00:00:00.000Z',
  evidenceRole: 'primary'
};
const durableSuccess = {
  accepted: true,
  evidenceId: '123e4567-e89b-12d3-a456-426614174009',
  evidenceRole: 'primary',
  classification: acceptedClassification
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

const jpegSegment = (marker, payload = Buffer.alloc(0)) => {
  const length = payload.length + 2;
  return Buffer.concat([
    Buffer.from([0xff, marker, (length >> 8) & 0xff, length & 0xff]),
    payload
  ]);
};

const validJpeg = (size, width = 500, height = 500) => {
  const sof = jpegSegment(0xc0, Buffer.from([
    8,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    1,
    1, 0x11, 0
  ]));
  const prefix = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    sof,
    jpegSegment(0xda, Buffer.from([1, 1, 0, 0, 63, 0]))
  ]);

  if (!size) return Buffer.concat([prefix, Buffer.from([0x11, 0x22, 0xff, 0xd9])]);
  if (size < prefix.length + 4) throw new Error('JPEG fixture size is too small');
  return Buffer.concat([
    prefix,
    Buffer.alloc(size - prefix.length - 2, 0x11),
    Buffer.from([0xff, 0xd9])
  ]);
};

const activeSession = () => ({
  id: sessionId,
  status: 'active',
  expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
});

const attachImage = (app, {
  field = 'image',
  buffer = validJpeg(),
  mimeType = 'image/jpeg',
  filename = 'private-original-name.jpg',
  fields = captureFields
} = {}) => {
  let upload = request(app).post(`/api/evidence/sessions/${sessionId}/image`);
  Object.entries(fields).forEach(([name, value]) => {
    if (value !== undefined) upload = upload.field(name, value);
  });
  return upload.attach(field, buffer, { filename, contentType: mimeType });
};

describe('strict evidence multipart ingestion boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    persistEvidenceImage.mockResolvedValue(durableSuccess);
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

    expect(response.status).toBe(201);
    expect(query.eq).toHaveBeenNthCalledWith(1, 'id', sessionId);
    expect(query.eq).toHaveBeenNthCalledWith(2, 'owner_user_id', citizen.id);
    expect(persistEvidenceImage).toHaveBeenCalledWith({
      imageBuffer: expect.any(Buffer),
      sessionId,
      ownerUserId: citizen.id,
      captureLocation: {
        latitude: 10.5,
        longitude: 124.9,
        accuracy: null,
        capturedAt: '2026-10-02T00:00:00.000Z'
      },
      evidenceRole: 'primary'
    });
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

  test('accepts one valid image/jpeg Buffer and returns durable metadata only', async () => {
    const { from } = buildSessionQuery({ data: activeSession() });
    const image = validJpeg();
    const response = await attachImage(buildApp(), { buffer: image });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: durableSuccess });
    expect(response.text).not.toContain('private-original-name.jpg');
    expect(response.text).not.toContain(image.toString('base64'));
    expect(persistEvidenceImage).toHaveBeenCalledWith({
      imageBuffer: image,
      sessionId,
      ownerUserId: citizen.id,
      captureLocation: {
        latitude: 10.5,
        longitude: 124.9,
        accuracy: null,
        capturedAt: '2026-10-02T00:00:00.000Z'
      },
      evidenceRole: 'primary'
    });
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

  test('accepts supplementary role with required per-image capture metadata', async () => {
    buildSessionQuery({ data: activeSession() });
    persistEvidenceImage.mockResolvedValue({
      accepted: true,
      evidenceId: '123e4567-e89b-12d3-a456-426614174010',
      evidenceRole: 'supplementary'
    });

    const response = await attachImage(buildApp(), {
      fields: { ...captureFields, evidenceRole: 'supplementary' }
    });

    expect(response.status).toBe(201);
    expect(response.body.data.evidenceRole).toBe('supplementary');
    expect(response.body.data).not.toHaveProperty('classification');
    expect(persistEvidenceImage).toHaveBeenCalledWith(expect.objectContaining({
      ownerUserId: citizen.id,
      evidenceRole: 'supplementary',
      captureLocation: expect.objectContaining({ latitude: 10.5, longitude: 124.9 })
    }));
  });

  test('rejects JPEG MIME metadata without JPEG markers', async () => {
    buildSessionQuery({ data: activeSession() });
    const response = await attachImage(buildApp(), { buffer: Buffer.from('not a jpeg') });

    expect(response.status).toBe(400);
  });

  test.each([
    ['missing latitude', { ...captureFields, captureLatitude: undefined }],
    ['missing longitude', { ...captureFields, captureLongitude: undefined }],
    ['missing capturedAt', { ...captureFields, capturedAt: undefined }],
    ['malformed latitude', { ...captureFields, captureLatitude: '10abc' }],
    ['malformed timestamp', { ...captureFields, capturedAt: '2026-10-02T00:00:00' }]
  ])('rejects %s before persistence', async (_, fields) => {
    buildSessionQuery({ data: activeSession() });
    const response = await attachImage(buildApp(), { fields });

    expect(response.status).toBe(400);
    expect(persistEvidenceImage).not.toHaveBeenCalled();
  });

  test('maps orchestrator JPEG validation failure to a generic 400', async () => {
    buildSessionQuery({ data: activeSession() });
    persistEvidenceImage.mockRejectedValue(Object.assign(new Error('private parser detail'), {
      code: 'INVALID_JPEG'
    }));

    const response = await attachImage(buildApp(), { buffer: validJpeg(undefined, 7000, 6000) });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Image content is not a valid JPEG' });
    expect(response.text).not.toContain('private parser detail');
  });

  test.each([
    ['SESSION_UNAVAILABLE', 404, 'Evidence upload session not found'],
    ['CAPACITY_REACHED', 409, 'Evidence session capacity reached'],
    ['RESERVATION_CONFLICT', 409, 'Evidence reservation conflict'],
    ['PERSISTENCE_UNAVAILABLE', 503, 'Evidence persistence unavailable']
  ])('maps %s to a safe HTTP response', async (code, status, message) => {
    buildSessionQuery({ data: activeSession() });
    persistEvidenceImage.mockRejectedValue(Object.assign(new Error('private database/storage error'), { code }));

    const response = await attachImage(buildApp());

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: message });
    expect(response.text).not.toContain('private database/storage error');
    expect(response.text).not.toContain(code);
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

    expect(response.status).toBe(201);
    expect(persistEvidenceImage).toHaveBeenCalledWith({
      imageBuffer: image,
      sessionId,
      ownerUserId: citizen.id,
      captureLocation: {
        latitude: 10.5,
        longitude: 124.9,
        accuracy: null,
        capturedAt: '2026-10-02T00:00:00.000Z'
      },
      evidenceRole: 'primary'
    });
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
    persistEvidenceImage.mockResolvedValue({ accepted: false, evidenceRole: 'primary', classification: rejectedClassification });

    const response = await attachImage(buildApp());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { accepted: false, evidenceRole: 'primary', classification: rejectedClassification }
    });
  });

  test('returns a generic 503 when classification infrastructure fails', async () => {
    buildSessionQuery({ data: activeSession() });
    persistEvidenceImage.mockRejectedValue(Object.assign(new Error('provider URL and body secret'), {
      code: 'CLASSIFIER_UNAVAILABLE'
    }));

    const response = await attachImage(buildApp());

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Classification service unavailable' });
    expect(response.text).not.toContain('provider URL');
    expect(response.text).not.toContain('secret');
  });

  test('returns only generic 503 for invalid provider decision fields', async () => {
    buildSessionQuery({ data: activeSession() });
    persistEvidenceImage.mockRejectedValue(Object.assign(
      new Error('private provider field value'),
      { code: 'CLASSIFIER_UNAVAILABLE' }
    ));

    const response = await attachImage(buildApp());

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Classification service unavailable' });
    expect(response.text).not.toContain('private provider field value');
    expect(response.text).not.toContain('CLASSIFIER_UNAVAILABLE');
  });

  test('client multipart classification metadata cannot influence the server result', async () => {
    buildSessionQuery({ data: activeSession() });
    const response = await request(buildApp())
      .post(`/api/evidence/sessions/${sessionId}/image`)
      .field('captureLatitude', '10.5')
      .field('captureLongitude', '124.9')
      .field('capturedAt', '2026-10-02T00:00:00.000Z')
      .field('label', 'road')
      .field('confidence', '1')
      .attach('image', validJpeg(), { filename: 'client.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(400);
    expect(persistEvidenceImage).not.toHaveBeenCalled();
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