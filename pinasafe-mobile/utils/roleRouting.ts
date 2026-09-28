import type { UserRole } from '@/contexts/AuthContext';

/**
 * Pure mapping from authenticated role to the post-login landing route.
 * super_admin intentionally shares the admin shell (see app/index.tsx) rather
 * than falling through to citizen screens.
 */
export function resolveRoleRoute(role: UserRole | undefined): string {
  if (role === 'admin' || role === 'super_admin') {
    return '/(tabs-admin)/dashboard';
  }
  if (role === 'responder') {
    return '/(tabs-responder)/dispatch';
  }
  return '/(tabs-citizen)/emergency-main';
}
