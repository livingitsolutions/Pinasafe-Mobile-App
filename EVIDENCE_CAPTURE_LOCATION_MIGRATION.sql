-- PWA-2.2 per-evidence capture location columns.
--
-- Each accepted evidence item must durably retain its own capture metadata
-- independently of the canonical report coordinates. The report's
-- latitude/longitude remain on emergency_reports; the columns below
-- belong to report_evidence so every photo carries its own capture origin.
--
-- Columns are nullable so historical rows (created before this migration)
-- remain valid without backfill.
--
-- 1. Table affected: public.report_evidence
-- 2. Columns proposed:
--    capture_latitude   double precision (nullable)
--    capture_longitude  double precision (nullable)
--    capture_accuracy   double precision (nullable)
--    capture_timestamp  timestamptz     (nullable)
-- 3. Nullability: all nullable — historical rows remain valid.
-- 4. Constraints:
--    latitude range -90..90
--    longitude range -180..180
--    accuracy non-negative
--    lat/lng both null or both non-null
-- 5. Compatibility: existing rows have NULL for all four columns.
-- 6. Historical rows remain valid (no backfill needed).
-- 7. RPC changes: finalize_report_evidence_upload gains 4 new parameters
--    (p_capture_latitude, p_capture_longitude, p_capture_accuracy,
--     p_capture_timestamp) and writes them into the new columns.
-- 8. Rollback: ALTER TABLE DROP COLUMN for each; DROP FUNCTION if replaced.
-- 9. RLS/security: no change — service_role only, browser roles have no access.

ALTER TABLE public.report_evidence
  ADD COLUMN IF NOT EXISTS capture_latitude double precision,
  ADD COLUMN IF NOT EXISTS capture_longitude double precision,
  ADD COLUMN IF NOT EXISTS capture_accuracy double precision,
  ADD COLUMN IF NOT EXISTS capture_timestamp timestamptz;

ALTER TABLE public.report_evidence
  ADD CONSTRAINT report_evidence_capture_latitude_range
    CHECK (capture_latitude IS NULL OR (capture_latitude >= -90 AND capture_latitude <= 90));

ALTER TABLE public.report_evidence
  ADD CONSTRAINT report_evidence_capture_longitude_range
    CHECK (capture_longitude IS NULL OR (capture_longitude >= -180 AND capture_longitude <= 180));

ALTER TABLE public.report_evidence
  ADD CONSTRAINT report_evidence_capture_accuracy_non_negative
    CHECK (capture_accuracy IS NULL OR (capture_accuracy >= 0));

ALTER TABLE public.report_evidence
  ADD CONSTRAINT report_evidence_capture_coords_consistent
    CHECK (
      (capture_latitude IS NULL AND capture_longitude IS NULL)
      OR
      (capture_latitude IS NOT NULL AND capture_longitude IS NOT NULL)
    );

-- Updated finalization RPC with capture location parameters.
CREATE OR REPLACE FUNCTION public.finalize_report_evidence_upload(
  p_session_id uuid,
  p_owner_user_id uuid,
  p_evidence_id uuid,
  p_width integer,
  p_height integer,
  p_classification_label text,
  p_classification_confidence numeric,
  p_classification_reason text,
  p_classification_caption text,
  p_capture_latitude double precision DEFAULT NULL,
  p_capture_longitude double precision DEFAULT NULL,
  p_capture_accuracy double precision DEFAULT NULL,
  p_capture_timestamp timestamptz DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $
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
    OR (p_capture_latitude IS NOT NULL
      AND (p_capture_latitude < -90 OR p_capture_latitude > 90))
    OR (p_capture_longitude IS NOT NULL
      AND (p_capture_longitude < -180 OR p_capture_longitude > 180))
    OR (p_capture_accuracy IS NOT NULL AND p_capture_accuracy < 0)
    OR (p_capture_latitude IS NOT NULL AND p_capture_longitude IS NULL)
    OR (p_capture_longitude IS NOT NULL AND p_capture_latitude IS NULL)
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
    capture_timestamp = p_capture_timestamp,
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
$;

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

