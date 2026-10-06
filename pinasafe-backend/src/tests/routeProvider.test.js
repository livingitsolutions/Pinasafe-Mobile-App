const { createOsrmRouteProvider, parseOsrmRoute, RouteUnavailableError } = require('../services/routeProvider');
const { createResponseRouteService } = require('../services/responseRouteService');

const origin = { latitude: 14.55, longitude: 121.05 };
const destination = { latitude: 14.6, longitude: 121.0 };
const osrmBody = {
  code: 'Ok',
  routes: [{ distance: 6400.2, duration: 780.5, geometry: { type: 'LineString', coordinates: [[121.05, 14.55], [121.02, 14.58], [121.0, 14.6]] } }]
};
const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });

describe('V3.6C.1 OSRM route provider', () => {
  test('16. requests the real origin and destination in lng,lat order', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okResponse(osrmBody));
    const provider = createOsrmRouteProvider({ baseUrl: 'https://routing.example/', fetchImpl });
    await provider.getRoute(origin, destination);
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toContain('https://routing.example/route/v1/driving/121.05,14.55;121,14.6?');
    expect(url).toContain('geometries=geojson');
  });

  test('17-18. ETA and distance are the provider route values; geometry converted to [lat,lng]', async () => {
    const provider = createOsrmRouteProvider({ fetchImpl: jest.fn().mockResolvedValue(okResponse(osrmBody)) });
    const route = await provider.getRoute(origin, destination);
    expect(route).toEqual({
      distance_meters: 6400.2,
      duration_seconds: 780.5,
      geometry: [[14.55, 121.05], [14.58, 121.02], [14.6, 121.0]]
    });
  });

  test.each([
    ['no route', { code: 'NoRoute', routes: [] }],
    ['missing duration', { code: 'Ok', routes: [{ distance: 10, geometry: osrmBody.routes[0].geometry }] }],
    ['NaN distance', { code: 'Ok', routes: [{ distance: NaN, duration: 5, geometry: osrmBody.routes[0].geometry }] }],
    ['bad geometry', { code: 'Ok', routes: [{ distance: 10, duration: 5, geometry: { type: 'LineString', coordinates: [[500, 14]] } }] }]
  ])('19. %s is rejected, never filled in', (_label, body) => {
    expect(() => parseOsrmRoute(body)).toThrow(RouteUnavailableError);
  });

  test('19. network and HTTP failures reject as unavailable', async () => {
    const down = createOsrmRouteProvider({ fetchImpl: jest.fn().mockRejectedValue(new Error('offline')) });
    await expect(down.getRoute(origin, destination)).rejects.toBeInstanceOf(RouteUnavailableError);
    const rateLimited = createOsrmRouteProvider({ fetchImpl: jest.fn().mockResolvedValue({ ok: false, status: 429 }) });
    await expect(rateLimited.getRoute(origin, destination)).rejects.toMatchObject({ reason: 'http_429' });
  });

  test('24. invalid points are never sent to the provider', async () => {
    const fetchImpl = jest.fn();
    const provider = createOsrmRouteProvider({ fetchImpl });
    await expect(provider.getRoute({ latitude: 95, longitude: 0 }, destination)).rejects.toBeInstanceOf(RouteUnavailableError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('V3.6C.1 route refresh throttle', () => {
  const route = { geometry: [[1, 2], [3, 4]], distance_meters: 100, duration_seconds: 60 };

  test('20. first position routes immediately, then at most once per refresh window', async () => {
    let clock = 0;
    const provider = { getRoute: jest.fn().mockResolvedValue(route) };
    const service = createResponseRouteService({ provider, now: () => clock, refreshMs: 25000 });

    expect((await service.getRoute('k', origin, destination)).status).toBe('available');
    clock = 7000;
    await service.getRoute('k', { latitude: 14.551, longitude: 121.049 }, destination);
    clock = 24999;
    await service.getRoute('k', origin, destination);
    expect(provider.getRoute).toHaveBeenCalledTimes(1);

    clock = 25000;
    const refreshed = await service.getRoute('k', { latitude: 14.56, longitude: 121.04 }, destination);
    expect(provider.getRoute).toHaveBeenCalledTimes(2);
    expect(provider.getRoute).toHaveBeenLastCalledWith({ latitude: 14.56, longitude: 121.04 }, destination);
    expect(refreshed.calculated_at).toBe(new Date(25000).toISOString());
  });

  test('20. concurrent requests share one provider call', async () => {
    const provider = { getRoute: jest.fn().mockResolvedValue(route) };
    const service = createResponseRouteService({ provider, now: () => 0 });
    await Promise.all([service.getRoute('k', origin, destination), service.getRoute('k', origin, destination)]);
    expect(provider.getRoute).toHaveBeenCalledTimes(1);
  });

  test('19-20. failures are throttled too and never produce an ETA', async () => {
    let clock = 0;
    const provider = { getRoute: jest.fn().mockRejectedValue(new Error('down')) };
    const service = createResponseRouteService({ provider, now: () => clock });
    expect(await service.getRoute('k', origin, destination)).toEqual({ status: 'unavailable' });
    clock = 10000;
    expect(await service.getRoute('k', origin, destination)).toEqual({ status: 'unavailable' });
    expect(provider.getRoute).toHaveBeenCalledTimes(1);
  });

  test('changed destination recalculates immediately', async () => {
    const provider = { getRoute: jest.fn().mockResolvedValue(route) };
    const service = createResponseRouteService({ provider, now: () => 0 });
    await service.getRoute('k', origin, destination);
    await service.getRoute('k', origin, { latitude: 14.7, longitude: 121.1 });
    expect(provider.getRoute).toHaveBeenCalledTimes(2);
  });

  test('cache is bounded', async () => {
    const provider = { getRoute: jest.fn().mockResolvedValue(route) };
    const service = createResponseRouteService({ provider, now: () => 0, maxEntries: 2 });
    await service.getRoute('a', origin, destination);
    await service.getRoute('b', origin, destination);
    await service.getRoute('c', origin, destination);
    await service.getRoute('a', origin, destination);
    expect(provider.getRoute).toHaveBeenCalledTimes(4);
  });
});
