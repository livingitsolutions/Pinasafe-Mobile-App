const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repositoryRoot = path.resolve(__dirname, '../../..');
const migrationPath = path.join(
  repositoryRoot,
  'supabase/migrations/20260926000100_add_atomic_evidence_reservations.sql'
);
const baseMigrationPath = path.join(
  repositoryRoot,
  'supabase/migrations/20260925000100_create_durable_evidence_schema.sql'
);
const migration = fs.readFileSync(migrationPath, 'utf8');
const baseMigration = fs.readFileSync(baseMigrationPath, 'utf8');

const functionBody = (name) => {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextFunction = migration.indexOf('\nCREATE OR REPLACE FUNCTION public.', start + 1);
  const end = nextFunction === -1 ? migration.indexOf('\n-- RPC calls', start) : nextFunction;
  return migration.slice(start, end);
};

describe('PWA-1.4B3.4A evidence reservation migration contract', () => {
  test('is additive after B1 and leaves the B1 migration unchanged', () => {
    expect(path.basename(migrationPath)).toBe('20260926000100_add_atomic_evidence_reservations.sql');
    expect(path.basename(baseMigrationPath)).toBe('20260925000100_create_durable_evidence_schema.sql');
    expect(migration).not.toMatch(/ALTER TABLE public\.users|ALTER TABLE public\.emergency_reports/i);
    expect(baseMigration).toMatch(/CREATE TABLE report_evidence/i);
    expect(() => execFileSync('git', [
      'diff', '--quiet', 'HEAD', '--', 'supabase/migrations/20260925000100_create_durable_evidence_schema.sql'
    ], { cwd: repositoryRoot })).not.toThrow();
  });

  test('adds uploading while preserving existing evidence lifecycle states', () => {
    expect(migration).toMatch(/CHECK \(status IN \('uploading', 'accepted', 'bound', 'expired'\)\)/i);
    expect(migration).toMatch(/status = 'accepted'[\s\S]*emergency_report_id IS NULL[\s\S]*bound_at IS NULL[\s\S]*accepted_at IS NOT NULL/i);
    expect(migration).toMatch(/status = 'bound'[\s\S]*emergency_report_id IS NOT NULL[\s\S]*bound_at IS NOT NULL[\s\S]*accepted_at IS NOT NULL/i);
    expect(migration).toMatch(/status = 'expired'[\s\S]*emergency_report_id IS NULL[\s\S]*bound_at IS NULL[\s\S]*accepted_at IS NOT NULL/i);
    expect(migration).toMatch(/status = 'uploading'[\s\S]*emergency_report_id IS NULL[\s\S]*bound_at IS NULL[\s\S]*accepted_at IS NULL/i);
  });

  test('allows null dimensions/classification only for uploading reservations', () => {
    expect(migration).toMatch(/ALTER COLUMN width DROP NOT NULL/i);
    expect(migration).toMatch(/ALTER COLUMN height DROP NOT NULL/i);
    expect(migration).toMatch(/status = 'uploading' AND width IS NULL AND height IS NULL/i);
    expect(migration).toMatch(/status IN \('accepted', 'bound', 'expired'\)[\s\S]*width IS NOT NULL AND width > 0[\s\S]*height IS NOT NULL AND height > 0/i);
    expect(migration).toMatch(/ALTER COLUMN classification_label DROP NOT NULL/i);
    expect(migration).toMatch(/status = 'uploading'[\s\S]*classification_label IS NULL[\s\S]*classification_status IS NULL[\s\S]*classification_action IS NULL/i);
    expect(migration).toMatch(/classification_label IN \('fire', 'road'\)[\s\S]*classification_status = 'valid'[\s\S]*classification_action = 'accept'/i);
    expect(baseMigration).toMatch(/CONSTRAINT report_evidence_confidence_range/i);
  });

  test('reservation locks, authorizes, checks expiry and capacity before insert', () => {
    const body = functionBody('reserve_report_evidence');
    expect(body).toMatch(/p_session_id uuid,[\s\S]*p_owner_user_id uuid,[\s\S]*p_evidence_id uuid,[\s\S]*p_storage_bucket text,[\s\S]*p_storage_path text,[\s\S]*p_mime_type text,[\s\S]*p_byte_size integer/i);
    expect(body).toMatch(/WHERE session_row\.id = p_session_id\s+AND session_row\.owner_user_id = p_owner_user_id\s+FOR UPDATE/i);
    expect(body).toMatch(/v_session\.status <> 'active'/i);
    expect(body).toMatch(/v_session\.expires_at <= clock_timestamp\(\)/i);
    expect(body).toMatch(/status IN \('uploading', 'accepted', 'bound'\)/i);
    expect(body).toMatch(/v_capacity_count >= 5/i);
    expect(body).toMatch(/'CAPACITY_REACHED'/i);
    expect(body).toMatch(/'SESSION_UNAVAILABLE'/i);
    expect(body).toMatch(/'RESERVATION_CONFLICT'/i);
    expect(body).toMatch(/'uploading'[\s\S]*NULL[\s\S]*v_session\.expires_at/i);
    expect(body).not.toMatch(/p_classification|p_emergency_report_id|p_accepted_at|p_bound_at/i);
    expect(body).toMatch(/p_storage_path IS DISTINCT FROM[\s\S]*evidence\//i);
  });

  test('finalization revalidates and changes only an uploading row to accepted', () => {
    const body = functionBody('finalize_report_evidence_upload');
    expect(body).toMatch(/p_session_id uuid,[\s\S]*p_owner_user_id uuid,[\s\S]*p_evidence_id uuid,[\s\S]*p_width integer,[\s\S]*p_height integer,[\s\S]*p_classification_label text,[\s\S]*p_classification_confidence numeric,[\s\S]*p_classification_reason text,[\s\S]*p_classification_caption text/i);
    expect(body).toMatch(/session_row\.owner_user_id = p_owner_user_id[\s\S]*FOR UPDATE/i);
    expect(body).toMatch(/v_session\.status <> 'active'[\s\S]*v_session\.expires_at <= clock_timestamp\(\)/i);
    expect(body).toMatch(/evidence_row\.uploader_user_id = p_owner_user_id[\s\S]*FOR UPDATE/i);
    expect(body).toMatch(/v_evidence\.status <> 'uploading'/i);
    expect(body).toMatch(/width = p_width[\s\S]*height = p_height/i);
    expect(body).toMatch(/classification_status = 'valid'[\s\S]*classification_action = 'accept'/i);
    expect(body).toMatch(/status = 'accepted'[\s\S]*accepted_at = clock_timestamp\(\)/i);
    expect(body).not.toMatch(/emergency_report_id\s*=/i);
    expect(body).not.toMatch(/storage_bucket\s*=|storage_path\s*=/i);
    expect(body).toMatch(/'FINALIZATION_INVALID'/i);
  });

  test('cancellation deletes only an uploading reservation for the matching owner/session', () => {
    const body = functionBody('cancel_report_evidence_reservation');
    expect(body).toMatch(/session_row\.id = p_session_id[\s\S]*session_row\.owner_user_id = p_owner_user_id[\s\S]*FOR UPDATE/i);
    expect(body).toMatch(/evidence_row\.id = p_evidence_id[\s\S]*evidence_row\.upload_session_id = p_session_id[\s\S]*evidence_row\.uploader_user_id = p_owner_user_id[\s\S]*evidence_row\.status = 'uploading'/i);
    expect(body).toMatch(/'CANCELLATION_INVALID'/i);
    expect(body).toMatch(/'CANCELLED'/i);
  });

  test('hardens execute privileges for each RPC', () => {
    for (const signature of [
      'reserve_report_evidence(uuid, uuid, uuid, text, text, text, integer)',
      'finalize_report_evidence_upload(uuid, uuid, uuid, integer, integer, text, numeric, text, text)',
      'cancel_report_evidence_reservation(uuid, uuid, uuid)'
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature}\n  FROM PUBLIC;`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature}\n  FROM anon;`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature}\n  FROM authenticated;`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${signature}\n  TO service_role;`);
    }
  });

  test('preserves server-generated UUID uniqueness and introduces no idempotency contract', () => {
    expect(baseMigration).toMatch(/id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/i);
    expect(migration).not.toMatch(/idempotency/i);
    expect(migration).not.toMatch(/CREATE TABLE[^;]*storage\.buckets/i);
  });
});
