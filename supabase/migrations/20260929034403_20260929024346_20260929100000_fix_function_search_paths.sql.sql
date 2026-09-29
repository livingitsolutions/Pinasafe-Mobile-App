/*
# Fix mutable search_path on trigger functions

## Summary
Four trigger functions in the public schema were created without an explicit
`search_path` parameter, leaving them vulnerable to search_path hijacking.
This migration sets `search_path = public` on each function so the schema
is pinned and cannot be manipulated by an attacker.

## Functions modified
1. `create_organization_alerts_for_report()` — trigger function that auto-creates
   organization_alerts rows when a new emergency_report is inserted.
2. `validate_team_member_role()` — trigger function that ensures only rescue
   members can be added to teams.
3. `validate_team_leader_role()` — trigger function that ensures only rescue
   members can be team leaders.
4. `assign_organization_to_report()` — trigger function that auto-assigns an
   organization to a new emergency report based on incident type.

## Security changes
- All four functions now have `SET search_path = public` explicitly declared,
   closing the mutable search_path vulnerability flagged by Supabase's linter.

## Important notes
1. The function bodies are unchanged — only the `SET search_path` clause is added.
2. `ALTER FUNCTION ... SET search_path = public` is safe to run while triggers
   are active; it takes effect on the next trigger invocation.
3. This migration is idempotent: re-running it is a no-op since the search_path
   is already set.
*/

ALTER FUNCTION public.create_organization_alerts_for_report() SET search_path = public;
ALTER FUNCTION public.validate_team_member_role() SET search_path = public;
ALTER FUNCTION public.validate_team_leader_role() SET search_path = public;
ALTER FUNCTION public.assign_organization_to_report() SET search_path = public;
