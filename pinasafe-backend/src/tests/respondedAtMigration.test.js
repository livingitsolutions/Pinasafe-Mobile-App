const fs = require('fs');
const path = require('path');

describe('responded_at migration contract', () => {
  const migration = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../supabase/migrations/20261006000400_add_emergency_report_responded_at.sql'
    ),
    'utf8'
  );
  const sql = migration.replace(/--.*$/gm, '');

  test('adds a nullable responded_at timestamptz idempotently', () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.emergency_reports\s+ADD COLUMN IF NOT EXISTS responded_at timestamptz NULL;/
    );
  });

  test('is purely additive and leaves frozen operational functions alone', () => {
    expect(sql).not.toMatch(/\bDROP\b|\bDELETE\b|\bUPDATE\b|\bRENAME\b|\bBEGIN\b|\bCOMMIT\b/i);
    expect(sql).not.toMatch(/FUNCTION|POLICY|GRANT|REVOKE/i);
    expect(sql).not.toMatch(
      /resolve_operational_incident_atomic|lock_operational_groups|assign_emergency_report_team_atomic|set_emergency_report_cluster_atomic/
    );
  });
});
