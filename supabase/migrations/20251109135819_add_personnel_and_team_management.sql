/*
  # Add Personnel Management and Team Structure
  
  1. Purpose
    - Add super-admin role for system-wide access
    - Update personnel table to link with users and add role types
    - Create rescue teams with team leaders and members
    - Enable admins to manage personnel within their organization
    - Restrict team membership to rescue members only
  
  2. Schema Changes
    - Add super_admin role to users table
    - Add user_id to personnel table to link with users
    - Add personnel_role field (staff, rescue_member)
    - Create rescue_teams table
    - Create team_members table for team assignments
  
  3. New Tables
    - `rescue_teams`
      - `id` (uuid, primary key)
      - `organization_id` (uuid, references organizations)
      - `name` (text, unique per organization)
      - `team_leader_id` (uuid, references users)
      - `description` (text)
      - `is_active` (boolean)
      - `created_by` (uuid, references users)
      - `created_at` (timestamptz)
      
    - `team_members`
      - `id` (uuid, primary key)
      - `team_id` (uuid, references rescue_teams)
      - `user_id` (uuid, references users)
      - `assigned_at` (timestamptz)
      - `assigned_by` (uuid, references users)
  
  4. Role Types
    - Super Admin: Can see all emergency reports across all organizations
    - Admin: Can manage personnel and teams within their organization, see organization-specific reports
    - Responder: Can be assigned to teams (if rescue_member), see organization-specific reports
    - Citizen: Can only submit and view their own reports
  
  5. Personnel Roles
    - Staff: Administrative personnel, cannot be assigned to rescue teams
    - Rescue Member: Field personnel, eligible for team assignments
  
  6. Security
    - Enable RLS on all new tables
    - Super-admins can access all data
    - Admins can manage their organization's data
    - Personnel can view their own assignments
  
  7. Important Business Rules
    - Only admins can add personnel under their organization
    - Only admins can create teams and assign team members
    - Only rescue_members can be added to rescue teams
    - Fire incidents only show to BFP organization members
    - Road incidents only show to rescue organization members
    - Super-admins see all incidents regardless of type
*/

-- Update users table to include super_admin role
DO $$
BEGIN
  -- Drop existing constraint
  ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_role;
  
  -- Add new constraint with super_admin
  ALTER TABLE users ADD CONSTRAINT valid_role 
    CHECK (role IN ('citizen', 'responder', 'admin', 'super_admin'));
END $$;

-- Update personnel table
DO $$
BEGIN
  -- Add user_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'personnel' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE personnel ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_personnel_user_id ON personnel(user_id);
  END IF;
  
  -- Add personnel_role column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'personnel' AND column_name = 'personnel_role'
  ) THEN
    ALTER TABLE personnel ADD COLUMN personnel_role text NOT NULL DEFAULT 'staff';
    ALTER TABLE personnel ADD CONSTRAINT valid_personnel_role 
      CHECK (personnel_role IN ('staff', 'rescue_member'));
  END IF;
END $$;

-- Create rescue_teams table
CREATE TABLE IF NOT EXISTS rescue_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  team_leader_id uuid REFERENCES users(id) ON DELETE SET NULL,
  description text,
  is_active boolean DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_team_name_per_org UNIQUE(organization_id, name)
);

-- Create team_members table
CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES rescue_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT unique_user_per_team UNIQUE(team_id, user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_rescue_teams_organization_id ON rescue_teams(organization_id);
CREATE INDEX IF NOT EXISTS idx_rescue_teams_team_leader_id ON rescue_teams(team_leader_id);
CREATE INDEX IF NOT EXISTS idx_rescue_teams_is_active ON rescue_teams(is_active);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);

-- Enable Row Level Security
ALTER TABLE rescue_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Update RLS Policies for personnel table to use organization-based access
DROP POLICY IF EXISTS "All authenticated users can read personnel" ON personnel;
DROP POLICY IF EXISTS "Only admins can manage personnel" ON personnel;

CREATE POLICY "Super-admins can read all personnel"
  ON personnel FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'super_admin'
    )
  );

CREATE POLICY "Admins can read their organization personnel"
  ON personnel FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
      AND users.organization_id = personnel.organization_id
    )
  );

CREATE POLICY "Personnel can read own record"
  ON personnel FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can add personnel to their organization"
  ON personnel FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.organization_id = personnel.organization_id
    )
  );

CREATE POLICY "Admins can update their organization personnel"
  ON personnel FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.organization_id = personnel.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.organization_id = personnel.organization_id
    )
  );

CREATE POLICY "Super-admins can manage all personnel"
  ON personnel FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'super_admin'
    )
  );

-- RLS Policies for rescue_teams
CREATE POLICY "Super-admins can read all teams"
  ON rescue_teams FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'super_admin'
    )
  );

CREATE POLICY "Organization members can read their teams"
  ON rescue_teams FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.organization_id = rescue_teams.organization_id
    )
  );

CREATE POLICY "Admins can create teams in their organization"
  ON rescue_teams FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.organization_id = rescue_teams.organization_id
    )
  );

CREATE POLICY "Admins can update their organization teams"
  ON rescue_teams FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.organization_id = rescue_teams.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.organization_id = rescue_teams.organization_id
    )
  );

CREATE POLICY "Admins can delete their organization teams"
  ON rescue_teams FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.organization_id = rescue_teams.organization_id
    )
  );

-- RLS Policies for team_members
CREATE POLICY "Team members can read their assignments"
  ON team_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users u
      JOIN rescue_teams rt ON u.organization_id = rt.organization_id
      WHERE u.id = auth.uid() AND rt.id = team_members.team_id
    )
  );

CREATE POLICY "Admins can manage team members in their organization"
  ON team_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      JOIN rescue_teams rt ON u.organization_id = rt.organization_id
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
      AND rt.id = team_members.team_id
    )
  );

CREATE POLICY "Admins can remove team members from their organization"
  ON team_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN rescue_teams rt ON u.organization_id = rt.organization_id
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
      AND rt.id = team_members.team_id
    )
  );

-- Update emergency_reports RLS policies for organization-based filtering
DROP POLICY IF EXISTS "Users can read own reports" ON emergency_reports;

CREATE POLICY "Citizens can read own reports"
  ON emergency_reports FOR SELECT
  TO authenticated
  USING (
    reported_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'citizen'
    )
  );

CREATE POLICY "Super-admins can read all reports"
  ON emergency_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'super_admin'
    )
  );

CREATE POLICY "Organization members can read relevant reports"
  ON emergency_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN organizations o ON u.organization_id = o.id
      WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'responder')
      AND (
        (emergency_reports.type = 'fire' AND o.type = 'fire') OR
        (emergency_reports.type = 'road' AND o.type = 'rescue')
      )
    )
  );

-- Function to validate team member is a rescue_member
CREATE OR REPLACE FUNCTION validate_team_member_role()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM personnel
    WHERE user_id = NEW.user_id
    AND personnel_role = 'rescue_member'
  ) THEN
    RAISE EXCEPTION 'Only rescue members can be added to teams';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate team member role
DROP TRIGGER IF EXISTS trigger_validate_team_member_role ON team_members;
CREATE TRIGGER trigger_validate_team_member_role
  BEFORE INSERT ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION validate_team_member_role();

-- Function to validate team leader is a rescue_member
CREATE OR REPLACE FUNCTION validate_team_leader_role()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.team_leader_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM personnel
    WHERE user_id = NEW.team_leader_id
    AND personnel_role = 'rescue_member'
  ) THEN
    RAISE EXCEPTION 'Only rescue members can be team leaders';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate team leader role
DROP TRIGGER IF EXISTS trigger_validate_team_leader_role ON rescue_teams;
CREATE TRIGGER trigger_validate_team_leader_role
  BEFORE INSERT OR UPDATE ON rescue_teams
  FOR EACH ROW
  EXECUTE FUNCTION validate_team_leader_role();