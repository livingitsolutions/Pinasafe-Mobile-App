const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(
  __dirname,
  '../../../supabase/migrations/20260925000100_create_durable_evidence_schema.sql'
);
const migration = fs.readFileSync(migrationPath, 'utf8');

describe('PWA-1.4B1 durable evidence schema foundation', () => {
  test('defines the upload-session and normalized evidence tables', () => {
    expect(migration).toMatch(/CREATE TABLE evidence_upload_sessions/i);
    expect(migration).toMatch(/CREATE TABLE report_evidence/i);
    expect(migration).toMatch(/owner_user_id uuid NOT NULL\s+REFERENCES users\(id\) ON DELETE RESTRICT/i);
    expect(migration).toMatch(/emergency_report_id uuid\s+REFERENCES emergency_reports\(id\) ON DELETE RESTRICT/i);
    expect(migration).toMatch(/FOREIGN KEY \(upload_session_id, uploader_user_id\)\s+REFERENCES evidence_upload_sessions\(id, owner_user_id\)/i);
    expect(migration).toMatch(/FOREIGN KEY \(upload_session_id, emergency_report_id\)\s+REFERENCES evidence_upload_sessions\(id, emergency_report_id\)/i);
    expect(migration).toMatch(/UNIQUE \(id, owner_user_id\)/i);
    expect(migration).toMatch(/UNIQUE \(id, emergency_report_id\)/i);
  });

  test('defines lifecycle and data-integrity constraints', () => {
    expect(migration).toMatch(/status IN \('active', 'bound', 'expired'\)/i);
    expect(migration).toMatch(/status IN \('accepted', 'bound', 'expired'\)/i);
    expect(migration).toMatch(/byte_size > 0 AND width > 0 AND height > 0/i);
    expect(migration).toMatch(/CHECK \(mime_type = 'image\/jpeg'\)/i);
    expect(migration).toMatch(/classification_confidence >= 0 AND classification_confidence <= 1/i);
    expect(migration).toMatch(/UNIQUE \(storage_path\)/i);
  });

  test('defines expiry indexes, RLS, and service-role-only privileges', () => {
    expect(migration).toMatch(/idx_evidence_upload_sessions_status_expires_at/i);
    expect(migration).toMatch(/idx_report_evidence_status_expires_at/i);
    expect(migration).toMatch(/ALTER TABLE evidence_upload_sessions ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/ALTER TABLE report_evidence ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/REVOKE ALL ON TABLE evidence_upload_sessions, report_evidence FROM PUBLIC/i);
    expect(migration).toMatch(/REVOKE ALL ON TABLE evidence_upload_sessions, report_evidence FROM anon/i);
    expect(migration).toMatch(/REVOKE ALL ON TABLE evidence_upload_sessions, report_evidence FROM authenticated/i);
    expect(migration).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE[\s\S]*TO service_role/i);
  });

  test('does not alter legacy evidence or create storage behavior', () => {
    expect(migration).not.toMatch(/ALTER TABLE\s+emergency_reports/i);
    expect(migration).not.toMatch(/evidence_photos/i);
    expect(migration).not.toMatch(/ai_classification/i);
    expect(migration).not.toMatch(/use_ai_classification/i);
    expect(migration).not.toMatch(/create\s+bucket|storage\.buckets|public_url/i);
  });
});