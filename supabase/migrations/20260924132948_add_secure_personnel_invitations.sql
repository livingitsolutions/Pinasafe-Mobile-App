-- PWA-1.4A.5.2A
-- Secure personnel invitation and atomic account provisioning.
--
-- Security properties:
-- - raw invitation tokens are never stored
-- - personnel invitations cannot create super-admins
-- - organization/email/roles are fixed by the invitation
-- - one pending invitation per organization/email
-- - one personnel profile per linked user
-- - invitation acceptance creates user + personnel + consumes invite atomically
-- - RLS is enabled with no direct client policies

-- A linked application user may have at most one personnel profile.
-- NULL remains allowed for legacy/unlinked personnel records.
CREATE UNIQUE INDEX IF NOT EXISTS idx_personnel_unique_user
  ON personnel(user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE personnel_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id uuid NOT NULL
    REFERENCES organizations(id) ON DELETE CASCADE,

  email text NOT NULL,
  user_role text NOT NULL,
  personnel_role text NOT NULL,

  name text NOT NULL,
  contact_number text NOT NULL,
  specializations jsonb NOT NULL DEFAULT '[]'::jsonb,

  token_hash text NOT NULL,

  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,

  invited_by uuid NOT NULL
    REFERENCES users(id) ON DELETE RESTRICT,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT personnel_invites_email_normalized
    CHECK (email = lower(btrim(email))),

  CONSTRAINT personnel_invites_email_not_blank
    CHECK (length(email) > 0),

  CONSTRAINT personnel_invites_name_not_blank
    CHECK (length(btrim(name)) > 0),

  CONSTRAINT personnel_invites_contact_not_blank
    CHECK (length(btrim(contact_number)) > 0),

  CONSTRAINT personnel_invites_user_role
    CHECK (user_role IN ('responder', 'admin')),

  CONSTRAINT personnel_invites_personnel_role
    CHECK (personnel_role IN ('staff', 'rescue_member')),

  CONSTRAINT personnel_invites_status
    CHECK (status IN ('pending', 'consumed', 'revoked')),

  CONSTRAINT personnel_invites_expiry
    CHECK (expires_at > created_at),

  CONSTRAINT personnel_invites_consumption_state
    CHECK (
      (status = 'consumed' AND consumed_at IS NOT NULL)
      OR
      (status IN ('pending', 'revoked') AND consumed_at IS NULL)
    )
);

CREATE UNIQUE INDEX idx_personnel_invites_token_hash
  ON personnel_invites(token_hash);

CREATE UNIQUE INDEX idx_personnel_invites_pending_org_email
  ON personnel_invites(organization_id, email)
  WHERE status = 'pending';

CREATE INDEX idx_personnel_invites_expires_at
  ON personnel_invites(expires_at)
  WHERE status = 'pending';

CREATE INDEX idx_personnel_invites_invited_by
  ON personnel_invites(invited_by);

ALTER TABLE personnel_invites ENABLE ROW LEVEL SECURITY;

-- Intentionally no authenticated/anon policies.
-- Backend access is through the server-side service-role client.

CREATE OR REPLACE FUNCTION accept_personnel_invitation(
  p_token_hash text,
  p_password_hash text
)
RETURNS TABLE (
  user_id uuid,
  personnel_id uuid,
  organization_id uuid
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_invite personnel_invites%ROWTYPE;
  v_user_id uuid;
  v_personnel_id uuid;
BEGIN
  IF p_token_hash IS NULL OR length(btrim(p_token_hash)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INVITATION';
  END IF;

  IF p_password_hash IS NULL OR length(btrim(p_password_hash)) = 0 THEN
    RAISE EXCEPTION 'INVALID_PASSWORD_HASH';
  END IF;

  SELECT *
  INTO v_invite
  FROM personnel_invites
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_INVITATION';
  END IF;

  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'INVITATION_NOT_PENDING';
  END IF;

  IF v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'INVITATION_EXPIRED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM users
    WHERE lower(email) = v_invite.email
  ) THEN
    RAISE EXCEPTION 'EMAIL_ALREADY_EXISTS';
  END IF;

  INSERT INTO users (
    email,
    password_hash,
    name,
    role,
    phone,
    organization_id,
    verified
  )
  VALUES (
    v_invite.email,
    p_password_hash,
    v_invite.name,
    v_invite.user_role,
    v_invite.contact_number,
    v_invite.organization_id,
    false
  )
  RETURNING id INTO v_user_id;

  INSERT INTO personnel (
    organization_id,
    user_id,
    name,
    contact_number,
    email,
    specializations,
    personnel_role,
    is_active
  )
  VALUES (
    v_invite.organization_id,
    v_user_id,
    v_invite.name,
    v_invite.contact_number,
    v_invite.email,
    v_invite.specializations,
    v_invite.personnel_role,
    true
  )
  RETURNING id INTO v_personnel_id;

  UPDATE personnel_invites
  SET
    status = 'consumed',
    consumed_at = now(),
    updated_at = now()
  WHERE id = v_invite.id;

  RETURN QUERY
  SELECT
    v_user_id,
    v_personnel_id,
    v_invite.organization_id;
END;
$$;

-- This function must not be directly callable by browser database roles.
REVOKE ALL ON FUNCTION accept_personnel_invitation(text, text)
  FROM PUBLIC;

REVOKE ALL ON FUNCTION accept_personnel_invitation(text, text)
  FROM anon;

REVOKE ALL ON FUNCTION accept_personnel_invitation(text, text)
  FROM authenticated;

GRANT EXECUTE ON FUNCTION accept_personnel_invitation(text, text)
  TO service_role;
