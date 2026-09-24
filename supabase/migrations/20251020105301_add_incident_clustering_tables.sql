/*
  # Add Incident Clustering and Notification System

  1. Schema Changes
    - Add `cluster_id` to `emergency_reports` table to group related incidents
    - Create `incident_updates` table to store responder updates
    - Create `incident_cluster_subscribers` table to track all citizens in a cluster

  2. New Tables
    - `incident_updates`
      - `id` (uuid, primary key)
      - `cluster_id` (uuid, references the primary incident)
      - `responder_id` (uuid, references users)
      - `message` (text)
      - `status` (text)
      - `created_at` (timestamptz)
    
    - `incident_cluster_subscribers`
      - `id` (uuid, primary key)
      - `cluster_id` (uuid, references the primary incident)
      - `user_id` (uuid, references users)
      - `incident_id` (uuid, their specific report in the cluster)
      - `subscribed_at` (timestamptz)

  3. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users to read updates
    - Add policies for responders to create updates
    - Add policies for users to view their cluster subscriptions

  4. Indexes
    - Add indexes for cluster_id lookups
    - Add indexes for efficient subscriber queries
*/

-- Add cluster_id to emergency_reports
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emergency_reports' AND column_name = 'cluster_id'
  ) THEN
    ALTER TABLE emergency_reports ADD COLUMN cluster_id uuid;
    CREATE INDEX IF NOT EXISTS idx_emergency_reports_cluster_id ON emergency_reports(cluster_id);
  END IF;
END $$;

-- Create incident_updates table
CREATE TABLE IF NOT EXISTS incident_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL,
  responder_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message text NOT NULL,
  status text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_update_status CHECK (status IN ('pending', 'dispatched', 'responding', 'resolved'))
);

-- Create incident_cluster_subscribers table
CREATE TABLE IF NOT EXISTS incident_cluster_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES emergency_reports(id) ON DELETE CASCADE,
  subscribed_at timestamptz DEFAULT now(),
  UNIQUE(cluster_id, user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_incident_updates_cluster_id ON incident_updates(cluster_id);
CREATE INDEX IF NOT EXISTS idx_incident_updates_created_at ON incident_updates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_cluster_subscribers_cluster_id ON incident_cluster_subscribers(cluster_id);
CREATE INDEX IF NOT EXISTS idx_incident_cluster_subscribers_user_id ON incident_cluster_subscribers(user_id);

-- Enable Row Level Security
ALTER TABLE incident_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_cluster_subscribers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for incident_updates
CREATE POLICY "Subscribers can read updates for their clusters"
  ON incident_updates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM incident_cluster_subscribers
      WHERE incident_cluster_subscribers.cluster_id = incident_updates.cluster_id
      AND incident_cluster_subscribers.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('responder', 'admin')
    )
  );

CREATE POLICY "Responders and admins can create updates"
  ON incident_updates FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('responder', 'admin')
    )
  );

-- RLS Policies for incident_cluster_subscribers
CREATE POLICY "Users can read own subscriptions"
  ON incident_cluster_subscribers FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('responder', 'admin')
    )
  );

CREATE POLICY "System can create subscriptions"
  ON incident_cluster_subscribers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can delete subscriptions"
  ON incident_cluster_subscribers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );