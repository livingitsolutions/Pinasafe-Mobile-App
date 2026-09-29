export function hasAuthoritativeCoordinates(value?: { latitude?: number; longitude?: number } | null): value is { latitude: number; longitude: number } {
  return Boolean(value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude));
}

export function isTeamPresentationReady(team: { is_active?: boolean; members?: unknown[] }): boolean {
  return team.is_active !== false && Array.isArray(team.members) && team.members.length > 0;
}
