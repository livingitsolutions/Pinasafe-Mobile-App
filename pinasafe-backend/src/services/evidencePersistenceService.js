const { v4: uuidv4 } = require('uuid');
const { getClient, getEvidenceStorageBucket } = require('../config/database');
const { classifyEvidenceImage } = require('./aiClassificationService');
const {
  EVIDENCE_MIME_TYPE,
  buildEvidenceObjectPath,
  uploadEvidenceObject,
  deleteEvidenceObject
} = require('./evidenceStorageService');
const { getJpegDimensions } = require('./jpegDimensionsService');
const safeLogger = require('../utils/safeLogger');

class EvidencePersistenceError extends Error {
  constructor(code) {
    super('Evidence persistence unavailable');
    this.name = 'EvidencePersistenceError';
    this.code = code;
  }
}

const persistenceError = (code) => new EvidencePersistenceError(code);

const bestEffortCancelReservation = async ({ sessionId, ownerUserId, evidenceId }) => {
  try {
    const { data, error } = await getClient().rpc('cancel_report_evidence_reservation', {
      p_session_id: sessionId,
      p_owner_user_id: ownerUserId,
      p_evidence_id: evidenceId
    });

    if (error || data !== 'CANCELLED') {
      safeLogger.error('evidence_cancellation_failed');
      return false;
    }

    return true;
  } catch (error) {
    safeLogger.error('evidence_cancellation_failed');
    return false;
  }
};

const compensateStorageAndReservation = async ({ sessionId, ownerUserId, evidenceId }) => {
  try {
    await deleteEvidenceObject({ uploadSessionId: sessionId, evidenceId });
  } catch (error) {
    safeLogger.error('evidence_storage_compensation_failed');
    return false;
  }

  return bestEffortCancelReservation({ sessionId, ownerUserId, evidenceId });
};

const reconcileEvidenceRow = async ({ sessionId, ownerUserId, evidenceId }) => {
  try {
    const { data, error } = await getClient()
      .from('report_evidence')
      .select('id, status, accepted_at')
      .eq('id', evidenceId)
      .eq('upload_session_id', sessionId)
      .eq('uploader_user_id', ownerUserId)
      .maybeSingle();

    if (error) {
      safeLogger.error('evidence_reconciliation_failed');
      return { outcome: 'READ_FAILED' };
    }

    if (!data) return { outcome: 'ROW_MISSING' };
    if (
      data.status === 'accepted'
      && data.accepted_at !== null
      && data.accepted_at !== undefined
    ) {
      return { outcome: 'ROW_ACCEPTED' };
    }
    if (data.status === 'uploading' && data.accepted_at === null) {
      return { outcome: 'ROW_UPLOADING' };
    }

    return { outcome: 'ROW_OTHER' };
  } catch (error) {
    safeLogger.error('evidence_reconciliation_failed');
    return { outcome: 'READ_FAILED' };
  }
};

const classificationProjection = (classification) => ({
  label: classification.label,
  confidence: classification.confidence,
  status: classification.status,
  action: classification.action,
  reason: classification.reason,
  caption: classification.caption
});

const acceptedResult = (evidenceId, classification) => ({
  accepted: true,
  evidenceId,
  classification: classificationProjection(classification)
});

const handleFinalizationFailure = async ({
  result,
  sessionId,
  ownerUserId,
  evidenceId,
  classification
}) => {
  if (result === 'SESSION_UNAVAILABLE') {
    const compensated = await compensateStorageAndReservation({ sessionId, ownerUserId, evidenceId });
    if (!compensated) throw persistenceError('PERSISTENCE_UNAVAILABLE');
    throw persistenceError('SESSION_UNAVAILABLE');
  }

  const reconciliation = await reconcileEvidenceRow({ sessionId, ownerUserId, evidenceId });
  if (reconciliation.outcome === 'ROW_ACCEPTED') {
    return acceptedResult(evidenceId, classification);
  }

  if (reconciliation.outcome === 'ROW_UPLOADING') {
    await compensateStorageAndReservation({ sessionId, ownerUserId, evidenceId });
  }

  throw persistenceError('PERSISTENCE_UNAVAILABLE');
};

const persistEvidenceImage = async ({ imageBuffer, sessionId, ownerUserId, captureLocation = null }) => {
  let dimensions;
  try {
    dimensions = getJpegDimensions(imageBuffer);
  } catch (error) {
    throw persistenceError('INVALID_JPEG');
  }

  let classification;
  try {
    classification = await classifyEvidenceImage(imageBuffer);
  } catch (error) {
    throw persistenceError('CLASSIFIER_UNAVAILABLE');
  }

  if (!classification.accepted) {
    return { accepted: false, classification };
  }

  const evidenceId = uuidv4();
  const storageBucket = getEvidenceStorageBucket();
  const storagePath = buildEvidenceObjectPath(sessionId, evidenceId);
  const client = getClient();

  let reservationResult;
  try {
    const { data, error } = await client.rpc('reserve_report_evidence', {
      p_session_id: sessionId,
      p_owner_user_id: ownerUserId,
      p_evidence_id: evidenceId,
      p_storage_bucket: storageBucket,
      p_storage_path: storagePath,
      p_mime_type: EVIDENCE_MIME_TYPE,
      p_byte_size: imageBuffer.length
    });

    if (error) throw error;
    reservationResult = data;
  } catch (error) {
    safeLogger.error('evidence_reservation_failed');
    await bestEffortCancelReservation({ sessionId, ownerUserId, evidenceId });
    throw persistenceError('PERSISTENCE_UNAVAILABLE');
  }

  if (reservationResult === 'SESSION_UNAVAILABLE') {
    throw persistenceError('SESSION_UNAVAILABLE');
  }
  if (reservationResult === 'CAPACITY_REACHED') {
    throw persistenceError('CAPACITY_REACHED');
  }
  if (reservationResult === 'RESERVATION_CONFLICT') {
    throw persistenceError('RESERVATION_CONFLICT');
  }
  if (reservationResult !== 'RESERVED') {
    safeLogger.error('evidence_reservation_failed');
    await bestEffortCancelReservation({ sessionId, ownerUserId, evidenceId });
    throw persistenceError('PERSISTENCE_UNAVAILABLE');
  }

  try {
    await uploadEvidenceObject({
      uploadSessionId: sessionId,
      evidenceId,
      imageBuffer,
      mimeType: EVIDENCE_MIME_TYPE
    });
  } catch (error) {
    safeLogger.error('evidence_storage_upload_failed');
    await compensateStorageAndReservation({ sessionId, ownerUserId, evidenceId });
    throw persistenceError('PERSISTENCE_UNAVAILABLE');
  }

  let finalizationResult;
  try {
    const { data, error } = await client.rpc('finalize_report_evidence_upload', {
      p_session_id: sessionId,
      p_owner_user_id: ownerUserId,
      p_evidence_id: evidenceId,
      p_width: dimensions.width,
      p_height: dimensions.height,
      p_classification_label: classification.label,
      p_classification_confidence: classification.confidence,
      p_classification_reason: classification.reason,
      p_classification_caption: classification.caption,
      p_capture_latitude: captureLocation ? captureLocation.latitude : null,
      p_capture_longitude: captureLocation ? captureLocation.longitude : null,
      p_capture_accuracy: captureLocation ? captureLocation.accuracy : null,
      p_captured_at: captureLocation ? captureLocation.capturedAt : null
    });

    if (error) throw error;
    finalizationResult = data;
  } catch (error) {
    safeLogger.error('evidence_finalization_failed');
    return handleFinalizationFailure({
      result: null,
      sessionId,
      ownerUserId,
      evidenceId,
      classification
    });
  }

  if (finalizationResult === 'FINALIZED') {
    return acceptedResult(evidenceId, classification);
  }

  if (finalizationResult === 'SESSION_UNAVAILABLE') {
    return handleFinalizationFailure({
      result: finalizationResult,
      sessionId,
      ownerUserId,
      evidenceId,
      classification
    });
  }

  if (finalizationResult === 'FINALIZATION_INVALID') {
    safeLogger.error('evidence_finalization_failed');
    return handleFinalizationFailure({
      result: finalizationResult,
      sessionId,
      ownerUserId,
      evidenceId,
      classification
    });
  }

  safeLogger.error('evidence_finalization_failed');
  return handleFinalizationFailure({
    result: null,
    sessionId,
    ownerUserId,
    evidenceId,
    classification
  });
};

module.exports = {
  EvidencePersistenceError,
  persistEvidenceImage
};
