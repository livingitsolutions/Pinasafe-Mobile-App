const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations');
const MIGRATION = '20261006000500_create_incident_response_locations.sql';
const FROZEN = [
  '20261006000100_create_operational_incident_acknowledgements.sql',
  '20261006000200_create_atomic_operational_dispatch_assignment.sql',
  '20261006000300_create_atomic_operational_incident_resolution.sql',
  '20261006000400_add_emergency_report_responded_at.sql'
];

describe('incident_response_locations migration contract', () => {
  const sql = () => fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8');
  const executable = () => sql().replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

  test('sorts after every frozen V3.6A/V3.6B migration', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(file => file.endsWith('.sql')).sort();
    FROZEN.forEach(file => expect(files.indexOf(file)).toBeGreaterThanOrEqual(0));
    expect(files.indexOf(MIGRATION)).toBeGreaterThan(files.indexOf(FROZEN[FROZEN.length - 1]));
  });

  test('creates the table with required columns and foreign keys', () => {
    const body = executable();
    expect(body).toMatch(/CREATE TABLE IF NOT EXISTS public\.incident_response_locations/);
    expect(body).toMatch(/organization_id uuid NOT NULL REFERENCES public\.organizations\(id\)/);
    expect(body).toMatch(/operational_id uuid NOT NULL/);
    expect(body).toMatch(/report_id uuid NOT NULL REFERENCES public\.emergency_reports\(id\)/);
    expect(body).toMatch(/team_id uuid NOT NULL REFERENCES public\.rescue_teams\(id\)/);
    expect(body).toMatch(/responder_id uuid NOT NULL REFERENCES public\.users\(id\)/);
    expect(body).toMatch(/latitude double precision NOT NULL/);
    expect(body).toMatch(/longitude double precision NOT NULL/);
    expect(body).toMatch(/accuracy_meters double precision,/);
    expect(body).toMatch(/captured_at timestamptz NOT NULL/);
    expect(body).toMatch(/received_at timestamptz NOT NULL DEFAULT now\(\)/);
  });

  test('enforces coordinate, accuracy and latest-position constraints', () => {
    const body = executable();
    expect(body).toMatch(/CHECK \(latitude BETWEEN -90 AND 90\)/);
    expect(body).toMatch(/CHECK \(longitude BETWEEN -180 AND 180\)/);
    expect(body).toMatch(/CHECK \(accuracy_meters IS NULL OR accuracy_meters >= 0\)/);
    expect(body).toMatch(/UNIQUE \(report_id, responder_id\)/);
  });

  test('is service-role only with RLS deny-by-default', () => {
    const body = executable();
    expect(body).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(body).not.toMatch(/CREATE POLICY/i);
    expect(body).toMatch(/REVOKE ALL ON TABLE public\.incident_response_locations FROM anon/);
    expect(body).toMatch(/REVOKE ALL ON TABLE public\.incident_response_locations FROM authenticated/);
    expect(body).toMatch(/TO service_role/);
    expect(body).not.toMatch(/GRANT[^;]*TO (anon|authenticated)/i);
  });

  test('is additive and leaves frozen objects untouched', () => {
    const body = executable();
    expect(body).not.toMatch(/\b(DROP|DELETE|TRUNCATE|RENAME)\b/i);
    expect(body).not.toMatch(/ALTER TABLE (public\.)?(emergency_reports|team_location_tracking)/i);
    expect(body).not.toMatch(/FUNCTION|resolve_operational_incident_atomic|assign_emergency_report_team_atomic|lock_operational_groups|set_emergency_report_cluster_atomic/i);
    expect(body).not.toMatch(/\b(BEGIN|COMMIT|ROLLBACK)\s*;/i);
  });
});
