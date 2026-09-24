const express = require('express');
const { getClient } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validateUUID } = require('../middleware/validation');

const router = express.Router();

router.post('/start/:emergencyId', authenticateToken, requireRole(['responder']), validateUUID('emergencyId'), async (req, res) => {
  try {
    const { emergencyId } = req.params;
    const { latitude, longitude, accuracy } = req.body;
    const { user } = req;
    const supabase = getClient();

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const { data: report, error: reportError } = await supabase
      .from('emergency_reports')
      .select('id, assigned_team_id')
      .eq('id', emergencyId)
      .maybeSingle();

    if (reportError || !report || !report.assigned_team_id) {
      return res.status(404).json({ error: 'Emergency report not found or no team assigned' });
    }

    const { data: membership } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', report.assigned_team_id)
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: team } = await supabase
      .from('rescue_teams')
      .select('team_leader_id')
      .eq('id', report.assigned_team_id)
      .maybeSingle();

    const isAuthorized = membership || (team && team.team_leader_id === user.id);

    if (!isAuthorized) {
      return res.status(403).json({ error: 'You are not a member of the assigned team' });
    }

    const { data: existingTracking } = await supabase
      .from('team_location_tracking')
      .select('id')
      .eq('team_id', report.assigned_team_id)
      .eq('user_id', user.id)
      .eq('emergency_report_id', emergencyId)
      .eq('is_active', true)
      .maybeSingle();

    if (existingTracking) {
      const { data: updated } = await supabase
        .from('team_location_tracking')
        .update({
          latitude,
          longitude,
          accuracy: accuracy || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingTracking.id)
        .select()
        .single();

      return res.json({
        message: 'Location tracking updated',
        data: updated
      });
    }

    const { data: tracking, error } = await supabase
      .from('team_location_tracking')
      .insert({
        team_id: report.assigned_team_id,
        user_id: user.id,
        emergency_report_id: emergencyId,
        latitude,
        longitude,
        accuracy: accuracy || null,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error('Start tracking error:', error);
      return res.status(500).json({ error: 'Failed to start location tracking' });
    }

    res.status(201).json({
      message: 'Location tracking started',
      data: tracking
    });

  } catch (error) {
    console.error('Start tracking error:', error);
    res.status(500).json({ error: 'Failed to start location tracking' });
  }
});

router.put('/update/:emergencyId', authenticateToken, requireRole(['responder']), validateUUID('emergencyId'), async (req, res) => {
  try {
    const { emergencyId } = req.params;
    const { latitude, longitude, speed, heading, accuracy, eta_minutes } = req.body;
    const { user } = req;
    const supabase = getClient();

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const { data: tracking, error } = await supabase
      .from('team_location_tracking')
      .update({
        latitude,
        longitude,
        speed: speed || 0,
        heading: heading || null,
        accuracy: accuracy || null,
        eta_minutes: eta_minutes || null,
        updated_at: new Date().toISOString()
      })
      .eq('emergency_report_id', emergencyId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .select()
      .single();

    if (error || !tracking) {
      return res.status(404).json({ error: 'Active tracking session not found' });
    }

    res.json({
      message: 'Location updated',
      data: tracking
    });

  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

router.post('/stop/:emergencyId', authenticateToken, requireRole(['responder']), validateUUID('emergencyId'), async (req, res) => {
  try {
    const { emergencyId } = req.params;
    const { user } = req;
    const supabase = getClient();

    const { data: tracking, error } = await supabase
      .from('team_location_tracking')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('emergency_report_id', emergencyId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .select()
      .single();

    if (error || !tracking) {
      return res.status(404).json({ error: 'Active tracking session not found' });
    }

    res.json({
      message: 'Location tracking stopped',
      data: tracking
    });

  } catch (error) {
    console.error('Stop tracking error:', error);
    res.status(500).json({ error: 'Failed to stop location tracking' });
  }
});

router.get('/emergency/:emergencyId', authenticateToken, validateUUID('emergencyId'), async (req, res) => {
  try {
    const { emergencyId } = req.params;
    const supabase = getClient();

    const { data: locations, error } = await supabase
      .from('team_location_tracking')
      .select('*')
      .eq('emergency_report_id', emergencyId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Get locations error:', error);
      return res.status(500).json({ error: 'Failed to fetch locations' });
    }

    res.json({ data: locations || [] });

  } catch (error) {
    console.error('Get locations error:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

router.get('/team/:teamId', authenticateToken, validateUUID('teamId'), async (req, res) => {
  try {
    const { teamId } = req.params;
    const supabase = getClient();

    const { data: locations, error } = await supabase
      .from('team_location_tracking')
      .select('*')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Get team locations error:', error);
      return res.status(500).json({ error: 'Failed to fetch team locations' });
    }

    res.json({ data: locations || [] });

  } catch (error) {
    console.error('Get team locations error:', error);
    res.status(500).json({ error: 'Failed to fetch team locations' });
  }
});

module.exports = router;
