export function hasAuthoritativeCoordinates(value?: { latitude?: number; longitude?: number } | null): value is { latitude: number; longitude: number } {
  return Boolean(value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude));
}

interface TeamMemberLike {
  personnel_role?: string;
  is_active?: boolean;
}

export function isTeamPresentationReady(team: { is_active?: boolean; members?: unknown[] }): boolean {
  if (team.is_active === false) return false;
  if (!Array.isArray(team.members) || team.members.length === 0) return false;
  return team.members.some((member: unknown) => {
    const m = member as TeamMemberLike;
    return m?.personnel_role === 'rescue_member' && m?.is_active !== false;
  });
}
