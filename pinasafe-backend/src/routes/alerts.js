const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validateAlert, validateUUID } = require('../middleware/validation');
const safeLogger = require('../utils/safeLogger');

const router = express.Router();

const AUTHORIZED_ALERT_TYPES = ['fire', 'safety'];

function deriveAuthorizedAlertType(orgType) {
  if (orgType === 'fire') return 'fire';
  if (orgType === 'rescue') return 'safety';
  return null;
}

async function resolveAuthorizedAlertType(supabase, user) {
  if (!user.organization_id) {
    return { error: { status: 400, message: 'User not assigned to an organization' } };
  }

  const { data: orgData, error: orgError } = await supabase
    .from('organizations')
    .select('type')
    .eq('id', user.organization_id)
    .maybeSingle();

  if (orgError || !orgData) {
    return { error: { status: 500, message: 'Failed to fetch organization details' } };
  }

  const authorizedType = deriveAuthorizedAlertType(orgData.type);
  if (!authorizedType) {
    return { error: { status: 403, message: 'Insufficient permissions' } };
  }

  return { authorizedType };
}

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { user } = req;
    const supabase = getClient();

    let query = supabase
      .from('system_alerts')
      .select('*')
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

    if (user.role === 'responder' || user.role === 'admin') {
      const { authorizedType, error } = await resolveAuthorizedAlertType(supabase, user);
      if (error) {
        return res.status(error.status).json({ error: error.message });
      }
      query = query.eq('type', authorizedType);
    }

    const { data: alerts, error } = await query
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      safeLogger.error('alerts.list_failed');
      return res.status(500).json({ error: 'Failed to fetch alerts' });
    }

    res.json({ data: alerts });

  } catch (error) {
    safeLogger.error('alerts.list_failed');
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

router.post('/', authenticateToken, requireRole(['responder', 'admin']), validateAlert, async (req, res) => {
  try {
    const {
      type,
      title,
      description,
      priority,
      location,
      affectedAreas,
      expiresAt
    } = req.body;

    if (!AUTHORIZED_ALERT_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Invalid alert type' });
    }

    const supabase = getClient();

    const { authorizedType, error: authError } = await resolveAuthorizedAlertType(supabase, req.user);
    if (authError) {
      return res.status(authError.status).json({ error: authError.message });
    }

    if (type !== authorizedType) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const alertId = uuidv4();

    const { data: alert, error } = await supabase
      .from('system_alerts')
      .insert({
        id: alertId,
        type,
        title,
        description,
        priority,
        location,
        affected_areas: affectedAreas || [],
        expires_at: expiresAt || null,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) {
      safeLogger.error('alerts.create_failed');
      return res.status(500).json({ error: 'Failed to create alert' });
    }

    res.status(201).json({
      message: 'Alert created successfully',
      data: alert
    });

  } catch (error) {
    safeLogger.error('alerts.create_failed');
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

router.put('/:id/dismiss', authenticateToken, requireRole(['responder', 'admin']), validateUUID('id'), async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req;
    const supabase = getClient();

    const { data: alert, error: fetchError } = await supabase
      .from('system_alerts')
      .select('id, type, is_active')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const { authorizedType, error: authError } = await resolveAuthorizedAlertType(supabase, user);
    if (authError) {
      return res.status(authError.status).json({ error: authError.message });
    }

    if (alert.type !== authorizedType) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { error: updateError } = await supabase
      .from('system_alerts')
      .update({ is_active: false })
      .eq('id', id);

    if (updateError) {
      safeLogger.error('alerts.dismiss_failed');
      return res.status(500).json({ error: 'Failed to dismiss alert' });
    }

    res.json({ message: 'Alert dismissed successfully' });

  } catch (error) {
    safeLogger.error('alerts.dismiss_failed');
    res.status(500).json({ error: 'Failed to dismiss alert' });
  }
});

router.get('/:id', authenticateToken, validateUUID('id'), async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req;
    const supabase = getClient();

    const { data: alert, error } = await supabase
      .from('system_alerts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    if (user.role === 'responder' || user.role === 'admin') {
      const { authorizedType, error: authError } = await resolveAuthorizedAlertType(supabase, user);
      if (authError) {
        return res.status(authError.status).json({ error: authError.message });
      }

      if (alert.type !== authorizedType) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    res.json({ data: alert });

  } catch (error) {
    safeLogger.error('alerts.get_failed');
    res.status(500).json({ error: 'Failed to fetch alert' });
  }
});

module.exports = router;
