import { EvidenceClassification } from '@/services/apiService';

export type IncidentType = 'road' | 'fire';
export type EvidenceItem = {
  localId: string;
  uri: string;
  status: 'uploading' | 'accepted' | 'rejected' | 'error';
  classification?: EvidenceClassification;
  reason?: string;
};

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
