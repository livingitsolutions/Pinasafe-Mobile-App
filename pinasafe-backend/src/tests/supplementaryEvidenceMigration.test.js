const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '../../..');
const migrationPath = path.join(
  repositoryRoot,
  'supabase/migrations/20261002000200_add_supplementary_evidence_roles.sql'
);
const migration = fs.readFileSync(migrationPath, 'utf8');
const oldReservationSignature = 'uuid, uuid, uuid, text, text, text, integer';
const reservationSignature = 'uuid, uuid, uuid, text, text, text, integer, text';
const reservationBody = migration.slice(
  migration.indexOf('CREATE FUNCTION public.reserve_report_evidence('),
  migration.indexOf('$function$;', migration.indexOf('CREATE FUNCTION public.reserve_report_evidence(')) + '$function$;'.length
);
const finalizationBody = migration.slice(
  migration.indexOf('CREATE FUNCTION public.finalize_report_evidence_upload('),
  migration.indexOf('$function$;', migration.indexOf('CREATE FUNCTION public.finalize_report_evidence_upload(')) + '$function$;'.length
);
const bindingBody = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.create_emergency_report_with_evidence('),
  migration.indexOf('\nALTER FUNCTION public.create_emergency_report_with_evidence(')
);

describe('V3 supplementary evidence migration contract', () => {
  test('is forward-only and keeps historical evidence role/capture values untouched', () => {
    expect(path.basename(migrationPath)).toBe('20261002000200_add_supplementary_evidence_roles.sql');
    expect(migration).toMatch(/ADD COLUMN evidence_role text;/i);
    expect(migration.slice(0, migration.indexOf('CREATE OR REPLACE FUNCTION')))
      .not.toMatch(/NOT NULL|UPDATE\s+public\.report_evidence|DELETE\s+FROM\s+public\.report_evidence/i);
    expect(migration).not.toMatch(/DROP\s+MIGRATION|ALTER\s+TABLE\s+public\.emergency_reports/i);
  });

  test('models primary and supplementary explicitly while preserving legacy NULL role rows', () => {
    expect(migration).toMatch(/evidence_role IS NULL OR evidence_role IN \('primary', 'supplementary'\)/i);
    expect(migration).toMatch(/WHERE evidence_role = 'primary'/i);
    expect(migration).toMatch(/evidence_role = 'supplementary'[\s\S]*classification_label IS NULL[\s\S]*classification_status IS NULL[\s\S]*classification_action IS NULL/i);
    expect(migration).toMatch(/evidence_role IS DISTINCT FROM 'supplementary'[\s\S]*classification_label IN \('fire', 'road'\)/i);
  });

  test('reserves under the owner-locked session and counts both roles against the five-item cap', () => {
    expect(migration).toMatch(/DROP FUNCTION public\.reserve_report_evidence\(\s*uuid,\s*uuid,\s*uuid,\s*text,\s*text,\s*text,\s*integer\s*\);/i);
    expect(migration).toMatch(/CREATE FUNCTION public\.reserve_report_evidence\([\s\S]*p_evidence_role text/i);
    expect(reservationBody).toMatch(/SECURITY INVOKER[\s\S]*SET search_path = pg_catalog, public/i);
    expect(reservationBody).toMatch(/session_row\.id = p_session_id\s+AND session_row\.owner_user_id = p_owner_user_id\s+FOR UPDATE/i);
    expect(reservationBody).toMatch(/status IN \('uploading', 'accepted', 'bound'\)[\s\S]*v_capacity_count >= 5/i);
    expect(reservationBody).toMatch(/evidence_role,[\s\S]*p_evidence_role/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.reserve_report_evidence\([\s\S]*TO service_role;/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.reserve_report_evidence\([\s\S]*FROM PUBLIC;/i);
  });

  test('replaces the exact V2 finalizer with a role-aware atomic classifier/provenance contract', () => {
    expect(migration).toMatch(/DROP FUNCTION public\.finalize_report_evidence_upload\(\s*uuid,\s*uuid,\s*uuid,\s*integer,\s*integer,\s*text,\s*numeric,\s*text,\s*text,\s*double precision,\s*double precision,\s*double precision,\s*timestamptz\s*\);/i);
    expect(migration).toMatch(/CREATE FUNCTION public\.finalize_report_evidence_upload\([\s\S]*p_captured_at timestamptz,[\s\S]*p_evidence_role text/i);
    expect(finalizationBody).toMatch(new RegExp(`p_session_id uuid,[\\s\\S]*p_owner_user_id uuid,[\\s\\S]*p_evidence_id uuid,[\\s\\S]*p_evidence_role text`, 'i'));
    expect(finalizationBody).toMatch(/SECURITY INVOKER[\s\S]*SET search_path = pg_catalog, public/i);
    expect(finalizationBody).toMatch(/session_row\.id = p_session_id\s+AND session_row\.owner_user_id = p_owner_user_id\s+FOR UPDATE/i);
    expect(finalizationBody).toMatch(/evidence_row\.id = p_evidence_id[\s\S]*evidence_row\.upload_session_id = p_session_id[\s\S]*evidence_row\.uploader_user_id = p_owner_user_id[\s\S]*FOR UPDATE/i);
    expect(finalizationBody).toMatch(/p_evidence_role = 'primary'[\s\S]*p_classification_label IS NULL[\s\S]*p_evidence_role = 'supplementary'[\s\S]*p_classification_label IS NOT NULL/i);
    expect(finalizationBody).toMatch(/capture_latitude = p_capture_latitude[\s\S]*capture_longitude = p_capture_longitude[\s\S]*capture_accuracy = p_capture_accuracy[\s\S]*captured_at = p_captured_at[\s\S]*status = 'accepted'/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.finalize_report_evidence_upload\([\s\S]*FROM authenticated;/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.finalize_report_evidence_upload\([\s\S]*TO service_role;/i);
  });

  test('requires one classified primary, up to four unclassified supplementary rows, and five total', () => {
    expect(bindingBody).toMatch(/v_primary_count <> 1[\s\S]*v_supplementary_count > 4[\s\S]*v_unroled_count <> 0/);
    expect(bindingBody).toMatch(/v_accepted_count > 5/);
    expect(bindingBody).toMatch(/evidence_role = 'primary'[\s\S]*classification_label IS DISTINCT FROM p_type/i);
    expect(bindingBody).toMatch(/evidence_role = 'supplementary'[\s\S]*classification_label IS NOT NULL[\s\S]*classification_caption IS NOT NULL/i);
    expect(bindingBody).toMatch(/p_latitude IS DISTINCT FROM v_primary_latitude[\s\S]*p_longitude IS DISTINCT FROM v_primary_longitude/i);
    expect(bindingBody).toMatch(/capture_latitude IS NULL[\s\S]*capture_longitude IS NULL[\s\S]*captured_at IS NULL/i);
  });

  test('keeps existing ownership locks, atomic association, ACL and legacy replay behavior', () => {
    expect(bindingBody).toMatch(/SECURITY INVOKER[\s\S]*SET search_path = pg_catalog, public/i);
    expect(bindingBody).toMatch(/session_row\.id = p_upload_session_id\s+AND session_row\.owner_user_id = p_reporter_id\s+FOR UPDATE/i);
    expect(bindingBody).toMatch(/UPDATE public\.evidence_upload_sessions[\s\S]*status = 'bound'[\s\S]*UPDATE public\.report_evidence[\s\S]*status = 'bound'/i);
    expect(bindingBody).toMatch(/IF v_v3_roles THEN[\s\S]*ELSE[\s\S]*classification_label IS DISTINCT FROM p_type/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.create_emergency_report_with_evidence\([\s\S]*FROM PUBLIC;/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.create_emergency_report_with_evidence\([\s\S]*FROM anon;/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.create_emergency_report_with_evidence\([\s\S]*FROM authenticated;/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_emergency_report_with_evidence\([\s\S]*TO service_role;/i);
  });

  test('makes role and capture provenance immutable after finalization', () => {
    expect(migration).toMatch(/OLD\.status <> 'uploading'[\s\S]*NEW\.evidence_role[\s\S]*NEW\.capture_latitude[\s\S]*NEW\.capture_longitude[\s\S]*NEW\.capture_accuracy[\s\S]*NEW\.captured_at[\s\S]*FINALIZED_EVIDENCE_METADATA_IMMUTABLE/i);
    expect(migration).toMatch(/BEFORE UPDATE ON public\.report_evidence[\s\S]*EXECUTE FUNCTION public\.prevent_finalized_evidence_metadata_mutation\(\)/i);
    expect(migration).not.toMatch(/CASCADE/i);
  });
});