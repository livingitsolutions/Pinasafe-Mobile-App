import * as fs from 'fs';
import * as path from 'path';
import {
  classifyPublishError,
  formatLocationAge,
  GeoFix,
  GeolocationSource,
  getLocationFreshness,
  isValidFix,
  LiveTrackingController,
  LiveTrackingState,
  PUBLISH_INTERVAL_MS,
  STALE_AFTER_MS,
} from '@/utils/liveTracking';

const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(options: { granted?: boolean | 'throw'; publish?: jest.Mock } = {}) {
  let clock = 1_000_000;
  let emit: ((fix: GeoFix) => void) | null = null;
  let emitError: ((message: string) => void) | null = null;
  const unwatch = jest.fn();
  const source: GeolocationSource & { requestPermission: jest.Mock; watch: jest.Mock } = {
    requestPermission: jest.fn(async () => {
      if (options.granted === 'throw') throw new Error('unsupported');
      return options.granted ?? true;
    }),
    watch: jest.fn(async (onFix: (fix: GeoFix) => void, onError: (message: string) => void) => { emit = onFix; emitError = onError; return unwatch; }),
  };
  const publish = options.publish ?? jest.fn(async () => 'ok' as const);
  const states: LiveTrackingState[] = [];
  const controller = new LiveTrackingController({ source, publish, onChange: state => states.push(state), now: () => clock });
  return {
    controller, source, publish, unwatch, states,
    advance: (ms: number) => { clock += ms; },
    fix: (overrides: Partial<GeoFix> = {}) => ({ latitude: 14.6, longitude: 121.0, accuracy: 6, timestamp: clock, ...overrides }),
    emit: async (fix: GeoFix) => { emit?.(fix); await flush(); },
    emitError: (message: string) => emitError?.(message),
  };
}

describe('V3.6C live tracking controller', () => {
  test('20. geolocation is never requested until start() is called explicitly', async () => {
    const h = harness();
    await flush();
    expect(h.source.requestPermission).not.toHaveBeenCalled();
    expect(h.source.watch).not.toHaveBeenCalled();
    expect(h.controller.getState()).toEqual({ phase: 'idle' });
    await h.controller.start();
    expect(h.source.requestPermission).toHaveBeenCalledTimes(1);
    expect(h.source.watch).toHaveBeenCalledTimes(1);
    expect(h.controller.getState()).toEqual({ phase: 'active', lastPublishedAt: null, publishError: false });
  });

  test('21. permission denial is graceful and never starts a watcher', async () => {
    const h = harness({ granted: false });
    await h.controller.start();
    expect(h.source.watch).not.toHaveBeenCalled();
    expect(h.controller.getState()).toEqual(expect.objectContaining({ phase: 'unavailable' }));
    expect(h.publish).not.toHaveBeenCalled();
  });

  test('21. unsupported geolocation and watch errors become unavailable, not crashes', async () => {
    const unsupported = harness({ granted: 'throw' });
    await expect(unsupported.controller.start()).resolves.toBeUndefined();
    expect(unsupported.controller.getState().phase).toBe('unavailable');

    const failing = harness();
    await failing.controller.start();
    failing.emitError('GPS signal lost');
    expect(failing.unwatch).toHaveBeenCalledTimes(1);
    expect(failing.controller.getState()).toEqual({ phase: 'unavailable', message: 'GPS signal lost' });
  });

  test('22. Stop Sharing clears the watcher and ignores later fixes', async () => {
    const h = harness();
    await h.controller.start();
    h.controller.stop('user');
    expect(h.unwatch).toHaveBeenCalledTimes(1);
    expect(h.controller.isWatching()).toBe(false);
    expect(h.controller.getState()).toEqual({ phase: 'stopped', reason: 'user' });
    await h.emit(h.fix());
    expect(h.publish).not.toHaveBeenCalled();
  });

  test('23. resolution (server 409 not responding) stops the watcher', async () => {
    const h = harness({ publish: jest.fn(async () => classifyPublishError(409, 'not_responding')) });
    await h.controller.start();
    await h.emit(h.fix());
    expect(h.unwatch).toHaveBeenCalledTimes(1);
    expect(h.controller.getState()).toEqual({ phase: 'stopped', reason: 'not_responding' });
  });

  test('23. authorization or assignment loss (403) stops the watcher', async () => {
    const h = harness({ publish: jest.fn(async () => classifyPublishError(403)) });
    await h.controller.start();
    await h.emit(h.fix());
    expect(h.controller.isWatching()).toBe(false);
  });

  test('24. dispose (logout/unmount) clears the watcher, even mid-start', async () => {
    const h = harness();
    await h.controller.start();
    h.controller.dispose();
    expect(h.unwatch).toHaveBeenCalledTimes(1);

    const pending = harness();
    const starting = pending.controller.start();
    pending.controller.dispose();
    await starting;
    await flush();
    expect(pending.controller.isWatching()).toBe(false);
    if (pending.source.watch.mock.calls.length) expect(pending.unwatch).toHaveBeenCalledTimes(1);
  });

  test('25. publishing is throttled to one update per interval', async () => {
    const h = harness();
    await h.controller.start();
    await h.emit(h.fix());
    h.advance(1000); await h.emit(h.fix());
    h.advance(1000); await h.emit(h.fix());
    expect(h.publish).toHaveBeenCalledTimes(1);
    h.advance(PUBLISH_INTERVAL_MS); await h.emit(h.fix());
    expect(h.publish).toHaveBeenCalledTimes(2);
    expect(PUBLISH_INTERVAL_MS).toBeGreaterThanOrEqual(5000);
    expect(PUBLISH_INTERVAL_MS).toBeLessThanOrEqual(10000);
  });

  test('publishes only real fixes and records the last update time', async () => {
    const h = harness();
    await h.controller.start();
    const fix = h.fix();
    await h.emit(fix);
    expect(h.publish).toHaveBeenCalledWith(fix);
    expect(h.controller.getState()).toEqual({ phase: 'active', lastPublishedAt: expect.any(Number), publishError: false });
  });

  test('26. invalid, cached or out-of-order fixes are dropped, never substituted', async () => {
    const h = harness();
    await h.controller.start();
    await h.emit(h.fix({ latitude: NaN }));
    await h.emit(h.fix({ longitude: 200 }));
    await h.emit(h.fix({ accuracy: -3 }));
    const cached = h.fix();
    await h.emit({ ...cached, timestamp: cached.timestamp - 120000 });
    expect(h.publish).not.toHaveBeenCalled();
    const first = h.fix();
    await h.emit(first);
    h.advance(PUBLISH_INTERVAL_MS);
    await h.emit({ ...first });
    expect(h.publish).toHaveBeenCalledTimes(1);
    expect(isValidFix(null)).toBe(false);
  });

  test('transient publish errors keep tracking on and flag the failure', async () => {
    const h = harness({ publish: jest.fn(async () => classifyPublishError(500)) });
    await h.controller.start();
    await h.emit(h.fix());
    expect(h.controller.isWatching()).toBe(true);
    expect(h.controller.getState()).toEqual(expect.objectContaining({ phase: 'active', publishError: true }));
    expect(classifyPublishError(409, 'out_of_order')).toBe('ignored');
  });
});

describe('V3.6C freshness', () => {
  test('27. positions become stale after 30 seconds', () => {
    const captured = new Date('2026-10-06T10:00:00Z').toISOString();
    const t = Date.parse(captured);
    expect(STALE_AFTER_MS).toBe(30000);
    expect(getLocationFreshness(captured, t + 29000)).toBe('fresh');
    expect(getLocationFreshness(captured, t + 31000)).toBe('stale');
    expect(getLocationFreshness(null, t)).toBeNull();
    expect(getLocationFreshness('garbage', t)).toBeNull();
    expect(formatLocationAge(captured, t + 12000)).toBe('12s ago');
    expect(formatLocationAge(captured, t + 125000)).toBe('2 min ago');
  });
});

describe('V3.6C source guarantees', () => {
  const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    .split('\n').filter(line => !line.trim().startsWith('//')).join('\n');

  test('26. tracking code has no simulated, hardcoded or incident fallback coordinates', () => {
    ['utils/liveTracking.ts', 'services/liveLocationSource.ts', 'components/ResponderLiveTracking.tsx', 'components/ResponderLocationPanel.tsx'].forEach(file => {
      const source = read(file);
      expect(source).not.toMatch(/-?\d{1,3}\.\d{3,}/);
      expect(source).not.toMatch(/report\.(coordinates|latitude|longitude)|cluster\.(coordinates|latitude|longitude)/);
      expect(source).not.toMatch(/getCurrentPositionAsync|getLastKnownPositionAsync|EmergencyContext/);
    });
  });

  test('20. responder UI offers tracking only for backend-confirmed responding reports, behind a button', () => {
    const dispatch = read('app/(tabs-responder)/dispatch.tsx');
    expect(dispatch).toMatch(/report\.status === 'responding' \? <ResponderLiveTracking reportId=\{report\.id\} \/>/);
    const component = read('components/ResponderLiveTracking.tsx');
    expect(component).toMatch(/label="Start Live Tracking"/);
    expect(component).toMatch(/Live Tracking On/);
    expect(component).toMatch(/Last update: /);
    expect(component).toMatch(/label="Stop Sharing"/);
    expect(component).toMatch(/return \(\) => \{ controller\.dispose\(\)/);
    const effectBody = component.slice(component.indexOf('useEffect('), component.indexOf('}, [reportId]);'));
    expect(effectBody).not.toMatch(/\.start\(/);
  });

  test('28. citizen screens and the citizen API surface never fetch responder locations', () => {
    const citizenDir = path.join(__dirname, '..', 'app', '(tabs-citizen)');
    const citizenFiles = fs.readdirSync(citizenDir).filter(file => /\.tsx?$/.test(file));
    expect(citizenFiles.length).toBeGreaterThan(0);
    citizenFiles.forEach(file => expect(read(`app/(tabs-citizen)/${file}`)).not.toMatch(/getResponderLocation|ResponderLocationPanel|location-tracking/));
    const api = read('services/apiService.ts');
    expect(api).not.toMatch(/getEmergencyLocations|getTeamLocations|startLocationTracking|location-tracking\/emergency|location-tracking\/team/);
    const panelUsers = ['components/OperationalIncidentDetail.tsx'];
    panelUsers.forEach(file => expect(read(file)).toMatch(/ResponderLocationPanel/));
  });

  test('admin panel shows the empty state and never uses incident coordinates', () => {
    const panel = read('components/ResponderLocationPanel.tsx');
    expect(panel).toMatch(/Responder location not available yet\./);
    expect(panel).toMatch(/STALE/);
    expect(panel).toMatch(/Response complete/);
    expect(panel).not.toMatch(/\bETA\b|eta_minutes|speed|heading/);
  });
});
