-- V3 evidence roles. NULL roles are retained for V2 historical evidence.
ALTER TABLE public.report_evidence
  ADD COLUMN evidence_role text;

ALTER TABLE public.report_evidence
  ADD CONSTRAINT report_evidence_evidence_role
    CHECK (evidence_role IS NULL OR evidence_role IN ('primary', 'supplementary'));

ALTER TABLE public.report_evidence
  DROP CONSTRAINT report_evidence_classification_by_status;

ALTER TABLE public.report_evidence
  ADD CONSTRAINT report_evidence_classification_by_status
    CHECK (
      (status = 'uploading'
        AND classification_label IS NULL
        AND classification_status IS NULL
        AND classification_action IS NULL
        AND classification_confidence IS NULL
        AND classification_reason IS NULL
        AND classification_caption IS NULL)
      OR
      (status IN ('accepted', 'bound', 'expired')
        AND (
          (evidence_role IS DISTINCT FROM 'supplementary'
            AND classification_label IN ('fire', 'road')
            AND classification_status = 'valid'
            AND classification_action = 'accept')
          OR
          (evidence_role = 'supplementary'
            AND classification_label IS NULL
            AND classification_status IS NULL
            AND classification_action IS NULL
            AND classification_confidence IS NULL
            AND classification_reason IS NULL
            AND classification_caption IS NULL)
        ))
    );

CREATE UNIQUE INDEX report_evidence_one_v3_primary_per_session
  ON public.report_evidence(upload_session_id)
  WHERE evidence_role = 'primary';

CREATE OR REPLACE FUNCTION public.prevent_finalized_evidence_metadata_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF OLD.status <> 'uploading'
    AND ROW(
      NEW.evidence_role,
      NEW.capture_latitude,
      NEW.capture_longitude,
      NEW.capture_accuracy,
      NEW.captured_at
    ) IS DISTINCT FROM ROW(
      OLD.evidence_role,
      OLD.capture_latitude,
      OLD.capture_longitude,
      OLD.capture_accuracy,
      OLD.captured_at
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FINALIZED_EVIDENCE_METADATA_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.prevent_finalized_evidence_metadata_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_finalized_evidence_metadata_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_finalized_evidence_metadata_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_finalized_evidence_metadata_mutation() FROM authenticated;

CREATE TRIGGER trigger_prevent_finalized_evidence_metadata_mutation
  BEFORE UPDATE ON public.report_evidence
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_finalized_evidence_metadata_mutation();

DROP FUNCTION public.reserve_report_evidence(
  uuid, uuid, uuid, text, text, text, integer
);

CREATE FUNCTION public.reserve_report_evidence(
  p_session_id uuid,
  p_owner_user_id uuid,
  p_evidence_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_mime_type text,
  p_byte_size integer,
  p_evidence_role text
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_session public.evidence_upload_sessions%ROWTYPE;
  v_capacity_count bigint;
BEGIN
  IF p_evidence_id IS NULL
    OR p_storage_bucket IS NULL
    OR length(btrim(p_storage_bucket)) = 0
    OR p_storage_path IS DISTINCT FROM
      ('evidence/' || p_session_id::text || '/' || p_evidence_id::text || '.jpg')
    OR p_mime_type IS DISTINCT FROM 'image/jpeg'
    OR p_byte_size IS NULL
    OR p_byte_size < 1
    OR p_byte_size > 5242880
    OR p_evidence_role IS NULL
    OR p_evidence_role NOT IN ('primary', 'supplementary')
  THEN
    RETURN 'RESERVATION_CONFLICT';
  END IF;

  SELECT session_row.*
  INTO v_session
  FROM public.evidence_upload_sessions AS session_row
  WHERE session_row.id = p_session_id
    AND session_row.owner_user_id = p_owner_user_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_session.status <> 'active'
    OR v_session.expires_at <= clock_timestamp()
  THEN
    RETURN 'SESSION_UNAVAILABLE';
  END IF;

  SELECT count(*)
  INTO v_capacity_count
  FROM public.report_evidence AS evidence_row
  WHERE evidence_row.upload_session_id = p_session_id
    AND evidence_row.status IN ('uploading', 'accepted', 'bound');

  IF v_capacity_count >= 5 THEN
    RETURN 'CAPACITY_REACHED';
  END IF;

  BEGIN
    INSERT INTO public.report_evidence (
      id,
      upload_session_id,
      emergency_report_id,
      uploader_user_id,
      storage_bucket,
      storage_path,
      mime_type,
      byte_size,
      width,
      height,
      classification_label,
      classification_status,
      classification_action,
      classification_confidence,
      classification_reason,
      classification_caption,
      evidence_role,
      status,
      accepted_at,
      bound_at,
      expires_at
    )
    VALUES (
      p_evidence_id,
      p_session_id,
      NULL,
      p_owner_user_id,
      p_storage_bucket,
      p_storage_path,
      p_mime_type,
      p_byte_size,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      p_evidence_role,
      'uploading',
      NULL,
      NULL,
      v_session.expires_at
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN 'RESERVATION_CONFLICT';
  END;

  RETURN 'RESERVED';
END;
$function$;

ALTER FUNCTION public.reserve_report_evidence(
  uuid, uuid, uuid, text, text, text, integer, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reserve_report_evidence(
  uuid, uuid, uuid, text, text, text, integer, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_report_evidence(
  uuid, uuid, uuid, text, text, text, integer, text
) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_report_evidence(
  uuid, uuid, uuid, text, text, text, integer, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_report_evidence(
  uuid, uuid, uuid, text, text, text, integer, text
) TO service_role;

DROP FUNCTION public.finalize_report_evidence_upload(
  uuid, uuid, uuid, integer, integer, text, numeric, text, text,
  double precision, double precision, double precision, timestamptz
);

CREATE FUNCTION public.finalize_report_evidence_upload(
  p_session_id uuid,
  p_owner_user_id uuid,
  p_evidence_id uuid,
  p_width integer,
  p_height integer,
  p_classification_label text,
  p_classification_confidence numeric,
  p_classification_reason text,
  p_classification_caption text,
  p_capture_latitude double precision,
  p_capture_longitude double precision,
  p_capture_accuracy double precision,
  p_captured_at timestamptz,
  p_evidence_role text
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_session public.evidence_upload_sessions%ROWTYPE;
  v_evidence public.report_evidence%ROWTYPE;
BEGIN
  SELECT session_row.*
  INTO v_session
  FROM public.evidence_upload_sessions AS session_row
  WHERE session_row.id = p_session_id
    AND session_row.owner_user_id = p_owner_user_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_session.status <> 'active'
    OR v_session.expires_at <= clock_timestamp()
  THEN
    RETURN 'SESSION_UNAVAILABLE';
  END IF;

  SELECT evidence_row.*
  INTO v_evidence
  FROM public.report_evidence AS evidence_row
  WHERE evidence_row.id = p_evidence_id
    AND evidence_row.upload_session_id = p_session_id
    AND evidence_row.uploader_user_id = p_owner_user_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_evidence.status <> 'uploading'
    OR v_evidence.evidence_role IS DISTINCT FROM p_evidence_role
  THEN
    RETURN 'FINALIZATION_INVALID';
  END IF;

  IF p_width IS NULL OR p_width <= 0
    OR p_height IS NULL OR p_height <= 0
    OR p_evidence_role NOT IN ('primary', 'supplementary')
    OR p_capture_latitude IS NULL
    OR p_capture_latitude NOT BETWEEN -90 AND 90
    OR p_capture_longitude IS NULL
    OR p_capture_longitude NOT BETWEEN -180 AND 180
    OR p_captured_at IS NULL
    OR (p_capture_accuracy IS NOT NULL AND (
      p_capture_accuracy < 0
      OR p_capture_accuracy IN (
        'NaN'::double precision,
        'Infinity'::double precision,
        '-Infinity'::double precision
      )
    ))
    OR (p_evidence_role = 'primary' AND (
      p_classification_label IS NULL
      OR p_classification_label NOT IN ('fire', 'road')
      OR (p_classification_confidence IS NOT NULL
        AND (p_classification_confidence < 0 OR p_classification_confidence > 1))
      OR (p_classification_reason IS NOT NULL
        AND char_length(p_classification_reason) > 1000)
      OR (p_classification_caption IS NOT NULL
        AND char_length(p_classification_caption) > 1000)
    ))
    OR (p_evidence_role = 'supplementary' AND (
      p_classification_label IS NOT NULL
      OR p_classification_confidence IS NOT NULL
      OR p_classification_reason IS NOT NULL
      OR p_classification_caption IS NOT NULL
    ))
  THEN
    RETURN 'FINALIZATION_INVALID';
  END IF;

  UPDATE public.report_evidence AS evidence_row
  SET
    width = p_width,
    height = p_height,
    classification_label = p_classification_label,
    classification_status = CASE WHEN p_evidence_role = 'primary' THEN 'valid' ELSE NULL END,
    classification_action = CASE WHEN p_evidence_role = 'primary' THEN 'accept' ELSE NULL END,
    classification_confidence = p_classification_confidence,
    classification_reason = p_classification_reason,
    classification_caption = p_classification_caption,
    capture_latitude = p_capture_latitude,
    capture_longitude = p_capture_longitude,
    capture_accuracy = p_capture_accuracy,
    captured_at = p_captured_at,
    status = 'accepted',
    accepted_at = clock_timestamp()
  WHERE evidence_row.id = p_evidence_id
    AND evidence_row.upload_session_id = p_session_id
    AND evidence_row.uploader_user_id = p_owner_user_id
    AND evidence_row.evidence_role = p_evidence_role
    AND evidence_row.status = 'uploading';

  IF NOT FOUND THEN
    RETURN 'FINALIZATION_INVALID';
  END IF;

  RETURN 'FINALIZED';
END;
$function$;

ALTER FUNCTION public.finalize_report_evidence_upload(
  uuid, uuid, uuid, integer, integer, text, numeric, text, text,
  double precision, double precision, double precision, timestamptz, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finalize_report_evidence_upload(
  uuid, uuid, uuid, integer, integer, text, numeric, text, text,
  double precision, double precision, double precision, timestamptz, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_report_evidence_upload(
  uuid, uuid, uuid, integer, integer, text, numeric, text, text,
  double precision, double precision, double precision, timestamptz, text
) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_report_evidence_upload(
  uuid, uuid, uuid, integer, integer, text, numeric, text, text,
  double precision, double precision, double precision, timestamptz, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_report_evidence_upload(
  uuid, uuid, uuid, integer, integer, text, numeric, text, text,
  double precision, double precision, double precision, timestamptz, text
) TO service_role;

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
  v_primary_count bigint;
  v_supplementary_count bigint;
  v_unroled_count bigint;
  v_updated_count bigint;
  v_constraint_name text;
  v_bound_at timestamptz;
  v_primary_latitude double precision;
  v_primary_longitude double precision;
  v_v3_roles boolean;
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
    OR p_upload_session_id IS NULL
    OR p_latitude IS NULL
    OR p_longitude IS NULL
    OR p_latitude NOT BETWEEN -90 AND 90
    OR p_longitude NOT BETWEEN -180 AND 180
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_INVALID_REPORT';
  END IF;

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

  SELECT report_row.*
  INTO v_report
  FROM public.emergency_reports AS report_row
  WHERE report_row.id = p_report_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_report.reported_by IS DISTINCT FROM p_reporter_id
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

    SELECT
      count(*),
      count(*) FILTER (WHERE evidence_row.evidence_role = 'primary'),
      count(*) FILTER (WHERE evidence_row.evidence_role = 'supplementary'),
      count(*) FILTER (WHERE evidence_row.evidence_role IS NULL),
      bool_or(evidence_row.evidence_role IS NOT NULL)
    INTO v_evidence_count, v_primary_count, v_supplementary_count, v_unroled_count, v_v3_roles
    FROM public.report_evidence AS evidence_row
    WHERE evidence_row.upload_session_id = p_upload_session_id;

    IF v_evidence_count < 1 OR v_evidence_count > 5 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_EVIDENCE_CAPACITY_INVALID';
    END IF;

    IF v_v3_roles THEN
      IF v_primary_count <> 1 OR v_supplementary_count > 4 OR v_unroled_count <> 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_PRIMARY_EVIDENCE_INVALID';
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
            OR evidence_row.capture_latitude IS NULL
            OR evidence_row.capture_longitude IS NULL
            OR evidence_row.captured_at IS NULL
            OR (evidence_row.evidence_role = 'primary' AND (
              evidence_row.classification_status IS DISTINCT FROM 'valid'
              OR evidence_row.classification_action IS DISTINCT FROM 'accept'
              OR evidence_row.classification_label IS DISTINCT FROM p_type
            ))
            OR (evidence_row.evidence_role = 'supplementary' AND (
              evidence_row.classification_label IS NOT NULL
              OR evidence_row.classification_status IS NOT NULL
              OR evidence_row.classification_action IS NOT NULL
              OR evidence_row.classification_confidence IS NOT NULL
              OR evidence_row.classification_reason IS NOT NULL
              OR evidence_row.classification_caption IS NOT NULL
            ))
          )
      ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_REPORT_ID_CONFLICT';
      END IF;
    ELSE
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
    END IF;

    RETURN jsonb_build_object('outcome', 'REPLAYED', 'report_id', p_report_id);
  END IF;

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
    SELECT 1 FROM public.report_evidence AS evidence_row
    WHERE evidence_row.upload_session_id = p_upload_session_id
      AND evidence_row.status = 'uploading'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_UPLOAD_IN_PROGRESS';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.report_evidence AS evidence_row
    WHERE evidence_row.upload_session_id = p_upload_session_id
      AND evidence_row.status = 'expired'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_EXPIRED_EVIDENCE_PRESENT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.report_evidence AS evidence_row
    WHERE evidence_row.upload_session_id = p_upload_session_id
      AND evidence_row.status = 'accepted'
      AND evidence_row.uploader_user_id IS DISTINCT FROM p_reporter_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_EVIDENCE_OWNER_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.report_evidence AS evidence_row
    WHERE evidence_row.upload_session_id = p_upload_session_id
      AND (
        evidence_row.status = 'bound'
        OR (evidence_row.status = 'accepted'
          AND (evidence_row.emergency_report_id IS NOT NULL OR evidence_row.bound_at IS NOT NULL))
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_EVIDENCE_ALREADY_BOUND';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE evidence_row.evidence_role = 'primary'),
    count(*) FILTER (WHERE evidence_row.evidence_role = 'supplementary'),
    count(*) FILTER (WHERE evidence_row.evidence_role IS NULL),
    bool_or(evidence_row.evidence_role IS NOT NULL)
  INTO v_accepted_count, v_primary_count, v_supplementary_count, v_unroled_count, v_v3_roles
  FROM public.report_evidence AS evidence_row
  WHERE evidence_row.upload_session_id = p_upload_session_id
    AND evidence_row.status = 'accepted';

  IF v_accepted_count = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_NO_ACCEPTED_EVIDENCE';
  END IF;

  IF v_accepted_count > 5 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_EVIDENCE_CAPACITY_INVALID';
  END IF;

  IF NOT v_v3_roles
    OR v_primary_count <> 1
    OR v_supplementary_count > 4
    OR v_unroled_count <> 0
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_PRIMARY_EVIDENCE_INVALID';
  END IF;

  SELECT evidence_row.capture_latitude, evidence_row.capture_longitude
  INTO v_primary_latitude, v_primary_longitude
  FROM public.report_evidence AS evidence_row
  WHERE evidence_row.upload_session_id = p_upload_session_id
    AND evidence_row.evidence_role = 'primary'
    AND evidence_row.status = 'accepted';

  IF v_primary_latitude IS NULL
    OR v_primary_longitude IS NULL
    OR p_latitude IS DISTINCT FROM v_primary_latitude
    OR p_longitude IS DISTINCT FROM v_primary_longitude
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_PRIMARY_EVIDENCE_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.report_evidence AS evidence_row
    WHERE evidence_row.upload_session_id = p_upload_session_id
      AND evidence_row.status = 'accepted'
      AND (
        evidence_row.accepted_at IS NULL
        OR evidence_row.capture_latitude IS NULL
        OR evidence_row.capture_longitude IS NULL
        OR evidence_row.captured_at IS NULL
        OR (evidence_row.evidence_role = 'primary' AND (
          evidence_row.classification_status IS DISTINCT FROM 'valid'
          OR evidence_row.classification_action IS DISTINCT FROM 'accept'
          OR evidence_row.classification_label IS DISTINCT FROM p_type
        ))
        OR (evidence_row.evidence_role = 'supplementary' AND (
          evidence_row.classification_label IS NOT NULL
          OR evidence_row.classification_status IS NOT NULL
          OR evidence_row.classification_action IS NOT NULL
          OR evidence_row.classification_confidence IS NOT NULL
          OR evidence_row.classification_reason IS NOT NULL
          OR evidence_row.classification_caption IS NOT NULL
        ))
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_INVALID_CLASSIFICATION';
  END IF;

  BEGIN
    INSERT INTO public.emergency_reports (
      id, reported_by, type, title, description, location, latitude, longitude,
      contact_number, priority, evidence_photos, ai_classification, use_ai_classification
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

  v_bound_at := clock_timestamp();

  UPDATE public.evidence_upload_sessions AS session_row
  SET status = 'bound', emergency_report_id = p_report_id, bound_at = v_bound_at
  WHERE session_row.id = p_upload_session_id
    AND session_row.owner_user_id = p_reporter_id
    AND session_row.status = 'active'
    AND session_row.emergency_report_id IS NULL
    AND session_row.bound_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_SESSION_UNAVAILABLE';
  END IF;

  UPDATE public.report_evidence AS evidence_row
  SET status = 'bound', emergency_report_id = p_report_id, bound_at = v_bound_at
  WHERE evidence_row.upload_session_id = p_upload_session_id
    AND evidence_row.uploader_user_id = p_reporter_id
    AND evidence_row.status = 'accepted';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> v_accepted_count THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BINDING_EVIDENCE_ALREADY_BOUND';
  END IF;

  RETURN jsonb_build_object('outcome', 'CREATED', 'report_id', p_report_id);
END;
$function$;

ALTER FUNCTION public.create_emergency_report_with_evidence(
  uuid, uuid, text, text, text, numeric, numeric, text, text, uuid, jsonb, jsonb, boolean
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_emergency_report_with_evidence(
  uuid, uuid, text, text, text, numeric, numeric, text, text, uuid, jsonb, jsonb, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_emergency_report_with_evidence(
  uuid, uuid, text, text, text, numeric, numeric, text, text, uuid, jsonb, jsonb, boolean
) FROM anon;
REVOKE ALL ON FUNCTION public.create_emergency_report_with_evidence(
  uuid, uuid, text, text, text, numeric, numeric, text, text, uuid, jsonb, jsonb, boolean
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_emergency_report_with_evidence(
  uuid, uuid, text, text, text, numeric, numeric, text, text, uuid, jsonb, jsonb, boolean
) TO service_role;