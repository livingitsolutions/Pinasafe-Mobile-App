const { getAIEndpointUrl } = require('../config/database');
const safeLogger = require('../utils/safeLogger');
const { EVIDENCE_MIME_TYPE, MAX_EVIDENCE_BYTES } = require('./evidenceStorageService');

const CLASSIFIER_TIMEOUT_MS = 30_000;
const MAX_CLASSIFIER_RESPONSE_BYTES = 64 * 1024;
const MAX_CLASSIFICATION_TEXT_LENGTH = 1000;

class ClassifierServiceError extends Error {
  constructor(code) {
    super('Classification service unavailable');
    this.name = 'ClassifierServiceError';
    this.code = code;
  }
}

const classifierError = (kind) => new ClassifierServiceError(`AI_CLASSIFIER_${kind.toUpperCase()}`);

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw classifierError('invalid_response');
  const normalized = value.replace(/\s+/g, ' ').trim().slice(0, MAX_CLASSIFICATION_TEXT_LENGTH);
  return normalized || null;
};

const normalizeLabel = (value) => {
  if (typeof value !== 'string') throw classifierError('invalid_response');

  const label = value.trim().toLowerCase();
  if (!label) throw classifierError('invalid_response');
  if (label === 'fire') return 'fire';
  if (['road', 'accident', 'collision', 'vehicle_accident', 'car_crash', 'road_accident'].includes(label)) {
    return 'road';
  }
  return 'other';
};

const normalizeStatus = (value) => {
  if (typeof value !== 'string') throw classifierError('invalid_response');
  const status = value.trim().toLowerCase();
  if (status !== 'valid' && status !== 'invalid') throw classifierError('invalid_response');
  return status;
};

const normalizeAction = (value) => {
  if (typeof value !== 'string') throw classifierError('invalid_response');
  const action = value.trim().toLowerCase();
  if (!['accept', 'reject', 'uncertain'].includes(action)) throw classifierError('invalid_response');
  return action;
};

const normalizeClassifierResponse = (response) => {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw classifierError('invalid_response');
  }

  let confidence = null;
  if (Object.prototype.hasOwnProperty.call(response, 'confidence')) {
    if (
      typeof response.confidence !== 'number'
      || !Number.isFinite(response.confidence)
      || response.confidence < 0
      || response.confidence > 1
    ) {
      throw classifierError('invalid_response');
    }
    confidence = response.confidence;
  }

  const label = normalizeLabel(response.label);
  const status = normalizeStatus(response.status);
  const action = normalizeAction(response.action);

  return {
    accepted: (label === 'fire' || label === 'road') && status === 'valid' && action === 'accept',
    label,
    confidence,
    status,
    action,
    reason: normalizeText(response.reason),
    caption: normalizeText(response.caption)
  };
};

const validateImageBuffer = (imageBuffer) => {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0 || imageBuffer.length > MAX_EVIDENCE_BYTES) {
    throw new TypeError('A bounded JPEG Buffer is required');
  }

  if (
    imageBuffer.length < 4
    || imageBuffer[0] !== 0xff
    || imageBuffer[1] !== 0xd8
    || imageBuffer[imageBuffer.length - 2] !== 0xff
    || imageBuffer[imageBuffer.length - 1] !== 0xd9
  ) {
    throw new TypeError('A validated JPEG Buffer is required');
  }
};

const readBoundedResponse = async (response) => {
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_CLASSIFIER_RESPONSE_BYTES) {
    throw classifierError('invalid_response');
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    throw classifierError('invalid_response');
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      totalBytes += chunk.length;
      if (totalBytes > MAX_CLASSIFIER_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw classifierError('invalid_response');
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes).toString('utf8');
};

const logClassifierFailure = (error) => {
  const operation = error.code === 'AI_CLASSIFIER_TIMEOUT'
    ? 'evidence.classification_timeout'
    : error.code === 'AI_CLASSIFIER_INVALID_RESPONSE'
    ? 'evidence.classification_invalid_response'
    : 'evidence.classification_failed';
  safeLogger.error(operation);
};

const classifyEvidenceImage = async (imageBuffer) => {
  validateImageBuffer(imageBuffer);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

  try {
    const formData = new FormData();
    formData.append('file', new Blob([imageBuffer], { type: EVIDENCE_MIME_TYPE }), 'evidence.jpg');

    const response = await fetch(getAIEndpointUrl(), {
      method: 'POST',
      body: formData,
      redirect: 'error',
      signal: controller.signal
    });

    if (!response.ok) throw classifierError('failed');

    let providerResult;
    try {
      providerResult = JSON.parse(await readBoundedResponse(response));
    } catch (error) {
      if (error instanceof ClassifierServiceError) throw error;
      throw classifierError('invalid_response');
    }

    return normalizeClassifierResponse(providerResult);
  } catch (error) {
    const normalizedError = error instanceof ClassifierServiceError
      ? error
      : controller.signal.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError'
      ? classifierError('timeout')
      : classifierError('failed');
    logClassifierFailure(normalizedError);
    throw normalizedError;
  } finally {
    clearTimeout(timeoutId);
  }
};

module.exports = {
  CLASSIFIER_TIMEOUT_MS,
  MAX_CLASSIFICATION_TEXT_LENGTH,
  MAX_CLASSIFIER_RESPONSE_BYTES,
  ClassifierServiceError,
  classifyEvidenceImage,
  normalizeClassifierResponse
};