const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validateUUID } = require('../middleware/validation');
const safeLogger = require('../utils/safeLogger');

const router = express.Router();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
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

module.exports = router;