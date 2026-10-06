import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import {
  BeforeInstallPromptEvent,
  detectIos,
  detectStandalone,
  getInstallPresentation,
  InstallPresentation,
  readInstallDismissal,
  runInstallPrompt,
  saveInstallDismissal,
} from '@/utils/pwaInstall';

export type InstallStatus = 'idle' | 'prompting' | 'accepted' | 'installed' | 'failed';

interface InstallPromptValue {
  presentation: InstallPresentation;
  status: InstallStatus;
  install: () => Promise<void>;
  dismiss: () => void;
}

const InstallPromptContext = createContext<InstallPromptValue>({
  presentation: 'hidden',
  status: 'idle',
  install: async () => {},
  dismiss: () => {},
});

const browserWindow = () => (Platform.OS === 'web' && typeof window !== 'undefined' ? window : undefined);

export function InstallPromptProvider({ children }: { children: ReactNode }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<InstallStatus>('idle');
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const win = browserWindow();
    if (!win) return;
    setStandalone(detectStandalone(win));
    setIsIos(detectIos(win));
    setDismissedAt(readInstallDismissal(win));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setStatus('installed');
    };
    win.addEventListener('beforeinstallprompt', onPrompt);
    win.addEventListener('appinstalled', onInstalled);
    return () => {
      win.removeEventListener('beforeinstallprompt', onPrompt);
      win.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    const now = Date.now();
    saveInstallDismissal(browserWindow(), now);
    setDismissedAt(now);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    setStatus('prompting');
    const outcome = await runInstallPrompt(deferred);
    // A prompt event can only be used once.
    setDeferred(null);
    if (outcome === 'accepted') {
      setStatus(current => (current === 'installed' ? current : 'accepted'));
    } else if (outcome === 'dismissed') {
      setStatus('idle');
      dismiss();
    } else {
      setStatus('failed');
    }
  }, [deferred, dismiss]);

  const value = useMemo<InstallPromptValue>(() => ({
    presentation: status === 'installed' || status === 'accepted'
      ? 'hidden'
      : getInstallPresentation({
        isWeb: Platform.OS === 'web',
        isStandalone: standalone,
        isIos,
        hasDeferredPrompt: deferred !== null,
        dismissedAt,
        now: Date.now(),
      }),
    status,
    install,
    dismiss,
  }), [deferred, dismiss, dismissedAt, install, isIos, standalone, status]);

  return <InstallPromptContext.Provider value={value}>{children}</InstallPromptContext.Provider>;
}

export function useInstallPrompt(): InstallPromptValue {
  return useContext(InstallPromptContext);
}
