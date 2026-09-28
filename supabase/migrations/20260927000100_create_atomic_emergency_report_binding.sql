-- PinaSafe B4.1 atomic emergency report creation and durable evidence binding.
-- Report triggers remain the authority for organization routing and alerts.

CREATE OR REPLACE FUNCTION public.prevent_bound_report_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_session public.evidence_upload_sessions%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT session_row.*
    INTO v_session
    FROM public.evidence_upload_sessions AS session_row
    WHERE session_row.id = NEW.upload_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EVIDENCE_SESSION_UNAVAILABLE';
    END IF;

    IF v_session.owner_user_id IS DISTINCT FROM NEW.uploader_user_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EVIDENCE_SESSION_OWNER_MISMATCH';
    END IF;

    IF v_session.status = 'bound' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BOUND_EVIDENCE_IMMUTABLE';
    END IF;

    IF v_session.status <> 'active'
      OR v_session.expires_at <= clock_timestamp()
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EVIDENCE_SESSION_UNAVAILABLE';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'bound' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BOUND_EVIDENCE_IMMUTABLE';
    END IF;

    RETURN OLD;
  END IF;

  IF OLD.status = 'bound'
    AND ROW(
      NEW.id,
      NEW.upload_session_id,
      NEW.emergency_report_id,
      NEW.uploader_user_id,
      NEW.storage_bucket,
      NEW.storage_path,
      NEW.mime_type,
      NEW.byte_size,
      NEW.width,
      NEW.height,
      NEW.classification_label,
      NEW.classification_status,
      NEW.classification_action,
      NEW.classification_confidence,
      NEW.classification_reason,
      NEW.classification_caption,
      NEW.status,
      NEW.created_at,
      NEW.accepted_at,
      NEW.bound_at,
      NEW.expires_at
    ) IS DISTINCT FROM ROW(
      OLD.id,
      OLD.upload_session_id,
      OLD.emergency_report_id,
      OLD.uploader_user_id,
      OLD.storage_bucket,
      OLD.storage_path,
      OLD.mime_type,
      OLD.byte_size,
      OLD.width,
      OLD.height,
      OLD.classification_label,
      OLD.classification_status,
      OLD.classification_action,
      OLD.classification_confidence,
      OLD.classification_reason,
      OLD.classification_caption,
      OLD.status,
      OLD.created_at,
      OLD.accepted_at,
      OLD.bound_at,
      OLD.expires_at
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BOUND_EVIDENCE_IMMUTABLE';
  END IF;


  SELECT session_row.*
  INTO v_session
  FROM public.evidence_upload_sessions AS session_row
  WHERE session_row.id = NEW.upload_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'EVIDENCE_SESSION_UNAVAILABLE';
  END IF;

  IF v_session.owner_user_id IS DISTINCT FROM NEW.uploader_user_id THEN
    RAISE EXCEPTION USING ERRCODE = 'EVIDENCE_SESSION_OWNER_MISMATCH';
  END IF;

  IF NEW.upload_session_id IS DISTINCT FROM OLD.upload_session_id
    OR NEW.uploader_user_id IS DISTINCT FROM OLD.uploader_user_id
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BOUND_EVIDENCE_IMMUTABLE';
  END IF;

  IF NEW.status = 'bound' THEN
    IF OLD.status IS DISTINCT FROM 'accepted'
      OR OLD.emergency_report_id IS NOT NULL
      OR OLD.bound_at IS NOT NULL
      OR v_session.status IS DISTINCT FROM 'bound'
      OR v_session.emergency_report_id IS NULL
      OR NEW.emergency_report_id IS DISTINCT FROM v_session.emergency_report_id
      OR NEW.bound_at IS NULL
      OR NEW.upload_session_id IS DISTINCT FROM OLD.upload_session_id
      OR NEW.uploader_user_id IS DISTINCT FROM OLD.uploader_user_id
      OR OLD.accepted_at IS NULL
        OR NEW.bound_at IS DISTINCT FROM v_session.bound_at
      OR OLD.accepted_at > v_session.bound_at
      OR OLD.created_at > v_session.bound_at
      OR ROW(
        NEW.id,
        NEW.storage_bucket,
        NEW.storage_path,
        NEW.mime_type,
        NEW.byte_size,
        NEW.width,
        NEW.height,
        NEW.classification_label,
        NEW.classification_status,
        NEW.classification_action,
        NEW.classification_confidence,
        NEW.classification_reason,
        NEW.classification_caption,
        NEW.created_at,
        NEW.accepted_at,
        NEW.expires_at
      ) IS DISTINCT FROM ROW(
        OLD.id,
        OLD.storage_bucket,
        OLD.storage_path,
        OLD.mime_type,
        OLD.byte_size,
        OLD.width,
        OLD.height,
        OLD.classification_label,
        OLD.classification_status,
        OLD.classification_action,
        OLD.classification_confidence,
        OLD.classification_reason,
        OLD.classification_caption,
        OLD.created_at,
        OLD.accepted_at,
        OLD.expires_at
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BOUND_EVIDENCE_IMMUTABLE';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.emergency_report_id IS DISTINCT FROM OLD.emergency_report_id
    OR NEW.bound_at IS DISTINCT FROM OLD.bound_at
    OR v_session.status IS DISTINCT FROM 'active'
    OR v_session.expires_at <= clock_timestamp()
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EVIDENCE_SESSION_UNAVAILABLE';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_prevent_bound_report_evidence_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.report_evidence
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_bound_report_evidence_mutation();

CREATE OR REPLACE FUNCTION public.prevent_bound_evidence_upload_session_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'bound' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BOUND_EVIDENCE_SESSION_IMMUTABLE';
    END IF;

    RETURN OLD;
  END IF;

  IF OLD.status = 'bound'
    AND ROW(
      NEW.id,
      NEW.owner_user_id,
      NEW.status,
      NEW.emergency_report_id,
      NEW.bound_at,
      NEW.created_at,
      NEW.expires_at
    ) IS DISTINCT FROM ROW(
      OLD.id,
      OLD.owner_user_id,
      OLD.status,
      OLD.emergency_report_id,
      OLD.bound_at,
      OLD.created_at,
      OLD.expires_at
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BOUND_EVIDENCE_SESSION_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_prevent_bound_evidence_upload_session_mutation
  BEFORE UPDATE OR DELETE ON public.evidence_upload_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_bound_evidence_upload_session_mutation();

CREATE OR REPLACE FUNCTION public.create_emergency_report_with_evidence(
  p_report_id uuid,
  p_reporter_id uuid,
  p_type text,
  p_description text,
  p_location text,
  p_latitude numeric,
  p_longitude numeric,
  p_contact_number text,
  p_priority text,
  p_upload_session_id uuid,
  p_evidence_photos jsonb,
  p_ai_classification jsonb,
  p_use_ai_classification boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_session public.evidence_upload_sessions%ROWTYPE;
  v_report public.emergency_reports%ROWTYPE;
  v_accepted_count bigint;
  v_evidence_count bigint;
  v_updated_count bigint;
  v_constraint_name text;
  v_bound_at timestamptz;
BEGIN
  IF p_report_id IS NULL
    OR p_reporter_id IS NULL
    OR p_type IS NULL
    OR p_type NOT IN ('road', 'fire')
    OR p_description IS NULL
    OR char_length(btrim(p_description)) NOT BETWEEN 10 AND 1000
    OR p_location IS NULL
    OR char_length(btrim(p_location)) NOT BETWEEN 5 AND 500
    OR p_priority IS NULL
    OR p_priority NOT IN ('low', 'medium', 'high', 'critical')
    OR (p_latitude IS NOT NULL AND (p_latitude < -90 OR p_latitude > 90))
    OR (p_longitude IS NOT NULL AND (p_longitude < -180 OR p_longitude > 180))
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_INVALID_REPORT';
  END IF;

  IF p_upload_session_id IS NOT NULL THEN
    SELECT session_row.*
    INTO v_session
    FROM public.evidence_upload_sessions AS session_row
    WHERE session_row.id = p_upload_session_id
      AND session_row.owner_user_id = p_reporter_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_SESSION_UNAVAILABLE';
    END IF;

    IF v_session.status = 'bound'
      AND v_session.emergency_report_id IS DISTINCT FROM p_report_id
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_SESSION_ALREADY_BOUND';
    END IF;
  END IF;

  SELECT report_row.*
  INTO v_report
  FROM public.emergency_reports AS report_row
  WHERE report_row.id = p_report_id
  FOR UPDATE;

  IF FOUND THEN
    IF p_upload_session_id IS NULL
      OR v_session.owner_user_id IS DISTINCT FROM p_reporter_id
      OR v_report.reported_by IS DISTINCT FROM p_reporter_id
      OR v_report.type IS DISTINCT FROM p_type
      OR v_report.title IS DISTINCT FROM initcap(p_type) || ' Emergency'
      OR v_report.description IS DISTINCT FROM btrim(p_description)
      OR v_report.location IS DISTINCT FROM btrim(p_location)
      OR v_report.latitude IS DISTINCT FROM p_latitude
      OR v_report.longitude IS DISTINCT FROM p_longitude
      OR v_report.contact_number IS DISTINCT FROM p_contact_number
      OR v_report.priority IS DISTINCT FROM p_priority
      OR v_report.evidence_photos IS DISTINCT FROM COALESCE(p_evidence_photos, '[]'::jsonb)
      OR v_report.ai_classification IS DISTINCT FROM p_ai_classification
      OR v_report.use_ai_classification IS DISTINCT FROM COALESCE(p_use_ai_classification, false)
      OR v_session.status IS DISTINCT FROM 'bound'
      OR v_session.emergency_report_id IS DISTINCT FROM p_report_id
      OR v_session.bound_at IS NULL
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_REPORT_ID_CONFLICT';
    END IF;

    SELECT count(*)
    INTO v_evidence_count
    FROM public.report_evidence AS evidence_row
    WHERE evidence_row.upload_session_id = p_upload_session_id;

    IF v_evidence_count < 1 OR v_evidence_count > 5 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_REPORT_ID_CONFLICT';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.report_evidence AS evidence_row
      WHERE evidence_row.upload_session_id = p_upload_session_id
        AND (
          evidence_row.status IS DISTINCT FROM 'bound'
          OR evidence_row.uploader_user_id IS DISTINCT FROM p_reporter_id
          OR evidence_row.emergency_report_id IS DISTINCT FROM p_report_id
          OR evidence_row.bound_at IS NULL
          OR evidence_row.accepted_at IS NULL
          OR evidence_row.classification_status IS DISTINCT FROM 'valid'
          OR evidence_row.classification_action IS DISTINCT FROM 'accept'
          OR evidence_row.classification_label IS DISTINCT FROM p_type
        )
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_REPORT_ID_CONFLICT';
    END IF;

    RETURN jsonb_build_object('outcome', 'REPLAYED', 'report_id', p_report_id);
  END IF;

  IF p_upload_session_id IS NOT NULL THEN
    IF v_session.status = 'expired'
      OR v_session.expires_at <= clock_timestamp()
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_SESSION_EXPIRED';
    END IF;

    IF v_session.status <> 'active'
      OR v_session.emergency_report_id IS NOT NULL
      OR v_session.bound_at IS NOT NULL
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_SESSION_ALREADY_BOUND';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.report_evidence AS evidence_row
      WHERE evidence_row.upload_session_id = p_upload_session_id
        AND evidence_row.status = 'uploading'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_UPLOAD_IN_PROGRESS';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.report_evidence AS evidence_row
      WHERE evidence_row.upload_session_id = p_upload_session_id
        AND evidence_row.status = 'expired'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_EXPIRED_EVIDENCE_PRESENT';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.report_evidence AS evidence_row
      WHERE evidence_row.upload_session_id = p_upload_session_id
        AND evidence_row.status = 'accepted'
        AND evidence_row.uploader_user_id IS DISTINCT FROM p_reporter_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_EVIDENCE_OWNER_MISMATCH';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.report_evidence AS evidence_row
      WHERE evidence_row.upload_session_id = p_upload_session_id
        AND (
          evidence_row.status = 'bound'
          OR (
            evidence_row.status = 'accepted'
            AND (
              evidence_row.emergency_report_id IS NOT NULL
              OR evidence_row.bound_at IS NOT NULL
            )
          )
        )
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_EVIDENCE_ALREADY_BOUND';
    END IF;

    SELECT count(*)
    INTO v_accepted_count
    FROM public.report_evidence AS evidence_row
    WHERE evidence_row.upload_session_id = p_upload_session_id
      AND evidence_row.status = 'accepted';

    IF v_accepted_count = 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_NO_ACCEPTED_EVIDENCE';
    END IF;

    IF v_accepted_count > 5 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_EVIDENCE_CAPACITY_INVALID';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.report_evidence AS evidence_row
      WHERE evidence_row.upload_session_id = p_upload_session_id
        AND evidence_row.status = 'accepted'
        AND (
          evidence_row.accepted_at IS NULL
          OR evidence_row.classification_status IS DISTINCT FROM 'valid'
          OR evidence_row.classification_action IS DISTINCT FROM 'accept'
        )
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_INVALID_CLASSIFICATION';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.report_evidence AS evidence_row
      WHERE evidence_row.upload_session_id = p_upload_session_id
        AND evidence_row.status = 'accepted'
        AND evidence_row.classification_label IS DISTINCT FROM p_type
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_CLASSIFICATION_MISMATCH';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.emergency_reports (
      id,
      reported_by,
      type,
      title,
      description,
      location,
      latitude,
      longitude,
      contact_number,
      priority,
      evidence_photos,
      ai_classification,
      use_ai_classification
    )
    VALUES (
      p_report_id,
      p_reporter_id,
      p_type,
      initcap(p_type) || ' Emergency',
      btrim(p_description),
      btrim(p_location),
      p_latitude,
      p_longitude,
      p_contact_number,
      p_priority,
      COALESCE(p_evidence_photos, '[]'::jsonb),
      p_ai_classification,
      COALESCE(p_use_ai_classification, false)
    );
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name = 'emergency_reports_pkey' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_REPORT_ID_CONFLICT';
      END IF;
      RAISE;
  END;

  IF p_upload_session_id IS NOT NULL THEN
    v_bound_at := clock_timestamp();

    UPDATE public.evidence_upload_sessions AS session_row
    SET
      status = 'bound',
      emergency_report_id = p_report_id,
      bound_at = v_bound_at
    WHERE session_row.id = p_upload_session_id
      AND session_row.owner_user_id = p_reporter_id
      AND session_row.status = 'active'
      AND session_row.emergency_report_id IS NULL
      AND session_row.bound_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_SESSION_UNAVAILABLE';
    END IF;

    UPDATE public.report_evidence AS evidence_row
    SET
      status = 'bound',
      emergency_report_id = p_report_id,
      bound_at = v_bound_at
    WHERE evidence_row.upload_session_id = p_upload_session_id
      AND evidence_row.uploader_user_id = p_reporter_id
      AND evidence_row.status = 'accepted';

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> v_accepted_count THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_EVIDENCE_ALREADY_BOUND';
    END IF;
  END IF;

  RETURN jsonb_build_object('outcome', 'CREATED', 'report_id', p_report_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_emergency_report_with_evidence(uuid, uuid, text, text, text, numeric, numeric, text, text, uuid, jsonb, jsonb, boolean)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_emergency_report_with_evidence(uuid, uuid, text, text, text, numeric, numeric, text, text, uuid, jsonb, jsonb, boolean)
  FROM anon;
REVOKE ALL ON FUNCTION public.create_emergency_report_with_evidence(uuid, uuid, text, text, text, numeric, numeric, text, text, uuid, jsonb, jsonb, boolean)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_emergency_report_with_evidence(uuid, uuid, text, text, text, numeric, numeric, text, text, uuid, jsonb, jsonb, boolean)
  TO service_role;