jest.mock('../config/database', () => ({
  getClient: jest.fn(),
  getEvidenceStorageBucket: jest.fn(() => 'private-evidence')
}));

const fs = require('fs');
const { getClient } = require('../config/database');
const {
  EVIDENCE_MIME_TYPE,
  MAX_EVIDENCE_BYTES,
  buildEvidenceObjectPath,
  uploadEvidenceObject,
  deleteEvidenceObject
} = require('../services/evidenceStorageService');

const uploadSessionId = '123e4567-e89b-12d3-a456-426614174000';
const evidenceId = '123e4567-e89b-12d3-a456-426614174001';
const expectedPath = `evidence/${uploadSessionId}/${evidenceId}.jpg`;

const createStorageMock = ({ uploadError = null, deleteError = null } = {}) => {
  const upload = jest.fn().mockResolvedValue({ data: null, error: uploadError });
  const remove = jest.fn().mockResolvedValue({ data: null, error: deleteError });
  const from = jest.fn(() => ({ upload, remove }));
  getClient.mockReturnValue({ storage: { from } });
  return { from, upload, remove };
};

describe('evidence storage service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('generates an opaque UUID-based JPEG key', () => {
    expect(buildEvidenceObjectPath(uploadSessionId, evidenceId)).toBe(expectedPath);
  });

  test.each([
    ['uploadSessionId', { uploadSessionId: '../../session' }],
    ['evidenceId', { evidenceId: '../../evidence' }]
  ])('rejects malformed or path-traversal %s', async (_, values) => {
    await expect(uploadEvidenceObject({
      uploadSessionId: values.uploadSessionId || uploadSessionId,
      evidenceId: values.evidenceId || evidenceId,
      imageBuffer: Buffer.from('jpeg'),
      mimeType: EVIDENCE_MIME_TYPE
    })).rejects.toThrow(/valid UUID/);
  });

  test('rejects a malformed evidence UUID', async () => {
    await expect(uploadEvidenceObject({
      uploadSessionId,
      evidenceId: 'not-a-uuid',
      imageBuffer: Buffer.from('jpeg'),
      mimeType: EVIDENCE_MIME_TYPE
    })).rejects.toThrow(/evidenceId/);
  });

  test.each([
    ['non-JPEG MIME type', { imageBuffer: Buffer.from('jpeg'), mimeType: 'image/png' }, /image\/jpeg/],
    ['missing Buffer', { imageBuffer: 'base64-data', mimeType: EVIDENCE_MIME_TYPE }, /Buffer/],
    ['empty Buffer', { imageBuffer: Buffer.alloc(0), mimeType: EVIDENCE_MIME_TYPE }, /empty/],
    ['oversized Buffer', { imageBuffer: Buffer.alloc(MAX_EVIDENCE_BYTES + 1), mimeType: EVIDENCE_MIME_TYPE }, /maximum/]
  ])('rejects %s before storage access', async (_, input, expectedError) => {
    createStorageMock();

    await expect(uploadEvidenceObject({ uploadSessionId, evidenceId, ...input }))
      .rejects.toThrow(expectedError);
    expect(getClient).not.toHaveBeenCalled();
  });

  test('uploads JPEG buffers up to 5 MiB with trusted settings', async () => {
    const storage = createStorageMock();
    const imageBuffer = Buffer.alloc(MAX_EVIDENCE_BYTES);

    const result = await uploadEvidenceObject({
      uploadSessionId,
      evidenceId,
      imageBuffer,
      mimeType: EVIDENCE_MIME_TYPE
    });

    expect(storage.from).toHaveBeenCalledWith('private-evidence');
    expect(storage.upload).toHaveBeenCalledWith(expectedPath, imageBuffer, {
      contentType: EVIDENCE_MIME_TYPE,
      upsert: false
    });
    expect(result).toEqual({
      bucket: 'private-evidence',
      path: expectedPath,
      byteSize: MAX_EVIDENCE_BYTES,
      mimeType: EVIDENCE_MIME_TYPE
    });
    expect(result).not.toHaveProperty('publicUrl');
    expect(result).not.toHaveProperty('signedUrl');
  });

  test('deletes only the derived trusted key', async () => {
    const storage = createStorageMock();

    const result = await deleteEvidenceObject({
      uploadSessionId,
      evidenceId,
      path: 'arbitrary/caller/path.jpg'
    });

    expect(storage.from).toHaveBeenCalledWith('private-evidence');
    expect(storage.remove).toHaveBeenCalledWith([expectedPath]);
    expect(result).toEqual({ bucket: 'private-evidence', path: expectedPath, deleted: true });
  });

  test('rejects deletion without server-controlled IDs', async () => {
    await expect(deleteEvidenceObject({ path: 'arbitrary/caller/path.jpg' }))
      .rejects.toThrow(/uploadSessionId/);
    expect(getClient).not.toHaveBeenCalled();
  });

  test('normalizes upload provider failures and does not expose provider details', async () => {
    const providerSecret = 'provider-secret-image-error';
    createStorageMock({ uploadError: new Error(providerSecret) });

    await expect(uploadEvidenceObject({
      uploadSessionId,
      evidenceId,
      imageBuffer: Buffer.from('jpeg'),
      mimeType: EVIDENCE_MIME_TYPE
    })).rejects.toMatchObject({
      code: 'EVIDENCE_STORAGE_UPLOAD_FAILED',
      message: 'Evidence storage upload failed'
    });
    await expect(uploadEvidenceObject({
      uploadSessionId,
      evidenceId,
      imageBuffer: Buffer.from('jpeg'),
      mimeType: EVIDENCE_MIME_TYPE
    })).rejects.not.toThrow(providerSecret);
  });

  test('normalizes delete provider failures', async () => {
    createStorageMock({ deleteError: new Error('provider-delete-secret') });

    await expect(deleteEvidenceObject({ uploadSessionId, evidenceId }))
      .rejects.toMatchObject({
        code: 'EVIDENCE_STORAGE_DELETE_FAILED',
        message: 'Evidence storage delete failed'
      });
  });

  test('does not expose bucket creation, public URL, or signed URL behavior', () => {
    const serviceSource = fs.readFileSync(
      require.resolve('../services/evidenceStorageService'),
      'utf8'
    );

    expect(serviceSource).not.toMatch(/createBucket|getPublicUrl|createSignedUrl|createSignedUrls/);
  });
});