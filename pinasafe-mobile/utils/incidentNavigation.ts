import type { UserRole } from '@/contexts/AuthContext';

export type IncidentBackFallback =
  | '/(tabs-citizen)/reported-emergency'
  | '/(tabs-admin)/incidents'
  | '/(tabs-responder)/dispatch'
  | '/';

export interface IncidentBackNavigator {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: IncidentBackFallback) => void;
}

export function resolveIncidentBackFallback(role: UserRole | string | null | undefined): IncidentBackFallback {
  if (role === 'admin') return '/(tabs-admin)/incidents';
  if (role === 'responder') return '/(tabs-responder)/dispatch';
  if (role === 'citizen') return '/(tabs-citizen)/reported-emergency';
  return '/';
}

// replace (not push) keeps the fallback from stacking a new entry that Back would return to.
export function navigateBackFromIncident(navigator: IncidentBackNavigator, role: UserRole | string | null | undefined): 'history' | IncidentBackFallback {
  let canGoBack = false;
  try {
    canGoBack = navigator.canGoBack();
  } catch {
    canGoBack = false;
  }
  if (canGoBack) {
    navigator.back();
    return 'history';
  }
  const fallback = resolveIncidentBackFallback(role);
  navigator.replace(fallback);
  return fallback;
}
