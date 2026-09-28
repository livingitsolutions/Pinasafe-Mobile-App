-- Reconcile the users column used by the backend authentication contract.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

ALTER TABLE public.users
  ALTER COLUMN must_change_password SET DEFAULT false;

UPDATE public.users
SET must_change_password = false
WHERE must_change_password IS NULL;

ALTER TABLE public.users
  ALTER COLUMN must_change_password SET NOT NULL;