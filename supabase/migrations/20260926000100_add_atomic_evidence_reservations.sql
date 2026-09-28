-- PWA-1.4B3.4A atomic evidence reservation protocol.
--
-- Reservation serializes on the parent upload-session row. With four
-- capacity-consuming rows, request A locks the session, counts four, inserts
-- the fifth reservation, and commits. Request B waits on that same row lock,
-- then its subsequent READ COMMITTED count sees five and returns capacity
-- reached. Both requests therefore cannot reserve the fifth/sixth slots.
--
-- Storage remains outside PostgreSQL transactions. Keep uploading rows when
-- compensation deletion fails so a later cleanup process retains the object
-- identity; cancellation is only for objects known absent or deleted.

ALTER TABLE public.report_evidence
  ALTER COLUMN width DROP NOT NULL,
  ALTER COLUMN height DROP NOT NULL,
  ALTER COLUMN accepted_at DROP NOT NULL,
  ALTER COLUMN classification_label DROP NOT NULL,
  ALTER COLUMN classification_status DROP NOT NULL,
  ALTER COLUMN classification_action DROP NOT NULL;

ALTER TABLE public.report_evidence
  DROP CONSTRAINT report_evidence_status,
  DROP CONSTRAINT report_evidence_lifecycle,
  DROP CONSTRAINT report_evidence_positive_dimensions,
  DROP CONSTRAINT report_evidence_classification;

ALTER TABLE public.report_evidence
  ADD CONSTRAINT report_evidence_status
    CHECK (status IN ('uploading', 'accepted', 'bound', 'expired')),
  ADD CONSTRAINT report_evidence_lifecycle
    CHECK (
      (status = 'uploading'
        AND emergency_report_id IS NULL
        AND bound_at IS NULL
        AND accepted_at IS NULL)
      OR
      (status = 'accepted'
        AND emergency_report_id IS NULL
        AND bound_at IS NULL
        AND accepted_at IS NOT NULL)
      OR
      (status = 'bound'
        AND emergency_report_id IS NOT NULL
        AND bound_at IS NOT NULL
        AND accepted_at IS NOT NULL)
      OR
      (status = 'expired'
        AND emergency_report_id IS NULL
        AND bound_at IS NULL
        AND accepted_at IS NOT NULL)
    ),
  ADD CONSTRAINT report_evidence_positive_byte_size
    CHECK (byte_size > 0),
  ADD CONSTRAINT report_evidence_dimensions_by_status
    CHECK (
      (status = 'uploading' AND width IS NULL AND height IS NULL)
      OR
      (status IN ('accepted', 'bound', 'expired')
        AND width IS NOT NULL AND width > 0
        AND height IS NOT NULL AND height > 0)
    ),
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
        AND classification_label IS NOT NULL
        AND classification_label IN ('fire', 'road')
        AND classification_status IS NOT NULL
        AND classification_status = 'valid'
        AND classification_action IS NOT NULL
        AND classification_action = 'accept')
    );

CREATE OR REPLACE FUNCTION public.reserve_report_evidence(
  p_session_id uuid,
  p_owner_user_id uuid,
  p_evidence_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_mime_type text,
  p_byte_size integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.finalize_report_evidence_upload(
  p_session_id uuid,
  p_owner_user_id uuid,
  p_evidence_id uuid,
  p_width integer,
  p_height integer,
  p_classification_label text,
  p_classification_confidence numeric,
  p_classification_reason text,
  p_classification_caption text
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.cancel_report_evidence_reservation(
  p_session_id uuid,
  p_owner_user_id uuid,
  p_evidence_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  SELECT session_row.id
  INTO v_session_id
  FROM public.evidence_upload_sessions AS session_row
  WHERE session_row.id = p_session_id
    AND session_row.owner_user_id = p_owner_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'CANCELLATION_INVALID';
  END IF;

  DELETE FROM public.report_evidence AS evidence_row
  WHERE evidence_row.id = p_evidence_id
    AND evidence_row.upload_session_id = p_session_id
    AND evidence_row.uploader_user_id = p_owner_user_id
    AND evidence_row.status = 'uploading';

  IF NOT FOUND THEN
    RETURN 'CANCELLATION_INVALID';
  END IF;

  RETURN 'CANCELLED';
END;
$$;

-- RPC calls are backend-only; browser roles must not invoke these functions.
REVOKE ALL ON FUNCTION public.reserve_report_evidence(uuid, uuid, uuid, text, text, text, integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_report_evidence(uuid, uuid, uuid, text, text, text, integer)
  FROM anon;
REVOKE ALL ON FUNCTION public.reserve_report_evidence(uuid, uuid, uuid, text, text, text, integer)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_report_evidence(uuid, uuid, uuid, text, text, text, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.finalize_report_evidence_upload(uuid, uuid, uuid, integer, integer, text, numeric, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_report_evidence_upload(uuid, uuid, uuid, integer, integer, text, numeric, text, text)
  FROM anon;
REVOKE ALL ON FUNCTION public.finalize_report_evidence_upload(uuid, uuid, uuid, integer, integer, text, numeric, text, text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_report_evidence_upload(uuid, uuid, uuid, integer, integer, text, numeric, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.cancel_report_evidence_reservation(uuid, uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_report_evidence_reservation(uuid, uuid, uuid)
  FROM anon;
REVOKE ALL ON FUNCTION public.cancel_report_evidence_reservation(uuid, uuid, uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_report_evidence_reservation(uuid, uuid, uuid)
  TO service_role;
