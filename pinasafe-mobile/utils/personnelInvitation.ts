import { ApiError } from '@/services/apiService';

export const PERSONNEL_INVITATION_ROUTE = '/accept-personnel-invitation';
export const MIN_PERSONNEL_PASSWORD_LENGTH = 8;

export type InvitationAcceptanceError =
  | 'invalid'
  | 'unavailable'
  | 'expired'
  | 'generic';

export function buildPersonnelInvitationUrl(origin: string, token: string): string {
  const normalizedOrigin = origin.replace(/\/$/, '');
  return `${normalizedOrigin}${PERSONNEL_INVITATION_ROUTE}?token=${encodeURIComponent(token)}`;
}

export interface PersonnelInvitationResult {
  email: string;
  url: string;
}

export function createPersonnelInvitationResult(
  invitation: { email: string; invitationToken: string },
  origin: string
): PersonnelInvitationResult {
  return {
    email: invitation.email,
    url: buildPersonnelInvitationUrl(origin, invitation.invitationToken),
  };
}

export function validateInvitationPasswords(
  password: string,
  confirmPassword: string
): string | null {
  if (password.length < MIN_PERSONNEL_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PERSONNEL_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirmPassword) {
    return 'Passwords do not match.';
  }
  return null;
}

export function getInvitationAcceptanceError(error: unknown): InvitationAcceptanceError {
  if (error instanceof ApiError) {
    if (error.status === 400) return 'invalid';
    if (error.status === 409) return 'unavailable';
    if (error.status === 410) return 'expired';
  }
  return 'generic';
}

export interface InvitationAcceptanceState {
  submitting: boolean;
  accepted: boolean;
  error: InvitationAcceptanceError | null;
  validationError: string | null;
}

export function createInvitationAcceptanceController(
  accept: (token: string, password: string) => Promise<unknown>
) {
  const state: InvitationAcceptanceState = {
    submitting: false,
    accepted: false,
    error: null,
    validationError: null,
  };

  return {
    state,
    async submit(token: string, password: string, confirmPassword: string): Promise<boolean> {
      if (state.submitting) return false;
      state.validationError = null;
      state.error = null;

      if (!token) {
        state.validationError = 'This invitation link is missing its token.';
        return false;
      }

      const validationError = validateInvitationPasswords(password, confirmPassword);
      if (validationError) {
        state.validationError = validationError;
        return false;
      }

      state.submitting = true;
      try {
        await accept(token, password);
        state.accepted = true;
        return true;
      } catch (error) {
        state.error = getInvitationAcceptanceError(error);
        return false;
      } finally {
        state.submitting = false;
      }
    },
  };
}
