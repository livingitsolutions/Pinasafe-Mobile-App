-- Create PinaSafe Emergency Response System Schema
-- 
-- 1. New Tables: users, emergency_reports, emergency_calls, system_alerts, organizations, personnel
-- 2. Security: Enable RLS with role-based access policies

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'citizen',
  phone text,
  address text,
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_role CHECK (role IN ('citizen', 'responder', 'admin'))
);

-- Emergency reports table
CREATE TABLE IF NOT EXISTS emergency_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  responder_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  location text NOT NULL,
  latitude numeric,
  longitude numeric,
  contact_number text,
  priority text NOT NULL,
  status text DEFAULT 'pending',
  evidence_photos jsonb DEFAULT '[]'::jsonb,
  ai_classification jsonb,
  use_ai_classification boolean DEFAULT false,
  notes text,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_type CHECK (type IN ('road', 'fire','other')),
  CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'dispatched', 'responding', 'resolved'))
);

-- Emergency calls table
CREATE TABLE IF NOT EXISTS emergency_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  service_number text NOT NULL,
  call_date date NOT NULL,
  call_time time NOT NULL,
  duration integer,
  status text NOT NULL,
  location text,
  outcome text,
  created_at timestamptz DEFAULT now()
);

-- System alerts table
CREATE TABLE IF NOT EXISTS system_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL,
  location text,
  affected_areas jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  expires_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_alert_type CHECK (type IN ('weather', 'safety', 'community', 'emergency', 'system')),
  CONSTRAINT valid_alert_priority CHECK (priority IN ('low', 'medium', 'high', 'critical'))
);

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  type text NOT NULL,
  contact_number text NOT NULL,
  email text,
  address text,
  coverage_areas jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_org_type CHECK (type IN ('fire', 'rescue'))
);

-- Personnel table
CREATE TABLE IF NOT EXISTS personnel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  position text NOT NULL,
  contact_number text NOT NULL,
  email text,
  specializations jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_emergency_reports_reported_by ON emergency_reports(reported_by);
CREATE INDEX IF NOT EXISTS idx_emergency_reports_status ON emergency_reports(status);
CREATE INDEX IF NOT EXISTS idx_emergency_reports_created_at ON emergency_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emergency_calls_caller_id ON emergency_calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_system_alerts_is_active ON system_alerts(is_active);
CREATE INDEX IF NOT EXISTS idx_system_alerts_created_at ON system_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personnel_organization_id ON personnel(organization_id);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can read own profile"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all users"
  ON users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can update any user"
  ON users FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- RLS Policies for emergency_reports table
CREATE POLICY "Users can read own reports"
  ON emergency_reports FOR SELECT
  TO authenticated
  USING (
    reported_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('responder', 'admin')
    )
  );

CREATE POLICY "Authenticated users can create reports"
  ON emergency_reports FOR INSERT
  TO authenticated
  WITH CHECK (reported_by = auth.uid());

CREATE POLICY "Responders and admins can update reports"
  ON emergency_reports FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('responder', 'admin')
    )
  );

-- RLS Policies for emergency_calls table
CREATE POLICY "Users can read own calls"
  ON emergency_calls FOR SELECT
  TO authenticated
  USING (caller_id = auth.uid());

CREATE POLICY "Users can create own calls"
  ON emergency_calls FOR INSERT
  TO authenticated
  WITH CHECK (caller_id = auth.uid());

-- RLS Policies for system_alerts table
CREATE POLICY "All authenticated users can read alerts"
  ON system_alerts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Responders and admins can create alerts"
  ON system_alerts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('responder', 'admin')
    )
  );

CREATE POLICY "Creators and admins can update alerts"
  ON system_alerts FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- RLS Policies for organizations table
CREATE POLICY "All authenticated users can read organizations"
  ON organizations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can manage organizations"
  ON organizations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- RLS Policies for personnel table
CREATE POLICY "All authenticated users can read personnel"
  ON personnel FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can manage personnel"
  ON personnel FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );