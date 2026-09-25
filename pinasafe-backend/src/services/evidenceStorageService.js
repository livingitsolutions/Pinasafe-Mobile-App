const { validate: validateUUID } = require('uuid');
const { getClient, getEvidenceStorageBucket } = require('../config/database');
const safeLogger = require('../utils/safeLogger');

const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
const EVIDENCE_MIME_TYPE = 'image/jpeg';

const assertUUID = (value, fieldName) => {
  if (typeof value !== 'string' || !validateUUID(value)) {
    throw new Error(`${fieldName} must be a valid UUID`);
  }
};

const buildEvidenceObjectPath = (uploadSessionId, evidenceId) => {
  assertUUID(uploadSessionId, 'uploadSessionId');
  assertUUID(evidenceId, 'evidenceId');
  return `evidence/${uploadSessionId}/${evidenceId}.jpg`;
};

const validateImageBuffer = (imageBuffer, mimeType) => {
  if (!Buffer.isBuffer(imageBuffer)) {
    throw new Error('imageBuffer must be a Buffer');
  }

  if (imageBuffer.length === 0) {
    throw new Error('imageBuffer must not be empty');
  }

  if (imageBuffer.length > MAX_EVIDENCE_BYTES) {
    throw new Error('imageBuffer exceeds the maximum evidence size');
  }

  if (mimeType !== EVIDENCE_MIME_TYPE) {
    throw new Error('Evidence must use image/jpeg');
  }
};

const createStorageError = (operation) => {
  const error = new Error(`Evidence storage ${operation} failed`);
  error.code = `EVIDENCE_STORAGE_${operation.toUpperCase()}_FAILED`;
  return error;
};

const uploadEvidenceObject = async ({
  uploadSessionId,
  evidenceId,
  imageBuffer,
  mimeType
}) => {
  const path = buildEvidenceObjectPath(uploadSessionId, evidenceId);
  validateImageBuffer(imageBuffer, mimeType);
  const bucket = getEvidenceStorageBucket();

  try {
    const { error } = await getClient()
      .storage
      .from(bucket)
      .upload(path, imageBuffer, {
        contentType: EVIDENCE_MIME_TYPE,
        upsert: false
      });

    if (error) {
      throw error;
    }

    return {
      bucket,
      path,
      byteSize: imageBuffer.length,
      mimeType: EVIDENCE_MIME_TYPE
    };
  } catch (error) {
    safeLogger.error('evidence_storage.upload_failed');
    throw createStorageError('upload');
  }
};

const deleteEvidenceObject = async ({ uploadSessionId, evidenceId }) => {
  const path = buildEvidenceObjectPath(uploadSessionId, evidenceId);
  const bucket = getEvidenceStorageBucket();

  try {
    const { error } = await getClient()
      .storage
      .from(bucket)
      .remove([path]);

    if (error) {
      throw error;
    }

    return { bucket, path, deleted: true };
  } catch (error) {
    safeLogger.error('evidence_storage.delete_failed');
    throw createStorageError('delete');
  }
};

module.exports = {
  EVIDENCE_MIME_TYPE,
  MAX_EVIDENCE_BYTES,
  buildEvidenceObjectPath,
  uploadEvidenceObject,
  deleteEvidenceObject
};