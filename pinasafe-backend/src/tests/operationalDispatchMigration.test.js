const fs = require('fs');
const path = require('path');

describe('atomic operational dispatch migration contract', () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, '../../../supabase/migrations/20261006000200_create_atomic_operational_dispatch_assignment.sql'),
    'utf8'
  );
  const dispatchFunction = migration.split('CREATE OR REPLACE FUNCTION public.assign_emergency_report_team_atomic')[1]
    .split('CREATE OR REPLACE FUNCTION public.set_emergency_report_cluster_atomic')[0];
  const membershipFunction = migration.split('CREATE OR REPLACE FUNCTION public.set_emergency_report_cluster_atomic')[1]
    .split('REVOKE ALL ON FUNCTION public.lock_operational_groups')[0];
  const clusteringService = fs.readFileSync(
    path.resolve(__dirname, '../services/incidentClusteringService.js'),
    'utf8'
  );

  test('dispatch and membership mutation share organization-scoped group locking', () => {
    expect(migration).toMatch(/pg_catalog\.pg_advisory_xact_lock/);
    expect(dispatchFunction).toMatch(/public\.lock_operational_groups\(p_organization_id, ARRAY\[v_group_id\]\)/);
    expect(membershipFunction).toMatch(/public\.lock_operational_groups\(\s*p_organization_id,\s*ARRAY\[v_source_group_id, v_target_group_id\]/);
    expect(migration).toMatch(/p_organization_id::text \|\| ':' \|\| groups\.group_id::text/);
    expect(migration).toMatch(/ORDER BY lock_id/);
    expect(membershipFunction).toMatch(/v_source_group_id := coalesce\(v_initial_report\.cluster_id, v_initial_report\.id\)/);
    expect(membershipFunction).toMatch(/v_target_group_id := p_target_cluster_id/);
  });

  test('writes audit and lifecycle fields only to the selected pending report', () => {
    expect(dispatchFunction).toMatch(/report\.id = p_report_id/);
    expect(dispatchFunction).toMatch(/report\.organization_id = p_organization_id/);
    expect(dispatchFunction).toMatch(/report\.status = 'pending'/);
    expect(dispatchFunction).toMatch(/report\.assigned_team_id IS NULL/);
    expect(dispatchFunction).toMatch(/assigned_by = p_assigned_by/);
    expect(dispatchFunction).toMatch(/status = 'dispatched'/);
    expect(dispatchFunction).toMatch(/FROM public\.emergency_reports\s+WHERE id = p_report_id\s+FOR UPDATE/);
    expect(dispatchFunction).toMatch(/coalesce\(v_report\.cluster_id, v_report\.id\) IS DISTINCT FROM v_group_id/);
    expect(dispatchFunction).toMatch(/ORDER BY personnel\.id\s+LIMIT 1\s+FOR SHARE/);
    expect(dispatchFunction).toMatch(/personnel\.personnel_role = 'rescue_member'/);
    expect(dispatchFunction).toMatch(/personnel\.is_active = true/);
    expect(dispatchFunction).toMatch(/personnel\.team_id = p_team_id/);
  });

  test.each([
    ['unassigned report into unassigned cluster', false, 0, false],
    ['unassigned report into assigned cluster', false, 1, false],
    ['assigned report into unassigned cluster', true, 0, false],
    ['assigned report into assigned cluster', true, 1, true],
  ])('%s follows the assigned-to-assigned-only rejection rule', (_label, reportAssigned, assignedTargetCount, rejected) => {
    const membershipRejectsOnlyAssignedMerge = reportAssigned && assignedTargetCount > 0;
    expect(membershipFunction).toMatch(/IF v_report\.assigned_team_id IS NOT NULL AND EXISTS/);
    expect(membershipFunction).toMatch(/target_report\.assigned_team_id IS NOT NULL/);
    expect(membershipFunction).toMatch(/target_report\.id <> p_report_id/);
    expect(membershipRejectsOnlyAssignedMerge).toBe(rejected);
  });

  test('membership mutation re-reads source and target state after locking and only writes cluster_id', () => {
    expect(membershipFunction).toMatch(/SELECT \*\s+INTO v_initial_report[\s\S]*?PERFORM public\.lock_operational_groups[\s\S]*?SELECT \*\s+INTO v_report[\s\S]*?FOR UPDATE/);
    expect(membershipFunction).toMatch(/coalesce\(v_report\.cluster_id, v_report\.id\) IS DISTINCT FROM v_source_group_id/);
    expect(membershipFunction).toMatch(/target_report\.id = p_target_cluster_id\s+AND target_report\.organization_id = p_organization_id/);
    expect(membershipFunction).toMatch(/coalesce\(target_report\.cluster_id, target_report\.id\) = v_target_group_id/);
    expect(membershipFunction).toMatch(/target_report\.status <> 'resolved'/);
    expect(membershipFunction).toMatch(/SET cluster_id = p_target_cluster_id/);
    expect(membershipFunction).not.toMatch(/SET[^;]*(status|assigned_team_id|description|evidence)/i);
  });

  test('RPC execution is service_role-only and functions use a fixed search path', () => {
    expect(migration).toMatch(/SET search_path = pg_catalog, public/g);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.assign_emergency_report_team_atomic[\s\S]*?FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.set_emergency_report_cluster_atomic[\s\S]*?FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.assign_emergency_report_team_atomic[\s\S]*?TO service_role/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.set_emergency_report_cluster_atomic[\s\S]*?TO service_role/);
  });

  test('documents required real PostgreSQL race coverage', () => {
    for (const scenario of [
      'dispatch-vs-dispatch in one cluster',
      'unclustered dispatch-vs-merge into an',
      'rejection of assigned-to-assigned merge',
      'assigned+unassigned and unassigned+assigned merges',
      'dispatch-vs-merge into an unassigned group',
      'inverse moves without deadlock',
      'readiness-row deactivation-vs-dispatch'
    ]) {
      expect(migration).toContain(scenario);
    }
  });

  test('production clustering service routes both cluster writes through the atomic RPC', () => {
    expect(clusteringService).toMatch(/rpc\(\s*'set_emergency_report_cluster_atomic'/);
    expect(clusteringService).not.toMatch(/\.update\(\s*\{\s*cluster_id\s*:/);
  });
});
