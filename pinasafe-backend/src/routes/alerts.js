const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validateAlert, validateUUID } = require('../middleware/validation');

const router = express.Router();

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
      if (!user.organization_id) {
        return res.status(400).json({ error: 'User not assigned to an organization' });
      }

      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('type')
        .eq('id', user.organization_id)
        .maybeSingle();

      if (orgError || !orgData) {
        return res.status(500).json({ error: 'Failed to fetch organization details' });
      }

      const alertType = orgData.type === 'fire' ? 'fire' : 'safety';
      query = query.eq('type', alertType);
    }

    const { data: alerts, error } = await query
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Get alerts error:', error);
      return res.status(500).json({ error: 'Failed to fetch alerts' });
    }

    res.json({ data: alerts });

  } catch (error) {
    console.error('Get alerts error:', error);
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

    const alertId = uuidv4();
    const supabase = getClient();

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
      console.error('Create alert error:', error);
      return res.status(500).json({ error: 'Failed to create alert' });
    }

    res.status(201).json({
      message: 'Alert created successfully',
      data: alert
    });

  } catch (error) {
    console.error('Create alert error:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

router.put('/:id/dismiss', authenticateToken, validateUUID('id'), async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getClient();

    const { data: alert, error } = await supabase
      .from('system_alerts')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ message: 'Alert dismissed successfully' });

  } catch (error) {
    console.error('Dismiss alert error:', error);
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
    console.error('Get alert error:', error);
    res.status(500).json({ error: 'Failed to fetch alert' });
  }
});

module.exports = router;
