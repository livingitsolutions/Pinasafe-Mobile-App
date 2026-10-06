export const INSTALL_DISMISS_KEY = 'pinasafe.installPrompt.dismissedAt';
export const INSTALL_DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

export type InstallPresentation = 'hidden' | 'prompt' | 'ios-instructions';

export interface InstallEnvironment {
  isWeb: boolean;
  isStandalone: boolean;
  isIos: boolean;
  hasDeferredPrompt: boolean;
  dismissedAt: number | null;
  now: number;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

type WindowLike = {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: { userAgent?: string; platform?: string; maxTouchPoints?: number; standalone?: boolean; onLine?: boolean };
  localStorage?: Pick<Storage, 'getItem' | 'setItem'>;
};

export function getInstallPresentation(env: InstallEnvironment): InstallPresentation {
  if (!env.isWeb || env.isStandalone) return 'hidden';
  if (env.dismissedAt !== null && env.now - env.dismissedAt < INSTALL_DISMISS_MS) return 'hidden';
  if (env.hasDeferredPrompt) return 'prompt';
  if (env.isIos) return 'ios-instructions';
  return 'hidden';
}

export function detectStandalone(win: WindowLike | undefined): boolean {
  if (!win) return false;
  try {
    if (win.matchMedia?.('(display-mode: standalone)').matches) return true;
  } catch {
    // Older browsers without display-mode media queries.
  }
  return win.navigator?.standalone === true;
}

export function detectIos(win: WindowLike | undefined): boolean {
  const nav = win?.navigator;
  if (!nav) return false;
  if (/iPad|iPhone|iPod/.test(nav.userAgent ?? '')) return true;
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1;
}

export function readInstallDismissal(win: WindowLike | undefined): number | null {
  try {
    const raw = win?.localStorage?.getItem(INSTALL_DISMISS_KEY);
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveInstallDismissal(win: WindowLike | undefined, now: number): void {
  try {
    win?.localStorage?.setItem(INSTALL_DISMISS_KEY, String(now));
  } catch {
    // Without storage the prompt simply may reappear next visit.
  }
}

export async function runInstallPrompt(event: BeforeInstallPromptEvent): Promise<'accepted' | 'dismissed' | 'failed'> {
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch {
    return 'failed';
  }
}

export function readOnlineStatus(win: WindowLike | undefined): boolean {
  return win?.navigator?.onLine !== false;
}
