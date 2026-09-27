jest.mock('uuid', () => ({
  v4: jest.fn(() => '123e4567-e89b-12d3-a456-426614174009'),
  validate: jest.fn((value) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value))
}));

jest.mock('../config/database', () => ({ getClient: jest.fn() }));

const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../config/database');
const {
  EmergencyReportBindingError,
  createEmergencyReportWithEvidence
} = require('../services/emergencyReportBindingService');

const reportId = '123e4567-e89b-12d3-a456-426614174009';
const sessionId = '123e4567-e89b-12d3-a456-426614174000';
const reporterId = '123e4567-e89b-12d3-a456-426614174001';

const reportInput = (overrides = {}) => ({
  type: 'fire',
  description: 'Smoke visible at the residence',
  location: 'Barangay Central, Leyte',
  coordinates: { latitude: 10.1, longitude: 124.8 },
  contactNumber: '+639171234567',
  priority: 'high',
  ...overrides
});

const setupRpc = ({ data = { outcome: 'CREATED', report_id: reportId }, error = null } = {}) => {
  const rpc = jest.fn().mockResolvedValue({ data, error });
  getClient.mockReturnValue({ rpc });
  return rpc;
};

describe('atomic emergency report binding service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates a no-session report through one RPC and mutates no evidence input', async () => {
    const rpc = setupRpc();

    await expect(createEmergencyReportWithEvidence(reportInput(), reporterId))
      .resolves.toEqual({ reportId, outcome: 'CREATED' });

    expect(uuidv4).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('create_emergency_report_with_evidence', expect.objectContaining({
      p_report_id: reportId,
      p_reporter_id: reporterId,
      p_upload_session_id: null,
      p_evidence_photos: [],
      p_ai_classification: null,
      p_use_ai_classification: false
    }));
  });

  test('passes a durable session and all report fields through the single RPC', async () => {
    const rpc = setupRpc();

    await createEmergencyReportWithEvidence(
      reportInput({ uploadSessionId: sessionId, reporterId: '123e4567-e89b-12d3-a456-426614174002' }),
      reporterId
    );

    expect(rpc).toHaveBeenCalledWith('create_emergency_report_with_evidence', expect.objectContaining({
      p_report_id: reportId,
      p_reporter_id: reporterId,
      p_upload_session_id: sessionId,
      p_latitude: 10.1,
      p_longitude: 124.8
    }));
  });

  test('returns only the report ID and outcome, never Storage metadata', async () => {
    setupRpc({
      data: {
        outcome: 'CREATED',
        report_id: reportId,
        storage_bucket: 'private-bucket',
        storage_path: 'private/path.jpg',
        private_url: 'https://private.invalid/object'
      }
    });

    const result = await createEmergencyReportWithEvidence(
      reportInput({ uploadSessionId: sessionId }),
      reporterId
    );

    expect(result).toEqual({ reportId, outcome: 'CREATED' });
    expect(result).not.toHaveProperty('storage_bucket');
    expect(result).not.toHaveProperty('storage_path');
    expect(result).not.toHaveProperty('private_url');
  });

  test('accepts an exact durable-session replay result for the same server report ID', async () => {
    const rpc = setupRpc({ data: { outcome: 'REPLAYED', report_id: reportId } });

    await expect(createEmergencyReportWithEvidence(
      reportInput({ uploadSessionId: sessionId }),
      reporterId,
      reportId
    )).resolves.toEqual({ reportId, outcome: 'REPLAYED' });

    expect(rpc.mock.calls[0][1].p_report_id).toBe(reportId);
    expect(uuidv4).not.toHaveBeenCalled();
  });

  test('maps RPC rejection codes without exposing database details', async () => {
    setupRpc({ error: { message: 'BINDING_CLASSIFICATION_MISMATCH; private SQL detail' } });

    await expect(createEmergencyReportWithEvidence(
      reportInput({ uploadSessionId: sessionId }),
      reporterId
    )).rejects.toMatchObject({
      name: 'EmergencyReportBindingError',
      code: 'REPORT_CREATE_FAILED',
      message: 'Emergency report creation failed'
    });
  });

  test('maps exact machine result codes while sanitizing the error message', async () => {
    setupRpc({ error: { message: 'BINDING_CLASSIFICATION_MISMATCH' } });

    await expect(createEmergencyReportWithEvidence(
      reportInput({ uploadSessionId: sessionId }),
      reporterId
    )).rejects.toMatchObject({
      code: 'CLASSIFICATION_MISMATCH',
      message: 'Emergency report creation failed'
    });
  });

  test('retains the generated report ID on failure for a bounded retry', async () => {
    setupRpc({ error: { message: 'network timeout with private detail' } });

    await expect(createEmergencyReportWithEvidence(
      reportInput({ uploadSessionId: sessionId }),
      reporterId
    )).rejects.toMatchObject({
      code: 'REPORT_CREATE_FAILED',
      reportId,
      message: 'Emergency report creation failed'
    });
  });

  test('rejects an unexpected RPC response without returning it', async () => {
    setupRpc({ data: { outcome: 'CREATED', report_id: sessionId, storage_path: 'private/path.jpg' } });

    await expect(createEmergencyReportWithEvidence(reportInput(), reporterId))
      .rejects.toBeInstanceOf(EmergencyReportBindingError);
  });

  test('normalizes text and falsey metadata like the existing report route', async () => {
    const rpc = setupRpc();

    await createEmergencyReportWithEvidence(reportInput({
      description: '  Smoke visible at the residence  ',
      location: '  Barangay Central, Leyte  ',
      contactNumber: '',
      evidencePhotos: '',
      aiClassification: 0,
      useAIClassification: 0
    }), reporterId);

    expect(rpc.mock.calls[0][1]).toEqual(expect.objectContaining({
      p_description: 'Smoke visible at the residence',
      p_location: 'Barangay Central, Leyte',
      p_contact_number: null,
      p_evidence_photos: [],
      p_ai_classification: null,
      p_use_ai_classification: false
    }));
  });

  test('uses the authenticated reporter argument instead of a report payload field', async () => {
    const rpc = setupRpc();
    const requestReporterId = '123e4567-e89b-12d3-a456-426614174002';

    await createEmergencyReportWithEvidence(
      reportInput({ reporterId: requestReporterId, uploadSessionId: sessionId }),
      reporterId
    );

    expect(rpc.mock.calls[0][1].p_reporter_id).toBe(reporterId);
  });

  test('rejects a missing authenticated reporter before invoking the RPC', async () => {
    const rpc = setupRpc();

    await expect(createEmergencyReportWithEvidence(reportInput(), null))
      .rejects.toMatchObject({ code: 'INVALID_REPORTER_ID' });
    expect(rpc).not.toHaveBeenCalled();
  });

  test('does not expose bound-row trigger errors through the service message', async () => {
    setupRpc({ error: { message: 'BOUND_EVIDENCE_IMMUTABLE' } });

    await expect(createEmergencyReportWithEvidence(
      reportInput({ uploadSessionId: sessionId }),
      reporterId
    )).rejects.toMatchObject({
      code: 'REPORT_CREATE_FAILED',
      message: 'Emergency report creation failed'
    });
  });
});