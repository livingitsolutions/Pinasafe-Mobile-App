const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validateUUID } = require('../middleware/validation');

const router = express.Router();

router.get('/', authenticateToken, requireRole(['admin', 'responder', 'super_admin']), async (req, res) => {
  try {
    const { user } = req;
    const supabase = getClient();

    let query = supabase
      .from('rescue_teams')
      .select(`
        *,
        organization:organizations(id, name, type),
        team_leader:users!team_leader_id(id, name, email, phone),
        created_by_user:users!created_by(id, name)
      `)
      .eq('is_active', true);

    if (user.role === 'admin' || user.role === 'responder') {
      if (!user.organization_id) {
        return res.status(400).json({ error: 'User not assigned to an organization' });
      }
      query = query.eq('organization_id', user.organization_id);
    }

    const { data: teams, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Get teams error:', error);
      return res.status(500).json({ error: 'Failed to fetch teams' });
    }

    const teamsWithMembers = await Promise.all(teams.map(async (team) => {
      const { data: members, error: membersError } = await supabase
        .from('team_members')
        .select(`
          *,
          user:users!team_members_user_id_fkey(id, name, email, phone),
          assigned_by_user:users!team_members_assigned_by_fkey(id, name)
        `)
        .eq('team_id', team.id);

      return {
        ...team,
        members: members || []
      };
    }));

    res.json({ data: teamsWithMembers });

  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

router.post('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const {
      name,
      teamLeaderId,
      description
    } = req.body;

    const { user } = req;

    if (!user.organization_id) {
      return res.status(400).json({ error: 'User not assigned to an organization' });
    }

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Team name is required' });
    }

    const teamId = uuidv4();
    const supabase = getClient();

    if (teamLeaderId) {
      const { data: leaderPersonnel, error: leaderError } = await supabase
        .from('personnel')
        .select('*')
        .eq('user_id', teamLeaderId)
        .eq('organization_id', user.organization_id)
        .eq('personnel_role', 'rescue_member')
        .maybeSingle();

      if (leaderError || !leaderPersonnel) {
        return res.status(400).json({ error: 'Team leader must be a rescue member in your organization' });
      }
    }

    const { data: team, error } = await supabase
      .from('rescue_teams')
      .insert({
        id: teamId,
        organization_id: user.organization_id,
        name,
        team_leader_id: teamLeaderId || null,
        description: description || null,
        created_by: user.id
      })
      .select(`
        *,
        organization:organizations(id, name, type),
        team_leader:users!team_leader_id(id, name, email, phone),
        created_by_user:users!created_by(id, name)
      `)
      .single();

    if (error) {
      console.error('Create team error:', error);
      if (error.code === '23505') {
        return res.status(400).json({ error: 'A team with this name already exists in your organization' });
      }
      return res.status(500).json({ error: 'Failed to create team' });
    }

    // Update team leader's personnel record
    if (teamLeaderId) {
      await supabase
        .from('personnel')
        .update({
          team_id: teamId,
          team_position: 'Team Leader'
        })
        .eq('user_id', teamLeaderId)
        .eq('organization_id', user.organization_id);
    }

    res.status(201).json({
      message: 'Team created successfully',
      data: { ...team, members: [] }
    });

  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

router.put('/:id', authenticateToken, requireRole(['admin']), validateUUID('id'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      teamLeaderId,
      description,
      isActive
    } = req.body;

    const { user } = req;
    const supabase = getClient();

    if (!user.organization_id) {
      return res.status(400).json({ error: 'User not assigned to an organization' });
    }

    const { data: existingTeam, error: fetchError } = await supabase
      .from('rescue_teams')
      .select('*')
      .eq('id', id)
      .eq('organization_id', user.organization_id)
      .maybeSingle();

    if (fetchError || !existingTeam) {
      return res.status(404).json({ error: 'Team not found' });
    }

    if (teamLeaderId) {
      const { data: leaderPersonnel, error: leaderError } = await supabase
        .from('personnel')
        .select('*')
        .eq('user_id', teamLeaderId)
        .eq('organization_id', user.organization_id)
        .eq('personnel_role', 'rescue_member')
        .maybeSingle();

      if (leaderError || !leaderPersonnel) {
        return res.status(400).json({ error: 'Team leader must be a rescue member in your organization' });
      }
    }

    const updateData = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;
    if (teamLeaderId !== undefined) updateData.team_leader_id = teamLeaderId;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.is_active = isActive;

    const { data: team, error } = await supabase
      .from('rescue_teams')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        organization:organizations(id, name, type),
        team_leader:users!team_leader_id(id, name, email, phone),
        created_by_user:users!created_by(id, name)
      `)
      .single();

    if (error) {
      console.error('Update team error:', error);
      if (error.code === '23505') {
        return res.status(400).json({ error: 'A team with this name already exists in your organization' });
      }
      return res.status(500).json({ error: 'Failed to update team' });
    }

    // If team leader changed, update personnel records
    if (teamLeaderId !== undefined) {
      // Clear previous team leader's assignment if they exist and are different
      if (existingTeam.team_leader_id && existingTeam.team_leader_id !== teamLeaderId) {
        await supabase
          .from('personnel')
          .update({
            team_id: null,
            team_position: null
          })
          .eq('user_id', existingTeam.team_leader_id)
          .eq('organization_id', user.organization_id);
      }

      // Set new team leader's assignment
      if (teamLeaderId) {
        await supabase
          .from('personnel')
          .update({
            team_id: id,
            team_position: 'Team Leader'
          })
          .eq('user_id', teamLeaderId)
          .eq('organization_id', user.organization_id);
      }
    }

    res.json({
      message: 'Team updated successfully',
      data: team
    });

  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ error: 'Failed to update team' });
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

    const { data: team, error } = await supabase
      .from('rescue_teams')
      .select('*')
      .eq('id', id)
      .eq('organization_id', user.organization_id)
      .maybeSingle();

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Clear team assignments for all personnel in this team
    await supabase
      .from('personnel')
      .update({
        team_id: null,
        team_position: null
      })
      .eq('team_id', id)
      .eq('organization_id', user.organization_id);

    // Delete all team members
    await supabase
      .from('team_members')
      .delete()
      .eq('team_id', id);

    // Delete the team
    const { error: deleteError } = await supabase
      .from('rescue_teams')
      .delete()
      .eq('id', id)
      .eq('organization_id', user.organization_id);

    if (deleteError) {
      console.error('Delete team error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete team' });
    }

    res.json({ message: 'Team deleted successfully' });

  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

router.post('/:id/members', authenticateToken, requireRole(['admin']), validateUUID('id'), async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, position } = req.body;

    console.log('Add team member request:', { teamId: id, userId, position, adminId: req.user?.id });

    const { user } = req;
    const supabase = getClient();

    if (!user.organization_id) {
      return res.status(400).json({ error: 'User not assigned to an organization' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Validate userId is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    const { data: team, error: teamError } = await supabase
      .from('rescue_teams')
      .select('*')
      .eq('id', id)
      .eq('organization_id', user.organization_id)
      .eq('is_active', true)
      .maybeSingle();

    if (teamError || !team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const { data: personnel, error: personnelError } = await supabase
      .from('personnel')
      .select('*')
      .eq('user_id', userId)
      .eq('organization_id', user.organization_id)
      .eq('personnel_role', 'rescue_member')
      .eq('is_active', true)
      .maybeSingle();

    if (personnelError || !personnel) {
      return res.status(400).json({ error: 'User must be an active rescue member in your organization' });
    }

    const memberId = uuidv4();
    const teamPosition = position || 'Member';

    const { data: member, error } = await supabase
      .from('team_members')
      .insert({
        id: memberId,
        team_id: id,
        user_id: userId,
        position: teamPosition,
        assigned_by: user.id
      })
      .select(`
        *,
        user:users!team_members_user_id_fkey(id, name, email, phone),
        assigned_by_user:users!team_members_assigned_by_fkey(id, name)
      `)
      .single();

    if (error) {
      console.error('Add team member error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      if (error.code === '23505') {
        return res.status(400).json({ error: 'User is already a member of this team' });
      }
      if (error.code === '23503') {
        return res.status(400).json({ error: 'Invalid user ID or team ID' });
      }
      return res.status(500).json({
        error: 'Failed to add team member',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    // Update personnel table with team assignment
    const { error: personnelUpdateError } = await supabase
      .from('personnel')
      .update({
        team_id: id,
        team_position: teamPosition
      })
      .eq('user_id', userId)
      .eq('organization_id', user.organization_id);

    if (personnelUpdateError) {
      console.error('Failed to update personnel team assignment:', personnelUpdateError);
    }

    res.status(201).json({
      message: 'Team member added successfully',
      data: member
    });

  } catch (error) {
    console.error('Add team member error:', error);
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

router.delete('/:id/members/:memberId', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id, memberId } = req.params;
    const { user } = req;
    const supabase = getClient();

    if (!user.organization_id) {
      return res.status(400).json({ error: 'User not assigned to an organization' });
    }

    const { data: team, error: teamError } = await supabase
      .from('rescue_teams')
      .select('*')
      .eq('id', id)
      .eq('organization_id', user.organization_id)
      .maybeSingle();

    if (teamError || !team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Get the team member to find user_id before deleting
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('id', memberId)
      .eq('team_id', id)
      .maybeSingle();

    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('id', memberId)
      .eq('team_id', id);

    if (error) {
      console.error('Remove team member error:', error);
      return res.status(500).json({ error: 'Failed to remove team member' });
    }

    // Clear team assignment from personnel table
    if (teamMember?.user_id) {
      await supabase
        .from('personnel')
        .update({
          team_id: null,
          team_position: null
        })
        .eq('user_id', teamMember.user_id)
        .eq('organization_id', user.organization_id);
    }

    res.json({ message: 'Team member removed successfully' });

  } catch (error) {
    console.error('Remove team member error:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

router.get('/:id', authenticateToken, requireRole(['admin', 'responder', 'super_admin']), validateUUID('id'), async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req;
    const supabase = getClient();

    let query = supabase
      .from('rescue_teams')
      .select(`
        *,
        organization:organizations(id, name, type),
        team_leader:users!team_leader_id(id, name, email, phone),
        created_by_user:users!created_by(id, name)
      `)
      .eq('id', id);

    if (user.role === 'admin' || user.role === 'responder') {
      if (!user.organization_id) {
        return res.status(400).json({ error: 'User not assigned to an organization' });
      }
      query = query.eq('organization_id', user.organization_id);
    }

    const { data: team, error } = await query.maybeSingle();

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const { data: members, error: membersError } = await supabase
      .from('team_members')
      .select(`
        *,
        user:users!team_members_user_id_fkey(id, name, email, phone),
        assigned_by_user:users!team_members_assigned_by_fkey(id, name)
      `)
      .eq('team_id', team.id);

    res.json({
      data: {
        ...team,
        members: members || []
      }
    });

  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

module.exports = router;
