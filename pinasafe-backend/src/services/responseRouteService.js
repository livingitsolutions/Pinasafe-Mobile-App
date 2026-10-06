const safeLogger = require('../utils/safeLogger');
const { isPoint } = require('./routeProvider');

const ROUTE_REFRESH_MS = 25000;
const MAX_ENTRIES = 500;

const samePoint = (left, right) => left.latitude === right.latitude && left.longitude === right.longitude;

/**
 * Throttles road-route calculations per response: at most one provider call per
 * key per refresh window, whether it succeeded or failed. The first usable
 * position is routed immediately.
 */
const createResponseRouteService = ({ provider, now = Date.now, refreshMs = ROUTE_REFRESH_MS, maxEntries = MAX_ENTRIES }) => {
  const entries = new Map();
  const inFlight = new Map();

  const remember = (key, entry) => {
    entries.delete(key);
    entries.set(key, entry);
    if (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  };

  const toResult = (entry) => (entry.route
    ? { status: 'available', ...entry.route, calculated_at: new Date(entry.computedAt).toISOString() }
    : { status: 'unavailable' });

  const getRoute = async (key, origin, destination) => {
    if (!isPoint(origin) || !isPoint(destination)) return { status: 'unavailable' };

    const cached = entries.get(key);
    const destinationChanged = cached && !samePoint(cached.destination, destination);
    if (cached && !destinationChanged && now() - cached.computedAt < refreshMs) return toResult(cached);
    if (inFlight.has(key)) return inFlight.get(key);

    const pending = (async () => {
      let route = null;
      try {
        route = await provider.getRoute(origin, destination);
      } catch (error) {
        safeLogger.warn?.('route.provider_unavailable', { reason: error?.reason || 'error' });
      }
      const entry = { destination, route, computedAt: now() };
      remember(key, entry);
      return toResult(entry);
    })();
    inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      inFlight.delete(key);
    }
  };

  return { getRoute, forget: (key) => entries.delete(key) };
};

module.exports = { createResponseRouteService, ROUTE_REFRESH_MS };
