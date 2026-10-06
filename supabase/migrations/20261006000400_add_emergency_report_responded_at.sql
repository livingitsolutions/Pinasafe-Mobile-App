-- PinaSafe V3.6B
-- Responder dispatch acknowledgement timestamp.
--
-- 1. New column on public.emergency_reports
--    - responded_at (timestamptz, nullable): server time at which an
--      authorized assigned-team responder pressed Respond (dispatched ->
--      responding). Written only by the backend service role.
--
-- 2. Notes
--    - Additive and idempotent; existing rows remain NULL.
--    - No RLS, grant, function, or lifecycle semantics are changed.
--    - Not propagated to sibling reports of the operational incident.

ALTER TABLE public.emergency_reports
  ADD COLUMN IF NOT EXISTS responded_at timestamptz NULL;
