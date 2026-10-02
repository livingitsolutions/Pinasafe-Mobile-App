-- Persist capture metadata per evidence item. Existing evidence remains NULL.
ALTER TABLE public.report_evidence
  ADD COLUMN capture_latitude double precision,
  ADD COLUMN capture_longitude double precision,
  ADD COLUMN capture_accuracy double precision,
  ADD COLUMN captured_at timestamptz;

ALTER TABLE public.report_evidence
  ADD CONSTRAINT report_evidence_capture_latitude_range
    CHECK (capture_latitude IS NULL OR capture_latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT report_evidence_capture_longitude_range
    CHECK (capture_longitude IS NULL OR capture_longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT report_evidence_capture_accuracy_nonnegative
    CHECK (
      capture_accuracy IS NULL
      OR (
        capture_accuracy >= 0
        AND capture_accuracy NOT IN (
          'NaN'::double precision,
          'Infinity'::double precision,
          '-Infinity'::double precision
        )
      )
    ),
  ADD CONSTRAINT report_evidence_capture_location_complete
    CHECK (
      (capture_latitude IS NULL) = (capture_longitude IS NULL)
      AND (capture_latitude IS NULL) = (captured_at IS NULL)
    );

CREATE OR REPLACE FUNCTION public.prevent_bound_capture_location_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF (OLD.status = 'bound' OR NEW.status = 'bound')
    AND ROW(
      NEW.capture_latitude,
      NEW.capture_longitude,
      NEW.capture_accuracy,
      NEW.captured_at
    ) IS DISTINCT FROM ROW(
      OLD.capture_latitude,
      OLD.capture_longitude,
      OLD.capture_accuracy,
      OLD.captured_at
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BOUND_EVIDENCE_CAPTURE_LOCATION_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.prevent_bound_capture_location_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_bound_capture_location_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_bound_capture_location_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_bound_capture_location_mutation() FROM authenticated;

CREATE TRIGGER trigger_prevent_bound_capture_location_mutation
  BEFORE UPDATE ON public.report_evidence
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_bound_capture_location_mutation();

DROP FUNCTION public.finalize_report_evidence_upload(
  uuid,
  uuid,
  uuid,
  integer,
  integer,
  text,
  numeric,
  text,
  text
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
  p_captured_at timestamptz
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

  IF NOT FOUND OR v_evidence.status <> 'uploading' THEN
    RETURN 'FINALIZATION_INVALID';
  END IF;

  IF p_width IS NULL OR p_width <= 0
    OR p_height IS NULL OR p_height <= 0
    OR p_classification_label IS NULL
    OR p_classification_label NOT IN ('fire', 'road')
    OR (p_classification_confidence IS NOT NULL
      AND (p_classification_confidence < 0 OR p_classification_confidence > 1))
    OR (p_classification_reason IS NOT NULL
      AND char_length(p_classification_reason) > 1000)
    OR (p_classification_caption IS NOT NULL
      AND char_length(p_classification_caption) > 1000)
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
  THEN
    RETURN 'FINALIZATION_INVALID';
  END IF;

  UPDATE public.report_evidence AS evidence_row
  SET
    width = p_width,
    height = p_height,
    classification_label = p_classification_label,
    classification_status = 'valid',
    classification_action = 'accept',
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
    AND evidence_row.status = 'uploading';

  IF NOT FOUND THEN
    RETURN 'FINALIZATION_INVALID';
  END IF;

  RETURN 'FINALIZED';
END;
$function$;

ALTER FUNCTION public.finalize_report_evidence_upload(
  uuid, uuid, uuid, integer, integer, text, numeric, text, text,
  double precision, double precision, double precision, timestamptz
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.finalize_report_evidence_upload(
  uuid, uuid, uuid, integer, integer, text, numeric, text, text,
  double precision, double precision, double precision, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_report_evidence_upload(
  uuid, uuid, uuid, integer, integer, text, numeric, text, text,
  double precision, double precision, double precision, timestamptz
) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_report_evidence_upload(
  uuid, uuid, uuid, integer, integer, text, numeric, text, text,
  double precision, double precision, double precision, timestamptz
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_report_evidence_upload(
  uuid, uuid, uuid, integer, integer, text, numeric, text, text,
  double precision, double precision, double precision, timestamptz
) TO service_role;