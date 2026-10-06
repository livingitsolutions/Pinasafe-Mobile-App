import React from 'react';
import IncidentDetail, { getEmergencyReportMapUrl } from '../app/incident/[id]';
import { collectText, findAllByType } from './support/tree';

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
  Linking: { openURL: jest.fn().mockResolvedValue(undefined) },
  Platform: { select: ({ web, default: fallback }: { web?: unknown; default?: unknown }) => web ?? fallback },
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  View: 'View',
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ id: 'synthetic-report-id' }),
}));
jest.mock('lucide-react-native', () => ({
  ArrowLeft: 'ArrowLeft',
  MapPin: 'MapPin',
  RefreshCw: 'RefreshCw',
  ShieldCheck: 'ShieldCheck',
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn(() => ({ user: null })) }));
jest.mock('@/services/apiService', () => ({
  apiService: {},
  isApiError: () => false,
}));
jest.mock('@/components/CitizenResponseTracking', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/ResponderNavigation', () => ({ __esModule: true, default: 'ResponderNavigation' }));
jest.mock('@/components/ui', () => ({
  ActionBar: 'ActionBar',
  Banner: 'Banner',
  Button: 'Button',
  Card: 'Card',
  DetailItem: 'DetailItem',
  EmptyState: 'EmptyState',
  ErrorState: 'ErrorState',
  IconButton: 'IconButton',
  LoadingState: 'LoadingState',
  PageHeader: 'PageHeader',
  Priority: 'Priority',
  Screen: 'Screen',
  Section: 'Section',
  StatusBadge: 'StatusBadge',
  TypeBadge: 'TypeBadge',
}));

const { useState } = jest.requireMock('react') as { useState: jest.Mock };
const { Linking } = jest.requireMock('react-native') as {
  Linking: { openURL: jest.Mock };
};

const baseReport = {
  id: 'synthetic-report-id',
  type: 'road',
  description: 'Synthetic report description',
  location: 'Synthetic location',
  priority: 'high',
  status: 'pending' as const,
};

type ElementProps = {
  children?: React.ReactNode;
  label?: string;
  message?: string;
  onPress?: () => void | Promise<void>;
};

function findElement(node: React.ReactNode, type: string): React.ReactElement<ElementProps> | null {
  if (!React.isValidElement<ElementProps>(node)) return null;
  if (node.type === type) return node;

  for (const child of React.Children.toArray(node.props.children)) {
    const found = findElement(child, type);
    if (found) return found;
  }

  return null;
}

function renderDetail(report: Record<string, unknown>, evidence: unknown[] = []) {
  const stateValues = [report, evidence, false, false, '', ''];
  useState.mockImplementation(() => [stateValues.shift(), jest.fn()]);
  return IncidentDetail();
}

describe('resolved report timing metadata', () => {
  const { useAuth } = jest.requireMock('@/contexts/AuthContext') as { useAuth: jest.Mock };
  const reported = '2026-10-07T06:23:34.000Z';
  const resolved = '2026-10-07T06:38:49.000Z';
  const updated = '2026-10-07T07:00:00.000Z';
  const details = (tree: React.ReactNode) => Object.fromEntries(findAllByType(tree, 'DetailItem').map(item => [item.props.label, item.props.value]));

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: { role: 'citizen' } });
  });
  afterEach(() => useAuth.mockReturnValue({ user: null }));

  test('citizen keeps Reported and evidence and uses resolved_at rather than updated_at', () => {
    const tree = renderDetail({ ...baseReport, status: 'resolved', created_at: reported, resolved_at: resolved, updated_at: updated }, [
      { id: 'evidence-1', url: 'https://example.test/evidence', evidenceRole: 'primary', width: 640, height: 480 },
    ]);
    expect(details(tree)).toEqual({ Reported: new Date(reported).toLocaleString(), Resolved: new Date(resolved).toLocaleString(), 'Response time': '15 min 15 sec' });
    expect(findAllByType(tree, 'StatusBadge')[0].props.value).toBe('resolved');
    expect(findAllByType(tree, 'Section').some(section => section.props.title === 'Response status')).toBe(true);
    expect(findAllByType(tree, 'Image')).toHaveLength(1);
  });

  test('resolved-only updated_at compatibility fallback is displayed', () => {
    expect(details(renderDetail({ ...baseReport, status: 'resolved', created_at: reported, updated_at: resolved }))).toMatchObject({
      Resolved: new Date(resolved).toLocaleString(), 'Response time': '15 min 15 sec',
    });
  });

  test.each(['pending', 'dispatched', 'responding'])('citizen %s retains Last updated without completed timing', status => {
    expect(details(renderDetail({ ...baseReport, status, created_at: reported, resolved_at: resolved, updated_at: updated }))).toEqual({
      Reported: new Date(reported).toLocaleString(), 'Last updated': new Date(updated).toLocaleString(),
    });
  });

  test('responder completed detail preserves the supplied historical team and has no live controls', () => {
    useAuth.mockReturnValue({ user: { role: 'responder' } });
    const tree = renderDetail({ ...baseReport, status: 'resolved', created_at: reported, resolved_at: resolved,
      assigned_team: { id: 'team-1', name: 'DRRMO Alpha Team' },
    });
    expect(details(tree)).toMatchObject({ 'Assigned team': 'DRRMO Alpha Team', Resolved: new Date(resolved).toLocaleString(), 'Response time': '15 min 15 sec' });
    expect(findAllByType(tree, 'Button').some(button => ['Respond', 'Mark resolved', 'Open live location controls'].includes(String(button.props.label)))).toBe(false);
  });

  test.each([
    { resolved_at: undefined, updated_at: undefined },
    { resolved_at: 'invalid', updated_at: 'invalid' },
    { resolved_at: '2026-10-07T06:00:00.000Z', updated_at: updated },
    { resolved_at: resolved, created_at: 'invalid' },
  ])('invalid or negative completed timing omits Response time safely: %j', overrides => {
    const tree = renderDetail({ ...baseReport, status: 'resolved', created_at: reported, ...overrides });
    expect(details(tree)).not.toHaveProperty('Response time');
    expect(details(tree)).not.toHaveProperty('Last updated');
    expect(collectText(tree).join(' ')).not.toMatch(/NaN|Invalid Date|Infinity|undefined|null|-[0-9]+ min/);
  });
});

describe('incident detail coordinate contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    [10.25, 124.75, '10.25', '124.75'],
    [0, 0, '0', '0'],
    [-90, 180, '-90', '180'],
  ])('enables map navigation for valid coordinates %s, %s', async (latitude, longitude, latText, lonText) => {
    const tree = renderDetail({ ...baseReport, coordinates: { latitude, longitude } });
    const mapButton = findElement(tree, 'Button');

    expect(mapButton?.props.label).toBe('Open location in maps');
    await mapButton?.props.onPress?.();
    expect(Linking.openURL).toHaveBeenCalledWith(
      `https://www.openstreetmap.org/?mlat=${latText}&mlon=${lonText}#map=17/${latText}/${lonText}`,
    );
  });

  test('Unknown location with valid coordinates still enables map navigation', () => {
    const tree = renderDetail({
      ...baseReport,
      location: 'Unknown location',
      coordinates: { latitude: 0, longitude: 0 },
    });

    expect(findElement(tree, 'Button')?.props.label).toBe('Open location in maps');
    expect(findElement(tree, 'Banner')).toBeNull();
  });

  test.each([
    ['missing coordinates', undefined],
    ['null coordinates', null],
    ['malformed truthy coordinate object', { latitude: '10', longitude: 20 }],
    ['non-finite coordinates', { latitude: Number.NaN, longitude: 20 }],
    ['infinite coordinates', { latitude: 10, longitude: Number.POSITIVE_INFINITY }],
    ['out-of-range latitude', { latitude: 90.01, longitude: 20 }],
    ['out-of-range longitude', { latitude: 10, longitude: -180.01 }],
    ['array coordinates', [10, 20]],
    ['empty coordinate object', {}],
  ])('does not create a map URL for %s', (label, coordinates) => {
    const tree = renderDetail({ ...baseReport, coordinates });

    expect(getEmergencyReportMapUrl(coordinates)).toBeNull();
    expect(findElement(tree, 'Button')).toBeNull();
    expect(findElement(tree, 'Banner')?.props).toMatchObject({
      title: 'Map coordinates unavailable',
      message: 'Map coordinates are unavailable for this incident.',
      tone: 'info',
    });
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(JSON.stringify(tree)).not.toContain('No map location was submitted');
  });

  test('does not fall back to flat fields, evidence, device location, or readable address', () => {
    const tree = renderDetail({
      ...baseReport,
      location: 'Synthetic address',
      latitude: 1,
      longitude: 2,
      coordinates: null,
      evidence: [{ captureLocation: { latitude: 3, longitude: 4 } }],
      deviceLocation: { latitude: 5, longitude: 6 },
    });

    expect(findElement(tree, 'Button')).toBeNull();
    expect(getEmergencyReportMapUrl(undefined)).toBeNull();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});
