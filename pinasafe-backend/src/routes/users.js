const express = require('express');
const { getClient } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validatePagination } = require('../middleware/validation');

const router = express.Router();

// Get current user profile
router.get('/profile', authenticateToken, (req, res) => {
  res.json({ data: req.user });
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    const userId = req.user.id;
    const supabase = getClient();

    const updates = {};
    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (address) updates.address = address;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.updated_at = new Date().toISOString();

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select('id, email, name, role, phone, address, verified, created_at')
      .single();

    if (error) {
      console.error('Update profile error:', error);
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    res.json({
      message: 'Profile updated successfully',
      data: updatedUser
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get all users (admin only)
router.get('/', authenticateToken, requireRole(['admin']), validatePagination, async (req, res) => {
  try {
    const { user } = req;
    const { page = 1, limit = 20, role, verified } = req.query;
    const offset = (page - 1) * limit;
    const supabase = getClient();

    if (!user.organization_id) {
      return res.status(400).json({ error: 'User not assigned to an organization' });
    }

    let query = supabase
      .from('users')
      .select('id, email, name, role, phone, address, verified, created_at, organization_id')
      .eq('organization_id', user.organization_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (role) {
      query = query.eq('role', role);
    }

    if (verified !== undefined) {
      query = query.eq('verified', verified === 'true');
    }

    const { data: users, error } = await query;

    if (error) {
      console.error('Get users error:', error);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    res.json({
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: users.length
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Update user role (admin only)
router.put('/:id/role', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const { user } = req;
    const supabase = getClient();

    if (!user.organization_id) {
      return res.status(400).json({ error: 'User not assigned to an organization' });
    }

    const validRoles = ['citizen', 'responder', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const { data: targetUser, error: targetUserError } = await supabase
      .from('users')
      .select('id, organization_id, role')
      .eq('id', id)
      .maybeSingle();

    if (targetUserError || !targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.organization_id !== user.organization_id) {
      return res.status(403).json({ error: 'Access denied for this organization' });
    }

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User role updated successfully' });

  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

module.exports = router;