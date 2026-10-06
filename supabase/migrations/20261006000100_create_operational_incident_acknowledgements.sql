CREATE TABLE operational_incident_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  operational_id uuid NOT NULL,
  acknowledged_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operational_incident_acknowledgements_org_operational_unique
    UNIQUE (organization_id, operational_id)
);

CREATE INDEX idx_operational_incident_acknowledgements_operational_id
  ON operational_incident_acknowledgements(operational_id);

ALTER TABLE operational_incident_acknowledgements ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON TABLE operational_incident_acknowledgements TO service_role;
