const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org';
const DEFAULT_TIMEOUT_MS = 6000;
const MAX_GEOMETRY_POINTS = 400;

class RouteUnavailableError extends Error {
  constructor(reason) {
    super(`Route unavailable: ${reason}`);
    this.name = 'RouteUnavailableError';
    this.reason = reason;
  }
}

const isFiniteNonNegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isLatitude = (value) => typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
const isLongitude = (value) => typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;

const isPoint = (point) => Boolean(point) && isLatitude(point.latitude) && isLongitude(point.longitude);

const thinGeometry = (points) => {
  if (points.length <= MAX_GEOMETRY_POINTS) return points;
  const step = (points.length - 1) / (MAX_GEOMETRY_POINTS - 1);
  return Array.from({ length: MAX_GEOMETRY_POINTS }, (_, index) => points[Math.round(index * step)]);
};

/** Validates an OSRM /route response; never fills in missing values. */
const parseOsrmRoute = (body) => {
  const route = body?.code === 'Ok' && Array.isArray(body.routes) ? body.routes[0] : null;
  if (!route) throw new RouteUnavailableError('no_route');
  if (!isFiniteNonNegative(route.distance) || !isFiniteNonNegative(route.duration)) {
    throw new RouteUnavailableError('invalid_metrics');
  }
  const coordinates = route.geometry?.type === 'LineString' ? route.geometry.coordinates : null;
  if (!Array.isArray(coordinates) || coordinates.length < 2) throw new RouteUnavailableError('invalid_geometry');
  const geometry = coordinates.map((pair) => (Array.isArray(pair) ? { latitude: pair[1], longitude: pair[0] } : null));
  if (!geometry.every(isPoint)) throw new RouteUnavailableError('invalid_geometry');

  return {
    geometry: thinGeometry(geometry).map((point) => [point.latitude, point.longitude]),
    distance_meters: route.distance,
    duration_seconds: route.duration
  };
};

/**
 * OSRM road-routing adapter. The default base URL is the public OSRM demo server,
 * which is rate-limited, has no SLA and is not production infrastructure.
 */
const createOsrmRouteProvider = ({
  baseUrl = process.env.ROUTING_OSRM_BASE_URL || DEFAULT_OSRM_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) => ({
  name: 'osrm',
  async getRoute(origin, destination) {
    if (!isPoint(origin) || !isPoint(destination)) throw new RouteUnavailableError('invalid_points');
    if (typeof fetchImpl !== 'function') throw new RouteUnavailableError('fetch_unavailable');

    const path = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    const url = `${baseUrl.replace(/\/+$/, '')}/route/v1/driving/${path}?overview=full&geometries=geojson&alternatives=false&steps=false`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    } catch {
      throw new RouteUnavailableError('network');
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new RouteUnavailableError(`http_${response.status}`);
    let body;
    try { body = await response.json(); } catch { throw new RouteUnavailableError('invalid_body'); }
    return parseOsrmRoute(body);
  }
});

module.exports = {
  RouteUnavailableError,
  createOsrmRouteProvider,
  parseOsrmRoute,
  isPoint
};
