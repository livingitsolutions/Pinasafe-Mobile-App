import {
  acquireSubmissionLock,
  acceptedClassificationTransition,
  buildPrimaryClassificationRetry,
  buildDurableReportPayload,
  CLASSIFICATION_RECOVERY_LABEL,
  CLASSIFICATION_RETRY_LABEL,
  CLASSIFICATION_UNAVAILABLE_MESSAGE,
  classificationFailureTransition,
  countAcceptedEvidence,
  countAcceptedSupplementaryEvidence,
  canSubmitEvidenceReport,
  discardFailedCapture,
  EvidenceItem,
  CaptureLocation,
  getClassificationRecoveryContent,
  MAX_ACCEPTED_EVIDENCE,
  MAX_SUPPLEMENTARY_EVIDENCE,
  parseEvidenceUploadDecision,
  retakeCaptureTransition,
  retryClassificationTransition,
} from '../utils/evidenceFlow';
import type { PrivateEvidenceItem } from '../services/apiService';

const captureLocation: CaptureLocation = { latitude: 0, longitude: 1, capturedAt: '2026-10-02T00:00:00.000Z' };

describe('durable citizen evidence flow', () => {
  test('only accepted evidence counts toward the maximum of five', () => {
    const items: EvidenceItem[] = [
      ...Array.from({ length: MAX_ACCEPTED_EVIDENCE }, (_, index) => ({ captureLocation, localId: `${index}`, uri: 'local', role: index === 0 ? 'primary' as const : 'supplementary' as const, status: 'accepted' as const })),
      { captureLocation, localId: 'rejected', uri: 'local', role: 'supplementary', status: 'rejected' as const },
      { captureLocation, localId: 'error', uri: 'local', role: 'supplementary', status: 'error' as const },
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
      role: 'primary',
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
      { localId: '1', uri: 'a', role: 'primary', status: 'accepted', captureLocation: loc1 },
      { localId: '2', uri: 'b', role: 'supplementary', status: 'accepted', captureLocation: loc2 },
    ];
    expect(items[0].captureLocation?.latitude).not.toBe(items[1].captureLocation?.latitude);
    expect(items[0].captureLocation?.longitude).not.toBe(items[1].captureLocation?.longitude);
  });

  test('rejected evidence is not counted as accepted', () => {
    const items: EvidenceItem[] = [
      { localId: '1', uri: 'a', role: 'primary', status: 'accepted', captureLocation: { latitude: 10.5, longitude: 124.9, capturedAt: '2026-10-02T00:00:00.000Z' } },
      { captureLocation, localId: '2', uri: 'b', role: 'supplementary', status: 'rejected' },
    ];
    expect(countAcceptedEvidence(items)).toBe(1);
  });

  test('historical private evidence without capture location remains valid', () => {
    const item: Pick<PrivateEvidenceItem, 'captureLocation'> = {};
    expect(item.captureLocation).toBeUndefined();
    const legacyWithNull: Pick<PrivateEvidenceItem, 'captureLocation'> = { captureLocation: null };
    expect(legacyWithNull.captureLocation).toBeNull();
  });

  test('unavailable or malformed classification enters explicit recoverable failure without accepting evidence', () => {
    const failedResponse = parseEvidenceUploadDecision(undefined);
    const malformedResponse = parseEvidenceUploadDecision({
      accepted: true,
      evidenceId: 'server-evidence-id',
      classification: { label: 'road' },
    });

    expect(failedResponse).toEqual({ kind: 'unavailable' });
    expect(malformedResponse).toEqual({ kind: 'unavailable' });
    expect(CLASSIFICATION_RECOVERY_LABEL).toBe('Retake / capture another photo');
    expect(CLASSIFICATION_UNAVAILABLE_MESSAGE).toMatch(/currently unavailable/i);
    expect(getClassificationRecoveryContent(false)).toBeNull();
    expect(getClassificationRecoveryContent(true)).toEqual({
      title: 'Classification unavailable',
      message: CLASSIFICATION_UNAVAILABLE_MESSAGE,
      actionLabel: CLASSIFICATION_RECOVERY_LABEL,
      retryLabel: null,
    });
    expect(getClassificationRecoveryContent(true, true)?.retryLabel).toBe(CLASSIFICATION_RETRY_LABEL);
    expect(classificationFailureTransition()).toEqual({
      stage: 'capture',
      showCamera: false,
      classificationUnavailable: true,
    });
  });

  test('unsupported and uncertain primary classification is rejected without an incident type', () => {
    const decision = parseEvidenceUploadDecision({
      accepted: false,
      evidenceRole: 'primary',
      classification: {
        accepted: false,
        label: 'other',
        confidence: 0.4,
        status: 'valid',
        action: 'uncertain',
        reason: 'Unclear image',
        caption: null,
      },
    });

    expect(decision).toMatchObject({ kind: 'rejected-primary', classification: { label: 'other', action: 'uncertain' } });
    expect(decision.kind).not.toBe('accepted-primary');
  });

  test('retry discards only the failed capture and reopens capture with accepted evidence intact', () => {
    const acceptedItem: EvidenceItem = {
      localId: 'accepted',
      uri: 'accepted-photo',
      role: 'primary',
      status: 'accepted',
      classification: {
        accepted: true,
        label: 'fire',
        confidence: 0.9,
        status: 'valid',
        action: 'accept',
        reason: null,
        caption: null,
      },
      captureLocation,
    };
    const failedItem: EvidenceItem = {
      localId: 'failed',
      uri: 'failed-photo',
      role: 'supplementary',
      status: 'error',
      captureLocation: { ...captureLocation, latitude: 2 },
    };
    const remaining = discardFailedCapture([acceptedItem, failedItem], failedItem.localId);

    expect(remaining).toEqual([acceptedItem]);
    expect(countAcceptedEvidence(remaining)).toBe(1);
    expect(retryClassificationTransition()).toEqual({
      stage: 'capture',
      showCamera: false,
      classificationUnavailable: false,
    });
    expect(buildPrimaryClassificationRetry(failedItem, 'session-id')).toBeNull();
    const failedPrimary: EvidenceItem = { ...failedItem, role: 'primary' };
    const retry = buildPrimaryClassificationRetry(failedPrimary, 'session-id');
    expect(retry).toMatchObject({
      uploadSessionId: 'session-id',
      image: { uri: failedPrimary.uri },
      evidenceRole: 'primary',
      localId: failedPrimary.localId,
    });
    expect(retry?.captureLocation).toBe(failedPrimary.captureLocation);
    expect(retakeCaptureTransition('primary')).toMatchObject({ stage: 'capture', showCamera: true });
  });

  test('repeated classification failure remains recoverable and a valid retry is accepted by the normal path', () => {
    const acceptedResponse = parseEvidenceUploadDecision({
      accepted: true,
      evidenceId: 'server-evidence-id',
      evidenceRole: 'primary',
      classification: {
        label: 'fire',
        confidence: 0.92,
        status: 'valid',
        action: 'accept',
        reason: 'Fire confirmed',
        caption: 'Smoke visible',
      },
    });

    expect(classificationFailureTransition().classificationUnavailable).toBe(true);
    expect(retryClassificationTransition().showCamera).toBe(false);
    expect(classificationFailureTransition().classificationUnavailable).toBe(true);
    expect(retryClassificationTransition().stage).toBe('capture');
    expect(acceptedResponse).toMatchObject({
      kind: 'accepted-primary',
      evidenceId: 'server-evidence-id',
      classification: { label: 'fire', action: 'accept' },
    });
    expect(acceptedClassificationTransition().stage).toBe('verify');
  });

  test('primary-only submission is valid and supplementary evidence is optional', () => {
    const primary: EvidenceItem = {
      localId: 'primary',
      uri: 'primary-photo',
      role: 'primary',
      status: 'accepted',
      classification: {
        accepted: true,
        label: 'road',
        confidence: 0.88,
        status: 'valid',
        action: 'accept',
        reason: null,
        caption: null,
      },
      captureLocation,
    };
    const supplementary = Array.from({ length: MAX_SUPPLEMENTARY_EVIDENCE }, (_, index): EvidenceItem => ({
      localId: `supplementary-${index}`,
      uri: `supplementary-photo-${index}`,
      role: 'supplementary',
      status: 'accepted',
      captureLocation: { ...captureLocation, latitude: index + 1 },
    }));

    expect(canSubmitEvidenceReport([primary], 'session-id', 'road')).toBe(true);
    expect(canSubmitEvidenceReport([primary, ...supplementary], 'session-id', 'road')).toBe(true);
    expect(countAcceptedSupplementaryEvidence([primary, ...supplementary])).toBe(4);
    expect(canSubmitEvidenceReport([primary, ...supplementary, {
      ...supplementary[0], localId: 'fifth-supplementary'
    }], 'session-id', 'road')).toBe(false);
    expect(canSubmitEvidenceReport(supplementary, 'session-id', 'road')).toBe(false);
    expect(canSubmitEvidenceReport([primary], null, 'road')).toBe(false);
    expect(canSubmitEvidenceReport([primary], 'session-id', 'fire')).toBe(false);
  });
});
