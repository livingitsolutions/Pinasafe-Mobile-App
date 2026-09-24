const express = require('express');
const { getClient } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all active organizations
router.get('/', authenticateToken, async (req, res) => {
  try {
    const supabase = getClient();

    const { data: organizations, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Get organizations error:', error);
      return res.status(500).json({ error: 'Failed to fetch organizations' });
    }

    res.json({ data: organizations });

  } catch (error) {
    console.error('Get organizations error:', error);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

// Get organization readiness with team details
router.get('/readiness', authenticateToken, async (req, res) => {
  try {
    const { user } = req;
    const supabase = getClient();

    // Determine which organizations to fetch based on user role
    let orgQuery = supabase
      .from('organizations')
      .select('id, name, type, is_active')
      .eq('is_active', true);

    // If admin/responder, only their organization
    if (user.role === 'admin' || user.role === 'responder') {
      if (!user.organization_id) {
        return res.status(400).json({ error: 'User not assigned to an organization' });
      }
      orgQuery = orgQuery.eq('id', user.organization_id);
    }

    const { data: organizations, error: orgError } = await orgQuery.order('name');

    if (orgError) {
      console.error('Get organizations error:', orgError);
      return res.status(500).json({ error: 'Failed to fetch organizations' });
    }

    // For each organization, get personnel and teams
    const readinessData = await Promise.all(organizations.map(async (org) => {
      // Get personnel for this organization
      const { data: personnel } = await supabase
        .from('personnel')
        .select(`
          id,
          name,
          team_position,
          personnel_role,
          is_active,
          user_id,
          user:users(id, name, role)
        `)
        .eq('organization_id', org.id)
        .eq('is_active', true);

      // Get teams for this organization with member counts
      const { data: teams } = await supabase
        .from('rescue_teams')
        .select(`
          id,
          name,
          description,
          is_active,
          team_leader_id,
          team_leader:users!team_leader_id(id, name)
        `)
        .eq('organization_id', org.id)
        .eq('is_active', true);

      // For each team, get member details
      const teamsWithDetails = await Promise.all((teams || []).map(async (team) => {
        const { data: teamMembers } = await supabase
          .from('team_members')
          .select(`
            id,
            user_id,
            assigned_at,
            user:users(id, name, role)
          `)
          .eq('team_id', team.id);

        // Get personnel details for team members to check their roles
        const memberDetails = await Promise.all((teamMembers || []).map(async (tm) => {
          const { data: personnelInfo } = await supabase
            .from('personnel')
            .select('id, name, personnel_role, is_active')
            .eq('user_id', tm.user_id)
            .eq('organization_id', org.id)
            .maybeSingle();

          return {
            ...tm,
            personnel: personnelInfo,
            status: personnelInfo?.is_active ? 'available' : 'off_duty'
          };
        }));

        const activeMembers = memberDetails.filter(m => m.personnel?.is_active);
        const onDutyCount = activeMembers.length; // Could be enhanced with actual duty tracking
        const availableCount = activeMembers.length;

        return {
          id: team.id,
          name: team.name,
          description: team.description,
          team_leader: team.team_leader,
          total_members: memberDetails.length,
          active_members: activeMembers.length,
          on_duty: onDutyCount,
          available: availableCount,
          responding: 0, // Could be enhanced by checking active incidents
          readiness: activeMembers.length > 0
            ? Math.round((activeMembers.length / memberDetails.length) * 100)
            : 0,
          members: memberDetails
        };
      }));

      // Calculate organization-level stats
      const totalPersonnel = (personnel || []).length;
      const activePersonnel = (personnel || []).filter(p => p.is_active).length;
      const rescueMembers = (personnel || []).filter(p => p.personnel_role === 'rescue_member' && p.is_active).length;
      const staffMembers = (personnel || []).filter(p => p.personnel_role === 'staff' && p.is_active).length;

      // Organization readiness based on active personnel vs total
      const orgReadiness = totalPersonnel > 0
        ? Math.round((activePersonnel / totalPersonnel) * 100)
        : 0;

      return {
        id: org.id,
        name: org.name,
        type: org.type,
        readiness: orgReadiness,
        personnel: {
          total: totalPersonnel,
          active: activePersonnel,
          rescue_members: rescueMembers,
          staff: staffMembers,
          on_duty: activePersonnel, // Could be enhanced with actual duty tracking
          available: activePersonnel,
          responding: 0 // Could be enhanced by checking active incidents
        },
        teams: teamsWithDetails
      };
    }));

    res.json({ data: readinessData });

  } catch (error) {
    console.error('Get readiness error:', error);
    res.status(500).json({ error: 'Failed to fetch readiness data' });
  }
});

// // Get a specific organization by ID
// router.get('/:id', authenticateToken, async (req, res) => {
//   try {
//     const { id } = req.params;
//     const supabase = getClient();

//     const { data: organization, error } = await supabase
//       .from('organizations')
//       .select('*')
//       .eq('id', id)
//       .maybeSingle();

//     if (error) {
//       console.error('Get organization by ID error:', error);
//       return res.status(500).json({ error: 'Failed to fetch organization' });
//     }

//     if (!organization) {
//       return res.status(404).json({ error: 'Organization not found' });
//     }

//     res.json({ data: organization });

//   } catch (error) {
//     console.error('Get organization by ID error:', error);
//     res.status(500).json({ error: 'Failed to fetch organization' });
//   }
// });



// Get organization personnel
router.get('/:id/personnel', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getClient();

    const { data: personnel, error } = await supabase
      .from('personnel')
      .select('*')
      .eq('organization_id', id)
      .order('name');

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

  // Create personnel under an organization
  router.post('/:id/personnel', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, contact_number, email, is_active, team, address, barangay, city, province } = req.body;

      const supabase = getClient();

      // Check if email already exists
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("email", email.toLowerCase())
        .maybeSingle();

      if (existingUser) {
        return res.status(409).json({ error: "Email already registered" });
      }

      // Default password for personnel
      const rawPassword = "Password123";
      const hashedPassword = await bcrypt.hash(rawPassword, 12);
      const userId = uuidv4();

      // Create user account for personnel
      const { error: userInsertError } = await supabase
        .from("users")
        .insert({
          id: userId,
          email: email.toLowerCase(),
          password_hash: hashedPassword,
          name,
          role: "responder",
          phone: contact_number,
          address: address || null,
          barangay: barangay || null,
          city: city || null,
          province: province || null,
          verified: true,
          must_change_password: true,
        });

      if (userInsertError) {
        console.error("User insert error:", userInsertError);
        return res.status(500).json({ error: "Failed to create user account" });
      }

      // Insert into personnel table
      const { data, error: personnelError } = await supabase
        .from("personnel")
        .insert([
          {
            organization_id: id,
            name,
            contact_number,
            email,
            is_active: is_active ?? true,
            user_id: userId,
            personnel_role: 'rescue_member',
          }
        ])
        .select()
        .single();

      if (personnelError) {
        console.error("Insert personnel error:", personnelError);
        return res.status(500).json({ error: "Failed to create personnel record" });
      }

      res.status(201).json({
        message: "Personnel created successfully",
        personnel: data,
        login_credentials: {
          email,
          password: rawPassword
        }
      });

    } catch (error) {
      console.error("Create personnel error:", error);
      res.status(500).json({ error: "Server error creating personnel" });
    }
  });
  // router.post('/:id/personnel', authenticateToken, async (req, res) => {
  //   try {
  //     const { id } = req.params;
  //     const { name, position, contact_number, email, is_active, team } = req.body;
  //     const supabase = getClient();

  //     const { data, error } = await supabase
  //       .from('personnel')
  //       .insert([
  //         {
  //           organization_id: id,
  //           name,
  //           position: position || 'Member',
  //           contact_number: contact_number || '',
  //           email: email || null,
  //           is_active: typeof is_active === 'boolean' ? is_active : true,
  //           team: team || null,
  //         },
  //       ])
  //       .select()
  //       .single();

  //     if (error) {
  //       console.error('Insert personnel error:', error);
  //       return res.status(500).json({ error: 'Failed to create personnel' });
  //     }

  //     res.status(201).json({ data });
  //   } catch (error) {
  //     console.error('Create personnel error:', error);
  //     res.status(500).json({ error: 'Failed to create personnel' });
  //   }
  // });

  // Update a personnel record (team assignment, leader flag, etc.)
  router.put('/personnel/:personnelId', authenticateToken, async (req, res) => {
    try {
      const { personnelId } = req.params;
      const updates = req.body;
      const supabase = getClient();

      const { data, error } = await supabase
        .from('personnel')
        .update(updates)
        .eq('id', personnelId)
        .select()
        .single();

      if (error) {
        console.error('Update personnel error:', error);
        return res.status(500).json({ error: 'Failed to update personnel' });
      }

      res.json({ data });
    } catch (error) {
      console.error('Update personnel error:', error);
      res.status(500).json({ error: 'Failed to update personnel' });
    }
  });

  router.get("/organization/:id/alerts", authenticateToken, async (req, res) => {
  const supabase = getClient();
  const { id } = req.params;

  const { data, error } = await supabase
    .from("organization_alerts")
    .select("*")
    .eq("organization_id", id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: "Failed to fetch alerts" });

  res.json({ data });
});

module.exports = router;