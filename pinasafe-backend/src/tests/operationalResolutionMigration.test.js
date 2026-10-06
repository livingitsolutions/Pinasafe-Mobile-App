const fs = require('fs');
const path = require('path');

describe('atomic operational resolution migration contract', () => {
  const migration = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../supabase/migrations/20261006000300_create_atomic_operational_incident_resolution.sql'
    ),
    'utf8'
  );

  const resolutionFunction = migration
    .split('CREATE OR REPLACE FUNCTION public.resolve_operational_incident_atomic')[1]
    .split('REVOKE ALL')[0];

  test('adds resolver attribution without replacing responder identity', () => {
    expect(migration).toMatch(
      /ADD COLUMN IF NOT EXISTS resolved_by uuid[\s\S]*?REFERENCES public\.users\(id\)[\s\S]*?ON DELETE SET NULL/
    );

    expect(resolutionFunction).toMatch(/resolved_by = p_actor_user_id/);
    expect(resolutionFunction).not.toMatch(/responder_id = p_actor_user_id/);
  });

  test('uses the shared organization-scoped operational group lock before terminal mutation', () => {
    expect(resolutionFunction).toMatch(
      /v_operational_id := COALESCE\(v_report\.cluster_id, v_report\.id\)/
    );

    expect(resolutionFunction).toMatch(
      /PERFORM public\.lock_operational_groups\(\s*p_organization_id,\s*ARRAY\[v_operational_id\]::uuid\[\]\s*\)/
    );

    expect(resolutionFunction).toMatch(
      /PERFORM public\.lock_operational_groups[\s\S]*?SELECT \*[\s\S]*?INTO v_locked_report[\s\S]*?FOR UPDATE/
    );

    expect(resolutionFunction).toMatch(
      /v_locked_operational_id IS DISTINCT FROM v_operational_id/
    );

    expect(resolutionFunction).toMatch(/'status', 'group_changed'/);
  });

  test('locks all current operational members deterministically', () => {
    expect(resolutionFunction).toMatch(
      /COALESCE\(er\.cluster_id, er\.id\) = v_operational_id[\s\S]*?ORDER BY er\.id[\s\S]*?FOR UPDATE/
    );

    expect(resolutionFunction).toMatch(
      /IF v_report\.status IS DISTINCT FROM 'resolved' THEN[\s\S]*?v_unresolved_count := v_unresolved_count \+ 1/
    );
  });

  test('rejects conflicting operational assignments by distinct team identity', () => {
    expect(resolutionFunction).toMatch(
      /COUNT\(DISTINCT er\.assigned_team_id\)/
    );

    expect(resolutionFunction).toMatch(
      /v_distinct_assigned_team_count = 0/
    );

    expect(resolutionFunction).toMatch(
      /v_distinct_assigned_team_count > 1/
    );

    expect(resolutionFunction).toMatch(
      /'status',\s*'assignment_integrity_violation'/
    );
  });

  test('requires an active same-organization assigned team and authorized responder', () => {
    expect(resolutionFunction).toMatch(
      /FROM public\.rescue_teams[\s\S]*?id = v_assigned_team_id[\s\S]*?organization_id = p_organization_id[\s\S]*?is_active = true/
    );

    expect(resolutionFunction).toMatch(
      /u\.id = p_actor_user_id[\s\S]*?u\.organization_id = p_organization_id[\s\S]*?u\.role = 'responder'/
    );

    expect(resolutionFunction).toMatch(
      /v_team\.team_leader_id = u\.id[\s\S]*?OR EXISTS[\s\S]*?FROM public\.team_members/
    );

    expect(resolutionFunction).toMatch(/'status', 'not_authorized'/);
  });

  test('requires an authoritative assigned-team report to be responding before first resolution', () => {
    expect(resolutionFunction).toMatch(
      /er\.assigned_team_id = v_assigned_team_id[\s\S]*?er\.status = 'responding'/
    );

    expect(resolutionFunction).toMatch(/'status', 'not_responding'/);
  });

  test('resolves every unresolved current member of the operational incident atomically', () => {
    expect(resolutionFunction).toMatch(
      /UPDATE public\.emergency_reports er[\s\S]*?status = 'resolved'[\s\S]*?resolved_at = pg_catalog\.now\(\)[\s\S]*?resolved_by = p_actor_user_id/
    );

    expect(resolutionFunction).toMatch(
      /WHERE er\.organization_id = p_organization_id[\s\S]*?COALESCE\(er\.cluster_id, er\.id\) = v_operational_id[\s\S]*?er\.status IS DISTINCT FROM 'resolved'/
    );

    expect(resolutionFunction).toMatch(
      /GET DIAGNOSTICS v_resolved_count = ROW_COUNT/
    );
  });

  test('is idempotent after all operational members are resolved and returns the requested report', () => {
    expect(resolutionFunction).toMatch(
      /IF v_unresolved_count = 0 THEN[\s\S]*?'status', 'already_resolved'[\s\S]*?'resolved_count', 0[\s\S]*?'report', v_result_report/
    );
  });

  test('keeps resolution notes on the requested report rather than copying them to siblings', () => {
    expect(resolutionFunction).toMatch(
      /UPDATE public\.emergency_reports[\s\S]*?notes = p_notes[\s\S]*?WHERE id = p_report_id[\s\S]*?organization_id = p_organization_id/
    );

    expect(resolutionFunction).not.toMatch(
      /IF p_notes IS NOT NULL THEN/
    );
  });

  test('returns the authoritative requested report after successful resolution', () => {
    expect(resolutionFunction).toMatch(
      /SELECT to_jsonb\(er\)[\s\S]*?INTO v_result_report[\s\S]*?WHERE er\.id = p_report_id[\s\S]*?er\.organization_id = p_organization_id/
    );

    expect(resolutionFunction).toMatch(
      /'status', 'resolved'[\s\S]*?'resolved_count', v_resolved_count[\s\S]*?'report', v_result_report/
    );
  });

  test('RPC is service_role-only and uses a fixed search path', () => {
    expect(migration).toMatch(/SECURITY DEFINER/);
    expect(migration).toMatch(/SET search_path = pg_catalog, public/);

    expect(migration).toMatch(
      /REVOKE ALL[\s\S]*?ON FUNCTION public\.resolve_operational_incident_atomic\(uuid, uuid, uuid, text\)[\s\S]*?FROM PUBLIC/
    );

    expect(migration).toMatch(
      /REVOKE ALL[\s\S]*?ON FUNCTION public\.resolve_operational_incident_atomic\(uuid, uuid, uuid, text\)[\s\S]*?FROM anon/
    );

    expect(migration).toMatch(
      /REVOKE ALL[\s\S]*?ON FUNCTION public\.resolve_operational_incident_atomic\(uuid, uuid, uuid, text\)[\s\S]*?FROM authenticated/
    );

    expect(migration).toMatch(
      /GRANT EXECUTE[\s\S]*?ON FUNCTION public\.resolve_operational_incident_atomic\(uuid, uuid, uuid, text\)[\s\S]*?TO service_role/
    );
  });

  test('documents the remaining real PostgreSQL concurrency verification requirement', () => {
    expect(migration).toContain(
      'Requires real PostgreSQL concurrency verification before production promotion.'
    );
  });
});
