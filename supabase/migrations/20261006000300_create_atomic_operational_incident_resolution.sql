-- PinaSafe V3.6A
-- Atomic terminal resolution for one operational incident.
--
-- Citizen reports remain independent observations. This function only
-- propagates the terminal "resolved" lifecycle state across the current
-- members of the same operational incident.
--
-- IMPORTANT:
-- This migration does not alter dispatch assignment semantics.

ALTER TABLE public.emergency_reports
  ADD COLUMN IF NOT EXISTS resolved_by uuid
  REFERENCES public.users(id)
  ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.resolve_operational_incident_atomic(
  p_report_id uuid,
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_report public.emergency_reports%ROWTYPE;
  v_locked_report public.emergency_reports%ROWTYPE;
  v_operational_id uuid;
  v_locked_operational_id uuid;

  v_assigned_team_id uuid;
  v_distinct_assigned_team_count integer := 0;

  v_team public.rescue_teams%ROWTYPE;
  v_actor_authorized boolean := false;

  v_member_count integer := 0;
  v_unresolved_count integer := 0;
  v_resolved_count integer := 0;
  v_result_report jsonb;
BEGIN
  /*
   * Initial lookup establishes the candidate organization/group.
   * Membership is re-read after taking the operational advisory lock.
   */
  SELECT *
  INTO v_report
  FROM public.emergency_reports
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_report.organization_id IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('status', 'organization_mismatch');
  END IF;

  v_operational_id := COALESCE(v_report.cluster_id, v_report.id);

  /*
   * Use the same lock namespace/order as the accepted V3.5C.3A
   * operational dispatch and membership functions.
   */
  PERFORM public.lock_operational_groups(
    p_organization_id,
    ARRAY[v_operational_id]::uuid[]
  );

  /*
   * Re-read and lock the requested report after acquiring the
   * operational-group advisory lock.
   */
  SELECT *
  INTO v_locked_report
  FROM public.emergency_reports
  WHERE id = p_report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_locked_report.organization_id IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('status', 'organization_mismatch');
  END IF;

  v_locked_operational_id :=
    COALESCE(v_locked_report.cluster_id, v_locked_report.id);

  IF v_locked_operational_id IS DISTINCT FROM v_operational_id THEN
    RETURN jsonb_build_object('status', 'group_changed');
  END IF;

  /*
   * Lock every CURRENT member of the operational group in deterministic
   * order. The query is intentionally consumed by the loop so the row
   * locks remain held for the transaction.
   */
  FOR v_report IN
    SELECT er.*
    FROM public.emergency_reports er
    WHERE er.organization_id = p_organization_id
      AND COALESCE(er.cluster_id, er.id) = v_operational_id
    ORDER BY er.id
    FOR UPDATE
  LOOP
    v_member_count := v_member_count + 1;

    IF v_report.status IS DISTINCT FROM 'resolved' THEN
      v_unresolved_count := v_unresolved_count + 1;
    END IF;
  END LOOP;

  IF v_member_count = 0 THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  /*
   * Operational assignment integrity is based on DISTINCT teams, not on
   * the number of reports carrying that same team assignment.
   */
  SELECT
    COUNT(DISTINCT er.assigned_team_id),
    MIN(er.assigned_team_id::text)::uuid
  INTO
    v_distinct_assigned_team_count,
    v_assigned_team_id
  FROM public.emergency_reports er
  WHERE er.organization_id = p_organization_id
    AND COALESCE(er.cluster_id, er.id) = v_operational_id
    AND er.assigned_team_id IS NOT NULL;

  IF v_distinct_assigned_team_count = 0 OR v_assigned_team_id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_assigned');
  END IF;

  IF v_distinct_assigned_team_count > 1 THEN
    RETURN jsonb_build_object(
      'status',
      'assignment_integrity_violation'
    );
  END IF;

  SELECT *
  INTO v_team
  FROM public.rescue_teams
  WHERE id = v_assigned_team_id
    AND organization_id = p_organization_id
    AND is_active = true
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'team_unavailable');
  END IF;

  /*
   * Resolution remains responder-only. The actor must be the assigned
   * team's leader or a current team member, and must be a responder in
   * the same organization.
   */
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_actor_user_id
      AND u.organization_id = p_organization_id
      AND u.role = 'responder'
      AND (
        v_team.team_leader_id = u.id
        OR EXISTS (
          SELECT 1
          FROM public.team_members tm
          WHERE tm.team_id = v_assigned_team_id
            AND tm.user_id = u.id
        )
      )
  )
  INTO v_actor_authorized;

  IF NOT v_actor_authorized THEN
    RETURN jsonb_build_object('status', 'not_authorized');
  END IF;

  /*
   * Idempotent terminal state. This is checked before requiring an
   * actively responding assignment so a retry after successful
   * resolution returns success without additional writes.
   */
  IF v_unresolved_count = 0 THEN
    SELECT to_jsonb(er)
    INTO v_result_report
    FROM public.emergency_reports er
    WHERE er.id = p_report_id
      AND er.organization_id = p_organization_id;

    RETURN jsonb_build_object(
      'status', 'already_resolved',
      'operational_id', v_operational_id,
      'resolved_count', 0,
      'report', v_result_report
    );
  END IF;

  /*
   * At least one report carrying the authoritative team assignment must
   * be actively responding before the operational incident can close.
   */
  IF NOT EXISTS (
    SELECT 1
    FROM public.emergency_reports er
    WHERE er.organization_id = p_organization_id
      AND COALESCE(er.cluster_id, er.id) = v_operational_id
      AND er.assigned_team_id = v_assigned_team_id
      AND er.status = 'responding'
  ) THEN
    RETURN jsonb_build_object('status', 'not_responding');
  END IF;

  UPDATE public.emergency_reports er
  SET
    status = 'resolved',
    resolved_at = pg_catalog.now(),
    resolved_by = p_actor_user_id,
    updated_at = pg_catalog.now()
  WHERE er.organization_id = p_organization_id
    AND COALESCE(er.cluster_id, er.id) = v_operational_id
    AND er.status IS DISTINCT FROM 'resolved';

  GET DIAGNOSTICS v_resolved_count = ROW_COUNT;

  /*
   * Preserve the existing responder-resolution notes behavior only on
   * the requested authoritative report. NULL intentionally clears the
   * requested report's notes, while sibling citizen reports are untouched.
   */
  UPDATE public.emergency_reports
  SET
    notes = p_notes,
    updated_at = pg_catalog.now()
  WHERE id = p_report_id
    AND organization_id = p_organization_id;

  SELECT to_jsonb(er)
  INTO v_result_report
  FROM public.emergency_reports er
  WHERE er.id = p_report_id
    AND er.organization_id = p_organization_id;

  RETURN jsonb_build_object(
    'status', 'resolved',
    'operational_id', v_operational_id,
    'resolved_count', v_resolved_count,
    'report', v_result_report
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.resolve_operational_incident_atomic(uuid, uuid, uuid, text)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.resolve_operational_incident_atomic(uuid, uuid, uuid, text)
FROM anon;

REVOKE ALL
ON FUNCTION public.resolve_operational_incident_atomic(uuid, uuid, uuid, text)
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.resolve_operational_incident_atomic(uuid, uuid, uuid, text)
TO service_role;

COMMENT ON FUNCTION public.resolve_operational_incident_atomic(uuid, uuid, uuid, text)
IS 'Atomically resolves every current member report of one authorized operational incident. Requires real PostgreSQL concurrency verification before production promotion.';
