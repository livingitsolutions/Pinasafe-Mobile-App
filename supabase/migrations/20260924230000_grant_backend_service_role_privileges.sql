-- PinaSafe backend service-role privileges
--
-- The Express backend accesses Supabase using SUPABASE_SERVICE_ROLE_KEY.
-- RLS remains enabled and existing policies remain unchanged.
-- No privileges are granted to anon or authenticated by this migration.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.emergency_calls,
  public.emergency_reports,
  public.incident_cluster_subscribers,
  public.incident_updates,
  public.organization_alerts,
  public.organizations,
  public.personnel,
  public.personnel_invites,
  public.rescue_teams,
  public.system_alerts,
  public.team_location_tracking,
  public.team_members,
  public.users
TO service_role;
