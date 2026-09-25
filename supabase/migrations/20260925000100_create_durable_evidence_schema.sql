-- PWA-1.4B1 durable evidence schema foundation.
--
-- Evidence is created through a server-owned upload session. Application
-- authorization and lifecycle transitions remain in the backend service.

CREATE TABLE evidence_upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL
    REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  bound_at timestamptz,
  emergency_report_id uuid
    REFERENCES emergency_reports(id) ON DELETE RESTRICT,

  CONSTRAINT evidence_upload_sessions_status
    CHECK (status IN ('active', 'bound', 'expired')),

  CONSTRAINT evidence_upload_sessions_lifecycle
    CHECK (
      (status = 'active' AND emergency_report_id IS NULL AND bound_at IS NULL)
      OR
      (status = 'bound' AND emergency_report_id IS NOT NULL AND bound_at IS NOT NULL)
      OR
      (status = 'expired' AND emergency_report_id IS NULL AND bound_at IS NULL)
    ),

  CONSTRAINT evidence_upload_sessions_expiry
    CHECK (expires_at >= created_at),

  UNIQUE (id, owner_user_id),
  UNIQUE (id, emergency_report_id)
);

CREATE TABLE report_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_session_id uuid NOT NULL,
  emergency_report_id uuid
    REFERENCES emergency_reports(id) ON DELETE RESTRICT,
  uploader_user_id uuid NOT NULL
    REFERENCES users(id) ON DELETE RESTRICT,

  storage_bucket text NOT NULL,
  storage_path text NOT NULL,

  mime_type text NOT NULL,
  byte_size bigint NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,

  classification_label text NOT NULL,
  classification_status text NOT NULL,
  classification_action text NOT NULL,
  classification_confidence numeric,
  classification_reason text,
  classification_caption text,

  status text NOT NULL DEFAULT 'accepted',
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  bound_at timestamptz,
  expires_at timestamptz NOT NULL,

  CONSTRAINT report_evidence_upload_session_owner
    FOREIGN KEY (upload_session_id, uploader_user_id)
    REFERENCES evidence_upload_sessions(id, owner_user_id)
    ON DELETE RESTRICT,

  CONSTRAINT report_evidence_upload_session_report
    FOREIGN KEY (upload_session_id, emergency_report_id)
    REFERENCES evidence_upload_sessions(id, emergency_report_id)
    ON DELETE RESTRICT,

  CONSTRAINT report_evidence_status
    CHECK (status IN ('accepted', 'bound', 'expired')),

  CONSTRAINT report_evidence_lifecycle
    CHECK (
      (status = 'accepted'
        AND emergency_report_id IS NULL
        AND bound_at IS NULL)
      OR
      (status = 'bound'
        AND emergency_report_id IS NOT NULL
        AND bound_at IS NOT NULL)
      OR
      (status = 'expired'
        AND emergency_report_id IS NULL
        AND bound_at IS NULL)
    ),

  CONSTRAINT report_evidence_positive_dimensions
    CHECK (byte_size > 0 AND width > 0 AND height > 0),

  CONSTRAINT report_evidence_jpeg_mime
    CHECK (mime_type = 'image/jpeg'),

  CONSTRAINT report_evidence_classification
    CHECK (
      classification_label IN ('fire', 'road')
      AND classification_status = 'valid'
      AND classification_action = 'accept'
    ),

  CONSTRAINT report_evidence_confidence_range
    CHECK (
      classification_confidence IS NULL
      OR (classification_confidence >= 0 AND classification_confidence <= 1)
    ),

  CONSTRAINT report_evidence_expiry
    CHECK (expires_at >= created_at),

  CONSTRAINT report_evidence_storage_path_unique
    UNIQUE (storage_path)
);

CREATE INDEX idx_evidence_upload_sessions_owner_user_id
  ON evidence_upload_sessions(owner_user_id);

CREATE INDEX idx_evidence_upload_sessions_status_expires_at
  ON evidence_upload_sessions(status, expires_at);

CREATE INDEX idx_evidence_upload_sessions_emergency_report_id
  ON evidence_upload_sessions(emergency_report_id);

CREATE INDEX idx_report_evidence_upload_session_id
  ON report_evidence(upload_session_id);

CREATE INDEX idx_report_evidence_emergency_report_id
  ON report_evidence(emergency_report_id);

CREATE INDEX idx_report_evidence_uploader_user_id
  ON report_evidence(uploader_user_id);

CREATE INDEX idx_report_evidence_status_expires_at
  ON report_evidence(status, expires_at);

ALTER TABLE evidence_upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_evidence ENABLE ROW LEVEL SECURITY;

-- Browser roles receive no direct access. The backend uses service_role and
-- performs authorization through the parent session/report relationship.
REVOKE ALL ON TABLE evidence_upload_sessions, report_evidence FROM PUBLIC;
REVOKE ALL ON TABLE evidence_upload_sessions, report_evidence FROM anon;
REVOKE ALL ON TABLE evidence_upload_sessions, report_evidence FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  evidence_upload_sessions,
  report_evidence
TO service_role;