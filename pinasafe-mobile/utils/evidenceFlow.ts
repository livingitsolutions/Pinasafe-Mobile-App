import type { EvidenceClassification } from '@/services/apiService';
import type { LocationData } from '@/hooks/locationService';

export type IncidentType = 'road' | 'fire';

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
  status: 'uploading' | 'accepted' | 'rejected' | 'error';
  classification?: EvidenceClassification;
  reason?: string;
  captureLocation: CaptureLocation;
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

export const captureWithLocation = async <Photo>(
  takePhoto: () => Promise<Photo>,
  acquireLocation: () => Promise<LocationData | null>,
) => {
  const startedAt = Date.now();
  const [photo, location] = await Promise.all([takePhoto(), acquireLocation()]);
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

export const getFirstAcceptedCaptureLocation = (items: EvidenceItem[]) =>
  items.find(item => item.status === 'accepted')?.captureLocation ?? null;

export const MAX_ACCEPTED_EVIDENCE = 5;

export const countAcceptedEvidence = (items: EvidenceItem[]) =>
  items.filter(item => item.status === 'accepted').length;

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
