import React from 'react';
import { InstallPromptProvider } from '@/contexts/InstallPromptContext';
import { BeforeInstallPromptEvent, INSTALL_DISMISS_KEY, INSTALL_DISMISS_MS } from '@/utils/pwaInstall';
import { createHookHarness } from './support/tree';

let mockHooks: ReturnType<typeof createHookHarness>;
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: (initial: unknown) => mockHooks.useState(initial),
  useEffect: (effect: () => void | (() => void), dependencies?: unknown[]) => mockHooks.useEffect(effect, dependencies),
  useCallback: (callback: unknown) => callback,
  useMemo: (callback: () => unknown) => callback(),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

type Value = {
  presentation: string;
  manualPresentation: string;
  status: string;
  dismiss: () => void;
  install: () => Promise<void>;
};

const listeners = new Map<string, (event: Event) => void>();
const storage = new Map<string, string>();
let mediaChange: (() => void) | undefined;
const media = {
  matches: false,
  addEventListener: jest.fn((_name: string, callback: () => void) => { mediaChange = callback; }),
  removeEventListener: jest.fn(),
};
const host = {
  navigator: { userAgent: 'Chromium', platform: 'Linux', maxTouchPoints: 0, standalone: false },
  matchMedia: () => media,
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  },
  addEventListener: (name: string, callback: (event: Event) => void) => { listeners.set(name, callback); },
  removeEventListener: (name: string) => { listeners.delete(name); },
};
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

const render = () => {
  mockHooks.resetCursor();
  const tree = InstallPromptProvider({ children: null }) as React.ReactElement<{ value: Value }>;
  mockHooks.flushEffects();
  return tree.props.value;
};

function prompt(outcome: 'accepted' | 'dismissed' = 'accepted', failed = false) {
  const event = {
    preventDefault: jest.fn(),
    prompt: failed ? jest.fn().mockRejectedValue(new Error('blocked')) : jest.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  } as unknown as BeforeInstallPromptEvent;
  listeners.get('beforeinstallprompt')!(event);
  return event;
}

describe('install provider lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-06T12:00:00Z'));
    mockHooks = createHookHarness();
    listeners.clear();
    storage.clear();
    media.matches = false;
    mediaChange = undefined;
    host.navigator.userAgent = 'Chromium';
    host.navigator.standalone = false;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: host });
    render();
  });

  afterEach(() => {
    mockHooks.unmount();
    jest.useRealTimers();
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });

  test('offers Profile guidance before any browser promotion', () => {
    expect(render()).toMatchObject({ presentation: 'hidden', manualPresentation: 'browser-instructions' });
  });

  test('captures the Chromium event and invokes its native prompt once', async () => {
    const event = prompt();
    const value = render();
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(value).toMatchObject({ presentation: 'prompt', manualPresentation: 'prompt' });
    await value.install();
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(render().status).toBe('accepted');
    await render().install();
    expect(event.prompt).toHaveBeenCalledTimes(1);
  });

  test('dismissal hides only promotion, not Profile installation', () => {
    prompt();
    render().dismiss();
    expect(render()).toMatchObject({ presentation: 'hidden', manualPresentation: 'prompt' });
    expect(storage.has(INSTALL_DISMISS_KEY)).toBe(true);
  });

  test('dismissal expires after exactly fourteen days during an open session', () => {
    prompt();
    render().dismiss();
    render();
    jest.advanceTimersByTime(INSTALL_DISMISS_MS - 1);
    expect(render().presentation).toBe('hidden');
    jest.advanceTimersByTime(1);
    expect(render().presentation).toBe('prompt');
  });

  test('a dismissed native prompt leaves manual browser guidance', async () => {
    prompt('dismissed');
    await render().install();
    expect(render()).toMatchObject({ presentation: 'hidden', manualPresentation: 'browser-instructions', status: 'idle' });
  });

  test('a failed prompt retains a manual recovery path without claiming success', async () => {
    prompt('accepted', true);
    await render().install();
    expect(render()).toMatchObject({ manualPresentation: 'browser-instructions', status: 'failed' });
  });

  test('acceptance is not confirmation; appinstalled hides both paths', async () => {
    prompt();
    await render().install();
    expect(render()).toMatchObject({ status: 'accepted', manualPresentation: 'browser-instructions' });
    listeners.get('appinstalled')!(new Event('appinstalled'));
    expect(render()).toMatchObject({ status: 'installed', presentation: 'hidden', manualPresentation: 'hidden' });
  });

  test('a standalone display-mode change hides both paths', () => {
    media.matches = true;
    mediaChange!();
    expect(render()).toMatchObject({ presentation: 'hidden', manualPresentation: 'hidden' });
  });

  test('iOS instructions remain available after dismissal', () => {
    mockHooks.unmount();
    mockHooks = createHookHarness();
    host.navigator.userAgent = 'iPhone';
    render();
    expect(render().manualPresentation).toBe('ios-instructions');
    render().dismiss();
    expect(render()).toMatchObject({ presentation: 'hidden', manualPresentation: 'ios-instructions' });
  });

  test('iOS standalone detection hides the redundant path', () => {
    mockHooks.unmount();
    mockHooks = createHookHarness();
    host.navigator.standalone = true;
    render();
    expect(render().manualPresentation).toBe('hidden');
  });

  test('unmounting removes all browser and media listeners', () => {
    mockHooks.unmount();
    expect(listeners.size).toBe(0);
    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
