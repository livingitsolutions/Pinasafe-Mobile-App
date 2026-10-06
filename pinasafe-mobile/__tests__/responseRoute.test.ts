import fs from 'fs';
import path from 'path';
import type { CitizenResponseTracking } from '@/services/apiService';
import {
  buildNavigationUrl, describeCitizenResponse, fitMapView, formatDistance, formatEta, mapTiles, projectPoint, toRoutePoints,
} from '@/utils/responseRoute';

const NOW = Date.parse('2026-10-06T10:00:00.000Z');
const base: CitizenResponseTracking = {
  status: 'responding', response_team_assigned: true, tracking_active: true, response_complete: false,
  incident_location: { latitude: 14.6, longitude: 121 },
  responder_location: { latitude: 14.55, longitude: 121.05, captured_at: '2026-10-06T09:59:55.000Z', freshness: 'fresh' },
  route_status: 'available', route: [[14.55, 121.05], [14.6, 121]], distance_meters: 6400, duration_seconds: 780, calculated_at: '2026-10-06T09:59:58.000Z',
};
const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  .split('\n').filter(line => !line.trim().startsWith('//')).join('\n');

describe('V3.6C.1 ETA and distance formatting', () => {
  test('17. ETA is the provider duration rounded to minutes', () => {
    expect(formatEta(780)).toBe('~13 min');
    expect(formatEta(20)).toBe('~1 min');
    expect(formatEta(3900)).toBe('~1 h 5 min');
  });

  test('18. distance is the provider distance', () => {
    expect(formatDistance(6400)).toBe('6.4 km');
    expect(formatDistance(420)).toBe('420 m');
  });

  test('19/24. missing values never produce a number', () => {
    [null, undefined, NaN, -1].forEach(value => {
      expect(formatEta(value as number)).toBeNull();
      expect(formatDistance(value as number)).toBeNull();
    });
  });
});

describe('V3.6C.1 citizen response states', () => {
  test('live with route', () => {
    expect(describeCitizenResponse(base, NOW)).toMatchObject({ state: 'live', title: 'Response Team en route', routeAvailable: true, showMap: true });
  });

  test('11. resolved shows Response completed with no map or ETA', () => {
    expect(describeCitizenResponse({ ...base, status: 'resolved', response_complete: true, tracking_active: false }, NOW))
      .toMatchObject({ state: 'completed', title: 'Response completed', showMap: false, routeAvailable: false });
  });

  test('12. pending without a team', () => {
    expect(describeCitizenResponse({ ...base, status: 'pending', response_team_assigned: false, tracking_active: false, responder_location: null }, NOW).state).toBe('awaiting_team');
  });

  test('13. dispatched before Respond', () => {
    expect(describeCitizenResponse({ ...base, status: 'dispatched', tracking_active: false, responder_location: null }, NOW))
      .toMatchObject({ state: 'assigned', title: 'Response team assigned', showMap: false });
  });

  test('14. responding with no location waits', () => {
    expect(describeCitizenResponse({ ...base, responder_location: null }, NOW))
      .toMatchObject({ state: 'waiting_location', message: 'Waiting for live location...', showMap: false });
  });

  test('15. stale location is labelled delayed', () => {
    const stale = { ...base, responder_location: { ...base.responder_location!, captured_at: '2026-10-06T09:58:00.000Z' } };
    expect(describeCitizenResponse(stale, NOW)).toMatchObject({ state: 'stale', title: 'Last known response location', message: 'Location update delayed.' });
  });

  test('19. no route keeps live location and says the estimate is unavailable', () => {
    expect(describeCitizenResponse({ ...base, route_status: 'unavailable', route: null, duration_seconds: null, distance_meters: null }, NOW))
      .toMatchObject({ state: 'live', title: 'Live response location available', message: 'Route estimate unavailable.', routeAvailable: false, showMap: true });
  });
});

describe('V3.6C.1 navigation and map projection', () => {
  test('23. Navigate targets the incident coordinate on each platform', () => {
    const incident = { latitude: 14.6, longitude: 121.01 };
    expect(buildNavigationUrl(incident, 'ios')).toBe('http://maps.apple.com/?daddr=14.6,121.01&dirflag=d');
    expect(buildNavigationUrl(incident, 'android')).toBe('https://www.google.com/maps/dir/?api=1&destination=14.6,121.01&travelmode=driving');
    expect(buildNavigationUrl(incident, 'web')).toContain('destination=14.6,121.01');
  });

  test('24. no destination means no navigation link', () => {
    expect(buildNavigationUrl(null, 'ios')).toBeNull();
    expect(buildNavigationUrl({ latitude: 200, longitude: 0 }, 'android')).toBeNull();
  });

  test('route geometry is converted from [lat,lng] pairs and rejected when malformed', () => {
    expect(toRoutePoints([[14.55, 121.05], [14.6, 121]])).toEqual([{ latitude: 14.55, longitude: 121.05 }, { latitude: 14.6, longitude: 121 }]);
    expect(toRoutePoints([[14.55, 500]])).toEqual([]);
    expect(toRoutePoints(null)).toEqual([]);
  });

  test('map view fits all points inside the frame and tiles cover it', () => {
    const points = [{ latitude: 14.55, longitude: 121.05 }, { latitude: 14.6, longitude: 121 }];
    const view = fitMapView(points, 360, 220)!;
    points.forEach(point => {
      const { x, y } = projectPoint(point, view);
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(360);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(220);
    });
    expect(mapTiles(view, 360, 220).length).toBeGreaterThan(0);
    expect(fitMapView([], 360, 220)).toBeNull();
  });
});

describe('V3.6C.1 source boundaries', () => {
  const citizen = read('components/CitizenResponseTracking.tsx');
  const responder = read('components/ResponderNavigation.tsx');
  const util = read('utils/responseRoute.ts');
  const routeMap = read('components/RouteMap.tsx');

  test('7/11. citizen UI never names the responder and uses estimate wording only', () => {
    expect(citizen).not.toMatch(/responder_name|team_name|responder_id|accuracy/);
    expect(citizen).toMatch(/Response Team/);
    expect(citizen).toMatch(/HELP IS ON THE WAY/);
    [citizen, responder].forEach(source => expect(source).not.toMatch(/Arriving in exactly|Guaranteed arrival|will arrive at/i));
  });

  test('21/24. no fabricated coordinates, device lookups, or straight-line ETA', () => {
    [citizen, responder, util, routeMap].forEach(source => {
      expect(source).not.toMatch(/-?\d{1,3}\.\d{3,}/);
      expect(source).not.toMatch(/getCurrentPositionAsync|getLastKnownPositionAsync|EmergencyContext|haversine|speed/i);
      expect(source).not.toMatch(/report\.coordinates/);
    });
  });

  test('20. polling has explicit cleanup and stops after resolution', () => {
    [citizen, responder].forEach(source => {
      expect(source).toMatch(/clearInterval\(poll\)/);
      expect(source).toMatch(/clearInterval\(clock\)/);
      expect(source).toMatch(/response_complete\) done\.current = true/);
    });
  });

  test('citizen UI uses only the citizen-safe projection', () => {
    expect(citizen).toMatch(/getCitizenResponseTracking/);
    expect(citizen).not.toMatch(/getResponderLocation|getResponderNavigation|location-tracking/);
    expect(read('app/incident/[id].tsx')).toMatch(/user\?\.role === 'citizen' \? <Section title="Response status"><CitizenResponseTracking/);
  });

  test('22-23. responder Navigate uses the server destination, not the device position', () => {
    expect(responder).toMatch(/buildNavigationUrl\(destination, Platform\.OS\)/);
    expect(read('app/(tabs-responder)/map.tsx')).toMatch(/<ResponderNavigation reportId=\{report\.id\} \/>/);
  });
});
