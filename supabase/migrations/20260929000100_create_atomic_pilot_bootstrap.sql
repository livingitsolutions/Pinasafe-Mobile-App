-- B6.3 secure pilot bootstrap transaction boundary.

CREATE TABLE IF NOT EXISTS public.pinasafe_bootstrap_state (
  bootstrap_key text PRIMARY KEY,
  completed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pinasafe_bootstrap_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pinasafe_bootstrap_state FROM PUBLIC;
REVOKE ALL ON TABLE public.pinasafe_bootstrap_state FROM anon;
REVOKE ALL ON TABLE public.pinasafe_bootstrap_state FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.pinasafe_bootstrap_state TO service_role;

CREATE OR REPLACE FUNCTION public.bootstrap_pilot_atomic(
  p_rescue_name text, p_rescue_contact_number text,
  p_fire_name text, p_fire_contact_number text,
  p_rescue_admin_email text, p_rescue_admin_name text, p_rescue_admin_password_hash text,
  p_fire_admin_email text, p_fire_admin_name text, p_fire_admin_password_hash text
)
RETURNS TABLE (rescue_organization_id uuid, fire_organization_id uuid, rescue_admin_id uuid, fire_admin_id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_rescue_organization_id uuid;
  v_fire_organization_id uuid;
  v_rescue_admin_id uuid;
  v_fire_admin_id uuid;
  v_rescue_name text;
  v_rescue_contact_number text;
  v_fire_name text;
  v_fire_contact_number text;
  v_rescue_admin_email text;
  v_rescue_admin_name text;
  v_fire_admin_email text;
  v_fire_admin_name text;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pinasafe:b6.3:pilot-bootstrap', 0)
  );

  v_rescue_name := regexp_replace(coalesce(p_rescue_name, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_rescue_contact_number := regexp_replace(coalesce(p_rescue_contact_number, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_fire_name := regexp_replace(coalesce(p_fire_name, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_fire_contact_number := regexp_replace(coalesce(p_fire_contact_number, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_rescue_admin_email := lower(regexp_replace(coalesce(p_rescue_admin_email, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'));
  v_rescue_admin_name := regexp_replace(coalesce(p_rescue_admin_name, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_fire_admin_email := lower(regexp_replace(coalesce(p_fire_admin_email, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'));
  v_fire_admin_name := regexp_replace(coalesce(p_fire_admin_name, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');

  IF v_rescue_name = ''
    OR v_rescue_contact_number = ''
    OR v_fire_name = ''
    OR v_fire_contact_number = ''
    OR v_rescue_admin_email = ''
    OR v_rescue_admin_name = ''
    OR v_fire_admin_email = ''
    OR v_fire_admin_name = ''
    OR p_rescue_admin_password_hash IS NULL
    OR p_rescue_admin_password_hash ~ '^[[:space:]]*$'
    OR p_fire_admin_password_hash IS NULL
    OR p_fire_admin_password_hash ~ '^[[:space:]]*$'
  THEN
    RAISE EXCEPTION 'BOOTSTRAP_INVALID_INPUT';
  END IF;

  IF lower(v_rescue_name) = lower(v_fire_name)
    OR v_rescue_admin_email = v_fire_admin_email
  THEN
    RAISE EXCEPTION 'BOOTSTRAP_INVALID_INPUT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pinasafe_bootstrap_state
    WHERE bootstrap_key = 'pinasafe-pilot'
  ) THEN
    RAISE EXCEPTION 'BOOTSTRAP_ALREADY_COMPLETED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM organizations
    WHERE lower(regexp_replace(coalesce(name, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'))
      IN (lower(v_rescue_name), lower(v_fire_name))
  ) OR EXISTS (
    SELECT 1 FROM users
    WHERE lower(regexp_replace(coalesce(email, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'))
      IN (v_rescue_admin_email, v_fire_admin_email)
  ) THEN
    RAISE EXCEPTION 'BOOTSTRAP_CONFLICT';
  END IF;

  INSERT INTO organizations (name, type, contact_number, is_active)
  VALUES (v_rescue_name, 'rescue', v_rescue_contact_number, true)
  RETURNING id INTO v_rescue_organization_id;

  INSERT INTO organizations (name, type, contact_number, is_active)
  VALUES (v_fire_name, 'fire', v_fire_contact_number, true)
  RETURNING id INTO v_fire_organization_id;

  INSERT INTO users (email, password_hash, name, role, organization_id, verified, must_change_password)
  VALUES (v_rescue_admin_email, p_rescue_admin_password_hash, v_rescue_admin_name, 'admin', v_rescue_organization_id, false, false)
  RETURNING id INTO v_rescue_admin_id;

  INSERT INTO users (email, password_hash, name, role, organization_id, verified, must_change_password)
  VALUES (v_fire_admin_email, p_fire_admin_password_hash, v_fire_admin_name, 'admin', v_fire_organization_id, false, false)
  RETURNING id INTO v_fire_admin_id;

  INSERT INTO public.pinasafe_bootstrap_state (bootstrap_key)
  VALUES ('pinasafe-pilot');

  RETURN QUERY SELECT v_rescue_organization_id, v_fire_organization_id, v_rescue_admin_id, v_fire_admin_id;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM IN (
      'BOOTSTRAP_INVALID_INPUT',
      'BOOTSTRAP_ALREADY_COMPLETED',
      'BOOTSTRAP_CONFLICT'
    ) THEN
      RAISE;
    END IF;
    RAISE EXCEPTION 'BOOTSTRAP_FAILED';
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_pilot_atomic(text, text, text, text, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_pilot_atomic(text, text, text, text, text, text, text, text, text, text)
  TO service_role;