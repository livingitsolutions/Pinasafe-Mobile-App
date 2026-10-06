export function getEmergencyReportMapUrl(coordinates: unknown): string | null {
  if (!coordinates || typeof coordinates !== 'object' || Array.isArray(coordinates)) return null;

  const { latitude, longitude } = coordinates as { latitude?: unknown; longitude?: unknown };
  if (
    typeof latitude !== 'number'
    || typeof longitude !== 'number'
    || !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
  ) {
    return null;
  }

  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
}
