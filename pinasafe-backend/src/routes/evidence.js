const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validateUUID } = require('../middleware/validation');
const { classifyEvidenceImage } = require('../services/aiClassificationService');
const { MAX_EVIDENCE_BYTES } = require('../services/evidenceStorageService');
const { getJpegDimensions } = require('../services/jpegDimensionsService');
const safeLogger = require('../utils/safeLogger');

const router = express.Router();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const JPEG_MIME_TYPE = 'image/jpeg';
const protectedSessionFields = new Set([
  'owner_user_id',
  'ownerUserId',
  'status',
  'expires_at',
  'expiresAt',
  'emergency_report_id',
  'emergencyReportId',
  'report_id',
  'reportId',
  'bound_at',
  'boundAt'
]);

const rejectProtectedSessionFields = (req, res, next) => {
  const body = req.body;
  if (
    body
    && typeof body === 'object'
    && Object.keys(body).some((field) => protectedSessionFields.has(field))
  ) {
    return res.status(400).json({ error: 'Protected session fields are not accepted' });
  }

  next();
};

const notFound = (res) => res.status(404).json({ error: 'Evidence upload session not found' });

const requireActiveOwnedSession = async (req, res, next) => {
  try {
    const { data: session, error } = await getClient()
      .from('evidence_upload_sessions')
      .select('id, status, expires_at')
      .eq('id', req.params.sessionId)
      .eq('owner_user_id', req.user.id)
      .maybeSingle();

    if (error) {
      safeLogger.error('evidence.image_session_lookup_failed');
      return res.status(500).json({ error: 'Unable to accept image upload' });
    }

    const expiresAt = Date.parse(session?.expires_at);
    if (
      !session
      || session.status !== 'active'
      || !Number.isFinite(expiresAt)
      || expiresAt <= Date.now()
    ) {
      return notFound(res);
    }

    return next();
  } catch (error) {
    safeLogger.error('evidence.image_session_lookup_failed');
    return res.status(500).json({ error: 'Unable to accept image upload' });
  }
};

const singleImageParser = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_EVIDENCE_BYTES + 1,
    files: 1,
    fields: 0,
    parts: 2
  },
  fileFilter: (req, file, callback) => {
    if (file.mimetype !== JPEG_MIME_TYPE) {
      const error = new Error('Unsupported image MIME type');
      error.code = 'UNSUPPORTED_IMAGE_MIME_TYPE';
      return callback(error);
    }

    return callback(null, true);
  }
}).single('image');

const parseMultipartImage = (req, res, next) => {
  if (!req.is('multipart/form-data')) {
    return res.status(400).json({ error: 'A multipart image upload is required' });
  }

  return singleImageParser(req, res, (error) => {
    if (error) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Image exceeds the 5 MiB limit' });
      }

      if (error instanceof multer.MulterError || error.code === 'UNSUPPORTED_IMAGE_MIME_TYPE') {
        return res.status(400).json({ error: 'Invalid multipart image upload' });
      }

      safeLogger.error('evidence.image_multipart_parse_failed');
      return res.status(400).json({ error: 'Invalid multipart image upload' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Exactly one image file is required' });
    }

    if (!Buffer.isBuffer(req.file.buffer) || req.file.buffer.length === 0) {
      return res.status(400).json({ error: 'Image file must not be empty' });
    }

    if (req.file.buffer.length > MAX_EVIDENCE_BYTES) {
      return res.status(413).json({ error: 'Image exceeds the 5 MiB limit' });
    }

    if (req.file.mimetype !== JPEG_MIME_TYPE) {
      return res.status(400).json({ error: 'Image must use image/jpeg' });
    }

    const imageBuffer = req.file.buffer;
    if (
      imageBuffer.length < 4
      || imageBuffer[0] !== 0xff
      || imageBuffer[1] !== 0xd8
      || imageBuffer[imageBuffer.length - 2] !== 0xff
      || imageBuffer[imageBuffer.length - 1] !== 0xd9
    ) {
      return res.status(400).json({ error: 'Image content is not a valid JPEG signature' });
    }

    try {
      getJpegDimensions(imageBuffer);
    } catch (error) {
      return res.status(400).json({ error: 'Image content is not a valid JPEG' });
    }

    return next();
  });
};

router.post('/sessions', authenticateToken, requireRole(['citizen']), rejectProtectedSessionFields, async (req, res) => {
  try {
    const id = uuidv4();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const { data: session, error } = await getClient()
      .from('evidence_upload_sessions')
      .insert({
        id,
        owner_user_id: req.user.id,
        status: 'active',
        expires_at: expiresAt
      })
      .select('id, status, expires_at')
      .single();

    if (error || !session) {
      safeLogger.error('evidence.session_create_failed');
      return res.status(500).json({ error: 'Failed to create evidence upload session' });
    }

    return res.status(201).json({
      data: {
        id: session.id,
        status: session.status,
        expiresAt: session.expires_at
      }
    });
  } catch (error) {
    safeLogger.error('evidence.session_create_failed');
    return res.status(500).json({ error: 'Failed to create evidence upload session' });
  }
});

router.get('/sessions/:sessionId', authenticateToken, requireRole(['citizen']), validateUUID('sessionId'), async (req, res) => {
  try {
    const { data: session, error } = await getClient()
      .from('evidence_upload_sessions')
      .select('id, status, expires_at')
      .eq('id', req.params.sessionId)
      .eq('owner_user_id', req.user.id)
      .maybeSingle();

    if (error) {
      safeLogger.error('evidence.session_get_failed');
      return res.status(500).json({ error: 'Failed to fetch evidence upload session' });
    }

    if (!session) {
      return notFound(res);
    }

    const expiresAt = Date.parse(session.expires_at);
    if (
      session.status === 'expired'
      || (session.status === 'active' && (!Number.isFinite(expiresAt) || expiresAt <= Date.now()))
    ) {
      return notFound(res);
    }

    return res.json({
      data: {
        id: session.id,
        status: session.status,
        expiresAt: session.expires_at
      }
    });
  } catch (error) {
    safeLogger.error('evidence.session_get_failed');
    return res.status(500).json({ error: 'Failed to fetch evidence upload session' });
  }
});

router.post(
  '/sessions/:sessionId/image',
  authenticateToken,
  requireRole(['citizen']),
  validateUUID('sessionId'),
  requireActiveOwnedSession,
  parseMultipartImage,
  async (req, res) => {
    try {
      const classification = await classifyEvidenceImage(req.file.buffer);
      return res.status(200).json({ data: classification });
    } catch (error) {
      if (!error?.code?.startsWith('AI_CLASSIFIER_')) {
        safeLogger.error('evidence.classification_failed');
      }
      return res.status(503).json({ error: 'Classification service unavailable' });
    }
  }
);

module.exports = router;