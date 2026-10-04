import type { EvidenceClassification } from '@/services/apiService';
import type { LocationData } from '@/hooks/locationService';

export type IncidentType = 'road' | 'fire';
export type EvidenceRole = 'primary' | 'supplementary';

export type CaptureLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  capturedAt: string;
  address?: string;
};

export type EvidenceItem = {
  localId: string;
  uri: string;
  role: EvidenceRole;
  status: 'uploading' | 'accepted' | 'rejected' | 'error';
  classification?: EvidenceClassification;
  reason?: string;
  captureLocation: CaptureLocation;
};

export type EvidenceFlowStage = 'capture' | 'verify' | 'supplementary' | 'review' | 'success';

export const CLASSIFICATION_UNAVAILABLE_MESSAGE = 'AI classification is currently unavailable. This photo was not accepted. Retake it to try again.';
export const CLASSIFICATION_RECOVERY_LABEL = 'Retake / capture another photo';
export const CLASSIFICATION_RETRY_LABEL = 'Try Classification Again';

export const getClassificationRecoveryContent = (unavailable: boolean, retryAvailable = false) => unavailable
  ? {
      title: 'Classification unavailable',
      message: CLASSIFICATION_UNAVAILABLE_MESSAGE,
      actionLabel: CLASSIFICATION_RECOVERY_LABEL,
      retryLabel: retryAvailable ? CLASSIFICATION_RETRY_LABEL : null,
    }
  : null;

export type ClassificationRecoveryTransition = {
  stage: EvidenceFlowStage;
  showCamera: boolean;
  classificationUnavailable: boolean;
};

export const classificationFailureTransition = (): ClassificationRecoveryTransition => ({
  stage: 'capture',
  showCamera: false,
  classificationUnavailable: true,
});

export const retryClassificationTransition = (): ClassificationRecoveryTransition => ({
  stage: 'capture',
  showCamera: false,
  classificationUnavailable: false,
});

export const retakeCaptureTransition = (evidenceRole: EvidenceRole): ClassificationRecoveryTransition => ({
  stage: evidenceRole === 'primary' ? 'capture' : 'supplementary',
  showCamera: true,
  classificationUnavailable: false,
});

export const acceptedClassificationTransition = () => ({ stage: 'verify' as const });

export const discardFailedCapture = (items: EvidenceItem[], failedLocalId: string) =>
  items.filter(item => item.localId !== failedLocalId);

/**
 * Resolve the authoritative role for one shutter operation. The screen reads
 * this from a ref written synchronously when the camera opens, so a stale
 * React state closure can never override the intended role. Returns the role
 * to use for the local item, upload, and failure handling.
 */
export const resolveCaptureRole = (authoritativeRole: EvidenceRole): EvidenceRole => authoritativeRole;

/**
 * Map a completed upload to the item status/role the screen should persist.
 * The role always comes from the resolved capture context, never re-read from
 * mutable state, so a failed supplementary keeps role 'supplementary'.
 */
export const resolveCaptureOutcome = (
  resolvedRole: EvidenceRole,
  decision: EvidenceUploadDecision
): { status: EvidenceItem['status']; role: EvidenceRole; reason?: string } => {
  if (decision.kind === 'accepted-supplementary' && resolvedRole === 'supplementary') {
    return { status: 'accepted', role: 'supplementary' };
  }
  if (decision.kind === 'accepted-primary' && resolvedRole === 'primary') {
    return { status: 'accepted', role: 'primary' };
  }
  if (decision.kind === 'rejected-primary' && resolvedRole === 'primary') {
    return { status: 'rejected', role: 'primary' };
  }
  return { status: 'error', role: resolvedRole, reason: 'This photo was not accepted.' };
};

export const buildPrimaryClassificationRetry = (
  item: EvidenceItem | null,
  uploadSessionId: string | null
) => item?.role === 'primary'
  && item.status === 'error'
  && uploadSessionId
  ? {
      uploadSessionId,
      image: { uri: item.uri },
      captureLocation: item.captureLocation,
      evidenceRole: 'primary' as const,
      localId: item.localId,
    }
  : null;

export type EvidenceUploadDecision =
  | { kind: 'accepted-primary'; evidenceId: string; classification: Omit<EvidenceClassification, 'accepted'> }
  | { kind: 'accepted-supplementary'; evidenceId: string }
  | { kind: 'rejected-primary'; classification: EvidenceClassification }
  | { kind: 'unavailable' };

const isClassificationDetails = (value: unknown) => {
  if (!value || typeof value !== 'object') return false;
  const classification = value as Record<string, unknown>;
  return ['fire', 'road', 'other'].includes(String(classification.label))
    && (classification.confidence === null
      || (typeof classification.confidence === 'number'
        && Number.isFinite(classification.confidence)
        && classification.confidence >= 0
        && classification.confidence <= 1))
    && ['valid', 'invalid'].includes(String(classification.status))
    && ['accept', 'reject', 'uncertain'].includes(String(classification.action))
    && (classification.reason === null || typeof classification.reason === 'string')
    && (classification.caption === null || typeof classification.caption === 'string');
};

export const parseEvidenceUploadDecision = (value: unknown): EvidenceUploadDecision => {
  if (!value || typeof value !== 'object') return { kind: 'unavailable' };
  const response = value as Record<string, unknown>;

  if (response.accepted === true) {
    if (typeof response.evidenceId !== 'string' || response.evidenceId.length === 0) {
      return { kind: 'unavailable' };
    }

    if (response.evidenceRole === 'supplementary') {
      return Object.prototype.hasOwnProperty.call(response, 'classification')
        ? { kind: 'unavailable' }
        : { kind: 'accepted-supplementary', evidenceId: response.evidenceId };
    }

    const classification = response.classification;
    if (response.evidenceRole === 'primary' && isClassificationDetails(classification)) {
      const details = classification as Record<string, unknown>;
      if (
        ['fire', 'road'].includes(String(details.label))
        && details.status === 'valid'
        && details.action === 'accept'
        && details.accepted !== false
      ) {
        return {
          kind: 'accepted-primary',
          evidenceId: response.evidenceId,
          classification: details as unknown as Omit<EvidenceClassification, 'accepted'>,
        };
      }
    }
    return { kind: 'unavailable' };
  }

  if (
    response.accepted === false
    && response.evidenceRole === 'primary'
    && isClassificationDetails(response.classification)
  ) {
    return {
      kind: 'rejected-primary',
      classification: response.classification as EvidenceClassification,
    };
  }

  if (response.accepted === false && response.evidenceRole === undefined && isClassificationDetails(response)) {
    return {
      kind: 'rejected-primary',
      classification: response as unknown as EvidenceClassification,
    };
  }

  return { kind: 'unavailable' };
};

export const isValidCaptureLocation = (location: CaptureLocation | null | undefined): location is CaptureLocation => {
  if (!location) return false;
  return Number.isFinite(location.latitude) && location.latitude >= -90 && location.latitude <= 90
    && Number.isFinite(location.longitude) && location.longitude >= -180 && location.longitude <= 180
    && (location.accuracy === undefined || (Number.isFinite(location.accuracy) && location.accuracy >= 0))
    && typeof location.capturedAt === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(location.capturedAt)
    && Number.isFinite(Date.parse(location.capturedAt))
    && new Date(location.capturedAt).toISOString() === location.capturedAt;
};

// Bounded location acquisition. Mobile GPS re-acquisition on a reopened camera
// can otherwise hang the whole capture indefinitely. This fails CLOSED: on
// timeout we throw and never accept/upload/classify the photo.
export const CAPTURE_LOCATION_TIMEOUT_MS = 12000;

// Bounded photo capture. expo-camera's takePictureAsync has no built-in timeout;
// on a reopened web CameraView it can hang indefinitely waiting for a frame.
// This fails CLOSED: on timeout we throw and never accept/upload/classify.
export const CAPTURE_PHOTO_TIMEOUT_MS = 15000;

export class PhotoCaptureTimeoutError extends Error {
  readonly isPhotoCaptureTimeout = true;
  constructor(
    message = 'Camera capture took too long. The camera has been restarted. Please try again.'
  ) {
    super(message);
    this.name = 'PhotoCaptureTimeoutError';
  }
}

export const isPhotoCaptureTimeout = (error: unknown): boolean =>
  error instanceof PhotoCaptureTimeoutError;

const withTimeout = <T>(promise: Promise<T>, ms: number, error: string | Error): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      settled = true;
      reject(typeof error === 'string' ? new Error(error) : error);
    }, ms);
  });
  // Wrap the underlying promise so that:
  //  - early resolution wins the race with the original value
  //  - early rejection wins the race with the original error
  //  - late rejection AFTER timeout is swallowed (no unhandled rejection)
  const wrapped = new Promise<T>((resolve, reject) => {
    Promise.resolve(promise).then(
      value => {
        if (!settled) { settled = true; resolve(value); }
      },
      reason => {
        if (!settled) { settled = true; reject(reason); }
      },
    );
  });
  return Promise.race([wrapped, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
};

export const captureWithLocation = async <Photo>(
  takePhoto: () => Promise<Photo>,
  acquireLocation: () => Promise<LocationData | null>,
) => {
  const startedAt = Date.now();
  const [photo, location] = await Promise.all([
    withTimeout(
      takePhoto(),
      CAPTURE_PHOTO_TIMEOUT_MS,
      new PhotoCaptureTimeoutError()
    ),
    withTimeout(
      acquireLocation(),
      CAPTURE_LOCATION_TIMEOUT_MS,
      'Location could not be captured in time. Check location access and try the photo again.'
    ),
  ]);
  if (!location || !Number.isFinite(location.timestamp)
    || location.timestamp < startedAt - 5000 || location.timestamp > Date.now() + 1000) {
    throw new Error('A current capture location is required. Check location permission and try again.');
  }
  const captureLocation = Object.freeze({
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
    capturedAt: new Date(location.timestamp).toISOString(),
    address: location.address,
  });
  if (!isValidCaptureLocation(captureLocation)) {
    throw new Error('A valid capture location is required. Check location permission and try again.');
  }
  return { photo, captureLocation };
};

export const getFirstAcceptedPrimaryEvidence = (items: EvidenceItem[]) =>
  items.find(item => item.role === 'primary' && item.status === 'accepted') ?? null;

export const getFirstAcceptedCaptureLocation = (items: EvidenceItem[]) =>
  getFirstAcceptedPrimaryEvidence(items)?.captureLocation ?? null;

export const MAX_ACCEPTED_EVIDENCE = 5;
export const MAX_SUPPLEMENTARY_EVIDENCE = 4;

/**
 * Production shutter gate for CameraCapture. The shutter is enabled only when
 * the camera is fully ready; otherwise capture is blocked and the UI shows a
 * concise reason instead of a dead shutter. This is the single source of truth
 * the component calls directly.
 */
export type ShutterBlockReason = 'permission' | 'starting' | 'processing' | null;
export const getShutterState = (input: {
  permissionGranted: boolean;
  cameraRefAvailable: boolean;
  cameraReady: boolean;
  isProcessing: boolean;
}): { enabled: boolean; reason: ShutterBlockReason } => {
  if (!input.permissionGranted) return { enabled: false, reason: 'permission' };
  if (!input.cameraRefAvailable || !input.cameraReady) return { enabled: false, reason: 'starting' };
  if (input.isProcessing) return { enabled: false, reason: 'processing' };
  return { enabled: true, reason: null };
};

export const countAcceptedEvidence = (items: EvidenceItem[]) =>
  items.filter(item => item.status === 'accepted').length;

export const countAcceptedSupplementaryEvidence = (items: EvidenceItem[]) =>
  items.filter(item => item.role === 'supplementary' && item.status === 'accepted').length;

export const canSubmitEvidenceReport = (
  items: EvidenceItem[],
  uploadSessionId: string | null,
  incidentType: IncidentType | null
) => {
  const primaryItems = items.filter(item => item.role === 'primary' && item.status === 'accepted');
  const supplementaryItems = items.filter(item => item.role === 'supplementary' && item.status === 'accepted');
  const primary = primaryItems[0];

  return Boolean(
    uploadSessionId
    && incidentType
    && primaryItems.length === 1
    && supplementaryItems.length === 0
    && items.every(item => item.status !== 'uploading' && item.status !== 'error')
    && primary?.classification?.accepted === true
    && (primary.classification.label === 'fire' || primary.classification.label === 'road')
    && primary.classification.status === 'valid'
    && primary.classification.action === 'accept'
    && primary.classification.label === incidentType
    && isValidCaptureLocation(primary.captureLocation)
  );
};

export const acquireSubmissionLock = (lock: { current: boolean }) => {
  if (lock.current) return false;
  lock.current = true;
  return true;
};

export const buildDurableReportPayload = (input: {
  type: IncidentType;
  description: string;
  location: string;
  contactNumber?: string;
  coordinates?: { latitude: number; longitude: number };
  uploadSessionId: string;
}) => ({
  type: input.type,
  description: input.description.trim(),
  location: input.location.trim(),
  contactNumber: input.contactNumber?.trim() || undefined,
  coordinates: input.coordinates,
  priority: 'high' as const,
  uploadSessionId: input.uploadSessionId,
});
