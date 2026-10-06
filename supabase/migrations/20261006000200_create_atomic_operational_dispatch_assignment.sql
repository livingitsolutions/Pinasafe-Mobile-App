-- Every operation that changes operational grouping or assigns a team uses
-- the same organization/group advisory-lock key. For multi-group moves, lock
-- hashed keys in ascending bigint order. Hash collisions only serialize
-- unrelated operations; they cannot weaken the invariant.
CREATE OR REPLACE FUNCTION public.lock_operational_groups(
  p_organization_id uuid,
  p_group_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_lock_id bigint;
BEGIN
  FOR v_lock_id IN
    SELECT DISTINCT hashtextextended(
      p_organization_id::text || ':' || groups.group_id::text,
      0
    ) AS lock_id
    FROM unnest(p_group_ids) AS groups(group_id)
    WHERE groups.group_id IS NOT NULL
    ORDER BY lock_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_emergency_report_team_atomic(
  p_report_id uuid,
  p_team_id uuid,
  p_organization_id uuid,
  p_assigned_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_initial_report public.emergency_reports%ROWTYPE;
  v_report public.emergency_reports%ROWTYPE;
  v_updated_report public.emergency_reports%ROWTYPE;
  v_group_id uuid;
  v_team_id uuid;
  v_personnel_id uuid;
BEGIN
  SELECT *
  INTO v_initial_report
  FROM public.emergency_reports
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_initial_report.organization_id IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('status', 'organization_mismatch');
  END IF;

  v_group_id := coalesce(v_initial_report.cluster_id, v_initial_report.id);
  PERFORM public.lock_operational_groups(p_organization_id, ARRAY[v_group_id]);

  SELECT *
  INTO v_report
  FROM public.emergency_reports
  WHERE id = p_report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_report.organization_id IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('status', 'organization_mismatch');
  END IF;

  IF coalesce(v_report.cluster_id, v_report.id) IS DISTINCT FROM v_group_id THEN
    RETURN jsonb_build_object('status', 'group_changed');
  END IF;

  IF v_report.status IS DISTINCT FROM 'pending'
    OR v_report.assigned_team_id IS NOT NULL
  THEN
    RETURN jsonb_build_object('status', 'report_not_pending');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.emergency_reports sibling
    WHERE sibling.organization_id = p_organization_id
      AND coalesce(sibling.cluster_id, sibling.id) = v_group_id
      AND sibling.assigned_team_id IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('status', 'operational_assignment_exists');
  END IF;

  SELECT team.id
  INTO v_team_id
  FROM public.rescue_teams team
  WHERE team.id = p_team_id
    AND team.organization_id = p_organization_id
    AND team.is_active = true
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'team_unavailable');
  END IF;

  SELECT personnel.id
  INTO v_personnel_id
  FROM public.personnel personnel
  WHERE personnel.organization_id = p_organization_id
    AND personnel.personnel_role = 'rescue_member'
    AND personnel.is_active = true
    AND personnel.team_id = p_team_id
  ORDER BY personnel.id
  LIMIT 1
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'team_not_ready');
  END IF;

  UPDATE public.emergency_reports report
  SET assigned_team_id = p_team_id,
      assigned_by = p_assigned_by,
      assigned_at = now(),
      status = 'dispatched',
      updated_at = now()
  WHERE report.id = p_report_id
    AND report.organization_id = p_organization_id
    AND report.status = 'pending'
    AND report.assigned_team_id IS NULL
  RETURNING report.* INTO v_updated_report;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'report_not_pending');
  END IF;

  RETURN jsonb_build_object(
    'status', 'assigned',
    'report', to_jsonb(v_updated_report)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_emergency_report_cluster_atomic(
  p_report_id uuid,
  p_target_cluster_id uuid,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_initial_report public.emergency_reports%ROWTYPE;
  v_report public.emergency_reports%ROWTYPE;
  v_updated_report public.emergency_reports%ROWTYPE;
  v_source_group_id uuid;
  v_target_group_id uuid;
BEGIN
  IF p_target_cluster_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_target');
  END IF;

  SELECT *
  INTO v_initial_report
  FROM public.emergency_reports
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_initial_report.organization_id IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('status', 'organization_mismatch');
  END IF;

  v_source_group_id := coalesce(v_initial_report.cluster_id, v_initial_report.id);
  v_target_group_id := p_target_cluster_id;

  -- The shared lock helper serializes source and target groups in one stable
  -- order with dispatch assignments and inverse concurrent moves.
  PERFORM public.lock_operational_groups(
    p_organization_id,
    ARRAY[v_source_group_id, v_target_group_id]
  );

  SELECT *
  INTO v_report
  FROM public.emergency_reports
  WHERE id = p_report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_report.organization_id IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('status', 'organization_mismatch');
  END IF;

  IF coalesce(v_report.cluster_id, v_report.id) IS DISTINCT FROM v_source_group_id THEN
    RETURN jsonb_build_object('status', 'group_changed');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.emergency_reports target_report
    WHERE target_report.id = p_target_cluster_id
      AND target_report.organization_id = p_organization_id
      AND coalesce(target_report.cluster_id, target_report.id) = v_target_group_id
      AND target_report.status <> 'resolved'
  ) THEN
    RETURN jsonb_build_object('status', 'target_unavailable');
  END IF;

  IF v_report.cluster_id IS NOT DISTINCT FROM p_target_cluster_id THEN
    RETURN jsonb_build_object('status', 'unchanged');
  END IF;

  IF v_report.assigned_team_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.emergency_reports target_report
    WHERE target_report.organization_id = p_organization_id
      AND coalesce(target_report.cluster_id, target_report.id) = v_target_group_id
      AND target_report.id <> p_report_id
      AND target_report.assigned_team_id IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('status', 'assignment_conflict');
  END IF;

  UPDATE public.emergency_reports report
  SET cluster_id = p_target_cluster_id
  WHERE report.id = p_report_id
    AND report.organization_id = p_organization_id
    AND report.cluster_id IS NOT DISTINCT FROM v_report.cluster_id
  RETURNING report.* INTO v_updated_report;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'group_changed');
  END IF;

  RETURN jsonb_build_object(
    'status', 'updated',
    'report', to_jsonb(v_updated_report)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lock_operational_groups(uuid, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assign_emergency_report_team_atomic(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_emergency_report_cluster_atomic(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_emergency_report_team_atomic(uuid, uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_emergency_report_cluster_atomic(uuid, uuid, uuid)
  TO service_role;

-- Real PostgreSQL integration coverage required before production rollout:
-- dispatch-vs-dispatch in one cluster; unclustered dispatch-vs-merge into an
-- assigned cluster; rejection of assigned-to-assigned merge; successful
-- assigned+unassigned and unassigned+assigned merges;
-- dispatch-vs-merge into an unassigned group; inverse moves without deadlock;
-- readiness-row deactivation-vs-dispatch with a valid serialized outcome.
