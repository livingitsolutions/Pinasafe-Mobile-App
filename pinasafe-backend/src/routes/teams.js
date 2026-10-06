const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  validateUUID,
  validateTeamCreate,
  validateTeamUpdate,
  validateTeamMember
} = require('../middleware/validation');
const safeLogger = require('../utils/safeLogger');

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
      `);

    if (user.role === 'admin' || user.role === 'responder') {
      if (!user.organization_id) {
        return res.status(400).json({ error: 'User not assigned to an organization' });
      }
      query = query.eq('organization_id', user.organization_id);
    }
    if (user.role !== 'admin') {
      query = query.eq('is_active', true);
    }

    const { data: teams, error } = await query.order('created_at', { ascending: false });

    if (error) {
      safeLogger.error('teams.list_failed');
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
      if (membersError) {
        safeLogger.error('teams.members_list_failed');
        throw new Error('Failed to fetch team members');
      }

      let enrichedMembers = members || [];
      if (enrichedMembers.length > 0) {
        const memberUserIds = enrichedMembers.map(m => m.user_id).filter(Boolean);
        if (memberUserIds.length > 0) {
          const { data: personnelRecords, error: personnelError } = await supabase
            .from('personnel')
            .select('user_id, personnel_role, is_active')
            .in('user_id', memberUserIds);
          if (personnelError) {
            safeLogger.error('teams.member_personnel_list_failed');
            throw new Error('Failed to fetch team member eligibility');
          }

          const personnelByUserId = new Map(
            (personnelRecords || []).map(p => [p.user_id, p])
          );

          enrichedMembers = enrichedMembers.map(member => {
            const personnel = personnelByUserId.get(member.user_id);
            return {
              ...member,
              personnel_role: personnel?.personnel_role ?? null,
              is_active: personnel?.is_active ?? false,
            };
          });
        }
      }

      return {
        ...team,
        members: enrichedMembers
      };
    }));

    res.json({ data: teamsWithMembers });

  } catch (error) {
    safeLogger.error('teams.list_failed');
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

router.post('/', authenticateToken, requireRole(['admin']), validateTeamCreate, async (req, res) => {
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
        .eq('is_active', true)
        .maybeSingle();

      if (leaderError || !leaderPersonnel || leaderPersonnel.team_id) {
        return res.status(400).json({ error: 'Team leader must be a rescue member who is active and unassigned in your organization' });
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
      safeLogger.error('teams.create_failed');
      if (error.code === '23505') {
        return res.status(400).json({ error: 'A team with this name already exists in your organization' });
      }
      return res.status(500).json({ error: 'Failed to create team' });
    }

    let leaderMember;
    if (teamLeaderId) {
      const { data: createdMember, error: memberError } = await supabase
        .from('team_members')
        .insert({
          id: uuidv4(),
          team_id: teamId,
          user_id: teamLeaderId,
          position: 'Team Leader',
          assigned_by: user.id
        })
        .select(`
          *,
          user:users!team_members_user_id_fkey(id, name, email, phone),
          assigned_by_user:users!team_members_assigned_by_fkey(id, name)
        `)
        .single();

      if (memberError) {
        safeLogger.error('teams.leader_membership_create_failed');
        await supabase.from('rescue_teams').delete().eq('id', teamId).eq('organization_id', user.organization_id);
        return res.status(500).json({ error: 'Failed to add the team leader as a member' });
      }
      leaderMember = createdMember;

      const { data: assignedPersonnel, error: assignmentError } = await supabase
        .from('personnel')
        .update({
          team_id: teamId,
          team_position: 'Team Leader'
        })
        .eq('user_id', teamLeaderId)
        .eq('organization_id', user.organization_id)
        .is('team_id', null)
        .select('user_id')
        .maybeSingle();

      if (assignmentError || !assignedPersonnel) {
        safeLogger.error('teams.leader_assignment_failed');
        await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', teamLeaderId);
        await supabase.from('rescue_teams').delete().eq('id', teamId).eq('organization_id', user.organization_id);
        return res.status(409).json({ error: 'Team leader is already assigned to another team' });
      }
    }

    res.status(201).json({
      message: 'Team created successfully',
      data: { ...team, members: leaderMember ? [leaderMember] : [] }
    });

  } catch (error) {
    safeLogger.error('teams.create_failed');
    res.status(500).json({ error: 'Failed to create team' });
  }
});

router.put('/:id', authenticateToken, requireRole(['admin']), validateUUID('id'), validateTeamUpdate, async (req, res) => {
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
        .select('user_id, team_id')
        .eq('user_id', teamLeaderId)
        .eq('organization_id', user.organization_id)
        .eq('personnel_role', 'rescue_member')
        .eq('is_active', true)
        .maybeSingle();

      if (leaderError || !leaderPersonnel) {
        return res.status(400).json({ error: 'Team leader must be an active rescue member in your organization' });
      }
      if (leaderPersonnel.team_id && leaderPersonnel.team_id !== id) {
        return res.status(400).json({ error: 'Team leader is already assigned to another team' });
      }

      const { data: leaderMembership, error: membershipError } = await supabase
        .from('team_members')
        .select('id')
        .eq('team_id', id)
        .eq('user_id', teamLeaderId)
        .maybeSingle();
      if (membershipError || !leaderMembership) {
        return res.status(400).json({ error: 'Team leader must be a member of this team' });
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
      .eq('organization_id', user.organization_id)
      .select(`
        *,
        organization:organizations(id, name, type),
        team_leader:users!team_leader_id(id, name, email, phone),
        created_by_user:users!created_by(id, name)
      `)
      .single();

    if (error) {
      safeLogger.error('teams.update_failed');
      if (error.code === '23505') {
        return res.status(400).json({ error: 'A team with this name already exists in your organization' });
      }
      return res.status(500).json({ error: 'Failed to update team' });
    }

    if (teamLeaderId !== undefined && existingTeam.team_leader_id !== teamLeaderId) {
      if (existingTeam.team_leader_id) {
        const { error: previousMemberError } = await supabase
          .from('team_members')
          .update({ position: 'Member' })
          .eq('team_id', id)
          .eq('user_id', existingTeam.team_leader_id);
        const { error: previousPersonnelError } = await supabase
          .from('personnel')
          .update({ team_position: 'Member' })
          .eq('user_id', existingTeam.team_leader_id)
          .eq('organization_id', user.organization_id)
          .eq('team_id', id);

        if (previousMemberError || previousPersonnelError) {
          safeLogger.error('teams.previous_leader_demotion_failed');
          return res.status(500).json({ error: 'Failed to update the previous team leader assignment' });
        }
      }

      if (teamLeaderId) {
        const { error: memberUpdateError } = await supabase
          .from('team_members')
          .update({ position: 'Team Leader' })
          .eq('team_id', id)
          .eq('user_id', teamLeaderId);
        const { error: personnelUpdateError } = await supabase
          .from('personnel')
          .update({ team_id: id, team_position: 'Team Leader' })
          .eq('user_id', teamLeaderId)
          .eq('organization_id', user.organization_id)
          .or(`team_id.is.null,team_id.eq.${id}`);

        if (memberUpdateError || personnelUpdateError) {
          safeLogger.error('teams.leader_assignment_update_failed');
          return res.status(500).json({ error: 'Failed to update team leader assignment' });
        }
      }
    }

    res.json({
      message: 'Team updated successfully',
      data: team
    });

  } catch (error) {
    safeLogger.error('teams.update_failed');
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
      safeLogger.error('teams.delete_failed');
      return res.status(500).json({ error: 'Failed to delete team' });
    }

    res.json({ message: 'Team deleted successfully' });

  } catch (error) {
    safeLogger.error('teams.delete_failed');
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

router.post('/:id/members', authenticateToken, requireRole(['admin']), validateUUID('id'), validateTeamMember, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, position } = req.body;

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
    if (personnel.team_id && personnel.team_id !== id) {
      return res.status(400).json({ error: 'User is already assigned to another team' });
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
      safeLogger.error('teams.member_add_failed');
      if (error.code === '23505') {
        return res.status(400).json({ error: 'User is already a member of this team' });
      }
      if (error.code === '23503') {
        return res.status(400).json({ error: 'Invalid user ID or team ID' });
      }
      return res.status(500).json({
        error: 'Failed to add team member'
      });
    }

    // Claim the operational assignment only if it is still unassigned or already belongs to this team.
    let personnelUpdate = supabase
      .from('personnel')
      .update({
        team_id: id,
        team_position: teamPosition
      })
      .eq('user_id', userId)
      .eq('organization_id', user.organization_id);
    personnelUpdate = personnel.team_id === id
      ? personnelUpdate.eq('team_id', id)
      : personnelUpdate.is('team_id', null);
    const { data: assignedPersonnel, error: personnelUpdateError } = await personnelUpdate
      .select('user_id')
      .maybeSingle();

    if (personnelUpdateError || !assignedPersonnel) {
      safeLogger.error('teams.member_personnel_update_failed');
      await supabase.from('team_members').delete().eq('id', memberId).eq('team_id', id);
      return res.status(409).json({ error: 'User is already assigned to another team' });
    }

    res.status(201).json({
      message: 'Team member added successfully',
      data: member
    });

  } catch (error) {
    safeLogger.error('teams.member_add_failed');
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
    const { data: teamMember, error: memberFetchError } = await supabase
      .from('team_members')
      .select('user_id, position')
      .eq('id', memberId)
      .eq('team_id', id)
      .maybeSingle();

    if (memberFetchError) {
      safeLogger.error('teams.member_remove_lookup_failed');
      return res.status(500).json({ error: 'Failed to fetch team member' });
    }
    if (!teamMember) {
      return res.status(404).json({ error: 'Team member not found' });
    }
    if (team.team_leader_id === teamMember.user_id) {
      return res.status(400).json({ error: 'Change the team leader before removing this member.' });
    }

    const { error: personnelUpdateError } = await supabase
      .from('personnel')
      .update({ team_id: null, team_position: null })
      .eq('user_id', teamMember.user_id)
      .eq('organization_id', user.organization_id)
      .eq('team_id', id);

    if (personnelUpdateError) {
      safeLogger.error('teams.member_personnel_update_failed');
      return res.status(500).json({ error: 'Failed to clear team assignment' });
    }

    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('id', memberId)
      .eq('team_id', id);

    if (error) {
      safeLogger.error('teams.member_remove_failed');
      await supabase
        .from('personnel')
        .update({
          team_id: id,
          team_position: teamMember.position || 'Member'
        })
        .eq('user_id', teamMember.user_id)
        .eq('organization_id', user.organization_id)
        .is('team_id', null);
      return res.status(500).json({ error: 'Failed to remove team member' });
    }

    res.json({ message: 'Team member removed successfully' });

  } catch (error) {
    safeLogger.error('teams.member_remove_failed');
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
    if (membersError) {
      safeLogger.error('teams.members_list_failed');
      return res.status(500).json({ error: 'Failed to fetch team members' });
    }

    let enrichedMembers = members || [];
    if (enrichedMembers.length > 0) {
      const memberUserIds = enrichedMembers.map(m => m.user_id).filter(Boolean);
      if (memberUserIds.length > 0) {
        const { data: personnelRecords, error: personnelError } = await supabase
          .from('personnel')
          .select('user_id, personnel_role, is_active')
          .in('user_id', memberUserIds);
        if (personnelError) {
          safeLogger.error('teams.member_personnel_list_failed');
          return res.status(500).json({ error: 'Failed to fetch team member eligibility' });
        }

        const personnelByUserId = new Map(
          (personnelRecords || []).map(p => [p.user_id, p])
        );

        enrichedMembers = enrichedMembers.map(member => {
          const personnel = personnelByUserId.get(member.user_id);
          return {
            ...member,
            personnel_role: personnel?.personnel_role ?? null,
            is_active: personnel?.is_active ?? false,
          };
        });
      }
    }

    res.json({
      data: {
        ...team,
        members: enrichedMembers
      }
    });

  } catch (error) {
    safeLogger.error('teams.get_failed');
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

module.exports = router;
