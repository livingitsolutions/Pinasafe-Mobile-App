import { acquireSubmissionLock, buildDurableReportPayload, countAcceptedEvidence, MAX_ACCEPTED_EVIDENCE, EvidenceItem, CaptureLocation } from '../utils/evidenceFlow';

describe('durable citizen evidence flow', () => {
  test('only accepted evidence counts toward the maximum of five', () => {
    const items: EvidenceItem[] = [
      ...Array.from({ length: MAX_ACCEPTED_EVIDENCE }, (_, index) => ({ localId: `${index}`, uri: 'local', status: 'accepted' as const })),
      { localId: 'rejected', uri: 'local', status: 'rejected' as const },
      { localId: 'error', uri: 'local', status: 'error' as const },
    ];
    expect(countAcceptedEvidence(items)).toBe(5);
  });

  test.each(['road', 'fire'] as const)('builds a %s report with the durable binding identifier', type => {
    const captureLoc: CaptureLocation = { latitude: 10.5, longitude: 124.9, timestamp: 1700000000000 };
    expect(buildDurableReportPayload({
      type, description: '  A detailed incident  ', location: '  Main Road  ', uploadSessionId: 'session-id',
      coordinates: { latitude: captureLoc.latitude, longitude: captureLoc.longitude },
    })).toEqual({
      type, description: 'A detailed incident', location: 'Main Road', contactNumber: undefined,
      priority: 'high', coordinates: { latitude: captureLoc.latitude, longitude: captureLoc.longitude }, uploadSessionId: 'session-id',
    });
  });

  test('prevents a duplicate final submission while the first is active', () => {
    const lock = { current: false };
    expect(acquireSubmissionLock(lock)).toBe(true);
    expect(acquireSubmissionLock(lock)).toBe(false);
  });

  test('evidence item can carry capture-time location metadata', () => {
    const item: EvidenceItem = {
      localId: 'test',
      uri: 'file:///photo.jpg',
      status: 'accepted',
      captureLocation: {
        latitude: 10.5,
        longitude: 124.9,
        accuracy: 15,
        timestamp: 1700000000000,
        address: 'Main Road, Test City',
      },
    };
    expect(item.captureLocation?.latitude).toBe(10.5);
    expect(item.captureLocation?.accuracy).toBe(15);
  });

  test('buildDurableReportPayload uses capture coordinates when no explicit location string is given', () => {
    const result = buildDurableReportPayload({
      type: 'road',
      description: 'Test incident description',
      location: '',
      uploadSessionId: 'session-id',
      coordinates: { latitude: 10.5, longitude: 124.9 },
    });
    expect(result.coordinates).toEqual({ latitude: 10.5, longitude: 124.9 });
    expect(result.location).toBe('');
  });

  test('second capture can have different coordinates from first', () => {
    const loc1: CaptureLocation = { latitude: 10.5, longitude: 124.9, timestamp: 1700000000000 };
    const loc2: CaptureLocation = { latitude: 10.6, longitude: 125.0, timestamp: 1700000001000 };
    const items: EvidenceItem[] = [
      { localId: '1', uri: 'a', status: 'accepted', captureLocation: loc1 },
      { localId: '2', uri: 'b', status: 'accepted', captureLocation: loc2 },
    ];
    expect(items[0].captureLocation?.latitude).not.toBe(items[1].captureLocation?.latitude);
    expect(items[0].captureLocation?.longitude).not.toBe(items[1].captureLocation?.longitude);
  });

  test('rejected evidence is not counted as accepted', () => {
    const items: EvidenceItem[] = [
      { localId: '1', uri: 'a', status: 'accepted', captureLocation: { latitude: 10.5, longitude: 124.9, timestamp: 1 } },
      { localId: '2', uri: 'b', status: 'rejected' },
    ];
    expect(countAcceptedEvidence(items)).toBe(1);
  });

  test('evidence without capture location remains valid (nullable)', () => {
    const item: EvidenceItem = { localId: '1', uri: 'a', status: 'accepted' };
    expect(item.captureLocation).toBeUndefined();
    expect(countAcceptedEvidence([item])).toBe(1);
  });
});
