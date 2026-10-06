import fs from 'fs';
import path from 'path';
import vm from 'vm';
import InstallPrompt from '../components/InstallPrompt';
import ConnectivityBanner, { OFFLINE_MESSAGE } from '../components/ConnectivityBanner';
import {
  detectIos,
  detectStandalone,
  getInstallPresentation,
  getManualInstallPresentation,
  INSTALL_DISMISS_KEY,
  INSTALL_DISMISS_MS,
  readInstallDismissal,
  readOnlineStatus,
  runInstallPrompt,
  saveInstallDismissal,
  type BeforeInstallPromptEvent,
} from '../utils/pwaInstall';
import { canRegisterServiceWorker, registerServiceWorker } from '../utils/pwaRegistration';
import { collectElements, collectText } from './support/tree';

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: jest.fn(),
  useEffect: jest.fn(),
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'web', select: ({ web, default: fallback }: { web?: unknown; default?: unknown }) => web ?? fallback },
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  View: 'View',
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }) }));
jest.mock('lucide-react-native', () => ({ Download: 'Download', Share: 'Share', WifiOff: 'WifiOff' }));
jest.mock('@/components/ui', () => ({ Banner: 'Banner', Button: 'Button', Card: 'Card' }));
const mockInstall = { presentation: 'hidden', manualPresentation: 'hidden', status: 'idle', install: jest.fn(), dismiss: jest.fn() };
jest.mock('@/contexts/InstallPromptContext', () => ({ useInstallPrompt: () => mockInstall }));

const { useState } = jest.requireMock('react') as { useState: jest.Mock };
const root = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

function pngSize(file: string) {
  const buffer = fs.readFileSync(path.join(root, 'public', file));
  expect(buffer.subarray(1, 4).toString()).toBe('PNG');
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

describe('web app manifest', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));

  test('identifies PinaSafe as a standalone app starting at the root', () => {
    expect(manifest.name).toBe('PinaSafe');
    expect(manifest.short_name).toBe('PinaSafe');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.theme_color).toMatch(/^#[0-9A-F]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9A-F]{6}$/i);
  });

  test('ships 192, 512 and maskable icons that exist at the declared size', () => {
    const icons = manifest.icons as { src: string; sizes: string; purpose: string }[];
    expect(icons.map(icon => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(icons.some(icon => icon.purpose.includes('maskable'))).toBe(true);
    for (const icon of icons) {
      const [width, height] = pngSize(icon.src.replace(/^\/+/, ''));
      expect(`${width}x${height}`).toBe(icon.sizes);
    }
    expect(pngSize('icons/apple-touch-icon.png')).toEqual([180, 180]);
  });

  test('the page head links the manifest, icons, theme and safe-area viewport', () => {
    const html = read('app/+html.tsx');
    expect(html).toContain('href="/manifest.webmanifest"');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('apple-mobile-web-app-title" content="PinaSafe"');
    expect(html).toContain('prefers-reduced-motion: reduce');
  });

  test('Netlify serves the manifest as a manifest, not an opaque download', () => {
    expect(read('public/_headers')).toMatch(/\/manifest\.webmanifest\s+Content-Type: application\/manifest\+json/);
  });
});

describe('service worker caching rules', () => {
  type Handler = (event: Record<string, unknown>) => void;
  const ORIGIN = 'https://pinasafe.example';

  function loadWorker() {
    const handlers: Record<string, Handler> = {};
    const cache = { put: jest.fn(), addAll: jest.fn().mockResolvedValue(undefined) };
    const caches = { open: jest.fn().mockResolvedValue(cache), match: jest.fn().mockResolvedValue(undefined), keys: jest.fn().mockResolvedValue([]), delete: jest.fn() };
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, type: 'basic', headers: { get: () => '' }, clone: jest.fn() });
    const self = { addEventListener: (name: string, handler: Handler) => { handlers[name] = handler; }, location: { origin: ORIGIN }, skipWaiting: jest.fn(), clients: { claim: jest.fn() } };
    vm.runInNewContext(read('public/sw.js'), { self, caches, fetch: fetchMock, URL, Promise });
    return { handlers, cache, caches, fetchMock };
  }

  const request = (url: string, options: { method?: string; mode?: string; auth?: boolean } = {}) => ({
    url, method: options.method ?? 'GET', mode: options.mode ?? 'cors',
    headers: { has: (name: string) => name === 'authorization' && options.auth === true },
  });

  const intercepts = (req: ReturnType<typeof request>) => {
    const { handlers } = loadWorker();
    const respondWith = jest.fn();
    handlers.fetch({ request: req, respondWith });
    return respondWith.mock.calls.length > 0;
  };

  test.each([
    ['backend API', `${ORIGIN}/api/emergency-reports/1`],
    ['auth', `${ORIGIN}/auth/v1/token`],
    ['storage', `${ORIGIN}/storage/v1/object/sign/evidence.jpg`],
    ['cross-origin API', 'https://backend.example/api/reports'],
    ['Supabase', 'https://project.supabase.co/rest/v1/reports'],
    ['map tiles', 'https://tile.openstreetmap.org/1/1/1.png'],
    ['query-string request', `${ORIGIN}/assets/photo.png?token=abc`],
  ])('never caches %s requests', (_label, url) => {
    expect(intercepts(request(url))).toBe(false);
  });

  test('never caches authenticated or non-GET requests', () => {
    expect(intercepts(request(`${ORIGIN}/_expo/static/js/web/app.js`, { auth: true }))).toBe(false);
    expect(intercepts(request(`${ORIGIN}/icons/icon-192.png`, { method: 'POST' }))).toBe(false);
  });

  test.each([
    `${ORIGIN}/_expo/static/js/web/entry-abc123.js`,
    `${ORIGIN}/assets/fonts/Quicksand-Bold.ttf`,
    `${ORIGIN}/icons/icon-512.png`,
  ])('serves static file %s from cache', url => {
    expect(intercepts(request(url))).toBe(true);
  });

  test('pages always come from the network and fall back to the offline page only when it fails', async () => {
    const { handlers, fetchMock, caches } = loadWorker();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const offlinePage = { offline: true };
    caches.match.mockResolvedValueOnce(offlinePage);
    const respondWith = jest.fn();
    handlers.fetch({ request: request(`${ORIGIN}/incident/abc`, { mode: 'navigate' }), respondWith });
    await expect(respondWith.mock.calls[0][0]).resolves.toBe(offlinePage);
    expect(caches.match).toHaveBeenCalledWith('/offline.html');
  });

  test('responses marked private or no-store are not stored', async () => {
    const { handlers, fetchMock, cache } = loadWorker();
    fetchMock.mockResolvedValueOnce({ ok: true, type: 'basic', headers: { get: () => 'private, no-store' }, clone: jest.fn() });
    const respondWith = jest.fn();
    handlers.fetch({ request: request(`${ORIGIN}/assets/logo.png`), respondWith });
    await respondWith.mock.calls[0][0];
    await Promise.resolve();
    expect(cache.put).not.toHaveBeenCalled();
  });

  test('precaches only public files', () => {
    const source = read('public/sw.js');
    const list = source.match(/const PRECACHE = \[([^\]]*)\]/)![1];
    expect(list).not.toMatch(/api|auth|index\.html|'\/'/);
  });

  test('the offline page makes no offline reporting or delivery claims', () => {
    const html = read('public/offline.html').toLowerCase();
    expect(html).toContain('nothing is sent while you are offline');
    expect(html).not.toMatch(/queued|will be sent|saved for later|works offline|guaranteed/);
  });
});

describe('install presentation', () => {
  const env = { isWeb: true, isStandalone: false, isIos: false, hasDeferredPrompt: true, dismissedAt: null, now: 1_000_000_000 };

  test('manual installation ignores promotional dismissal and retains the native prompt', () => {
    const dismissed = { ...env, dismissedAt: env.now - 1000 };
    expect(getInstallPresentation(dismissed)).toBe('hidden');
    expect(getManualInstallPresentation(dismissed)).toBe('prompt');
  });

  test('manual installation provides safe guidance without a promotional browser event', () => {
    expect(getManualInstallPresentation({ ...env, hasDeferredPrompt: false })).toBe('browser-instructions');
    expect(getManualInstallPresentation({ ...env, hasDeferredPrompt: false, isIos: true, dismissedAt: env.now })).toBe('ios-instructions');
  });

  test('manual installation is hidden on native and standalone platforms', () => {
    expect(getManualInstallPresentation({ ...env, isStandalone: true })).toBe('hidden');
    expect(getManualInstallPresentation({ ...env, isWeb: false })).toBe('hidden');
  });

  test('Chromium with a deferred prompt shows Install', () => {
    expect(getInstallPresentation(env)).toBe('prompt');
  });

  test('already installed (standalone) hides the CTA', () => {
    expect(getInstallPresentation({ ...env, isStandalone: true })).toBe('hidden');
    expect(getInstallPresentation({ ...env, isStandalone: true, isIos: true, hasDeferredPrompt: false })).toBe('hidden');
  });

  test('iOS without a prompt shows Add to Home Screen instructions', () => {
    expect(getInstallPresentation({ ...env, isIos: true, hasDeferredPrompt: false })).toBe('ios-instructions');
  });

  test('other browsers without install support show nothing', () => {
    expect(getInstallPresentation({ ...env, hasDeferredPrompt: false })).toBe('hidden');
    expect(getInstallPresentation({ ...env, isWeb: false })).toBe('hidden');
  });

  test('a recent dismissal hides the CTA and it may return after the quiet period', () => {
    expect(getInstallPresentation({ ...env, dismissedAt: env.now - 1000 })).toBe('hidden');
    expect(getInstallPresentation({ ...env, dismissedAt: env.now - INSTALL_DISMISS_MS })).toBe('prompt');
  });

  test('detects standalone display mode and iOS home-screen mode', () => {
    expect(detectStandalone({ matchMedia: () => ({ matches: true }) })).toBe(true);
    expect(detectStandalone({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } })).toBe(true);
    expect(detectStandalone({ matchMedia: () => { throw new Error('unsupported'); } })).toBe(false);
    expect(detectStandalone(undefined)).toBe(false);
  });

  test('detects iPhone and iPadOS but not Android', () => {
    expect(detectIos({ navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } })).toBe(true);
    expect(detectIos({ navigator: { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 } })).toBe(true);
    expect(detectIos({ navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux' } })).toBe(false);
  });

  test('dismissal is stored and read back safely', () => {
    const data = new Map<string, string>();
    const win = { localStorage: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } } };
    expect(readInstallDismissal(win)).toBeNull();
    saveInstallDismissal(win, 1234);
    expect(data.get(INSTALL_DISMISS_KEY)).toBe('1234');
    expect(readInstallDismissal(win)).toBe(1234);
    data.set(INSTALL_DISMISS_KEY, 'garbage');
    expect(readInstallDismissal(win)).toBeNull();
    const broken = { localStorage: { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } };
    expect(readInstallDismissal(broken)).toBeNull();
    expect(() => saveInstallDismissal(broken, 1)).not.toThrow();
  });

  test.each([
    ['accepted', { prompt: () => Promise.resolve(), userChoice: Promise.resolve({ outcome: 'accepted' }) }, 'accepted'],
    ['dismissed', { prompt: () => Promise.resolve(), userChoice: Promise.resolve({ outcome: 'dismissed' }) }, 'dismissed'],
    ['failing', { prompt: () => Promise.reject(new Error('already used')), userChoice: Promise.resolve({ outcome: 'accepted' }) }, 'failed'],
  ])('a %s install prompt resolves to %s', async (_label, event, expected) => {
    await expect(runInstallPrompt(event as unknown as BeforeInstallPromptEvent)).resolves.toBe(expected);
  });
});

describe('service worker registration', () => {
  const register = jest.fn();
  const host = (protocol: string, hostname: string) => ({ location: { protocol, hostname }, navigator: { serviceWorker: { register } } });

  beforeEach(() => register.mockReset());

  test('registers only in production on HTTPS or localhost', () => {
    expect(canRegisterServiceWorker(host('https:', 'pinasafe.example'), true)).toBe(true);
    expect(canRegisterServiceWorker(host('http:', 'localhost'), true)).toBe(true);
    expect(canRegisterServiceWorker(host('http:', 'pinasafe.example'), true)).toBe(false);
    expect(canRegisterServiceWorker(host('https:', 'pinasafe.example'), false)).toBe(false);
    expect(canRegisterServiceWorker({ location: { protocol: 'https:' }, navigator: {} }, true)).toBe(false);
  });

  test('a failed registration resolves false and never throws', async () => {
    register.mockRejectedValueOnce(new Error('blocked'));
    await expect(registerServiceWorker(host('https:', 'pinasafe.example'), true)).resolves.toBe(false);
  });

  test('a successful registration uses the root-scoped worker', async () => {
    register.mockResolvedValueOnce({});
    await expect(registerServiceWorker(host('https:', 'pinasafe.example'), true)).resolves.toBe(true);
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });
});

describe('Install PinaSafe call to action', () => {
  const render = (overrides: Partial<typeof mockInstall>, manual = false) => {
    Object.assign(mockInstall, { presentation: 'hidden', manualPresentation: 'hidden', status: 'idle', install: jest.fn(), dismiss: jest.fn() }, overrides);
    const tree = InstallPrompt({ manual });
    return { tree, elements: collectElements(tree), text: collectText(tree).join(' ') };
  };

  test('renders nothing when hidden or already installed via standalone', () => {
    expect(render({ presentation: 'hidden' }).tree).toBeNull();
  });

  test('Chromium shows Install PinaSafe and Not now', () => {
    const { elements, text } = render({ presentation: 'prompt' });
    const install = elements.find(element => element.props.label === 'Install PinaSafe');
    (install!.props.onPress as () => void)();
    expect(mockInstall.install).toHaveBeenCalled();
    (elements.find(element => element.props.label === 'Not now')!.props.onPress as () => void)();
    expect(mockInstall.dismiss).toHaveBeenCalled();
    expect(text).toContain('internet connection is still needed');
  });

  test('iOS shows Share then Add to Home Screen instructions without a fake install button', () => {
    const { elements, text } = render({ presentation: 'ios-instructions' });
    expect(text).toContain('Tap Share, then Add to Home Screen.');
    expect(elements.some(element => element.props.label === 'Install PinaSafe' && element.type === 'Button')).toBe(false);
  });

  test('an accepted prompt does not claim installation before the browser confirms it', () => {
    const { text } = render({ status: 'accepted' });
    expect(text).not.toContain('PinaSafe installed');
    expect(text).toContain('Installation is not confirmed yet.');
  });

  test('a confirmed install hides redundant installation UI', () => {
    expect(render({ status: 'installed' }).tree).toBeNull();
  });

  test('a failed prompt keeps web use available', () => {
    expect(render({ status: 'failed', manualPresentation: 'browser-instructions' }, true).text).toContain('You can keep using PinaSafe here.');
    expect(render({ status: 'failed' }).text).toContain('Try Install app or Add to Home Screen');
  });

  test('Profile keeps the manual native install action even when the promotion is hidden', () => {
    const { elements } = render({ presentation: 'hidden', manualPresentation: 'prompt' }, true);
    (elements.find(element => element.props.label === 'Install PinaSafe')!.props.onPress as () => void)();
    expect(mockInstall.install).toHaveBeenCalledTimes(1);
    expect(elements.some(element => element.props.label === 'Not now')).toBe(false);
  });

  test('Profile shows useful installation instructions without claiming browser support', () => {
    const { text } = render({ manualPresentation: 'browser-instructions' }, true);
    expect(text).toContain('Open your browser menu');
    expect(text).toContain('If neither is available');
  });

  test('Profile hides the manual path in standalone mode', () => {
    expect(render({ manualPresentation: 'hidden' }, true).tree).toBeNull();
  });
});

describe('connectivity banner', () => {
  test('shows a clear offline state', () => {
    useState.mockReturnValueOnce([false, jest.fn()]);
    const text = collectText(ConnectivityBanner()).join(' ');
    expect(text).toContain('You’re offline');
    expect(text).toContain('Emergency actions require an internet connection');
  });

  test('is hidden while online', () => {
    useState.mockReturnValueOnce([true, jest.fn()]);
    expect(ConnectivityBanner()).toBeNull();
  });

  test('never claims offline reporting', () => {
    expect(OFFLINE_MESSAGE.toLowerCase()).not.toMatch(/queued|will be sent|saved|works offline/);
  });

  test('reads browser online status, assuming online when unknown', () => {
    expect(readOnlineStatus({ navigator: { onLine: false } })).toBe(false);
    expect(readOnlineStatus({ navigator: { onLine: true } })).toBe(true);
    expect(readOnlineStatus(undefined)).toBe(true);
  });
});

describe('installed-mode wiring', () => {
  test('the app shell registers the worker, provides install state and shows connectivity', () => {
    const layout = read('app/_layout.tsx');
    expect(layout).toContain('registerServiceWorker(window, !__DEV__)');
    expect(layout).toContain('<InstallPromptProvider>');
    expect(layout).toContain('<ConnectivityBanner />');
  });

  test('the install CTA is offered on sign-in and profile, not on emergency screens', () => {
    expect(read('app/(auth)/login.tsx')).toContain('<InstallPrompt />');
    expect(read('components/ProfileScreen.tsx')).toContain('<InstallPrompt manual />');
    expect(read('app/(tabs-citizen)/emergency-main.tsx')).not.toContain('InstallPrompt');
    expect(read('app/incident/[id].tsx')).not.toContain('InstallPrompt');
  });

  test('the provider waits for the browser before claiming installation', () => {
    const provider = read('contexts/InstallPromptContext.tsx');
    expect(provider).toContain("addEventListener('appinstalled'");
    expect(provider).toContain('event.preventDefault()');
    expect(provider).toMatch(/setStatus\('installed'\)/);
  });
});
