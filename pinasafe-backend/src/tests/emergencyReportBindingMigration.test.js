const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '../../..');
const migrationPath = path.join(
  repositoryRoot,
  'supabase/migrations/20260927000100_create_atomic_emergency_report_binding.sql'
);
const reservationMigrationPath = path.join(
  repositoryRoot,
  'supabase/migrations/20260926000100_add_atomic_evidence_reservations.sql'
);
const migration = fs.readFileSync(migrationPath, 'utf8');
const reservationMigration = fs.readFileSync(reservationMigrationPath, 'utf8');

const functionBody = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.create_emergency_report_with_evidence('),
  migration.indexOf('\nREVOKE ALL ON FUNCTION')
);
const triggerFunctionBody = (name) => {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const delimiter = migration.indexOf('$function$;', start);
  expect(delimiter).toBeGreaterThan(start);
  return migration.slice(start, delimiter + '$function$;'.length);
};
const evidenceGuard = triggerFunctionBody('prevent_bound_report_evidence_mutation');
const sessionGuard = triggerFunctionBody('prevent_bound_evidence_upload_session_mutation');

describe('B4.1 atomic report binding migration contract', () => {
  test('defines the service RPC with server report ID, reporter, report fields, and optional session', () => {
    expect(path.basename(migrationPath)).toBe('20260927000100_create_atomic_emergency_report_binding.sql');
    expect(functionBody).toMatch(/p_report_id uuid,[\s\S]*p_reporter_id uuid,[\s\S]*p_type text,[\s\S]*p_description text,[\s\S]*p_location text,[\s\S]*p_latitude numeric,[\s\S]*p_longitude numeric,[\s\S]*p_contact_number text,[\s\S]*p_priority text,[\s\S]*p_upload_session_id uuid,[\s\S]*p_evidence_photos jsonb,[\s\S]*p_ai_classification jsonb,[\s\S]*p_use_ai_classification boolean/i);
    expect(functionBody).toMatch(/SECURITY INVOKER[\s\S]*SET search_path = pg_catalog, public/i);
  });

  test('locks the exact owner-scoped session before inspecting evidence and uses database expiry time', () => {
    expect(functionBody).toMatch(/WHERE session_row\.id = p_upload_session_id\s+AND session_row\.owner_user_id = p_reporter_id\s+FOR UPDATE/i);
    expect(functionBody).toMatch(/v_session\.expires_at <= clock_timestamp\(\)/i);
    expect(functionBody).toMatch(/BINDING_SESSION_UNAVAILABLE/);
    expect(functionBody).toMatch(/v_session\.status = 'expired'[\s\S]*BINDING_SESSION_EXPIRED/i);
  });

  test('rejects NULL report type and priority before their SQL allowlist checks', () => {
    expect(functionBody).toMatch(/p_type IS NULL\s+OR p_type NOT IN/i);
    expect(functionBody).toMatch(/p_priority IS NULL\s+OR p_priority NOT IN/i);
  });

  test('rejects a session owned by another reporter', () => {
    expect(functionBody).toMatch(/WHERE session_row\.id = p_upload_session_id\s+AND session_row\.owner_user_id = p_reporter_id[\s\S]*IF NOT FOUND[\s\S]*BINDING_SESSION_UNAVAILABLE/i);
  });

  test('rejects empty sessions, in-progress uploads, and inconsistent evidence binding state', () => {
    expect(functionBody).toMatch(/evidence_row\.status = 'uploading'[\s\S]*BINDING_UPLOAD_IN_PROGRESS/i);
    expect(functionBody).toMatch(/evidence_row\.uploader_user_id IS DISTINCT FROM p_reporter_id[\s\S]*BINDING_EVIDENCE_OWNER_MISMATCH/i);
    expect(functionBody).toMatch(/BINDING_EVIDENCE_ALREADY_BOUND/);
    expect(functionBody).toMatch(/v_accepted_count = 0[\s\S]*BINDING_NO_ACCEPTED_EVIDENCE/i);
    expect(functionBody).toMatch(/v_accepted_count > 5[\s\S]*BINDING_EVIDENCE_CAPACITY_INVALID/i);
  });

  test('allows one through five accepted rows and preserves the existing reservation cap', () => {
    expect(functionBody).toMatch(/count\(\*\)[\s\S]*INTO v_accepted_count[\s\S]*evidence_row\.status = 'accepted'[\s\S]*v_accepted_count = 0/);
    expect(functionBody).toMatch(/WHERE evidence_row\.upload_session_id = p_upload_session_id[\s\S]*evidence_row\.status = 'accepted';[\s\S]*GET DIAGNOSTICS v_updated_count = ROW_COUNT/i);
    expect(reservationMigration).toMatch(/v_capacity_count >= 5/);
    expect(reservationMigration).toMatch(/status IN \('uploading', 'accepted', 'bound'\)/);
  });

  test('requires accepted evidence classification state and type to match the report', () => {
    expect(functionBody).toMatch(/classification_status IS DISTINCT FROM 'valid'[\s\S]*classification_action IS DISTINCT FROM 'accept'[\s\S]*BINDING_INVALID_CLASSIFICATION/i);
    expect(functionBody).toMatch(/classification_label IS DISTINCT FROM p_type[\s\S]*BINDING_CLASSIFICATION_MISMATCH/i);
  });

  test('creates the report normally, then atomically binds the session and every accepted row', () => {
    expect(functionBody).toMatch(/INSERT INTO public\.emergency_reports[\s\S]*reported_by[\s\S]*initcap\(p_type\) \|\| ' Emergency'/i);
    expect(functionBody).toMatch(/UPDATE public\.evidence_upload_sessions[\s\S]*status = 'bound'[\s\S]*emergency_report_id = p_report_id[\s\S]*bound_at = v_bound_at/i);
    expect(functionBody).toMatch(/UPDATE public\.report_evidence[\s\S]*status = 'bound'[\s\S]*emergency_report_id = p_report_id[\s\S]*bound_at = v_bound_at[\s\S]*status = 'accepted'/i);
    expect(functionBody).not.toMatch(/accepted_at\s*=/i);
    expect(functionBody).not.toMatch(/storage_bucket\s*=|storage_path\s*=/i);
    expect(functionBody).toMatch(/v_updated_count <> v_accepted_count[\s\S]*RAISE EXCEPTION/i);
  });

  test('supports exact durable replay and fails closed for no-session or mismatched replay', () => {
    expect(functionBody).toMatch(/p_upload_session_id IS NULL[\s\S]*v_report\.reported_by IS DISTINCT FROM p_reporter_id[\s\S]*BINDING_REPORT_ID_CONFLICT/i);
    expect(functionBody).toMatch(/v_report\.reported_by IS DISTINCT FROM p_reporter_id[\s\S]*v_report\.type IS DISTINCT FROM p_type[\s\S]*v_report\.description IS DISTINCT FROM btrim\(p_description\)/);
    expect(functionBody).toMatch(/v_session\.emergency_report_id IS DISTINCT FROM p_report_id[\s\S]*BINDING_SESSION_ALREADY_BOUND/);
    expect(functionBody).toMatch(/v_session\.emergency_report_id IS DISTINCT FROM p_report_id[\s\S]*BINDING_REPORT_ID_CONFLICT/);
    expect(functionBody).toMatch(/RETURN jsonb_build_object\('outcome', 'REPLAYED', 'report_id', p_report_id\)/i);
    expect(functionBody).toMatch(/evidence_row\.classification_status IS DISTINCT FROM 'valid'[\s\S]*evidence_row\.classification_action IS DISTINCT FROM 'accept'[\s\S]*evidence_row\.classification_label IS DISTINCT FROM p_type/i);
    expect(functionBody).toMatch(/BINDING_SESSION_ALREADY_BOUND/);
    expect(functionBody).toMatch(/BINDING_REPORT_ID_CONFLICT/);
  });

  test('replay validates every evidence row and requires one through five complete bound rows', () => {
    expect(functionBody).toMatch(/SELECT count\(\*\)[\s\S]*INTO v_evidence_count[\s\S]*FROM public\.report_evidence[\s\S]*WHERE evidence_row\.upload_session_id = p_upload_session_id/);
    expect(functionBody).toMatch(/v_evidence_count < 1 OR v_evidence_count > 5/);
    expect(functionBody).toMatch(/evidence_row\.status IS DISTINCT FROM 'bound'[\s\S]*evidence_row\.uploader_user_id IS DISTINCT FROM p_reporter_id[\s\S]*evidence_row\.emergency_report_id IS DISTINCT FROM p_report_id[\s\S]*evidence_row\.bound_at IS NULL[\s\S]*evidence_row\.accepted_at IS NULL[\s\S]*evidence_row\.classification_status IS DISTINCT FROM 'valid'[\s\S]*evidence_row\.classification_action IS DISTINCT FROM 'accept'[\s\S]*evidence_row\.classification_label IS DISTINCT FROM p_type/);
    expect(functionBody).not.toMatch(/v_bound_count/);
  });

  test('initial binding rejects expired rows so a successful bound session has only bindable evidence', () => {
    expect(functionBody).toMatch(/evidence_row\.status = 'expired'[\s\S]*BINDING_EXPIRED_EVIDENCE_PRESENT/);
  });

  test('bound evidence UPDATE and DELETE are blocked, while accepted-to-bound remains allowed', () => {
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OR DELETE ON public\.report_evidence/);
    expect(evidenceGuard).toMatch(/TG_OP = 'DELETE'[\s\S]*OLD\.status = 'bound'[\s\S]*BOUND_EVIDENCE_IMMUTABLE/);
    expect(evidenceGuard).toMatch(/IF OLD\.status = 'bound'[\s\S]*ROW\([\s\S]*IS DISTINCT FROM ROW\([\s\S]*BOUND_EVIDENCE_IMMUTABLE/);

    for (const field of [
      'id', 'upload_session_id', 'emergency_report_id', 'uploader_user_id',
      'storage_bucket', 'storage_path', 'mime_type', 'byte_size', 'width', 'height',
      'classification_label', 'classification_status', 'classification_action',
      'classification_confidence', 'classification_reason', 'classification_caption',
      'status', 'created_at', 'accepted_at', 'bound_at', 'expires_at'
    ]) {
      expect(evidenceGuard).toContain(`NEW.${field}`);
      expect(evidenceGuard).toContain(`OLD.${field}`);
    }

    expect(evidenceGuard).toMatch(/IF OLD\.status = 'bound'/);
    expect(evidenceGuard).toMatch(/IF NEW\.status = 'bound'[\s\S]*OLD\.status IS DISTINCT FROM 'accepted'[\s\S]*v_session\.status IS DISTINCT FROM 'bound'[\s\S]*RETURN NEW/);
  });

  test('prevents inserting evidence into a bound session under the same parent lock', () => {
    expect(evidenceGuard).toMatch(/TG_OP = 'INSERT'[\s\S]*FROM public\.evidence_upload_sessions[\s\S]*session_row\.id = NEW\.upload_session_id[\s\S]*FOR UPDATE[\s\S]*BOUND_EVIDENCE_IMMUTABLE/);
    expect(evidenceGuard).toMatch(/v_session\.owner_user_id IS DISTINCT FROM NEW\.uploader_user_id[\s\S]*EVIDENCE_SESSION_OWNER_MISMATCH/);
    expect(evidenceGuard).toMatch(/v_session\.status <> 'active'[\s\S]*v_session\.expires_at <= clock_timestamp\(\)[\s\S]*EVIDENCE_SESSION_UNAVAILABLE/);
  });

  test('rejects reassignment of session or uploader identity on every existing evidence row', () => {
    expect(evidenceGuard).toMatch(/WHERE session_row\.id = NEW\.upload_session_id\s+FOR UPDATE[\s\S]*v_session\.owner_user_id IS DISTINCT FROM NEW\.uploader_user_id[\s\S]*NEW\.upload_session_id IS DISTINCT FROM OLD\.upload_session_id[\s\S]*OR NEW\.uploader_user_id IS DISTINCT FROM OLD\.uploader_user_id[\s\S]*BOUND_EVIDENCE_IMMUTABLE/);
  });

  test('a non-bound accepted row cannot be moved into a bound target session', () => {
    expect(evidenceGuard).toMatch(/FROM public\.evidence_upload_sessions[\s\S]*WHERE session_row\.id = NEW\.upload_session_id[\s\S]*FOR UPDATE[\s\S]*NEW\.upload_session_id IS DISTINCT FROM OLD\.upload_session_id[\s\S]*BOUND_EVIDENCE_IMMUTABLE/);
  });

  test('permits only an unchanged accepted row to bind to its already-bound owner-matched parent', () => {
    expect(evidenceGuard).toMatch(/OLD\.status IS DISTINCT FROM 'accepted'[\s\S]*OLD\.emergency_report_id IS NOT NULL[\s\S]*OLD\.bound_at IS NOT NULL/);
    expect(evidenceGuard).toMatch(/v_session\.status IS DISTINCT FROM 'bound'[\s\S]*v_session\.emergency_report_id IS NULL[\s\S]*NEW\.emergency_report_id IS DISTINCT FROM v_session\.emergency_report_id[\s\S]*NEW\.bound_at IS NULL/);
    expect(evidenceGuard).toMatch(/v_session\.owner_user_id IS DISTINCT FROM NEW\.uploader_user_id/);
    expect(evidenceGuard).toMatch(/NEW\.bound_at IS DISTINCT FROM v_session\.bound_at/);
    expect(evidenceGuard).toMatch(/ROW\([\s\S]*NEW\.storage_bucket[\s\S]*NEW\.classification_label[\s\S]*NEW\.accepted_at[\s\S]*IS DISTINCT FROM ROW\([\s\S]*OLD\.storage_bucket[\s\S]*OLD\.classification_label[\s\S]*OLD\.accepted_at/);
    expect(evidenceGuard).toMatch(/IF NEW\.status = 'bound'[\s\S]*RETURN NEW/);
    expect(functionBody).toMatch(/UPDATE public\.evidence_upload_sessions[\s\S]*SET[\s\S]*status = 'bound'[\s\S]*WHERE session_row\.id = p_upload_session_id[\s\S]*session_row\.status = 'active'/);
    expect(functionBody).toMatch(/UPDATE public\.report_evidence[\s\S]*SET[\s\S]*status = 'bound'[\s\S]*WHERE evidence_row\.upload_session_id = p_upload_session_id[\s\S]*evidence_row\.status = 'accepted'/);
  });

  test('initial insert rejects expired status, database-expired sessions, missing parents, and owner mismatch', () => {
    expect(evidenceGuard).toMatch(/IF NOT FOUND[\s\S]*EVIDENCE_SESSION_UNAVAILABLE/);
    expect(evidenceGuard).toMatch(/v_session\.owner_user_id IS DISTINCT FROM NEW\.uploader_user_id[\s\S]*EVIDENCE_SESSION_OWNER_MISMATCH/);
    expect(evidenceGuard).toMatch(/v_session\.status <> 'active'[\s\S]*v_session\.expires_at <= clock_timestamp\(\)[\s\S]*EVIDENCE_SESSION_UNAVAILABLE/);
  });

  test('ordinary evidence updates lock and require an active unexpired owner-matched session', () => {
    expect(evidenceGuard).toMatch(/WHERE session_row\.id = NEW\.upload_session_id\s+FOR UPDATE/);
    expect(evidenceGuard).toMatch(/NEW\.emergency_report_id IS DISTINCT FROM OLD\.emergency_report_id[\s\S]*OR NEW\.bound_at IS DISTINCT FROM OLD\.bound_at[\s\S]*v_session\.status IS DISTINCT FROM 'active'[\s\S]*v_session\.expires_at <= clock_timestamp\(\)/);
  });

  test('bound session UPDATE and DELETE are blocked, while active-to-bound remains allowed', () => {
    expect(migration).toMatch(/BEFORE UPDATE OR DELETE ON public\.evidence_upload_sessions/);
    expect(sessionGuard).toMatch(/TG_OP = 'DELETE'[\s\S]*OLD\.status = 'bound'[\s\S]*BOUND_EVIDENCE_SESSION_IMMUTABLE/);
    expect(sessionGuard).toMatch(/IF OLD\.status = 'bound'[\s\S]*ROW\([\s\S]*IS DISTINCT FROM ROW\([\s\S]*BOUND_EVIDENCE_SESSION_IMMUTABLE/);

    for (const field of [
      'id', 'owner_user_id', 'status', 'emergency_report_id', 'bound_at', 'created_at', 'expires_at'
    ]) {
      expect(sessionGuard).toContain(`NEW.${field}`);
      expect(sessionGuard).toContain(`OLD.${field}`);
    }

    expect(sessionGuard).toMatch(/IF OLD\.status = 'bound'/);
    expect(sessionGuard).not.toMatch(/IF NEW\.status = 'bound'[\s\S]*RAISE EXCEPTION/);
  });

  test('does not duplicate report-trigger logic or add report/session mutation outside the RPC', () => {
    expect(functionBody).not.toMatch(/organization_id\s*,/i);
    expect(functionBody).not.toMatch(/CREATE TRIGGER|assign_organization_to_report|create_organization_alerts_for_report/i);
    expect(functionBody).toMatch(/p_upload_session_id IS NULL[\s\S]*INSERT INTO public\.emergency_reports/i);
  });

  test('restricts execution to service_role without changing table RLS or grants', () => {
    const signature = 'create_emergency_report_with_evidence(uuid, uuid, text, text, text, numeric, numeric, text, text, uuid, jsonb, jsonb, boolean)';
    expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature}\n  FROM PUBLIC;`);
    expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature}\n  FROM anon;`);
    expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature}\n  FROM authenticated;`);
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${signature}\n  TO service_role;`);
    expect(migration).not.toMatch(/ALTER TABLE|GRANT (SELECT|INSERT|UPDATE|DELETE) ON TABLE|REVOKE ALL ON TABLE/i);
  });
});