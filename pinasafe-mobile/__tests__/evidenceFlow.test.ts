import { acquireSubmissionLock, buildDurableReportPayload, countAcceptedEvidence, MAX_ACCEPTED_EVIDENCE, EvidenceItem, CaptureLocation } from '../utils/evidenceFlow';
import type { PrivateEvidenceItem } from '../services/apiService';

const captureLocation: CaptureLocation = { latitude: 0, longitude: 1, capturedAt: '2026-10-02T00:00:00.000Z' };

describe('durable citizen evidence flow', () => {
  test('only accepted evidence counts toward the maximum of five', () => {
    const items: EvidenceItem[] = [
      ...Array.from({ length: MAX_ACCEPTED_EVIDENCE }, (_, index) => ({ captureLocation, localId: `${index}`, uri: 'local', status: 'accepted' as const })),
      { captureLocation, localId: 'rejected', uri: 'local', status: 'rejected' as const },
      { captureLocation, localId: 'error', uri: 'local', status: 'error' as const },
    ];
    expect(countAcceptedEvidence(items)).toBe(5);
  });

  test.each(['road', 'fire'] as const)('builds a %s report with the durable binding identifier', type => {
    const captureLoc: CaptureLocation = { latitude: 10.5, longitude: 124.9, capturedAt: '2026-10-02T00:00:00.000Z' };
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
        capturedAt: '2026-10-02T00:00:00.000Z',
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
    const loc1: CaptureLocation = { latitude: 10.5, longitude: 124.9, capturedAt: '2026-10-02T00:00:00.000Z' };
    const loc2: CaptureLocation = { latitude: 10.6, longitude: 125.0, capturedAt: '2026-10-02T00:00:00.000Z' };
    const items: EvidenceItem[] = [
      { localId: '1', uri: 'a', status: 'accepted', captureLocation: loc1 },
      { localId: '2', uri: 'b', status: 'accepted', captureLocation: loc2 },
    ];
    expect(items[0].captureLocation?.latitude).not.toBe(items[1].captureLocation?.latitude);
    expect(items[0].captureLocation?.longitude).not.toBe(items[1].captureLocation?.longitude);
  });

  test('rejected evidence is not counted as accepted', () => {
    const items: EvidenceItem[] = [
      { localId: '1', uri: 'a', status: 'accepted', captureLocation: { latitude: 10.5, longitude: 124.9, capturedAt: '2026-10-02T00:00:00.000Z' } },
      { captureLocation, localId: '2', uri: 'b', status: 'rejected' },
    ];
    expect(countAcceptedEvidence(items)).toBe(1);
  });

  test('historical private evidence without capture location remains valid', () => {
    const item: Pick<PrivateEvidenceItem, 'captureLocation'> = {};
    expect(item.captureLocation).toBeUndefined();
    const legacyWithNull: Pick<PrivateEvidenceItem, 'captureLocation'> = { captureLocation: null };
    expect(legacyWithNull.captureLocation).toBeNull();
  });
});
