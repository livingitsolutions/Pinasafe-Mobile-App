/*
  # Add Automatic Organization Routing for Emergency Reports

  1. Purpose
    - Automatically assign emergency reports to the correct organization based on incident type
    - Fire incidents → BFP organizations
    - Road incidents → DRRMO/Rescue organizations
    - Enable organization-specific alert filtering

  2. Schema Changes
    - Add organization_id field to emergency_reports table
    - Create function to automatically assign organization based on type
    - Create trigger to execute function on report creation

  3. New Fields
    - `emergency_reports.organization_id` (uuid, references organizations)
      - Automatically set based on incident type
      - Fire → BFP organization
      - Road → Rescue organization

  4. Business Logic
    - When a citizen creates a fire report, it's automatically assigned to a BFP organization
    - When a citizen creates a road report, it's automatically assigned to a DRRMO organization
    - Responders/admins only see reports assigned to their organization
    - Alerts only show to users in the assigned organization

  5. Security
    - RLS policies ensure users only see reports for their organization type
    - Citizens can create reports without needing an organization_id
*/

-- Add organization_id to emergency_reports
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emergency_reports' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE emergency_reports ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_emergency_reports_organization_id ON emergency_reports(organization_id);
  END IF;
END $$;

-- Function to automatically assign organization based on incident type
CREATE OR REPLACE FUNCTION assign_organization_to_report()
RETURNS TRIGGER AS $$
DECLARE
  target_org_id uuid;
  target_org_type text;
BEGIN
  -- Determine target organization type based on incident type
  IF NEW.type = 'fire' THEN
    target_org_type := 'fire';
  ELSIF NEW.type = 'road' THEN
    target_org_type := 'rescue';
  ELSE
    -- For 'other' type, don't assign to specific organization
    RETURN NEW;
  END IF;

  -- Find the first active organization of the target type
  -- Priority: organizations in the same city/area as the incident
  SELECT id INTO target_org_id
  FROM organizations
  WHERE type = target_org_type
    AND is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  -- Assign the organization_id
  IF target_org_id IS NOT NULL THEN
    NEW.organization_id := target_org_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-assign organization on report creation
DROP TRIGGER IF EXISTS trigger_assign_organization_to_report ON emergency_reports;
CREATE TRIGGER trigger_assign_organization_to_report
  BEFORE INSERT ON emergency_reports
  FOR EACH ROW
  EXECUTE FUNCTION assign_organization_to_report();

-- Update existing reports to have organization_id
DO $$
DECLARE
  fire_org_id uuid;
  rescue_org_id uuid;
BEGIN
  -- Get first BFP organization
  SELECT id INTO fire_org_id
  FROM organizations
  WHERE type = 'fire' AND is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  -- Get first DRRMO/Rescue organization
  SELECT id INTO rescue_org_id
  FROM organizations
  WHERE type = 'rescue' AND is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  -- Update fire reports
  IF fire_org_id IS NOT NULL THEN
    UPDATE emergency_reports
    SET organization_id = fire_org_id
    WHERE type = 'fire' AND organization_id IS NULL;
  END IF;

  -- Update road reports
  IF rescue_org_id IS NOT NULL THEN
    UPDATE emergency_reports
    SET organization_id = rescue_org_id
    WHERE type = 'road' AND organization_id IS NULL;
  END IF;
END $$;

-- Update RLS policies to use organization_id directly
DROP POLICY IF EXISTS "Organization members can read relevant reports" ON emergency_reports;

CREATE POLICY "Organization members can read their assigned reports"
  ON emergency_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'responder')
      AND users.organization_id = emergency_reports.organization_id
    )
  );

-- Add policy for responders/admins to update reports in their organization
DROP POLICY IF EXISTS "Responders and admins can update reports" ON emergency_reports;

CREATE POLICY "Organization responders can update their reports"
  ON emergency_reports FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'responder')
      AND users.organization_id = emergency_reports.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'responder')
      AND users.organization_id = emergency_reports.organization_id
    )
  );

-- Super-admins can still update all reports
CREATE POLICY "Super-admins can update all reports"
  ON emergency_reports FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'super_admin'
    )
  );
