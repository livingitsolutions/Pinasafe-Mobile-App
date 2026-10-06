import fs from 'fs';
import path from 'path';
import React from 'react';
import AdminIncidents from '../app/(tabs-admin)/incidents';
import type { OperationalCluster, OperationalMemberReport } from '../types/operationalCluster';
import { collectText, createHookHarness, findAllByType } from './support/tree';

const mockHarness = createHookHarness();

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: (initial: unknown) => mockHarness.useState(initial),
  useRef: (initial: unknown) => mockHarness.useRef(initial),
  useEffect: (effect: () => void | (() => void), dependencies?: unknown[]) => mockHarness.useEffect(effect, dependencies),
  useCallback: (callback: unknown) => callback,
  useMemo: (callback: () => unknown) => callback(),
}));
jest.mock('react-native', () => ({
  Linking: { openURL: jest.fn().mockResolvedValue(undefined) },
  Platform: { OS: 'web', select: ({ web, default: fallback }: { web?: unknown; default?: unknown }) => web ?? fallback },
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  View: 'View',
  Image: 'Image',
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('lucide-react-native', () => ({ MapPin: 'MapPin', ShieldCheck: 'ShieldCheck', ShieldAlert: 'ShieldAlert', ArrowLeft: 'ArrowLeft' }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin', organizationId: 'org-1' } }) }));
jest.mock('@/services/apiService', () => ({ apiService: { getOperationalClusters: jest.fn() }, isApiError: () => false }));
jest.mock('@/components/ui', () => ({
  Banner: 'Banner', Button: 'Button', Card: 'Card', EmptyState: 'EmptyState', ErrorState: 'ErrorState', ListRow: 'ListRow',
  LoadingState: 'LoadingState', PageHeader: 'PageHeader', Priority: 'Priority', Screen: 'Screen', Section: 'Section',
  StatusBadge: 'StatusBadge', TypeBadge: 'TypeBadge', IconButton: 'IconButton',
}));

const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };
const { Linking } = jest.requireMock('react-native') as { Linking: { openURL: jest.Mock } };
const { Platform } = jest.requireMock('react-native') as { Platform: { OS: string } };
const { apiService } = jest.requireMock('@/services/apiService') as {
  apiService: { getOperationalClusters: jest.Mock };
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const member = (overrides: Partial<OperationalMemberReport> = {}): OperationalMemberReport => ({
  id: 'c-1', organization_id: 'org-1', assigned_team_id: null, type: 'fire', description: 'Smoke',
  latitude: 10, longitude: 124, priority: 'medium', status: 'pending', created_at: '2026-10-05T01:00:00.000Z',
  coordinates: { latitude: 10, longitude: 124 }, ...overrides,
});

const cluster = (overrides: Partial<OperationalCluster> = {}): OperationalCluster => ({
  operationalId: 'c-1', clusterId: 'c-1', type: 'fire', status: 'dispatched', location: 'Main Street',
  latitude: 10, longitude: 124, coordinates: { latitude: 10, longitude: 124 },
  firstReportedAt: '2026-10-05T01:00:00.000Z', latestReportedAt: '2026-10-05T02:00:00.000Z',
  reportCount: 2, distinctReporterCount: 1, corroborated: false, acknowledged: false,
  priority: 'high', assignedTeams: [],
  memberReports: [member(), member({ id: 'r-2', created_at: '2026-10-05T02:00:00.000Z' })], ...overrides,
});

// State order in AdminIncidents: filter, clusters, loading, errors, acknowledgement, and sound state.
const render = (clusters: OperationalCluster[], filter = 'all', error = '') => {
  mockHarness.slots.length = 0;
  mockHarness.slots.push(filter, clusters, false, error, new Set<string>(), {}, 'disabled', '');
  mockHarness.resetCursor();
  return AdminIncidents();
};

const rows = (tree: unknown) => findAllByType(tree, 'ListRow');
const allText = (tree: unknown) => collectText(tree).join(' | ');

describe('Admin operational incident queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHarness.unmount();
    mockHarness.slots.length = 0;
    mockHarness.resetCursor();
  });

  test('two member reports render as ONE card with an N Reports count', () => {
    const tree = render([cluster()]);
    expect(rows(tree)).toHaveLength(1);
    expect(allText(tree)).toContain('2 Reports');
    expect(allText(tree)).toContain('1 incident');
  });

  test('one-report incidents say 1 Report and remain visible', () => {
    const solo = cluster({ operationalId: 'solo', clusterId: null, reportCount: 1, memberReports: [member({ id: 'solo' })] });
    const tree = render([solo]);
    expect(rows(tree)).toHaveLength(1);
    expect(allText(tree)).toContain('1 Report ');
  });

  test('aggregate status, priority and type are displayed', () => {
    const tree = render([cluster({ status: 'responding', priority: 'critical', type: 'fire' })]);
    expect(findAllByType(tree, 'StatusBadge')[0].props.value).toBe('responding');
    expect(findAllByType(tree, 'Priority')[0].props.value).toBe('critical');
    expect(findAllByType(tree, 'TypeBadge')[0].props.value).toBe('fire');
  });

  test('null priority renders no priority badge', () => {
    expect(findAllByType(render([cluster({ priority: null })]), 'Priority')).toHaveLength(0);
  });

  test('readable location and times are shown', () => {
    const text = allText(render([cluster()]));
    expect(text).toContain('Main Street');
    expect(text).toContain('First reported');
    expect(text).toContain('Latest report');
  });

  test.each([null, 'Unknown location'])('unavailable location %p falls back truthfully with coordinates', location => {
    const text = allText(render([cluster({ location })]));
    expect(text).toContain('Exact address unavailable — coordinates available');
    expect(text).not.toContain('Unknown location');
  });

  test('no location and no coordinates shows Location unavailable and no map action', () => {
    const tree = render([cluster({ location: null, coordinates: null, latitude: null, longitude: null })]);
    expect(allText(tree)).toContain('Location unavailable');
    expect(allText(tree)).not.toContain('Open in Maps');
  });

  test('valid coordinates expose Open in Maps', async () => {
    const tree = render([cluster()]);
    const trailing = rows(tree)[0].props.trailing as React.ReactElement;
    const mapButton = findAllByType(trailing, 'Button').find(button => button.props.label === 'Open in Maps');
    expect(mapButton).toBeDefined();
    await (mapButton?.props.onPress as () => void)();
    expect(Linking.openURL).toHaveBeenCalledWith('https://www.openstreetmap.org/?mlat=10&mlon=124#map=17/10/124');
  });

  test('card navigates with the own-organization anchor member report id', () => {
    const tree = render([cluster()]);
    (rows(tree)[0].props.onPress as () => void)();
    expect(router.push).toHaveBeenCalledWith('/incident/c-1');
  });

  test('card never navigates using a foreign-organization anchor', () => {
    const foreignAnchor = cluster({
      memberReports: [member({ id: 'c-1', organization_id: 'org-2' }), member({ id: 'r-2', created_at: '2026-10-05T02:00:00.000Z' })],
    });
    (rows(render([foreignAnchor]))[0].props.onPress as () => void)();
    expect(router.push).toHaveBeenCalledWith('/incident/r-2');
  });

  test('the queue offers View Incident but never a cluster-wide Dispatch or status action', () => {
    const tree = render([cluster({ status: 'pending' })]);
    const labels = findAllByType(tree, 'Button').map(button => button.props.label);
    expect(labels).toContain('View Incident');
    expect(labels.some(label => /dispatch|resolve|responding/i.test(String(label)))).toBe(false);
  });

  test('same-reporter two-report cluster has no corroborated alert badge or action', () => {
    const tree = render([cluster({ distinctReporterCount: 1 })]);
    const text = allText(tree).toLowerCase();
    expect(text).not.toContain('corroborated');
    expect(findAllByType(tree, 'Button').map(button => button.props.label)).not.toContain('Acknowledge Alert');
  });

  test('backend corroboration displays the high alert independently from priority', () => {
    const tree = render([cluster({ distinctReporterCount: 2, corroborated: true })]);
    const text = allText(tree);
    expect(text).toContain('CORROBORATED HIGH ALERT');
    expect(text).toContain('2 Reports');
    expect(text).toContain('Priority ');
    expect(text).toContain('HIGH');
    expect(text).toContain('indicates urgency');
    expect(findAllByType(tree, 'Button').map(button => button.props.label)).toContain('Acknowledge Alert');
  });

  test('acknowledged corroborated incident stays visible and resolved incident is not active high alert', () => {
    const acknowledged = allText(render([cluster({ corroborated: true, acknowledged: true })]));
    expect(acknowledged).toContain('CORROBORATED HIGH ALERT');
    expect(acknowledged).toContain('Acknowledged');
    expect(acknowledged).not.toContain('Acknowledge Alert');

    const resolved = allText(render([cluster({ status: 'resolved', corroborated: true })]));
    expect(resolved).toContain('CORROBORATED');
    expect(resolved).not.toContain('CORROBORATED HIGH ALERT');
  });

  test('native platform keeps the visual alert and disables operational audio', () => {
    Platform.OS = 'android';
    const tree = render([cluster({ corroborated: true, distinctReporterCount: 2 })]);
    expect(allText(tree)).toContain('CORROBORATED HIGH ALERT');
    expect(allText(tree)).toContain('unavailable on this platform');
    const audioButton = findAllByType(tree, 'Button')
      .find(button => String(button.props.label).includes('unavailable on this platform'));
    expect(audioButton?.props.disabled).toBe(true);
    Platform.OS = 'web';
  });

  test('resolved incidents remain reachable through the resolved filter', () => {
    const resolved = cluster({ status: 'resolved' });
    expect(rows(render([resolved], 'all'))).toHaveLength(1);
    expect(rows(render([resolved], 'resolved'))).toHaveLength(1);
    expect(rows(render([resolved], 'pending'))).toHaveLength(0);
  });

  test('a queue load failure is reported without hiding the screen', () => {
    expect(allText(render([], 'all', 'Operational incidents could not be loaded.'))).toContain('Operational incidents could not be loaded.');
  });

  test('a late older queue response cannot overwrite a newer request', async () => {
    const older = deferred<{ data: { data: OperationalCluster[] } }>();
    const newer = deferred<{ data: { data: OperationalCluster[] } }>();
    apiService.getOperationalClusters.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

    mockHarness.slots.length = 0;
    mockHarness.resetCursor();
    let tree: unknown = AdminIncidents();
    mockHarness.flushEffects();
    expect(apiService.getOperationalClusters).toHaveBeenCalledTimes(1);

    const refresh = findAllByType(tree, 'Button').find(button => button.props.label === 'Refresh');
    (refresh?.props.onPress as () => void)();
    expect(apiService.getOperationalClusters).toHaveBeenCalledTimes(2);

    const latest = cluster({
      operationalId: 'newer',
      clusterId: null,
      location: 'New operational state',
      memberReports: [member({ id: 'newer' })],
    });
    newer.resolve({ data: { data: [latest] } });
    await Promise.resolve();
    await Promise.resolve();
    mockHarness.resetCursor();
    tree = AdminIncidents();
    expect(findAllByType(tree, 'ListRow').map(row => row.props.title)).toContain('New operational state');

    older.resolve({ data: { data: [cluster({ location: 'Old operational state' })] } });
    await Promise.resolve();
    await Promise.resolve();
    mockHarness.resetCursor();
    tree = AdminIncidents();
    expect(findAllByType(tree, 'ListRow').map(row => row.props.title)).toContain('New operational state');
    expect(findAllByType(tree, 'ListRow').map(row => row.props.title)).not.toContain('Old operational state');
    mockHarness.unmount();
  });
});

describe('alert/audio and terminology freeze', () => {
  const root = path.resolve(__dirname, '..');
  const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
  const operationalFiles = [
    'app/(tabs-admin)/incidents.tsx',
    'components/OperationalIncident.tsx',
    'components/OperationalIncidentDetail.tsx',
    'utils/operationalCluster.ts',
  ];

  test.each(operationalFiles)('%s does not couple to EmergencyContext or report-level clustering', file => {
    const source = read(file);
    expect(source).not.toMatch(/EmergencyContext|useEmergency|clusteredIncidents/);
  });

  test('the Incidents command center labels corroboration separately from priority', () => {
    expect(read('app/(tabs-admin)/incidents.tsx')).toMatch(/Priority indicates urgency; corroboration indicates independent confirmation/);
    expect(read('utils/operationalHighAlert.ts')).toMatch(/CORROBORATED HIGH ALERT/);
  });

  test('the operational code never calls the legacy cluster info/updates endpoints', () => {
    for (const file of operationalFiles) expect(read(file)).not.toMatch(/getClusterInfo|getClusterUpdates|createClusterUpdate|getMyClusters/);
  });
});
