const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { getClient } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validateUUID, validatePersonnelInvitation } = require('../middleware/validation');

const router = express.Router();

router.get('/', authenticateToken, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { user } = req;
    const supabase = getClient();

    let query = supabase
      .from('personnel')
      .select(`
        *,
        user:users(id, name, email, phone, role),
        organization:organizations(id, name, type)
      `)
      .eq('is_active', true);

    if (user.role === 'admin') {
      if (!user.organization_id) {
        return res.status(400).json({ error: 'User not assigned to an organization' });
      }
      query = query.eq('organization_id', user.organization_id);
    }

    const { data: personnel, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Get personnel error:', error);
      return res.status(500).json({ error: 'Failed to fetch personnel' });
    }

    res.json({ data: personnel });

  } catch (error) {
    console.error('Get personnel error:', error);
    res.status(500).json({ error: 'Failed to fetch personnel' });
  }
});

router.post(
  '/invitations',
  authenticateToken,
  requireRole(['admin']),
  validatePersonnelInvitation,
  async (req, res) => {
    try {
      const { user } = req;

      if (!user.organization_id) {
        return res.status(400).json({ error: 'User not assigned to an organization' });
      }

      const email = req.body.email.trim().toLowerCase();
      const name = req.body.name.trim();
      const contactNumber = req.body.contactNumber.trim();
      const personnelRole = req.body.personnelRole;
      const specializations = Array.isArray(req.body.specializations)
        ? req.body.specializations.map((item) => item.trim())
        : [];

      // Personnel invitations from this workflow always create responder accounts.
      const userRole = 'responder';
      const supabase = getClient();

      const { data: existingUsers, error: existingUserError } = await supabase
        .from('users')
        .select('id')
        .ilike('email', email)
        .limit(1);

      if (existingUserError) {
        return res.status(500).json({ error: 'Failed to verify invitation eligibility' });
      }

      if (existingUsers && existingUsers.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const rawToken = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const updatedAt = new Date().toISOString();

      // Reissuing replaces any still-pending invitation, including one that
      // has expired without having its status changed.
      const { error: revokeError } = await supabase
        .from('personnel_invites')
        .update({
          status: 'revoked',
          consumed_at: null,
          updated_at: updatedAt
        })
        .eq('organization_id', user.organization_id)
        .eq('email', email)
        .eq('status', 'pending');

      if (revokeError) {
        return res.status(500).json({ error: 'Failed to prepare personnel invitation' });
      }

      const { data: invitation, error: insertError } = await supabase
        .from('personnel_invites')
        .insert({
          organization_id: user.organization_id,
          email,
          user_role: userRole,
          personnel_role: personnelRole,
          name,
          contact_number: contactNumber,
          specializations,
          token_hash: tokenHash,
          status: 'pending',
          expires_at: expiresAt,
          invited_by: user.id
        })
        .select('id, email, name, personnel_role, user_role, expires_at')
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          return res.status(409).json({
            error: 'An active invitation already exists. Please retry.'
          });
        }

        return res.status(500).json({ error: 'Failed to create personnel invitation' });
      }

      return res.status(201).json({
        message: 'Personnel invitation created successfully',
        data: {
          id: invitation.id,
          email: invitation.email,
          name: invitation.name,
          personnelRole: invitation.personnel_role,
          userRole: invitation.user_role,
          expiresAt: invitation.expires_at,
          invitationToken: rawToken
        }
      });
    } catch (error) {
      return res.status(500).json({ error: 'Server error creating personnel invitation' });
    }
  }
);

router.post('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const {
      userId,
      name,
      contactNumber,
      email,
      specializations,
      personnelRole
    } = req.body;

    const { user } = req;

    if (!user.organization_id) {
      return res.status(400).json({ error: 'User not assigned to an organization' });
    }

    if (!userId) {
      return res.status(400).json({
        error: 'New personnel accounts must be created through the invitation workflow'
      });
    }

    if (!['staff', 'rescue_member'].includes(personnelRole)) {
      return res.status(400).json({
        error: 'Invalid personnel role. Must be staff or rescue_member'
      });
    }

    const supabase = getClient();

    const { data: existingUser, error: userError } = await supabase
      .from('users')
      .select('id, organization_id')
      .eq('id', userId)
      .maybeSingle();

    if (userError || !existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (
      existingUser.organization_id &&
      existingUser.organization_id !== user.organization_id
    ) {
      return res.status(400).json({
        error: 'User already assigned to another organization'
      });
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({
        organization_id: user.organization_id,
        role: 'responder'
      })
      .eq('id', userId);

    if (updateError) {
      return res.status(500).json({
        error: 'Failed to assign user to organization'
      });
    }

    const insertData = {
      id: uuidv4(),
      organization_id: user.organization_id,
      user_id: userId,
      name,
      contact_number: contactNumber,
      personnel_role: personnelRole
    };

    if (email) {
      insertData.email = email;
    }

    if (specializations && specializations.length > 0) {
      insertData.specializations = specializations;
    }

    const { data: personnel, error } = await supabase
      .from('personnel')
      .insert(insertData)
      .select(`
        *,
        user:users(id, name, email, phone, role),
        organization:organizations(id, name, type)
      `)
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to create personnel' });
    }

    return res.status(201).json({
      message: 'Personnel added successfully',
      data: personnel
    });
  } catch (error) {
    return res.status(500).json({ error: 'Server error creating personnel' });
  }
});

router.put('/:id', authenticateToken, requireRole(['admin']), validateUUID('id'), async (req, res) => {
  try {
    const { id } = req.params;

    const {
      contactNumber,
      contact_number,
      email,
      address,
      barangay,
      city,
      province,
      specializations,
      personnelRole,
      personnel_role,
      isActive,
      is_active,
      team,
      team_leader
    } = req.body;

    const { user } = req;
    const supabase = getClient();

    if (!user.organization_id) {
      return res.status(400).json({ error: 'User not assigned to an organization' });
    }

    const { data: existingPersonnel, error: existingFetchError } = await supabase
      .from('personnel')
      .select('*')
      .eq('id', id)
      .eq('organization_id', user.organization_id)
      .maybeSingle();

    if (existingFetchError || !existingPersonnel) {
      return res.status(404).json({ error: 'Personnel not found' });
    }

    const finalPersonnelRole = personnelRole || personnel_role;
    if (finalPersonnelRole && !['staff', 'rescue_member'].includes(finalPersonnelRole)) {
      return res.status(400).json({ error: 'Invalid personnel role. Must be staff or rescue_member' });
    }

    const updateData = {};
    const userUpdateData = {};

    if (contactNumber !== undefined) updateData.contact_number = contactNumber;
    if (contact_number !== undefined) updateData.contact_number = contact_number;
    if (email !== undefined) updateData.email = email;
    if (specializations !== undefined) updateData.specializations = specializations;
    if (finalPersonnelRole !== undefined) updateData.personnel_role = finalPersonnelRole;
    if (isActive !== undefined) updateData.is_active = isActive;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (team !== undefined) updateData.team = team;

    // Address fields update users table
    if (address !== undefined) userUpdateData.address = address;
    if (barangay !== undefined) userUpdateData.barangay = barangay;
    if (city !== undefined) userUpdateData.city = city;
    if (province !== undefined) userUpdateData.province = province;


    const { data: updatedPersonnel, error: updateError } = await supabase
      .from('personnel')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Update personnel error details:', {
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        code: updateError.code
      });
      return res.status(500).json({
        error: 'Failed to update personnel',
        details: updateError.message
      });
    }

    // Update user address if personnel has user_id and address fields provided
    if (existingPersonnel.user_id && Object.keys(userUpdateData).length > 0) {
      const { error: userUpdateError } = await supabase
        .from('users')
        .update(userUpdateData)
        .eq('id', existingPersonnel.user_id);

      if (userUpdateError) {
        console.error('Update user address error:', userUpdateError);
      }
    }

    const { data: personnel, error: fetchPersonnelError } = await supabase
      .from('personnel')
      .select(`
        *,
        user:users(id, name, email, phone, role),
        organization:organizations(id, name, type)
      `)
      .eq('id', id)
      .single();

    if (fetchPersonnelError) {
      return res.json({
        message: 'Personnel updated successfully',
        data: updatedPersonnel
      });
    }

    res.json({
      message: 'Personnel updated successfully',
      data: personnel
    });

  } catch (error) {
    console.error('Update personnel error:', error);
    res.status(500).json({
      error: 'Server error updating personnel',
      details: error.message
    });
  }
});

router.delete('/:id', authenticateToken, requireRole(['admin']), validateUUID('id'), async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req;
    const supabase = getClient();

    if (!user.organization_id) {
      return res.status(400).json({ error: 'User not assigned to an organization' });
    }

    const { data: personnel, error } = await supabase
      .from('personnel')
      .update({ is_active: false })
      .eq('id', id)
      .eq('organization_id', user.organization_id)
      .select()
      .maybeSingle();

    if (!personnel) {
      return res.status(404).json({ error: 'Personnel not found' });
    }

    res.json({ message: 'Personnel deactivated successfully' });

  } catch (error) {
    console.error('Delete personnel error:', error);
    res.status(500).json({ error: 'Failed to deactivate personnel' });
  }
});

router.get('/rescue-members', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { user } = req;
    const supabase = getClient();

    if (!user.organization_id) {
      return res.status(400).json({ error: 'User not assigned to an organization' });
    }

    const { data: rescueMembers, error } = await supabase
      .from('personnel')
      .select(`
        *,
        user:users(id, name, email, phone, role)
      `)
      .eq('organization_id', user.organization_id)
      .eq('personnel_role', 'rescue_member')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('Get rescue members error:', error);
      return res.status(500).json({ error: 'Failed to fetch rescue members' });
    }

    res.json({ data: rescueMembers });

  } catch (error) {
    console.error('Get rescue members error:', error);
    res.status(500).json({ error: 'Failed to fetch rescue members' });
  }
});

router.get('/by-user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { user } = req;
    const supabase = getClient();

    // First, get the personnel record
    const { data: personnel, error: personnelError } = await supabase
      .from('personnel')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (personnelError) {
      console.error('Get personnel by user ID error:', personnelError);
      return res.status(500).json({ error: 'Failed to fetch personnel' });
    }

    if (!personnel) {
      return res.status(404).json({ error: 'Personnel not found' });
    }

    // Then, get team membership if exists
    const { data: teamMembers, error: teamError } = await supabase
      .from('team_members')
      .select(`
        team_id,
        position,
        rescue_teams(id, name)
      `)
      .eq('user_id', userId);

    if (!teamError && teamMembers && teamMembers.length > 0) {
      personnel.team_id = teamMembers[0].team_id;
      personnel.position = teamMembers[0].position;
      personnel.team = teamMembers[0].rescue_teams;
    }

    res.json({ data: personnel });

  } catch (error) {
    console.error('Get personnel by user ID error:', error);
    res.status(500).json({ error: 'Failed to fetch personnel' });
  }
});

module.exports = router;
