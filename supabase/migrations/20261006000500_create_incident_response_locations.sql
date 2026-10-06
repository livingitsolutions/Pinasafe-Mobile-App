/*
 * PinaSafe V3.6C
 * Secure latest-position storage for active responder tracking.
 *
 * Access is server-side only through the service role.
 * RLS remains enabled with no client policies.
 * One latest position is retained per report/responder pair.
 */

CREATE TABLE IF NOT EXISTS public.incident_response_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  operational_id uuid NOT NULL,
  report_id uuid NOT NULL REFERENCES public.emergency_reports(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.rescue_teams(id) ON DELETE CASCADE,
  responder_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy_meters double precision,
  captured_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incident_response_locations_latitude_range
    CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT incident_response_locations_longitude_range
    CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT incident_response_locations_accuracy_non_negative
    CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0),
  CONSTRAINT incident_response_locations_report_responder_key
    UNIQUE (report_id, responder_id)
);

CREATE INDEX IF NOT EXISTS idx_incident_response_locations_org_operational
  ON public.incident_response_locations (organization_id, operational_id);

CREATE INDEX IF NOT EXISTS idx_incident_response_locations_report_received
  ON public.incident_response_locations (report_id, received_at DESC);

ALTER TABLE public.incident_response_locations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.incident_response_locations FROM PUBLIC;
REVOKE ALL ON TABLE public.incident_response_locations FROM anon;
REVOKE ALL ON TABLE public.incident_response_locations FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.incident_response_locations
  TO service_role;
