import React from 'react';
import IncidentDetail from '../app/incident/[id]';
import OperationalIncidentDetail from '../components/OperationalIncidentDetail';
import type { OperationalCluster, OperationalMemberReport } from '../types/operationalCluster';
import { collectElements, collectText, createHookHarness, findAllByType } from './support/tree';

const mockHarness = createHookHarness();
let mockRouteId = 'A';

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: (initial: unknown) => mockHarness.useState(initial),
  useRef: (initial: unknown) => mockHarness.useRef(initial),
  useEffect: (effect: () => void | (() => void), dependencies?: unknown[]) => mockHarness.useEffect(effect, dependencies),
  useCallback: (callback: unknown) => callback,
  useMemo: (callback: () => unknown) => callback(),
}));
jest.mock('react-native', () => ({
  Linking: { openURL: jest.fn() },
  Platform: { OS: 'web', select: ({ web, default: fallback }: { web?: unknown; default?: unknown }) => web ?? fallback },
  Pressable: 'Pressable', StyleSheet: { create: (styles: unknown) => styles }, Text: 'Text', View: 'View', Image: 'Image',
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: mockRouteId }),
}));
jest.mock('lucide-react-native', () => ({
  ArrowLeft: 'ArrowLeft', MapPin: 'MapPin', RefreshCw: 'RefreshCw', ShieldAlert: 'ShieldAlert', ShieldCheck: 'ShieldCheck',
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin', organizationId: 'org-1' } }) }));
jest.mock('@/services/apiService', () => ({
  apiService: {
    getEmergencyReport: jest.fn(),
    getOperationalClusters: jest.fn(),
    getReportEvidence: jest.fn(),
    assignTeamToReport: jest.fn(),
  },
  isApiError: (error: unknown) => Boolean(error && typeof error === 'object' && 'status' in error),
}));
jest.mock('@/services/teamService', () => ({ __esModule: true, default: { getTeams: jest.fn() } }));
jest.mock('@/utils/operations', () => ({ isTeamPresentationReady: () => true }));
jest.mock('@/components/ui', () => ({
  ActionBar: 'ActionBar', Banner: 'Banner', Button: 'Button', Card: 'Card', DetailItem: 'DetailItem',
  Dialog: 'Dialog', EmptyState: 'EmptyState', ErrorState: 'ErrorState', IconButton: 'IconButton',
  LoadingState: 'LoadingState', PageHeader: 'PageHeader', Priority: 'Priority', Screen: 'Screen',
  Section: 'Section', StatusBadge: 'StatusBadge', TypeBadge: 'TypeBadge',
}));

const { apiService } = jest.requireMock('@/services/apiService') as {
  apiService: {
    getEmergencyReport: jest.Mock;
    getOperationalClusters: jest.Mock;
    getReportEvidence: jest.Mock;
    assignTeamToReport: jest.Mock;
  };
};
const { default: teamService } = jest.requireMock('@/services/teamService') as {
  default: { getTeams: jest.Mock };
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

async function settlePromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const report = (id: string) => ({
  id, type: 'fire', description: `Report ${id}`, location: 'Main Street', priority: 'medium',
  status: 'pending' as const, created_at: '2026-10-05T01:00:00.000Z', coordinates: null, organization_id: 'org-1',
});

const member = (id: string, overrides: Partial<OperationalMemberReport> = {}): OperationalMemberReport => ({
  id, organization_id: 'org-1', assigned_team_id: null, type: 'fire', description: `Description ${id}`,
  latitude: 10, longitude: 124, priority: 'medium', status: 'pending',
  created_at: '2026-10-05T01:00:00.000Z', coordinates: { latitude: 10, longitude: 124 }, ...overrides,
});

const cluster = (id: string, members: OperationalMemberReport[], status: OperationalCluster['status'] = 'pending'): OperationalCluster => ({
  operationalId: id, clusterId: id, type: 'fire', status, location: `${id} location`,
  latitude: 10, longitude: 124, coordinates: { latitude: 10, longitude: 124 },
  firstReportedAt: '2026-10-05T01:00:00.000Z', latestReportedAt: '2026-10-05T02:00:00.000Z',
  reportCount: members.length, distinctReporterCount: 0, corroborated: false, acknowledged: false,
  priority: 'medium', assignedTeams: [], memberReports: members,
});

const clusterResponse = (item: OperationalCluster) => ({ data: { data: [item] } });
const evidenceItem = (id: string) => ({
  id, url: `https://signed.example/${id}`, width: 640, height: 480,
  evidenceRole: 'primary' as const, classification: null,
});

function resetHarness() {
  mockHarness.unmount();
  mockHarness.slots.length = 0;
  mockHarness.resetCursor();
  jest.clearAllMocks();
  mockRouteId = 'A';
}

function renderOperational(reportData: ReturnType<typeof report>) {
  mockHarness.resetCursor();
  const tree = OperationalIncidentDetail({ report: reportData, role: 'admin', routeId: reportData.id });
  return collectElements(tree);
}

describe('operational detail behavior under concurrent requests', () => {
  beforeEach(resetHarness);

  test('route change from A to B ignores the late report and error from A', async () => {
    const requestA = deferred<{ data: { data: ReturnType<typeof report> } }>();
    const requestB = deferred<{ data: { data: ReturnType<typeof report> } }>();
    apiService.getEmergencyReport.mockReturnValueOnce(requestA.promise).mockReturnValueOnce(requestB.promise);

    mockHarness.resetCursor();
    IncidentDetail();
    mockHarness.flushEffects();
    expect(apiService.getEmergencyReport).toHaveBeenNthCalledWith(1, 'A');

    mockRouteId = 'B';
    mockHarness.resetCursor();
    IncidentDetail();
    mockHarness.flushEffects();
    expect(apiService.getEmergencyReport).toHaveBeenNthCalledWith(2, 'B');

    requestB.resolve({ data: { data: report('B') } });
    await settlePromises();
    mockHarness.resetCursor();
    let tree = IncidentDetail() as React.ReactElement;
    expect(tree.type).toBe(OperationalIncidentDetail);
    expect((tree.props as { report: ReturnType<typeof report> }).report).toMatchObject({ id: 'B', description: 'Report B' });

    requestA.resolve({ data: { data: report('A') } });
    await settlePromises();
    mockHarness.resetCursor();
    tree = IncidentDetail() as React.ReactElement;
    expect(tree.type).toBe(OperationalIncidentDetail);
    expect((tree.props as { report: ReturnType<typeof report> }).report).toMatchObject({ id: 'B', description: 'Report B' });
    expect(collectText(tree).join(' ')).not.toContain('Report A');
    mockHarness.unmount();
  });

  test('report change ignores late operational summary and member evidence from the old report', async () => {
    const summaryA = deferred<{ data: { data: OperationalCluster[] } }>();
    const summaryB = deferred<{ data: { data: OperationalCluster[] } }>();
    const evidenceA = deferred<{ data: { data: ReturnType<typeof evidenceItem>[] } }>();
    const evidenceB = deferred<{ data: { data: ReturnType<typeof evidenceItem>[] } }>();
    const aCluster = cluster('cluster-A', [member('A', { description: 'Old A description' })]);
    const bPending = member('B-pending', { description: 'Current B pending description' });
    const bOther = member('B-other', { description: 'Current B other description', status: 'dispatched' });
    const bCluster = cluster('cluster-B', [member('B'), bPending, bOther]);

    apiService.getOperationalClusters.mockReturnValueOnce(summaryA.promise).mockReturnValueOnce(summaryB.promise);
    apiService.getReportEvidence.mockImplementation((id: string) => (
      id === 'A' ? evidenceA.promise : id === 'B-pending' ? evidenceB.promise : Promise.reject({ status: 403 })
    ));

    renderOperational(report('A'));
    mockHarness.flushEffects();
    expect(apiService.getOperationalClusters).toHaveBeenCalledTimes(1);

    renderOperational(report('B'));
    mockHarness.flushEffects();
    expect(apiService.getOperationalClusters).toHaveBeenCalledTimes(2);

    summaryB.resolve(clusterResponse(bCluster));
    await settlePromises();
    expect(apiService.getReportEvidence.mock.calls.map(([id]) => id)).toEqual(['B', 'B-pending', 'B-other']);

    evidenceB.resolve({ data: { data: [evidenceItem('evidence-B')] } });
    await settlePromises();
    let elements = renderOperational(report('B'));
    let content = collectText(elements).join(' | ');
    expect(content).toContain('Current B pending description');
    expect(content).toContain('Current B other description');
    expect(content).toContain('Evidence is restricted for this report.');
    expect(findAllByType(elements, 'Image').map(image => (image.props.source as { uri: string }).uri)).toContain('https://signed.example/evidence-B');

    summaryA.resolve(clusterResponse(aCluster));
    await settlePromises();
    evidenceA.resolve({ data: { data: [evidenceItem('evidence-A')] } });
    await settlePromises();
    elements = renderOperational(report('B'));
    content = collectText(elements).join(' | ');
    expect(content).toContain('Current B pending description');
    expect(content).toContain('Current B other description');
    expect(content).not.toContain('Old A description');
    expect(content).not.toContain('cluster-A location');
    expect(findAllByType(elements, 'Image').map(image => (image.props.source as { uri: string }).uri)).not.toContain('https://signed.example/evidence-A');
    mockHarness.unmount();
  });

  test('late evidence from the previous report cannot replace the current report evidence', async () => {
    const oldEvidence = deferred<{ data: { data: ReturnType<typeof evidenceItem>[] } }>();
    const oldCluster = cluster('cluster-A', [member('A', { description: 'Old A description' })]);
    const currentMember = member('B-member', { description: 'Current B description' });
    const currentCluster = cluster('cluster-B', [member('B'), currentMember]);
    apiService.getOperationalClusters
      .mockResolvedValueOnce(clusterResponse(oldCluster))
      .mockResolvedValueOnce(clusterResponse(currentCluster));
    apiService.getReportEvidence.mockImplementation((id: string) => {
      if (id === 'A') return oldEvidence.promise;
      if (id === 'B-member') return Promise.resolve({ data: { data: [evidenceItem('evidence-B')] } });
      return Promise.resolve({ data: { data: [] } });
    });

    renderOperational(report('A'));
    mockHarness.flushEffects();
    await settlePromises();
    expect(apiService.getReportEvidence).toHaveBeenCalledWith('A');

    renderOperational(report('B'));
    mockHarness.flushEffects();
    await settlePromises();
    let elements = renderOperational(report('B'));
    expect(collectText(elements).join(' ')).toContain('Current B description');
    expect(findAllByType(elements, 'Image').map(image => (image.props.source as { uri: string }).uri)).toContain('https://signed.example/evidence-B');

    oldEvidence.resolve({ data: { data: [evidenceItem('evidence-A')] } });
    await settlePromises();
    elements = renderOperational(report('B'));
    const text = collectText(elements).join(' | ');
    expect(text).toContain('Current B description');
    expect(text).not.toContain('Old A description');
    expect(findAllByType(elements, 'Image').map(image => (image.props.source as { uri: string }).uri)).not.toContain('https://signed.example/evidence-A');
    mockHarness.unmount();
  });

  test('dispatch targets only the pending member, then refreshes and renders updated state', async () => {
    const pending = member('pending-member');
    const other = member('other-member', { status: 'dispatched' });
    const initial = cluster('cluster-id', [member('cluster-id'), pending, other]);
    const updated = cluster('cluster-id', [
      member('cluster-id'),
      member('pending-member', { status: 'dispatched' }),
      other,
    ], 'dispatched');
    apiService.getOperationalClusters
      .mockResolvedValueOnce(clusterResponse(initial))
      .mockResolvedValueOnce(clusterResponse(updated));
    apiService.getReportEvidence.mockResolvedValue({ data: { data: [] } });
    apiService.assignTeamToReport.mockResolvedValue({ data: {} });
    teamService.getTeams.mockResolvedValue([{ id: 'team-1', name: 'Team One', members: [] }]);

    let elements = renderOperational(report('pending-member'));
    mockHarness.flushEffects();
    await settlePromises();
    elements = renderOperational(report('pending-member'));
    const pendingCard = findAllByType(elements, 'Card').find(card => collectText(card).join(' ').includes('Description pending-member'));
    let dispatchButton = pendingCard && findAllByType(pendingCard, 'Button').find(button => button.props.label === 'Dispatch this report');
    expect(dispatchButton).toBeDefined();
    (dispatchButton?.props.onPress as () => void)();
    await settlePromises();

    elements = renderOperational(report('pending-member'));
    const teamChoice = findAllByType(elements, 'Pressable').find(element => (
      collectText(element.props.children).join(' ').includes('Team One')
    ));
    expect(teamChoice).toBeDefined();
    (teamChoice?.props.onPress as () => void)();
    elements = renderOperational(report('pending-member'));
    const confirm = findAllByType(elements, 'Button').find(button => button.props.label === 'Dispatch team');
    await (confirm?.props.onPress as () => Promise<void>)();
    await settlePromises();

    expect(apiService.assignTeamToReport).toHaveBeenCalledTimes(1);
    expect(apiService.assignTeamToReport).toHaveBeenCalledWith('pending-member', 'team-1');
    expect(apiService.assignTeamToReport).not.toHaveBeenCalledWith('cluster-id', expect.anything());
    expect(apiService.assignTeamToReport).not.toHaveBeenCalledWith('other-member', expect.anything());
    expect(apiService.getOperationalClusters).toHaveBeenCalledTimes(2);
    elements = renderOperational(report('pending-member'));
    expect(findAllByType(elements, 'StatusBadge').some(badge => badge.props.value === 'dispatched')).toBe(true);
    mockHarness.unmount();
  });

  test.each(['success', 'failure'] as const)(
    'an A dispatch %s after route changes cannot refresh or show stale state over B',
    async outcome => {
      const dispatchRequest = deferred<{ data: unknown }>();
      const clusterA = cluster('cluster-A', [
        member('A'),
        member('pending-A', { description: 'Pending A report' }),
      ]);
      const clusterB = cluster('cluster-B', [
        member('B', { description: 'Current B report' }),
      ]);
      apiService.getOperationalClusters
        .mockResolvedValueOnce(clusterResponse(clusterA))
        .mockResolvedValueOnce(clusterResponse(clusterB));
      apiService.getReportEvidence.mockResolvedValue({ data: { data: [] } });
      apiService.assignTeamToReport.mockReturnValue(dispatchRequest.promise);
      teamService.getTeams.mockResolvedValue([{ id: 'team-A', name: 'Team A', members: [] }]);

      let elements = renderOperational(report('A'));
      mockHarness.flushEffects();
      await settlePromises();
      elements = renderOperational(report('A'));
      const pendingCard = findAllByType(elements, 'Card').find(card => collectText(card).join(' ').includes('Pending A report'));
      const dispatchButton = pendingCard && findAllByType(pendingCard, 'Button').find(button => button.props.label === 'Dispatch this report');
      (dispatchButton?.props.onPress as () => void)();
      await settlePromises();

      elements = renderOperational(report('A'));
      const teamChoice = findAllByType(elements, 'Pressable').find(element => (
        collectText(element.props.children).join(' ').includes('Team A')
      ));
      (teamChoice?.props.onPress as () => void)();
      elements = renderOperational(report('A'));
      const confirm = findAllByType(elements, 'Button').find(button => button.props.label === 'Dispatch team');
      const dispatchCompletion = (confirm?.props.onPress as () => Promise<void>)();
      expect(apiService.assignTeamToReport).toHaveBeenCalledWith('pending-A', 'team-A');

      elements = renderOperational(report('B'));
      mockHarness.flushEffects();
      await settlePromises();
      elements = renderOperational(report('B'));
      expect(collectText(elements).join(' ')).toContain('Current B report');
      expect(apiService.getOperationalClusters).toHaveBeenCalledTimes(2);

      if (outcome === 'success') dispatchRequest.resolve({ data: {} });
      else dispatchRequest.reject(new Error('stale A dispatch failed'));
      await dispatchCompletion;
      await settlePromises();

      elements = renderOperational(report('B'));
      const currentText = collectText(elements).join(' | ');
      expect(currentText).toContain('Current B report');
      expect(currentText).not.toContain('Pending A report');
      expect(currentText).not.toContain('stale A dispatch failed');
      expect(apiService.getOperationalClusters).toHaveBeenCalledTimes(2);
      expect(apiService.assignTeamToReport).toHaveBeenCalledTimes(1);
      expect(jest.requireMock('expo-router').router.push).not.toHaveBeenCalled();
      mockHarness.unmount();
    },
  );
});
