const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validateAlert, validateUUID } = require('../middleware/validation');
const safeLogger = require('../utils/safeLogger');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const supabase = getClient();

    const { data: alerts, error } = await supabase
      .from('system_alerts')
      .select('*')
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
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

    const supabase = getClient();
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
      .select('id, created_by, is_active')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const isCreator = alert.created_by === user.id;
    const isAdmin = user.role === 'admin';

    if (!isCreator && !isAdmin) {
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
    const supabase = getClient();

    const { data: alert, error } = await supabase
      .from('system_alerts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ data: alert });

  } catch (error) {
    safeLogger.error('alerts.get_failed');
    res.status(500).json({ error: 'Failed to fetch alert' });
  }
});

module.exports = router;
