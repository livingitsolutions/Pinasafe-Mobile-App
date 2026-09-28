import { ApiError, isApiError } from '@/services/apiService';

export type DispatchLock = { current: boolean };

export const acquireDispatchLock = (lock: DispatchLock): boolean => {
  if (lock.current) return false;
  lock.current = true;
  return true;
};

export const getDispatchErrorMessage = (error: unknown): string => {
  if (!isApiError(error)) return 'Unable to dispatch this incident. Please try again.';

  const messages: Record<number, string> = {
    400: 'Select a valid team before dispatching this incident.',
    401: 'Your session has expired. Please sign in again.',
    403: 'You are not authorized to dispatch this incident.',
    404: 'The incident or selected team is no longer available.',
    409: 'This incident changed before it could be dispatched. The latest details have been loaded.',
  };

  return messages[(error as ApiError).status] || 'Unable to dispatch this incident. Please try again.';
};
