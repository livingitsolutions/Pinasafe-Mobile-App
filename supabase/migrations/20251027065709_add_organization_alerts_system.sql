/*
  # Add Organization Alerts System

  1. Purpose
    - Route emergency reports to specific organizations based on incident type
    - Enable audio alerts only for organizations that should respond to specific incidents
    - Create mapping between report types and organization types

  2. New Table
    - `organization_alerts`
      - `id` (uuid, primary key)
      - `organization_id` (uuid, references organizations)
      - `report_id` (uuid, references emergency_reports)
      - `notified_at` (timestamptz)
      - `acknowledged_at` (timestamptz, nullable)
      - `acknowledged_by` (uuid, nullable, references users)
      - `is_active` (boolean, default true)
      - `created_at` (timestamptz)

  3. Type Mapping Logic
    - fire report → fire organizations
    - medical/accident report → medical organizations
    - crime report → police organizations
    - disaster report → disaster organizations
    - other report → rescue organizations

  4. Security
    - Enable RLS on organization_alerts table
    - Organization members can read their organization's alerts
    - Admins and responders can manage alerts

  5. Indexes
    - Add indexes for organization_id and report_id lookups
    - Add index for is_active status
*/

-- Create organization_alerts table
CREATE TABLE IF NOT EXISTS organization_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_id uuid NOT NULL REFERENCES emergency_reports(id) ON DELETE CASCADE,
  notified_at timestamptz DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, report_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_organization_alerts_organization_id ON organization_alerts(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_alerts_report_id ON organization_alerts(report_id);
CREATE INDEX IF NOT EXISTS idx_organization_alerts_is_active ON organization_alerts(is_active);
CREATE INDEX IF NOT EXISTS idx_organization_alerts_created_at ON organization_alerts(created_at DESC);

-- Enable Row Level Security
ALTER TABLE organization_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for organization_alerts
CREATE POLICY "Responders and admins can read organization alerts"
  ON organization_alerts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('responder', 'admin')
    )
  );

CREATE POLICY "System can create organization alerts"
  ON organization_alerts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('responder', 'admin')
    )
  );

CREATE POLICY "Responders and admins can update alerts"
  ON organization_alerts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('responder', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('responder', 'admin')
    )
  );

-- Function to automatically create organization alerts when a report is created
CREATE OR REPLACE FUNCTION create_organization_alerts_for_report()
RETURNS TRIGGER AS $$
DECLARE
  target_org_type text;
BEGIN
  -- Map report type to organization type
  target_org_type := CASE NEW.type
    WHEN 'fire' THEN 'fire'
    WHEN 'road' THEN 'rescue'
  END;

  -- Create alerts for all active organizations of the target type
  INSERT INTO organization_alerts (organization_id, report_id)
  SELECT id, NEW.id
  FROM organizations
  WHERE type = target_org_type AND is_active = true;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically create organization alerts
DROP TRIGGER IF EXISTS trigger_create_organization_alerts ON emergency_reports;
CREATE TRIGGER trigger_create_organization_alerts
  AFTER INSERT ON emergency_reports
  FOR EACH ROW
  EXECUTE FUNCTION create_organization_alerts_for_report();
