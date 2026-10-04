import {
  captureWithLocation,
  CaptureLocation,
  CAPTURE_LOCATION_TIMEOUT_MS,
  CAPTURE_PHOTO_TIMEOUT_MS,
  EvidenceItem,
  getFirstAcceptedCaptureLocation,
  isPhotoCaptureTimeout,
  isValidCaptureLocation,
} from '../utils/evidenceFlow';
import type { LocationData } from '../hooks/locationService';

const now = Date.parse('2026-10-02T00:00:00.000Z');
const currentLocation = (): LocationData => ({ coords: { latitude: 0, longitude: 1, accuracy: 5 }, timestamp: now });
const captureLocation: CaptureLocation = { latitude: 0, longitude: 1, capturedAt: new Date(now).toISOString() };

describe('capture-time location contract', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(now));
  afterEach(() => jest.restoreAllMocks());

  test('starts location acquisition concurrently with the shutter and freezes the per-image result', async () => {
    let finishPhoto!: (photo: { uri: string }) => void;
    const takePhoto = jest.fn(() => new Promise<{ uri: string }>(resolve => { finishPhoto = resolve; }));
    const acquireLocation = jest.fn(async () => currentLocation());
    const operation = captureWithLocation(takePhoto, acquireLocation);
    expect(takePhoto).toHaveBeenCalledTimes(1);
    expect(acquireLocation).toHaveBeenCalledTimes(1);
    finishPhoto({ uri: 'image-a' });
    const result = await operation;
    expect(result.photo.uri).toBe('image-a');
    expect(result.captureLocation).toEqual({ ...captureLocation, accuracy: 5, address: undefined });
    expect(Object.isFrozen(result.captureLocation)).toBe(true);
    expect(Reflect.set(result.captureLocation, 'latitude', 2)).toBe(false);
  });

  test.each([
    ['missing location', null],
    ['stale observation', { ...currentLocation(), timestamp: now - 6000 }],
    ['invalid observation time', { ...currentLocation(), timestamp: NaN }],
    ['future observation', { ...currentLocation(), timestamp: now + 2000 }],
    ['invalid coordinates', { ...currentLocation(), coords: { latitude: NaN, longitude: 1 } }],
  ])('blocks uploadable capture with %s', async (_, location) => {
    await expect(captureWithLocation(async () => ({ uri: 'photo' }), async () => location)).rejects.toThrow(/location/i);
  });

  test('two captures retain independent metadata', async () => {
    const first = await captureWithLocation(async () => 'first', async () => currentLocation());
    const second = await captureWithLocation(async () => 'second', async () => ({ ...currentLocation(), timestamp: now + 10, coords: { latitude: 2, longitude: 3 } }));
    expect(first.captureLocation).not.toEqual(second.captureLocation);
    expect(first.photo).toBe('first');
    expect(second.photo).toBe('second');
    expect(second.captureLocation.capturedAt).not.toBe(first.captureLocation.capturedAt);
  });

  test('report canonical location is the first accepted capture, not a later capture or rejection', () => {
    const items: EvidenceItem[] = [
      { localId: 'rejected', uri: 'rejected', role: 'primary', status: 'rejected', captureLocation: { ...captureLocation, latitude: 4 } },
      { localId: 'first', uri: 'first', role: 'primary', status: 'accepted', captureLocation },
      { localId: 'second', uri: 'second', role: 'supplementary', status: 'accepted', captureLocation: { ...captureLocation, latitude: 2 } },
    ];
    expect(getFirstAcceptedCaptureLocation(items)).toBe(captureLocation);
    expect(getFirstAcceptedCaptureLocation([])).toBeNull();
  });

  test.each([
    undefined,
    null,
    { ...captureLocation, latitude: Infinity },
    { ...captureLocation, longitude: NaN },
    { ...captureLocation, accuracy: -1 },
    { ...captureLocation, capturedAt: '2026-02-30T00:00:00.000Z' },
    { ...captureLocation, capturedAt: '' },
  ])('guards invalid new evidence metadata', location => {
    expect(isValidCaptureLocation(location)).toBe(false);
  });

  describe('bounded location acquisition (V3.1.1)', () => {
    test('fails closed when location acquisition never resolves within the timeout', async () => {
      jest.useFakeTimers();
      try {
        const neverResolves = () => new Promise<LocationData | null>(() => {});
        const operation = captureWithLocation(async () => ({ uri: 'photo' }), neverResolves);
        const assertion = expect(operation).rejects.toThrow(/location could not be captured/i);
        await jest.advanceTimersByTimeAsync(CAPTURE_LOCATION_TIMEOUT_MS);
        await assertion;
      } finally {
        jest.useRealTimers();
      }
    });

    test('timeout does not accept the photo, reuse coordinates, or call upload', async () => {
      jest.useFakeTimers();
      try {
        const takePhoto = jest.fn(async () => ({ uri: 'new-photo' }));
        const neverResolves = () => new Promise<LocationData | null>(() => {});
        const operation = captureWithLocation(takePhoto, neverResolves);
        const assertion = expect(operation).rejects.toThrow(/location/i);
        await jest.advanceTimersByTimeAsync(CAPTURE_LOCATION_TIMEOUT_MS + 1);
        await assertion;
        expect(takePhoto).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    test('late location rejection after timeout does not cause an unhandled rejection', async () => {
      jest.useFakeTimers();
      const rejectLater = () => new Promise<LocationData | null>((_r, reject) => {
        setTimeout(() => reject(new Error('gps lost')), CAPTURE_LOCATION_TIMEOUT_MS * 2);
      });
      const operation = captureWithLocation(async () => ({ uri: 'photo' }), rejectLater);
      const assertion = expect(operation).rejects.toThrow(/location could not be captured/i);
      await jest.advanceTimersByTimeAsync(CAPTURE_LOCATION_TIMEOUT_MS);
      await assertion;
      // Advance past the late rejection; it must be swallowed by the guard.
      await jest.advanceTimersByTimeAsync(CAPTURE_LOCATION_TIMEOUT_MS * 2);
      jest.useRealTimers();
    });

    test('succeeds when location resolves before the timeout and reuses that attempt metadata only', async () => {
      const result = await captureWithLocation(
        async () => ({ uri: 'second-photo' }),
        async () => ({ ...currentLocation(), coords: { latitude: 7, longitude: 8, accuracy: 3 } })
      );
      expect(result.photo).toEqual({ uri: 'second-photo' });
      expect(result.captureLocation.latitude).toBe(7);
      expect(result.captureLocation.longitude).toBe(8);
    });
  });

  describe('bounded photo capture (V3.1.2)', () => {
    test('fails closed when takePhoto never resolves within the photo timeout', async () => {
      jest.useFakeTimers();
      try {
        const neverResolves = () => new Promise<{ uri: string }>(() => {});
        const acquireLocation = jest.fn(async () => currentLocation());
        const operation = captureWithLocation(neverResolves, acquireLocation);
        const assertion = expect(operation).rejects.toThrow(/camera capture took too long/i);
        await jest.advanceTimersByTimeAsync(CAPTURE_PHOTO_TIMEOUT_MS);
        await assertion;
      } finally {
        jest.useRealTimers();
      }
    });

    test('photo timeout is distinguishable from location timeout and other errors', async () => {
      jest.useFakeTimers();
      try {
        const neverResolves = () => new Promise<{ uri: string }>(() => {});
        const operation = captureWithLocation(neverResolves, async () => currentLocation());
        const rejection = jest.fn();
        operation.catch(rejection);
        await jest.advanceTimersByTimeAsync(CAPTURE_PHOTO_TIMEOUT_MS);
        await Promise.resolve();
        expect(rejection).toHaveBeenCalledTimes(1);
        expect(isPhotoCaptureTimeout(rejection.mock.calls[0][0])).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    test('late photo resolution after timeout does not produce a successful capture', async () => {
      jest.useFakeTimers();
      try {
        let resolvePhoto!: (photo: { uri: string }) => void;
        const takePhoto = () => new Promise<{ uri: string }>(resolve => { resolvePhoto = resolve; });
        const operation = captureWithLocation(takePhoto, async () => currentLocation());
        const assertion = expect(operation).rejects.toThrow(/camera capture took too long/i);
        await jest.advanceTimersByTimeAsync(CAPTURE_PHOTO_TIMEOUT_MS);
        await assertion;
        // Late resolution must not cause an unhandled rejection or change outcome.
        resolvePhoto({ uri: 'late-photo' });
        await jest.advanceTimersByTimeAsync(1000);
        // The operation already rejected; late resolution is swallowed by the guard.
        await expect(operation).rejects.toThrow(/camera capture took too long/i);
      } finally {
        jest.useRealTimers();
      }
    });

    test('location timeout still fires when photo succeeds but location never resolves', async () => {
      jest.useFakeTimers();
      try {
        const takePhoto = jest.fn(async () => ({ uri: 'photo' }));
        const neverResolves = () => new Promise<LocationData | null>(() => {});
        const operation = captureWithLocation(takePhoto, neverResolves);
        const assertion = expect(operation).rejects.toThrow(/location could not be captured/i);
        await jest.advanceTimersByTimeAsync(CAPTURE_LOCATION_TIMEOUT_MS);
        await assertion;
        expect(isPhotoCaptureTimeout(await operation.catch(e => e))).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });

    test('normal capture succeeds when both photo and location resolve in time', async () => {
      const result = await captureWithLocation(
        async () => ({ uri: 'normal-photo' }),
        async () => currentLocation(),
      );
      expect(result.photo.uri).toBe('normal-photo');
      expect(result.captureLocation.latitude).toBe(0);
    });

    test('early takePhoto rejection propagates the original error before timeout', async () => {
      const cameraError = new Error('Camera hardware failure');
      const operation = captureWithLocation(
        () => Promise.reject(cameraError),
        async () => currentLocation(),
      );
      const caught = await operation.catch(e => e);
      expect(caught).toBe(cameraError);
      expect(isPhotoCaptureTimeout(caught)).toBe(false);
    });

    test('late takePhoto rejection after timeout does not cause an unhandled rejection', async () => {
      jest.useFakeTimers();
      try {
        let rejectPhoto!: (error: Error) => void;
        const takePhoto = () => new Promise<{ uri: string }>((_resolve, reject) => { rejectPhoto = reject; });
        const operation = captureWithLocation(takePhoto, async () => currentLocation());
        const assertion = expect(operation).rejects.toThrow(/camera capture took too long/i);
        await jest.advanceTimersByTimeAsync(CAPTURE_PHOTO_TIMEOUT_MS);
        await assertion;
        rejectPhoto(new Error('late camera error'));
        await jest.advanceTimersByTimeAsync(1000);
        await expect(operation).rejects.toThrow(/camera capture took too long/i);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
