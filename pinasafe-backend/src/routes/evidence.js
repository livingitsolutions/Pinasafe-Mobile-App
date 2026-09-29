const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { getClient, getEvidenceStorageBucket } = require('../config/database');
const { authenticateToken, requireRole, canAccessOrganization } = require('../middleware/auth');
const { validateUUID } = require('../middleware/validation');
const { persistEvidenceImage } = require('../services/evidencePersistenceService');
const { MAX_EVIDENCE_BYTES } = require('../services/evidenceStorageService');
const safeLogger = require('../utils/safeLogger');

const SIGNED_URL_EXPIRES_IN = 300;

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
      const result = await persistEvidenceImage({
        imageBuffer: req.file.buffer,
        sessionId: req.params.sessionId,
        ownerUserId: req.user.id
      });

      if (!result.accepted) {
        return res.status(200).json({ data: result.classification });
      }

      return res.status(201).json({ data: result });
    } catch (error) {
      if (error?.code === 'INVALID_JPEG') {
        return res.status(400).json({ error: 'Image content is not a valid JPEG' });
      }

      if (error?.code === 'SESSION_UNAVAILABLE') return notFound(res);
      if (error?.code === 'CAPACITY_REACHED') {
        return res.status(409).json({ error: 'Evidence session capacity reached' });
      }
      if (error?.code === 'RESERVATION_CONFLICT') {
        return res.status(409).json({ error: 'Evidence reservation conflict' });
      }
      if (error?.code === 'CLASSIFIER_UNAVAILABLE') {
        safeLogger.error('evidence.classification_failed');
        return res.status(503).json({ error: 'Classification service unavailable' });
      }

      safeLogger.error('evidence.persistence_failed');
      return res.status(503).json({ error: 'Evidence persistence unavailable' });
    }
  }
);

router.get(
  '/reports/:reportId',
  authenticateToken,
  validateUUID('reportId'),
  async (req, res) => {
    try {
      const { reportId } = req.params;
      const { user } = req;
      const supabase = getClient();

      const { data: report, error: reportError } = await supabase
        .from('emergency_reports')
        .select('id, reported_by, organization_id, assigned_team_id, status')
        .eq('id', reportId)
        .maybeSingle();

      if (reportError || !report) {
        return res.status(404).json({ error: 'Emergency report not found' });
      }

      let authorized = false;

      if (user.role === 'super_admin') {
        authorized = true;
      } else if (user.role === 'citizen') {
        authorized = report.reported_by === user.id;
      } else if (user.role === 'admin') {
        authorized = canAccessOrganization(user, report.organization_id);
      } else if (user.role === 'responder') {
        if (!canAccessOrganization(user, report.organization_id)) {
          authorized = false;
        } else if (!report.assigned_team_id) {
          authorized = false;
        } else {
          const { data: team } = await supabase
            .from('rescue_teams')
            .select('id, team_leader_id')
            .eq('id', report.assigned_team_id)
            .maybeSingle();

          if (!team) {
            authorized = false;
          } else if (team.team_leader_id === user.id) {
            authorized = true;
          } else {
            const { data: membership } = await supabase
              .from('team_members')
              .select('id')
              .eq('team_id', report.assigned_team_id)
              .eq('user_id', user.id)
              .maybeSingle();
            authorized = Boolean(membership);
          }
        }
      }

      if (!authorized) {
        return res.status(403).json({ error: 'You are not authorized to view this evidence' });
      }

      const { data: evidenceRows, error: evidenceError } = await supabase
        .from('report_evidence')
        .select('id, upload_session_id, storage_path, mime_type, byte_size, width, height, classification_label, classification_confidence, classification_caption, created_at')
        .eq('emergency_report_id', reportId)
        .eq('status', 'bound');

      if (evidenceError) {
        safeLogger.error('evidence.retrieval_query_failed');
        return res.status(500).json({ error: 'Failed to retrieve evidence' });
      }

      if (!evidenceRows || evidenceRows.length === 0) {
        return res.json({ data: [] });
      }

      const bucket = getEvidenceStorageBucket();
      const items = await Promise.all(
        evidenceRows.map(async (row) => {
          const { data: signedUrlData, error: signError } = await supabase
            .storage
            .from(bucket)
            .createSignedUrl(row.storage_path, SIGNED_URL_EXPIRES_IN);

          const signedUrl = signError ? null : signedUrlData?.signedUrl;

          return {
            id: row.id,
            url: signedUrl,
            mimeType: row.mime_type,
            byteSize: row.byte_size,
            width: row.width,
            height: row.height,
            classification: {
              label: row.classification_label,
              confidence: row.classification_confidence,
              caption: row.classification_caption
            },
            createdAt: row.created_at,
            expiresIn: SIGNED_URL_EXPIRES_IN
          };
        })
      );

      res.json({ data: items });
    } catch (error) {
      safeLogger.error('evidence.retrieval_failed');
      res.status(500).json({ error: 'Failed to retrieve evidence' });
    }
  }
);

module.exports = router;