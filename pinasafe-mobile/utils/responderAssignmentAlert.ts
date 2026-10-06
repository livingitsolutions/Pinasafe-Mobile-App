type AssignmentUser = { role?: string; teamId?: string } | null | undefined;
type AssignmentReport = { id: string; status: string; assigned_team_id?: string | null };

export const RESPONDER_ASSIGNMENT_AUDIO_PREFERENCE_KEY = 'pinasafe.responderAssignmentAudioEnabled';

// Server-reported state is the only source of truth: refresh cannot resurrect an
// acknowledged alert because the report is no longer `dispatched`.
export function getEligibleAssignmentAlerts<T extends AssignmentReport>(
  reports: T[],
  user: AssignmentUser,
): T[] {
  if (!user || user.role !== 'responder' || !user.teamId) return [];
  return reports.filter(report =>
    report.status === 'dispatched' && report.assigned_team_id === user.teamId);
}

export function readResponderAssignmentAudioPreference(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return true;
  return window.localStorage.getItem(RESPONDER_ASSIGNMENT_AUDIO_PREFERENCE_KEY) !== 'false';
}

export function saveResponderAssignmentAudioPreference(enabled: boolean): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Assignment alert sound preference storage is unavailable.');
  }
  window.localStorage.setItem(RESPONDER_ASSIGNMENT_AUDIO_PREFERENCE_KEY, String(enabled));
}
