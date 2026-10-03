jest.mock('uuid', () => ({ v4: jest.fn(() => '123e4567-e89b-12d3-a456-426614174009') }));

jest.mock('../config/database', () => ({
  getClient: jest.fn(),
  getEvidenceStorageBucket: jest.fn(() => 'private-evidence')
}));

jest.mock('../services/jpegDimensionsService', () => ({
  getJpegDimensions: jest.fn(() => ({ width: 640, height: 480 }))
}));

jest.mock('../services/aiClassificationService', () => ({
  classifyEvidenceImage: jest.fn()
}));

jest.mock('../services/evidenceStorageService', () => ({
  EVIDENCE_MIME_TYPE: 'image/jpeg',
  buildEvidenceObjectPath: jest.fn((sessionId, evidenceId) => `evidence/${sessionId}/${evidenceId}.jpg`),
  uploadEvidenceObject: jest.fn(),
  deleteEvidenceObject: jest.fn()
}));

const { v4: uuidv4 } = require('uuid');
const { getClient, getEvidenceStorageBucket } = require('../config/database');
const { getJpegDimensions } = require('../services/jpegDimensionsService');
const { classifyEvidenceImage } = require('../services/aiClassificationService');
const {
  buildEvidenceObjectPath,
  uploadEvidenceObject,
  deleteEvidenceObject
} = require('../services/evidenceStorageService');
const {
  EvidencePersistenceError,
  persistEvidenceImage
} = require('../services/evidencePersistenceService');

const sessionId = '123e4567-e89b-12d3-a456-426614174000';
const ownerUserId = '123e4567-e89b-12d3-a456-426614174001';
const evidenceId = '123e4567-e89b-12d3-a456-426614174009';
const imageBuffer = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);
const acceptedClassification = {
  accepted: true,
  label: 'fire',
  confidence: 0.1,
  status: 'valid',
  action: 'accept',
  reason: 'Fire confirmed',
  caption: 'Smoke visible'
};
const rejectedClassification = {
  accepted: false,
  label: 'other',
  confidence: 0.2,
  status: 'valid',
  action: 'accept',
  reason: null,
  caption: null
};
const successResult = {
  accepted: true,
  evidenceId,
  evidenceRole: 'primary',
  classification: {
    label: 'fire',
    confidence: 0.1,
    status: 'valid',
    action: 'accept',
    reason: 'Fire confirmed',
    caption: 'Smoke visible'
  }
};

const reserveResult = (data = 'RESERVED', error = null) => ({ data, error });
const finalizeResult = (data = 'FINALIZED', error = null) => ({ data, error });
const reconciliationResult = (data, error = null) => ({ data, error });

const buildDatabaseMock = ({ reserve = reserveResult(), finalize = finalizeResult(), reconciliation = reconciliationResult(null), cancel = { data: 'CANCELLED', error: null } } = {}) => {
  const rpc = jest.fn(async (name) => {
    if (name === 'reserve_report_evidence') return reserve;
    if (name === 'finalize_report_evidence_upload') return finalize;
    if (name === 'cancel_report_evidence_reservation') return cancel;
    throw new Error('unexpected RPC');
  });
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(reconciliation)
  };
  const from = jest.fn(() => query);
  getClient.mockReturnValue({ rpc, from });
  return { rpc, from, query };
};

const captureLocation = {
  latitude: 10.5,
  longitude: 124.9,
  accuracy: 12,
  capturedAt: '2026-10-02T00:00:00.000Z'
};
const runPersistence = () => persistEvidenceImage({ imageBuffer, sessionId, ownerUserId, captureLocation });

const expectPersistenceCode = async (promise, code) => {
  await expect(promise).rejects.toMatchObject({
    name: 'EvidencePersistenceError',
    code,
    message: 'Evidence persistence unavailable'
  });
};

const resetDependencies = () => {
  jest.clearAllMocks();
  getJpegDimensions.mockReturnValue({ width: 640, height: 480 });
  classifyEvidenceImage.mockResolvedValue(acceptedClassification);
  getEvidenceStorageBucket.mockReturnValue('private-evidence');
  buildEvidenceObjectPath.mockReturnValue(`evidence/${sessionId}/${evidenceId}.jpg`);
  uploadEvidenceObject.mockResolvedValue({
    bucket: 'private-evidence',
    path: `evidence/${sessionId}/${evidenceId}.jpg`,
    byteSize: imageBuffer.length,
    mimeType: 'image/jpeg'
  });
  deleteEvidenceObject.mockResolvedValue({ deleted: true });
  buildDatabaseMock();
};

describe('evidence persistence orchestration', () => {
  beforeEach(resetDependencies);

  test('parses trusted dimensions before classification exactly once', async () => {
    await runPersistence();

    expect(getJpegDimensions).toHaveBeenCalledTimes(1);
    expect(getJpegDimensions).toHaveBeenCalledWith(imageBuffer);
    expect(classifyEvidenceImage).toHaveBeenCalledTimes(1);
    expect(getJpegDimensions.mock.invocationCallOrder[0])
      .toBeLessThan(classifyEvidenceImage.mock.invocationCallOrder[0]);
  });

  test('invalid dimensions stop before classification or persistence', async () => {
    getJpegDimensions.mockImplementation(() => { throw new TypeError('private parser detail'); });

    await expectPersistenceCode(runPersistence(), 'INVALID_JPEG');

    expect(classifyEvidenceImage).not.toHaveBeenCalled();
    expect(uuidv4).not.toHaveBeenCalled();
    expect(getClient().rpc).not.toHaveBeenCalled();
    expect(uploadEvidenceObject).not.toHaveBeenCalled();
  });

  test('rejected classification returns transient result without UUID, reservation, or Storage', async () => {
    classifyEvidenceImage.mockResolvedValue(rejectedClassification);

    await expect(runPersistence()).resolves.toEqual({
      accepted: false,
      evidenceRole: 'primary',
      classification: rejectedClassification
    });

    expect(getJpegDimensions).toHaveBeenCalledTimes(1);
    expect(uuidv4).not.toHaveBeenCalled();
    expect(getClient().rpc).not.toHaveBeenCalled();
    expect(uploadEvidenceObject).not.toHaveBeenCalled();
    expect(deleteEvidenceObject).not.toHaveBeenCalled();
  });

  test('classifier failure does not reserve or upload', async () => {
    classifyEvidenceImage.mockRejectedValue(new Error('classifier private error'));

    await expectPersistenceCode(runPersistence(), 'CLASSIFIER_UNAVAILABLE');

    expect(getClient().rpc).not.toHaveBeenCalled();
    expect(uploadEvidenceObject).not.toHaveBeenCalled();
  });

  test('classifier recovery retries before creating exactly one reservation and finalization', async () => {
    const { rpc } = buildDatabaseMock();
    classifyEvidenceImage
      .mockRejectedValueOnce(new Error('classifier network unavailable'))
      .mockResolvedValueOnce(acceptedClassification);

    await expectPersistenceCode(runPersistence(), 'CLASSIFIER_UNAVAILABLE');
    expect(rpc).not.toHaveBeenCalled();
    expect(uploadEvidenceObject).not.toHaveBeenCalled();

    await expect(runPersistence()).resolves.toEqual(successResult);

    expect(classifyEvidenceImage).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'reserve_report_evidence',
      'finalize_report_evidence_upload'
    ]);
  });

  test('generates server evidence ID and reserves with trusted bucket/path before upload', async () => {
    const { rpc } = buildDatabaseMock();
    const result = await runPersistence();

    expect(uuidv4).toHaveBeenCalledTimes(1);
    expect(getEvidenceStorageBucket).toHaveBeenCalledTimes(1);
    expect(buildEvidenceObjectPath).toHaveBeenCalledWith(sessionId, evidenceId);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'reserve_report_evidence',
      'finalize_report_evidence_upload'
    ]);
    expect(rpc.mock.calls[0][1]).toEqual({
      p_session_id: sessionId,
      p_owner_user_id: ownerUserId,
      p_evidence_id: evidenceId,
      p_storage_bucket: 'private-evidence',
      p_storage_path: `evidence/${sessionId}/${evidenceId}.jpg`,
      p_mime_type: 'image/jpeg',
      p_byte_size: imageBuffer.length,
      p_evidence_role: 'primary'
    });
    expect(uploadEvidenceObject).toHaveBeenCalledWith({
      uploadSessionId: sessionId,
      evidenceId,
      imageBuffer,
      mimeType: 'image/jpeg'
    });
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(uploadEvidenceObject.mock.invocationCallOrder[0]);
    expect(uploadEvidenceObject.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[1]);
    expect(result).toEqual(successResult);
  });

  test('finalization sends the active capture RPC arguments exactly', async () => {
    const { rpc } = buildDatabaseMock();

    await runPersistence();

    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_capture_latitude: 10.5,
      p_capture_longitude: 124.9,
      p_capture_accuracy: 12,
      p_captured_at: '2026-10-02T00:00:00.000Z',
      p_evidence_role: 'primary'
    });
    expect(rpc.mock.calls[1][1]).not.toHaveProperty('p_capture_timestamp');
  });

  test('supplementary evidence persists with capture metadata without classification', async () => {
    const { rpc } = buildDatabaseMock();

    await expect(persistEvidenceImage({
      imageBuffer,
      sessionId,
      ownerUserId,
      captureLocation,
      evidenceRole: 'supplementary'
    })).resolves.toEqual({
      accepted: true,
      evidenceId,
      evidenceRole: 'supplementary'
    });

    expect(classifyEvidenceImage).not.toHaveBeenCalled();
    expect(uploadEvidenceObject).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1].p_evidence_role).toBe('supplementary');
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_classification_label: null,
      p_classification_confidence: null,
      p_classification_reason: null,
      p_classification_caption: null,
      p_capture_latitude: captureLocation.latitude,
      p_capture_longitude: captureLocation.longitude,
      p_captured_at: captureLocation.capturedAt,
      p_evidence_role: 'supplementary'
    });
  });

  test('reservation session-unavailable maps internally and never uploads', async () => {
    buildDatabaseMock({ reserve: reserveResult('SESSION_UNAVAILABLE') });

    await expectPersistenceCode(runPersistence(), 'SESSION_UNAVAILABLE');
    expect(uploadEvidenceObject).not.toHaveBeenCalled();
  });

  test('capacity reached maps internally and never uploads', async () => {
    buildDatabaseMock({ reserve: reserveResult('CAPACITY_REACHED') });

    await expectPersistenceCode(runPersistence(), 'CAPACITY_REACHED');
    expect(uploadEvidenceObject).not.toHaveBeenCalled();
  });

  test('reservation conflict maps internally and never uploads', async () => {
    buildDatabaseMock({ reserve: reserveResult('RESERVATION_CONFLICT') });

    await expectPersistenceCode(runPersistence(), 'RESERVATION_CONFLICT');
    expect(uploadEvidenceObject).not.toHaveBeenCalled();
  });

  test('reservation error attempts cancellation and returns generic persistence error', async () => {
    const { rpc } = buildDatabaseMock({ reserve: reserveResult(null, new Error('database detail')) });

    await expectPersistenceCode(runPersistence(), 'PERSISTENCE_UNAVAILABLE');

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'reserve_report_evidence',
      'cancel_report_evidence_reservation'
    ]);
    expect(uploadEvidenceObject).not.toHaveBeenCalled();
  });

  test('reservation cancellation failure remains generic and does not upload', async () => {
    buildDatabaseMock({
      reserve: reserveResult(null, new Error('private DB error')),
      cancel: { data: null, error: new Error('private cancellation error') }
    });

    await expectPersistenceCode(runPersistence(), 'PERSISTENCE_UNAVAILABLE');
    expect(uploadEvidenceObject).not.toHaveBeenCalled();
  });

  test('unknown reservation outcome best-effort cancels and fails closed', async () => {
    const { rpc } = buildDatabaseMock({ reserve: reserveResult('unexpected') });

    await expectPersistenceCode(runPersistence(), 'PERSISTENCE_UNAVAILABLE');
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'reserve_report_evidence',
      'cancel_report_evidence_reservation'
    ]);
    expect(uploadEvidenceObject).not.toHaveBeenCalled();
  });

  test('any Storage upload failure attempts delete then cancellation if delete resolves', async () => {
    const { rpc } = buildDatabaseMock();
    uploadEvidenceObject.mockRejectedValue(new Error('ambiguous storage failure'));
    let signalDeleteStarted;
    let resolveDelete;
    const deleteStarted = new Promise((resolve) => {
      signalDeleteStarted = resolve;
    });
    const deleteResolved = jest.fn();
    deleteEvidenceObject.mockImplementation(() => {
      signalDeleteStarted();
      return new Promise((resolve) => {
        resolveDelete = (result) => {
          deleteResolved();
          resolve(result);
        };
      });
    });

    const persistence = runPersistence();
    await deleteStarted;

    expect(uploadEvidenceObject).toHaveBeenCalledTimes(1);
    expect(deleteEvidenceObject).toHaveBeenCalledWith({ uploadSessionId: sessionId, evidenceId });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['reserve_report_evidence']);

    resolveDelete({ deleted: true });
    await expectPersistenceCode(persistence, 'PERSISTENCE_UNAVAILABLE');

    expect(deleteResolved).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'reserve_report_evidence',
      'cancel_report_evidence_reservation'
    ]);
    expect(deleteResolved.mock.invocationCallOrder[0])
      .toBeLessThan(rpc.mock.invocationCallOrder[1]);
  });

  test('Storage upload failure with failed delete preserves reservation', async () => {
    const { rpc } = buildDatabaseMock();
    uploadEvidenceObject.mockRejectedValue(new Error('ambiguous upload failure'));
    deleteEvidenceObject.mockRejectedValue(new Error('delete private error'));

    await expectPersistenceCode(runPersistence(), 'PERSISTENCE_UNAVAILABLE');

    expect(deleteEvidenceObject).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['reserve_report_evidence']);
  });

  test.each(['SESSION_UNAVAILABLE', 'FINALIZATION_INVALID'])('finalization result %s reconciles before compensation', async (finalizeOutcome) => {
    const { rpc, from, query } = buildDatabaseMock({
      finalize: finalizeResult(finalizeOutcome),
      reconciliation: reconciliationResult({ id: evidenceId, status: 'uploading', accepted_at: null })
    });
    const service = require('../services/evidencePersistenceService');
    const result = await service.persistEvidenceImage({ imageBuffer, sessionId, ownerUserId }).catch((error) => error);

    if (finalizeOutcome === 'SESSION_UNAVAILABLE') {
      expect(result).toMatchObject({ code: 'SESSION_UNAVAILABLE' });
      expect(from).not.toHaveBeenCalled();
      expect(deleteEvidenceObject).toHaveBeenCalledTimes(1);
      expect(rpc.mock.calls.map(([name]) => name)).toEqual([
        'reserve_report_evidence',
        'finalize_report_evidence_upload',
        'cancel_report_evidence_reservation'
      ]);
    } else {
      expect(result).toMatchObject({ code: 'PERSISTENCE_UNAVAILABLE' });
      expect(from).toHaveBeenCalledWith('report_evidence');
      expect(query.select).toHaveBeenCalledWith('id, status, accepted_at, evidence_role');
      expect(query.eq).toHaveBeenNthCalledWith(1, 'id', evidenceId);
      expect(query.eq).toHaveBeenNthCalledWith(2, 'upload_session_id', sessionId);
      expect(query.eq).toHaveBeenNthCalledWith(3, 'uploader_user_id', ownerUserId);
      expect(deleteEvidenceObject).toHaveBeenCalledTimes(1);
      expect(rpc.mock.calls.map(([name]) => name)).toEqual([
        'reserve_report_evidence',
        'finalize_report_evidence_upload',
        'cancel_report_evidence_reservation'
      ]);
      expect(from.mock.invocationCallOrder[0])
        .toBeLessThan(deleteEvidenceObject.mock.invocationCallOrder[0]);
    }
  });

  test.each([
    ['accepted', { id: evidenceId, status: 'accepted', accepted_at: '2026-09-26T00:00:00.000Z', evidence_role: 'primary' }, 'ROW_ACCEPTED'],
    ['accepted with role mismatch', { id: evidenceId, status: 'accepted', accepted_at: '2026-09-26T00:00:00.000Z', evidence_role: 'supplementary' }, 'ROW_OTHER'],
    ['accepted without timestamp', { id: evidenceId, status: 'accepted', accepted_at: null, evidence_role: 'primary' }, 'ROW_OTHER'],
    ['accepted with missing timestamp field', { id: evidenceId, status: 'accepted', evidence_role: 'primary' }, 'ROW_OTHER'],
    ['uploading', { id: evidenceId, status: 'uploading', accepted_at: null }, 'ROW_UPLOADING'],
    ['other status', { id: evidenceId, status: 'expired', accepted_at: '2026-09-26T00:00:00.000Z' }, 'ROW_OTHER'],
    ['missing', null, 'ROW_MISSING']
  ])('reconciles %s evidence state safely', async (_, row, outcome) => {
    const { rpc, from, query } = buildDatabaseMock({
      finalize: finalizeResult('FINALIZATION_INVALID'),
      reconciliation: reconciliationResult(row)
    });
    const result = await persistEvidenceImage({ imageBuffer, sessionId, ownerUserId }).catch((error) => error);

    expect(from).toHaveBeenCalledWith('report_evidence');
    expect(query.select).toHaveBeenCalledWith('id, status, accepted_at, evidence_role');
    expect(query.eq).toHaveBeenNthCalledWith(1, 'id', evidenceId);
    expect(query.eq).toHaveBeenNthCalledWith(2, 'upload_session_id', sessionId);
    expect(query.eq).toHaveBeenNthCalledWith(3, 'uploader_user_id', ownerUserId);

    if (outcome === 'ROW_ACCEPTED') {
      expect(result).toEqual(successResult);
      expect(deleteEvidenceObject).not.toHaveBeenCalled();
      expect(rpc).toHaveBeenCalledTimes(2);
    } else if (outcome === 'ROW_UPLOADING') {
      expect(result).toMatchObject({ code: 'PERSISTENCE_UNAVAILABLE' });
      expect(deleteEvidenceObject).toHaveBeenCalledTimes(1);
    } else {
      expect(result).toMatchObject({ code: 'PERSISTENCE_UNAVAILABLE' });
      expect(deleteEvidenceObject).not.toHaveBeenCalled();
      expect(rpc).toHaveBeenCalledTimes(2);
    }
  });

  test('reconciliation read failure preserves Storage and reservation', async () => {
    const { rpc } = buildDatabaseMock({
      finalize: finalizeResult(null, new Error('network error')),
      reconciliation: reconciliationResult(null, new Error('database detail'))
    });

    await expectPersistenceCode(runPersistence(), 'PERSISTENCE_UNAVAILABLE');
    expect(deleteEvidenceObject).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  test('ambiguous finalization error reconciles an accepted row as success', async () => {
    const { rpc, from } = buildDatabaseMock({
      finalize: finalizeResult(null, new Error('transport lost after commit')),
      reconciliation: reconciliationResult({
        id: evidenceId,
        status: 'accepted',
        accepted_at: '2026-09-26T00:00:00.000Z',
        evidence_role: 'primary'
      })
    });

    await expect(runPersistence()).resolves.toEqual(successResult);

    expect(from).toHaveBeenCalledWith('report_evidence');
    expect(deleteEvidenceObject).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  test('uploading reconciliation followed by failed deletion preserves reservation', async () => {
    const { rpc, from } = buildDatabaseMock({
      finalize: finalizeResult(null, new Error('transport lost')),
      reconciliation: reconciliationResult({ id: evidenceId, status: 'uploading', accepted_at: null })
    });
    deleteEvidenceObject.mockRejectedValue(new Error('remove failed'));

    await expectPersistenceCode(runPersistence(), 'PERSISTENCE_UNAVAILABLE');
    expect(from.mock.invocationCallOrder[0])
      .toBeLessThan(deleteEvidenceObject.mock.invocationCallOrder[0]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(deleteEvidenceObject).toHaveBeenCalledTimes(1);
  });

  test('explicit session unavailable compensates uploaded object before returning 404 error', async () => {
    const { rpc } = buildDatabaseMock({ finalize: finalizeResult('SESSION_UNAVAILABLE') });

    await expectPersistenceCode(runPersistence(), 'SESSION_UNAVAILABLE');

    expect(deleteEvidenceObject).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'reserve_report_evidence',
      'finalize_report_evidence_upload',
      'cancel_report_evidence_reservation'
    ]);
  });

  test('successful finalization returns only durable success metadata', async () => {
    const { from, rpc } = buildDatabaseMock();
    const result = await runPersistence();

    expect(result).toEqual(successResult);
    expect(from).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'reserve_report_evidence',
      'finalize_report_evidence_upload'
    ]);
    expect(deleteEvidenceObject).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('bucket');
    expect(result).not.toHaveProperty('path');
    expect(JSON.stringify(result)).not.toContain('private-evidence');
    expect(JSON.stringify(result)).not.toContain('evidence/');
  });

  test('never accepts client-controlled classification, identity, or storage arguments', async () => {
    const { rpc } = buildDatabaseMock();
    await persistEvidenceImage({
      imageBuffer,
      sessionId,
      ownerUserId,
      evidenceId: 'client-id',
      storagePath: 'client/path.jpg',
      classification: { label: 'road', accepted: false },
      width: 10,
      height: 20
    });

    expect(uuidv4).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1].p_evidence_id).toBe(evidenceId);
    expect(rpc.mock.calls[0][1].p_storage_path).toBe(`evidence/${sessionId}/${evidenceId}.jpg`);
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_width: 640,
      p_height: 480,
      p_classification_label: 'fire',
      p_classification_confidence: 0.1,
      p_classification_reason: 'Fire confirmed',
      p_classification_caption: 'Smoke visible'
    });
    expect(rpc.mock.calls[1][1]).not.toHaveProperty('p_storage_path');
    expect(rpc.mock.calls[1][1]).not.toHaveProperty('p_emergency_report_id');
  });
});
