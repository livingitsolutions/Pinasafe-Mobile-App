const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '../../..');
const migrationPath = path.join(
  repositoryRoot,
  'supabase/migrations/20261002000100_require_evidence_capture_location.sql'
);
const bindingPath = path.join(
  repositoryRoot,
  'supabase/migrations/20260927000100_create_atomic_emergency_report_binding.sql'
);
const evidenceFlowPath = path.join(repositoryRoot, 'pinasafe-mobile/utils/evidenceFlow.ts');
const reportScreenPath = path.join(
  repositoryRoot,
  'pinasafe-mobile/app/(tabs-citizen)/emergency/report.tsx'
);
const migration = fs.readFileSync(migrationPath, 'utf8');
const bindingMigration = fs.readFileSync(bindingPath, 'utf8');
const evidenceFlow = fs.readFileSync(evidenceFlowPath, 'utf8');
const reportScreen = fs.readFileSync(reportScreenPath, 'utf8');
const oldSignature = 'uuid, uuid, uuid, integer, integer, text, numeric, text, text';
const newSignature = 'uuid, uuid, uuid, integer, integer, text, numeric, text, text, double precision, double precision, double precision, timestamptz';
const finalizeStart = migration.indexOf('CREATE FUNCTION public.finalize_report_evidence_upload(');
const finalizeEnd = migration.indexOf('\nALTER FUNCTION public.finalize_report_evidence_upload(', finalizeStart);
const finalizeBody = migration.slice(finalizeStart, migration.indexOf('$function$;', finalizeStart) + '$function$;'.length);
const schemaChanges = migration.slice(0, migration.indexOf('CREATE OR REPLACE FUNCTION'));

describe('capture-location migration contract', () => {
  test('is the sole canonical pending capture-location migration with nullable columns and no backfill', () => {
    expect(path.basename(migrationPath)).toBe('20261002000100_require_evidence_capture_location.sql');
    expect(schemaChanges).toMatch(/ADD COLUMN capture_latitude double precision/i);
    expect(schemaChanges).toMatch(/ADD COLUMN capture_longitude double precision/i);
    expect(schemaChanges).toMatch(/ADD COLUMN capture_accuracy double precision/i);
    expect(schemaChanges).toMatch(/ADD COLUMN captured_at timestamptz/i);
    expect(schemaChanges).not.toMatch(/NOT NULL|UPDATE\s+public\.report_evidence|SET\s+capture_/i);
    expect(migration).not.toMatch(/capture_timestamp|CASCADE/i);
    expect(fs.existsSync(path.join(repositoryRoot, 'EVIDENCE_CAPTURE_LOCATION_MIGRATION.sql'))).toBe(false);
  });

  test('validates coordinate ranges, accuracy, and nullable historical metadata', () => {
    expect(migration).toMatch(/capture_latitude IS NULL OR capture_latitude BETWEEN -90 AND 90/i);
    expect(migration).toMatch(/capture_longitude IS NULL OR capture_longitude BETWEEN -180 AND 180/i);
    expect(migration).toMatch(/capture_accuracy IS NULL[\s\S]*capture_accuracy >= 0[\s\S]*'NaN'[\s\S]*'Infinity'/i);
    expect(migration).toMatch(/capture_latitude IS NULL\) = \(capture_longitude IS NULL[\s\S]*captured_at IS NULL/i);
  });

  test('drops the exact old nine-argument function without cascade and defines only the new thirteen-argument function', () => {
    expect(migration).toContain(`DROP FUNCTION public.finalize_report_evidence_upload(\n  ${oldSignature.replaceAll(', ', ',\n  ')}\n);`);
    expect(migration.slice(finalizeStart, finalizeEnd)).toMatch(new RegExp(`p_session_id uuid,[\\s\\S]*p_owner_user_id uuid,[\\s\\S]*p_evidence_id uuid,[\\s\\S]*p_width integer,[\\s\\S]*p_height integer,[\\s\\S]*p_classification_label text,[\\s\\S]*p_classification_confidence numeric,[\\s\\S]*p_classification_reason text,[\\s\\S]*p_classification_caption text,[\\s\\S]*p_capture_latitude double precision,[\\s\\S]*p_capture_longitude double precision,[\\s\\S]*p_capture_accuracy double precision,[\\s\\S]*p_captured_at timestamptz`, 'i'));
    expect((migration.match(/(?:CREATE|CREATE OR REPLACE) FUNCTION public\.finalize_report_evidence_upload\(/g) || [])).toHaveLength(1);
    expect(migration).not.toMatch(/DROP FUNCTION[^;]*CASCADE/i);
  });

  test('preserves invoker security, hardens search_path, preserves owner, and restricts execution', () => {
    expect(finalizeBody).toMatch(/SECURITY INVOKER[\s\S]*SET search_path = pg_catalog, public/i);
    expect(migration).toMatch(/ALTER FUNCTION public\.finalize_report_evidence_upload\([\s\S]*timestamptz\s*\) OWNER TO postgres;/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.finalize_report_evidence_upload\([\s\S]*FROM PUBLIC;/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.finalize_report_evidence_upload\([\s\S]*FROM anon;/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.finalize_report_evidence_upload\([\s\S]*FROM authenticated;/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.finalize_report_evidence_upload\([\s\S]*TO service_role;/i);
  });

  test('preserves owner-scoped locks, lifecycle checks, classification checks, and atomic finalization', () => {
    expect(finalizeBody).toMatch(/session_row\.id = p_session_id\s+AND session_row\.owner_user_id = p_owner_user_id\s+FOR UPDATE/i);
    expect(finalizeBody).toMatch(/v_session\.status <> 'active'[\s\S]*v_session\.expires_at <= clock_timestamp\(\)/i);
    expect(finalizeBody).toMatch(/evidence_row\.id = p_evidence_id[\s\S]*evidence_row\.upload_session_id = p_session_id[\s\S]*evidence_row\.uploader_user_id = p_owner_user_id[\s\S]*FOR UPDATE/i);
    expect(finalizeBody).toMatch(/p_classification_label NOT IN \('fire', 'road'\)[\s\S]*p_classification_confidence/i);
    expect(finalizeBody).toMatch(/UPDATE public\.report_evidence[\s\S]*capture_latitude = p_capture_latitude[\s\S]*capture_longitude = p_capture_longitude[\s\S]*capture_accuracy = p_capture_accuracy[\s\S]*captured_at = p_captured_at[\s\S]*status = 'accepted'[\s\S]*evidence_row\.status = 'uploading'/i);
  });

  test('keeps each evidence location immutable once its report binding starts or completes', () => {
    expect(migration).toMatch(/OLD\.status = 'bound' OR NEW\.status = 'bound'[\s\S]*NEW\.capture_latitude[\s\S]*NEW\.capture_longitude[\s\S]*NEW\.capture_accuracy[\s\S]*NEW\.captured_at[\s\S]*BOUND_EVIDENCE_CAPTURE_LOCATION_IMMUTABLE/i);
    expect(migration).toMatch(/BEFORE UPDATE ON public\.report_evidence[\s\S]*EXECUTE FUNCTION public\.prevent_bound_capture_location_mutation\(\)/i);
  });

  test('retains owner-locked atomic report, session, and evidence binding', () => {
    expect(bindingMigration).toMatch(/session_row\.id = p_upload_session_id\s+AND session_row\.owner_user_id = p_reporter_id\s+FOR UPDATE/i);
    expect(bindingMigration).toMatch(/UPDATE public\.evidence_upload_sessions[\s\S]*status = 'bound'[\s\S]*emergency_report_id = p_report_id[\s\S]*bound_at = v_bound_at/i);
    expect(bindingMigration).toMatch(/UPDATE public\.report_evidence[\s\S]*status = 'bound'[\s\S]*emergency_report_id = p_report_id[\s\S]*bound_at = v_bound_at[\s\S]*status = 'accepted'/i);
    expect(bindingMigration).toMatch(/v_updated_count <> v_accepted_count[\s\S]*RAISE EXCEPTION/i);
  });

  test('uses the first accepted capture for canonical report coordinates without later finalization overwrites', () => {
    expect(evidenceFlow).toMatch(/items\.find\(item => item\.status === 'accepted'\)\?\.captureLocation/);
    expect(reportScreen).toMatch(/getFirstAcceptedCaptureLocation\(evidence\)/);
    expect(reportScreen).toMatch(/coordinates: \{ latitude: captureLocation\.latitude, longitude: captureLocation\.longitude \}/);
    expect(bindingMigration).toMatch(/INSERT INTO public\.emergency_reports[\s\S]*latitude,[\s\S]*longitude,[\s\S]*p_latitude,[\s\S]*p_longitude/i);
    expect(bindingMigration).not.toMatch(/UPDATE public\.emergency_reports[\s\S]*latitude\s*=|UPDATE public\.emergency_reports[\s\S]*longitude\s*=/i);
    expect(finalizeBody).not.toMatch(/UPDATE public\.emergency_reports/i);
  });
});