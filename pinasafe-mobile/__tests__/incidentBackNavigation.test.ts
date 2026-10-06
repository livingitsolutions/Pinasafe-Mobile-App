import React from 'react';
import fs from 'fs';
import path from 'path';
import IncidentDetail from '../app/incident/[id]';
import { navigateBackFromIncident, resolveIncidentBackFallback, type IncidentBackNavigator } from '@/utils/incidentNavigation';
import { collectElements } from './support/tree';

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: jest.fn(),
  useRef: jest.fn(() => ({ current: false })),
  useCallback: (callback: unknown) => callback,
  useEffect: jest.fn(),
  useMemo: (callback: () => unknown) => callback(),
}));
jest.mock('react-native', () => ({
  Image: 'Image',
  Linking: { openURL: jest.fn() },
  Platform: { OS: 'web', select: ({ web, default: fallback }: { web?: unknown; default?: unknown }) => web ?? fallback },
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  View: 'View',
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => ({ id: 'synthetic-report-id' }),
}));
jest.mock('lucide-react-native', () => ({ ArrowLeft: 'ArrowLeft', MapPin: 'MapPin', RefreshCw: 'RefreshCw', ShieldCheck: 'ShieldCheck' }));
const mockAuth = { user: null as null | { role: string } };
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('@/services/apiService', () => ({ apiService: {}, isApiError: () => false }));
jest.mock('@/components/CitizenResponseTracking', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/ResponderNavigation', () => ({ __esModule: true, default: 'ResponderNavigation' }));
jest.mock('@/components/OperationalIncidentDetail', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/ui', () => ({
  ActionBar: 'ActionBar', Banner: 'Banner', Button: 'Button', Card: 'Card', DetailItem: 'DetailItem',
  EmptyState: 'EmptyState', ErrorState: 'ErrorState', IconButton: 'IconButton', LoadingState: 'LoadingState',
  PageHeader: 'PageHeader', Priority: 'Priority', Screen: 'Screen', Section: 'Section', StatusBadge: 'StatusBadge', TypeBadge: 'TypeBadge',
}));

const { useState } = jest.requireMock('react') as { useState: jest.Mock };
const { router } = jest.requireMock('expo-router') as {
  router: { back: jest.Mock; replace: jest.Mock; push: jest.Mock; canGoBack: jest.Mock };
};

const ROLE_GROUPS: Record<string, string> = {
  citizen: '/(tabs-citizen)/',
  admin: '/(tabs-admin)/',
  responder: '/(tabs-responder)/',
};

class HistoryStack implements IncidentBackNavigator {
  constructor(public entries: string[]) {}
  get current() { return this.entries[this.entries.length - 1]; }
  push(href: string) { this.entries.push(href); }
  canGoBack() { return this.entries.length > 1; }
  back() { this.entries.pop(); }
  replace(href: string) { this.entries[this.entries.length - 1] = href; }
}

function renderIncident(role: string | null, state: { report?: unknown; loading?: boolean; error?: string }) {
  mockAuth.user = role ? { role } : null;
  const values = [state.report ?? null, [], state.loading ?? false, false, state.error ?? '', ''];
  useState.mockImplementation(() => [values.shift(), jest.fn()]);
  return collectElements(IncidentDetail());
}

function backButton(elements: React.ReactElement<Record<string, unknown>>[]) {
  const button = elements.find(element => element.type === 'IconButton' && element.props.label === 'Go back');
  expect(button).toBeDefined();
  return button!.props.onPress as () => void;
}

const report = { id: 'synthetic-report-id', type: 'road', description: 'Synthetic', location: 'Synthetic', priority: 'high', status: 'pending', coordinates: null };

describe('role-safe incident Back fallback', () => {
  test.each([
    ['citizen', '/(tabs-citizen)/reported-emergency'],
    ['admin', '/(tabs-admin)/incidents'],
    ['responder', '/(tabs-responder)/dispatch'],
    ['super_admin', '/'],
    [undefined, '/'],
    [null, '/'],
    ['unexpected-role', '/'],
  ])('%s falls back to %s', (role, expected) => {
    expect(resolveIncidentBackFallback(role)).toBe(expected);
  });

  test.each(['citizen', 'admin', 'responder'])('%s fallback never crosses into another role area', role => {
    const fallback = resolveIncidentBackFallback(role);
    expect(fallback.startsWith(ROLE_GROUPS[role])).toBe(true);
    Object.entries(ROLE_GROUPS).filter(([other]) => other !== role).forEach(([, prefix]) => {
      expect(fallback.startsWith(prefix)).toBe(false);
    });
  });

  test('uses real history when it exists and does not also replace', () => {
    const nav = { canGoBack: jest.fn(() => true), back: jest.fn(), replace: jest.fn() };
    expect(navigateBackFromIncident(nav, 'citizen')).toBe('history');
    expect(nav.back).toHaveBeenCalledTimes(1);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  test('deep link without history replaces with the role fallback instead of pushing', () => {
    const nav = { canGoBack: jest.fn(() => false), back: jest.fn(), replace: jest.fn() };
    expect(navigateBackFromIncident(nav, 'responder')).toBe('/(tabs-responder)/dispatch');
    expect(nav.back).not.toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalledWith('/(tabs-responder)/dispatch');
  });

  test('a failing history check falls back safely', () => {
    const nav = { canGoBack: jest.fn(() => { throw new Error('navigator not ready'); }), back: jest.fn(), replace: jest.fn() };
    expect(navigateBackFromIncident(nav, 'admin')).toBe('/(tabs-admin)/incidents');
    expect(nav.back).not.toHaveBeenCalled();
  });
});

describe('incident Back journeys', () => {
  test('citizen: My Reports -> incident -> Back returns to My Reports', () => {
    const history = new HistoryStack(['/(tabs-citizen)/reported-emergency']);
    history.push('/incident/a');
    navigateBackFromIncident(history, 'citizen');
    expect(history.entries).toEqual(['/(tabs-citizen)/reported-emergency']);
  });

  test('citizen: report confirmation replaced by incident -> Back returns to the screen before the form', () => {
    const history = new HistoryStack(['/(tabs-citizen)/emergency-main', '/emergency/report']);
    history.replace('/incident/a');
    navigateBackFromIncident(history, 'citizen');
    expect(history.current).toBe('/(tabs-citizen)/emergency-main');
  });

  test('admin: Command Center -> incident -> sibling report -> Back -> Back returns to Command Center', () => {
    const history = new HistoryStack(['/(tabs-admin)/incidents', '/incident/a', '/incident/b']);
    navigateBackFromIncident(history, 'admin');
    expect(history.current).toBe('/incident/a');
    navigateBackFromIncident(history, 'admin');
    expect(history.current).toBe('/(tabs-admin)/incidents');
  });

  test('responder: map -> incident -> Back returns to the map', () => {
    const history = new HistoryStack(['/(tabs-responder)/dispatch', '/(tabs-responder)/map']);
    history.push('/incident/a');
    navigateBackFromIncident(history, 'responder');
    expect(history.current).toBe('/(tabs-responder)/map');
  });

  test.each(['citizen', 'admin', 'responder'])('%s deep link: Back lands on the role home and never loops back to the incident', role => {
    const history = new HistoryStack(['/incident/deep-link']);
    navigateBackFromIncident(history, role);
    expect(history.entries).toEqual([resolveIncidentBackFallback(role)]);
    expect(history.canGoBack()).toBe(false);
    expect(history.entries).not.toContain('/incident/deep-link');
  });
});

describe('incident screen Back wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    router.canGoBack.mockReturnValue(false);
  });

  test.each([
    ['loading', { loading: true }],
    ['error', { error: 'The incident could not be loaded.' }],
    ['not found', {}],
    ['loaded', { report }],
  ])('%s state offers Back that uses the citizen fallback on a deep link', (_label, state) => {
    backButton(renderIncident('citizen', state))();
    expect(router.replace).toHaveBeenCalledWith('/(tabs-citizen)/reported-emergency');
    expect(router.back).not.toHaveBeenCalled();
  });

  test('responder Back on a deep link goes to Assignments', () => {
    backButton(renderIncident('responder', { report: { ...report, status: 'dispatched' } }))();
    expect(router.replace).toHaveBeenCalledWith('/(tabs-responder)/dispatch');
  });

  test('a responding responder sees existing navigation and a shortcut to the existing sharing controls', () => {
    const tree = renderIncident('responder', { report: { ...report, status: 'responding' } });
    const elements = collectElements(tree);
    expect(elements.some(element => element.type === 'ResponderNavigation' && element.props.reportId === report.id)).toBe(true);
    const controls = elements.find(element => element.props.label === 'Open live location controls')!;
    (controls.props.onPress as () => void)();
    expect(router.push).toHaveBeenCalledWith('/(tabs-responder)/dispatch');
    expect(elements.some(element => element.props.label === 'Mark resolved' && element.props.variant === 'danger')).toBe(true);
  });

  test('citizen detail never renders responder navigation or sharing controls', () => {
    const elements = collectElements(renderIncident('citizen', { report: { ...report, status: 'responding' } }));
    expect(elements.some(element => element.type === 'ResponderNavigation')).toBe(false);
    expect(elements.some(element => element.props.label === 'Open live location controls')).toBe(false);
  });

  test('Back uses history when the app has a previous screen', () => {
    router.canGoBack.mockReturnValue(true);
    backButton(renderIncident('responder', { report }))();
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  test('incident screens never call router.back directly', () => {
    for (const file of ['app/incident/[id].tsx', 'components/OperationalIncidentDetail.tsx']) {
      const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
      expect(source).not.toMatch(/router\.back/);
      expect(source).toMatch(/navigateBackFromIncident\(router, (user\?\.)?role\)/);
    }
  });
});
