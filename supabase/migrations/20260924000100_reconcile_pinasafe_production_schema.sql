-- PinaSafe production schema reconciliation
--
-- The canonical migration history was found to be missing historical schema
-- changes required by the current application. This migration restores those
-- contracts without pretending to reconstruct the lost historical SQL.
--
-- Reconciles:
--   * emergency_reports team-assignment fields
--   * team_location_tracking required by the current backend
--
-- No legacy data migration is required for a fresh bootstrap.

-- ---------------------------------------------------------------------------
-- Emergency report team assignment
-- ---------------------------------------------------------------------------

ALTER TABLE emergency_reports
  ADD COLUMN IF NOT EXISTS assigned_team_id uuid
    REFERENCES rescue_teams(id) ON DELETE SET NULL;

ALTER TABLE emergency_reports
  ADD COLUMN IF NOT EXISTS assigned_by uuid
    REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE emergency_reports
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_emergency_reports_assigned_team_id
  ON emergency_reports(assigned_team_id);

CREATE INDEX IF NOT EXISTS idx_emergency_reports_assigned_by
  ON emergency_reports(assigned_by);

-- ---------------------------------------------------------------------------
-- Responder location tracking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS team_location_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  team_id uuid NOT NULL
    REFERENCES rescue_teams(id) ON DELETE CASCADE,

  user_id uuid NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,

  emergency_report_id uuid NOT NULL
    REFERENCES emergency_reports(id) ON DELETE CASCADE,

  latitude double precision NOT NULL,
  longitude double precision NOT NULL,

  accuracy double precision,
  speed double precision NOT NULL DEFAULT 0,
  heading double precision,
  eta_minutes integer,

  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_location_tracking_emergency
  ON team_location_tracking(emergency_report_id);

CREATE INDEX IF NOT EXISTS idx_team_location_tracking_team
  ON team_location_tracking(team_id);

CREATE INDEX IF NOT EXISTS idx_team_location_tracking_user
  ON team_location_tracking(user_id);

CREATE INDEX IF NOT EXISTS idx_team_location_tracking_active_emergency
  ON team_location_tracking(emergency_report_id, is_active);

CREATE INDEX IF NOT EXISTS idx_team_location_tracking_active_team
  ON team_location_tracking(team_id, is_active);

ALTER TABLE team_location_tracking ENABLE ROW LEVEL SECURITY;

-- The production backend accesses this table through its server-side
-- service-role client and performs application authorization in Express.
--
-- No broad authenticated-client policies are introduced here. Direct
-- authenticated Data API access therefore remains deny-by-default.
