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
  parseEvidenceUploadDecision,
  resolveCaptureOutcome,
  resolveCaptureRole,
  getShutterState,
  retakeCaptureTransition,
  retryClassificationTransition,
} from '../utils/evidenceFlow';
import type { PrivateEvidenceItem } from '../services/apiService';

const captureLocation: CaptureLocation = { latitude: 0, longitude: 1, capturedAt: '2026-10-02T00:00:00.000Z' };

const validPrimary = (overrides: Partial<EvidenceItem> = {}): EvidenceItem => ({
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
  ...overrides,
});

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

  // ─── V3.2A single-primary submission invariant ───────────────────────────

  describe('V3.2A single-primary submission invariant', () => {
    test('A. exactly one accepted primary + valid classification/location → submission allowed', () => {
      expect(canSubmitEvidenceReport([validPrimary()], 'session-id', 'road')).toBe(true);
    });

    test('B. zero primary → denied', () => {
      expect(canSubmitEvidenceReport([], 'session-id', 'road')).toBe(false);
      expect(canSubmitEvidenceReport([
        { localId: 'supp', uri: 's', role: 'supplementary', status: 'accepted', captureLocation },
      ], 'session-id', 'road')).toBe(false);
    });

    test('C. one primary + one supplementary → denied for new report submission', () => {
      const supp: EvidenceItem = {
        localId: 'supp', uri: 'supp-photo', role: 'supplementary', status: 'accepted',
        captureLocation: { ...captureLocation, latitude: 2 },
      };
      expect(canSubmitEvidenceReport([validPrimary(), supp], 'session-id', 'road')).toBe(false);
    });

    test('D. two primary items → denied', () => {
      const second: EvidenceItem = validPrimary({ localId: 'second' });
      expect(canSubmitEvidenceReport([validPrimary(), second], 'session-id', 'road')).toBe(false);
    });

    test('E. primary classification mismatch → denied', () => {
      expect(canSubmitEvidenceReport([validPrimary()], 'session-id', 'fire')).toBe(false);
    });

    test('F. invalid primary capture location → denied', () => {
      const badLoc: EvidenceItem = validPrimary({
        captureLocation: { latitude: 999, longitude: 0, capturedAt: '2026-10-02T00:00:00.000Z' },
      });
      expect(canSubmitEvidenceReport([badLoc], 'session-id', 'road')).toBe(false);
    });

    test('null uploadSessionId → denied', () => {
      expect(canSubmitEvidenceReport([validPrimary()], null, 'road')).toBe(false);
    });

    test('null incidentType → denied', () => {
      expect(canSubmitEvidenceReport([validPrimary()], 'session-id', null)).toBe(false);
    });

    test('uploading item → denied', () => {
      const uploading: EvidenceItem = validPrimary({ status: 'uploading' });
      expect(canSubmitEvidenceReport([uploading], 'session-id', 'road')).toBe(false);
    });

    test('error item → denied', () => {
      const errored: EvidenceItem = validPrimary({ status: 'error' });
      expect(canSubmitEvidenceReport([errored], 'session-id', 'road')).toBe(false);
    });
  });

  // ─── Historical supplementary parsing remains supported ──────────────────

  describe('historical supplementary parsing compatibility', () => {
    test('G. parseEvidenceUploadDecision still recognises accepted-supplementary', () => {
      const decision = parseEvidenceUploadDecision({ accepted: true, evidenceId: 'ev-supp', evidenceRole: 'supplementary' });
      expect(decision).toEqual({ kind: 'accepted-supplementary', evidenceId: 'ev-supp' });
    });

    test('resolveCaptureOutcome still resolves accepted-supplementary', () => {
      const outcome = resolveCaptureOutcome('supplementary', { kind: 'accepted-supplementary', evidenceId: 'ev-supp' });
      expect(outcome).toEqual({ status: 'accepted', role: 'supplementary' });
    });

    test('countAcceptedSupplementaryEvidence still counts historical supplementary', () => {
      const items: EvidenceItem[] = [
        validPrimary(),
        { localId: 's1', uri: 's', role: 'supplementary', status: 'accepted', captureLocation },
      ];
      expect(countAcceptedSupplementaryEvidence(items)).toBe(1);
    });

    test('retakeCaptureTransition for supplementary still resolves to supplementary stage', () => {
      expect(retakeCaptureTransition('supplementary')).toMatchObject({ stage: 'supplementary', showCamera: true });
    });
  });

  // ─── Primary retake transition ───────────────────────────────────────────

  test('H. primary retake transition resolves to primary capture', () => {
    expect(retakeCaptureTransition('primary')).toMatchObject({ stage: 'capture', showCamera: true });
  });

  test('resolveCaptureRole returns primary for primary', () => {
    expect(resolveCaptureRole('primary')).toBe('primary');
  });

  describe('V3.1 supplementary role authoritative capture (historical compatibility)', () => {

    test('Add Evidence after accepted primary resolves supplementary role even when state is stale primary', () => {
      const authoritativeRole: { current: import('../utils/evidenceFlow').EvidenceRole } = { current: 'primary' };
      authoritativeRole.current = 'supplementary';
      const staleStateRole = 'primary';
      const resolved = resolveCaptureRole(authoritativeRole.current);
      expect(resolved).toBe('supplementary');
      expect(resolved).not.toBe(staleStateRole);
    });

    test('supplementary upload failure stores the failed item with role supplementary', () => {
      const resolvedRole = resolveCaptureRole('supplementary');
      const outcome = resolveCaptureOutcome(resolvedRole, { kind: 'unavailable' });
      expect(outcome.role).toBe('supplementary');
      expect(outcome.status).toBe('error');
      const failedItem: EvidenceItem = {
        localId: 'failed-supp', uri: 'supp-photo', role: outcome.role, status: outcome.status, captureLocation,
      };
      expect(failedItem.role).toBe('supplementary');
    });

    test('Retake Photo after failed supplementary reopens camera as supplementary, not primary', () => {
      const failedSupplementary: EvidenceItem = {
        localId: 'failed-supp', uri: 'supp-photo', role: 'supplementary', status: 'error', captureLocation,
      };
      const authoritativeRole: { current: import('../utils/evidenceFlow').EvidenceRole } = { current: 'primary' };
      authoritativeRole.current = failedSupplementary.role;
      const transition = retakeCaptureTransition(failedSupplementary.role);
      expect(transition.stage).toBe('supplementary');
      expect(transition.showCamera).toBe(true);
      expect(resolveCaptureRole(authoritativeRole.current)).toBe('supplementary');
    });

    test('retaken supplementary resolves supplementary again for the next upload', () => {
      const authoritativeRole = { current: 'supplementary' as const };
      const resolved = resolveCaptureRole(authoritativeRole.current);
      const outcome = resolveCaptureOutcome(resolved, { kind: 'accepted-supplementary', evidenceId: 'ev-supp' });
      expect(resolved).toBe('supplementary');
      expect(outcome).toEqual({ status: 'accepted', role: 'supplementary' });
    });

    test('supplementary success never requires or produces classification', () => {
      const decision = parseEvidenceUploadDecision({ accepted: true, evidenceId: 'ev-supp', evidenceRole: 'supplementary' });
      expect(decision).toEqual({ kind: 'accepted-supplementary', evidenceId: 'ev-supp' });
      const outcome = resolveCaptureOutcome('supplementary', decision);
      expect(outcome.status).toBe('accepted');
      expect(outcome).not.toHaveProperty('classification');
    });

    test('primary classification retry path is unchanged and reuses frozen metadata', () => {
      const failedPrimary: EvidenceItem = {
        localId: 'failed-primary', uri: 'primary-photo', role: 'primary', status: 'error', captureLocation,
      };
      const retry = buildPrimaryClassificationRetry(failedPrimary, 'session-id');
      expect(retry?.evidenceRole).toBe('primary');
      expect(retry?.captureLocation).toBe(failedPrimary.captureLocation);
      expect(retakeCaptureTransition('primary')).toMatchObject({ stage: 'capture', showCamera: true });
    });
  });

  // These exercise the exact shutter-gate helper that CameraCapture calls in
  // production, so they cover the real gating decision rather than a helper
  // reimplementation.
  describe('V3.1.1 camera shutter readiness gate (production helper)', () => {
    const ready = { permissionGranted: true, cameraRefAvailable: true, cameraReady: true, isProcessing: false };

    test('shutter is disabled before camera ready (starting)', () => {
      expect(getShutterState({ ...ready, cameraReady: false })).toEqual({ enabled: false, reason: 'starting' });
      expect(getShutterState({ ...ready, cameraRefAvailable: false })).toEqual({ enabled: false, reason: 'starting' });
    });

    test('onCameraReady (cameraReady=true) enables capture', () => {
      expect(getShutterState(ready)).toEqual({ enabled: true, reason: null });
    });

    test('shutter is disabled while processing and without permission', () => {
      expect(getShutterState({ ...ready, isProcessing: true })).toEqual({ enabled: false, reason: 'processing' });
      expect(getShutterState({ ...ready, permissionGranted: false })).toEqual({ enabled: false, reason: 'permission' });
    });

    test('a fresh second camera session is ready-gated independently of the first', () => {
      const firstSession = getShutterState(ready);
      const secondSessionStarting = getShutterState({ ...ready, cameraReady: false });
      const secondSessionReady = getShutterState(ready);
      expect(firstSession.enabled).toBe(true);
      expect(secondSessionStarting.enabled).toBe(false);
      expect(secondSessionReady.enabled).toBe(true);
    });
  });
});
