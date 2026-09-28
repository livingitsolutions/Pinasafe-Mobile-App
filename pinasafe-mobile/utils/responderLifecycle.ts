import { ApiError, isApiError } from '@/services/apiService';

export type IncidentLifecycleStatus = 'pending' | 'dispatched' | 'responding' | 'resolved';
export type ResponderTargetStatus = 'responding' | 'resolved';

export interface ResponderLifecycleAction {
  label: 'Start Responding' | 'Mark Resolved';
  targetStatus: ResponderTargetStatus;
}

export const getResponderLifecycleAction = (
  status: IncidentLifecycleStatus
): ResponderLifecycleAction | null => {
  if (status === 'dispatched') {
    return { label: 'Start Responding', targetStatus: 'responding' };
  }
  if (status === 'responding') {
    return { label: 'Mark Resolved', targetStatus: 'resolved' };
  }
  return null;
};

export type LifecycleLock = { current: boolean };

export interface RunResponderLifecycleOptions {
  reportId: string;
  currentStatus: IncidentLifecycleStatus;
  lock: LifecycleLock;
  update: (reportId: string, status: ResponderTargetStatus) => Promise<unknown>;
  refresh: () => Promise<void>;
}

export const runResponderLifecycle = async ({
  reportId,
  currentStatus,
  lock,
  update,
  refresh,
}: RunResponderLifecycleOptions): Promise<'updated' | 'duplicate'> => {
  const action = getResponderLifecycleAction(currentStatus);
  if (!action) throw new Error('No responder lifecycle action is available.');
  if (lock.current) return 'duplicate';

  lock.current = true;
  try {
    await update(reportId, action.targetStatus);
    await refresh();
    return 'updated';
  } catch (error) {
    if (isApiError(error) && error.status === 409) {
      await refresh();
    }
    throw error;
  } finally {
    lock.current = false;
  }
};

export const getResponderLifecycleErrorMessage = (error: unknown): string => {
  if (!isApiError(error)) return 'Unable to update this incident. Please try again.';

  const messages: Record<number, string> = {
    401: 'Your session has expired. Please sign in again.',
    403: 'You are not authorized or assigned to update this incident.',
    409: 'This incident changed before your update. The latest details have been loaded.',
  };

  return messages[(error as ApiError).status] || 'Unable to update this incident. Please try again.';
};
