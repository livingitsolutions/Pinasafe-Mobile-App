import { captureWithLocation, CaptureLocation, EvidenceItem, getFirstAcceptedCaptureLocation, isValidCaptureLocation } from '../utils/evidenceFlow';
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
    const second = await captureWithLocation(async () => 'second', async () => ({ ...currentLocation(), coords: { latitude: 2, longitude: 3 } }));
    expect(first.captureLocation).not.toEqual(second.captureLocation);
    expect(first.photo).toBe('first');
    expect(second.photo).toBe('second');
  });

  test('report canonical location is the first accepted capture, not a later capture or rejection', () => {
    const items: EvidenceItem[] = [
      { localId: 'rejected', uri: 'rejected', status: 'rejected', captureLocation: { ...captureLocation, latitude: 4 } },
      { localId: 'first', uri: 'first', status: 'accepted', captureLocation },
      { localId: 'second', uri: 'second', status: 'accepted', captureLocation: { ...captureLocation, latitude: 2 } },
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
});
