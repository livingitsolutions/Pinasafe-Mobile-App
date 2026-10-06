import fs from 'fs';
import path from 'path';
import { MemberEvidence, OperationalIncidentHeader, OperationalMemberSection } from '../components/OperationalIncident';
import type { OperationalCluster, OperationalMemberReport } from '../types/operationalCluster';
import { collectText, findAllByType } from './support/tree';

jest.mock('react-native', () => ({
  Linking: { openURL: jest.fn() },
  Platform: { select: ({ web, default: fallback }: { web?: unknown; default?: unknown }) => web ?? fallback },
  Pressable: 'Pressable', StyleSheet: { create: (styles: unknown) => styles }, Text: 'Text', View: 'View', Image: 'Image',
}));
jest.mock('lucide-react-native', () => ({ MapPin: 'MapPin', ShieldCheck: 'ShieldCheck' }));
jest.mock('@/components/ui', () => ({
  Banner: 'Banner', Button: 'Button', Card: 'Card', EmptyState: 'EmptyState', ErrorState: 'ErrorState', ListRow: 'ListRow',
  Priority: 'Priority', StatusBadge: 'StatusBadge', TypeBadge: 'TypeBadge',
}));

const member = (overrides: Partial<OperationalMemberReport> = {}): OperationalMemberReport => ({
  id: 'r-1', organization_id: 'org-1', assigned_team_id: null, type: 'fire', description: 'Smoke',
  latitude: 10, longitude: 124, priority: 'medium', status: 'pending', created_at: '2026-10-05T01:00:00.000Z',
  coordinates: { latitude: 10, longitude: 124 }, ...overrides,
});
const cluster = (overrides: Partial<OperationalCluster> = {}): OperationalCluster => ({
  operationalId: 'c-1', clusterId: 'c-1', type: 'fire', status: 'pending', location: 'Main Street',
  latitude: 10, longitude: 124, coordinates: { latitude: 10, longitude: 124 },
  firstReportedAt: '2026-10-05T01:00:00.000Z', latestReportedAt: '2026-10-05T02:00:00.000Z',
  reportCount: 2, distinctReporterCount: 1, corroborated: false, acknowledged: false,
  priority: 'high', assignedTeams: [], memberReports: [member()], ...overrides,
});
const text = (tree: unknown) => collectText(tree).join(' | ');
const textLines = (tree: unknown) => findAllByType(tree, 'Text').map(element => collectText(element).join(''));
const item = (id: string) => ({
  id, url: `https://signed.example/${id}`, width: 640, height: 480, evidenceRole: 'primary' as const, classification: null,
}) as never;

describe('operational incident detail', () => {
  test('resolved summary keeps report times and uses the latest member resolution from the first report', () => {
    const first = '2026-10-07T06:23:34.000Z';
    const latest = '2026-10-07T06:28:34.000Z';
    const resolved = '2026-10-07T06:38:49.000Z';
    const tree = OperationalIncidentHeader({ cluster: cluster({ status: 'resolved', firstReportedAt: first, latestReportedAt: latest,
      memberReports: [
        member({ id: 'a', status: 'resolved', created_at: first, resolved_at: '2026-10-07T06:30:00.000Z', updated_at: '2026-10-07T07:00:00.000Z' }),
        member({ id: 'b', status: 'resolved', created_at: latest, resolved_at: resolved }),
      ],
    }), onOpenMap: jest.fn() });
    expect(textLines(tree)).toEqual(expect.arrayContaining([
      `First reported ${new Date(first).toLocaleString()}`,
      `Latest report ${new Date(latest).toLocaleString()}`,
      `Resolved ${new Date(resolved).toLocaleString()}`,
      'Response time 15 min 15 sec',
    ]));
    expect(findAllByType(tree, 'StatusBadge')[0].props.value).toBe('resolved');
    expect(text(tree)).toContain('2 Reports');
  });

  test.each(['pending', 'dispatched', 'responding'])('active operational %s omits completed timing', status => {
    const tree = OperationalIncidentHeader({ cluster: cluster({ status: status as OperationalCluster['status'], memberReports: [member({ status, updated_at: '2026-10-07T06:38:49.000Z' })] }), onOpenMap: jest.fn() });
    expect(text(tree)).not.toContain('Resolved ');
    expect(text(tree)).not.toContain('Response time');
  });

  test('resolved member update compatibility fallback and invalid omission stay safe', () => {
    const first = '2026-10-07T06:23:34.000Z';
    const resolved = '2026-10-07T06:38:49.000Z';
    const tree = OperationalIncidentHeader({ cluster: cluster({ status: 'resolved', firstReportedAt: first, memberReports: [member({ status: 'resolved', updated_at: resolved })] }), onOpenMap: jest.fn() });
    expect(textLines(tree)).toEqual(expect.arrayContaining([`Resolved ${new Date(resolved).toLocaleString()}`, 'Response time 15 min 15 sec']));
    const invalid = OperationalIncidentHeader({ cluster: cluster({ status: 'resolved', memberReports: [member({ status: 'resolved', resolved_at: 'invalid', updated_at: 'invalid' })] }), onOpenMap: jest.fn() });
    expect(text(invalid)).not.toMatch(/Resolved |Response time|NaN|Invalid Date/);
    const negative = OperationalIncidentHeader({ cluster: cluster({ status: 'resolved', firstReportedAt: '2026-10-07T07:00:00.000Z', memberReports: [member({ status: 'resolved', resolved_at: resolved })] }), onOpenMap: jest.fn() });
    expect(textLines(negative)).toContain(`Resolved ${new Date(resolved).toLocaleString()}`);
    expect(text(negative)).not.toContain('Response time');
  });

  test('each member keeps its own description and evidence', () => {
    const a = OperationalMemberSection({ member: member({ id: 'a', description: 'Alpha text' }), index: 0, evidence: { status: 'ready', items: [item('ev-a')] }, canDispatch: false, onDispatch: jest.fn() });
    const b = OperationalMemberSection({ member: member({ id: 'b', description: 'Beta text' }), index: 1, evidence: { status: 'ready', items: [item('ev-b')] }, canDispatch: false, onDispatch: jest.fn() });
    expect(text(a)).toContain('Alpha text');
    expect(text(a)).not.toContain('Beta text');
    expect(findAllByType(a, 'Image').map(i => (i.props.source as { uri: string }).uri)).toEqual(['https://signed.example/ev-a']);
    expect(findAllByType(b, 'Image').map(i => (i.props.source as { uri: string }).uri)).toEqual(['https://signed.example/ev-b']);
  });

  test('one member evidence failure is isolated to that member', () => {
    const failed = OperationalMemberSection({ member: member({ id: 'a' }), index: 0, evidence: { status: 'error', message: 'Evidence could not be loaded.' }, canDispatch: false, onDispatch: jest.fn() });
    const ok = OperationalMemberSection({ member: member({ id: 'b', description: 'Still here' }), index: 1, evidence: { status: 'ready', items: [item('ev-b')] }, canDispatch: false, onDispatch: jest.fn() });
    expect(findAllByType(failed, 'ErrorState')).toHaveLength(1);
    expect(findAllByType(ok, 'ErrorState')).toHaveLength(0);
    expect(findAllByType(ok, 'Image')).toHaveLength(1);
  });

  test('empty evidence state is truthful', () => {
    expect(findAllByType(MemberEvidence({ state: { status: 'ready', items: [] } }), 'EmptyState')).toHaveLength(1);
  });

  test('Dispatch is per member and only offered when allowed', () => {
    const onDispatch = jest.fn();
    const allowed = OperationalMemberSection({ member: member({ id: 'm-7' }), index: 0, evidence: undefined, canDispatch: true, onDispatch });
    const button = findAllByType(allowed, 'Button').find(b => b.props.label === 'Dispatch this report');
    (button?.props.onPress as () => void)();
    expect(onDispatch).toHaveBeenCalledTimes(1);
    const denied = OperationalMemberSection({ member: member({ status: 'dispatched' }), index: 0, evidence: undefined, canDispatch: false, onDispatch });
    expect(findAllByType(denied, 'Button').some(b => b.props.label === 'Dispatch this report')).toBe(false);
  });

  test('"Open this report" is offered when a handler is supplied', () => {
    const onOpenReport = jest.fn();
    const tree = OperationalMemberSection({ member: member(), index: 0, evidence: undefined, canDispatch: false, onDispatch: jest.fn(), onOpenReport });
    (findAllByType(tree, 'Button').find(b => b.props.label === 'Open this report')?.props.onPress as () => void)();
    expect(onOpenReport).toHaveBeenCalled();
  });

  test('header shows aggregate state, count and no corroboration wording', () => {
    const t = text(OperationalIncidentHeader({ cluster: cluster(), onOpenMap: jest.fn() }));
    expect(t).toContain('2 Reports');
    expect(t).toContain('Main Street');
    expect(t.toLowerCase()).not.toMatch(/high alert|corroborat|verified by multiple/);
  });

  test('header map action reflects coordinate availability', () => {
    const withCoords = OperationalIncidentHeader({ cluster: cluster(), onOpenMap: jest.fn() });
    const without = OperationalIncidentHeader({ cluster: cluster({ coordinates: null, location: null }), onOpenMap: jest.fn() });
    expect(findAllByType(withCoords, 'Button').some(b => b.props.label === 'Open location in maps')).toBe(true);
    expect(findAllByType(without, 'Button').some(b => b.props.label === 'Open location in maps')).toBe(false);
    expect(text(without)).toContain('Location unavailable');
  });
});

describe('detail wiring (source-level)', () => {
  const root = path.resolve(__dirname, '..');
  const detail = fs.readFileSync(path.join(root, 'components/OperationalIncidentDetail.tsx'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'app/incident/[id].tsx'), 'utf8');

  test('dispatch uses the selected member report id and only the existing per-report API', () => {
    expect(detail).toContain('assignTeamToReport(selectedReportId, teamId)');
    expect(detail).not.toMatch(/updateReportStatus|updateClusterStatus|resolveCluster|bulk/i);
  });

  test('evidence is loaded per member via the existing report evidence endpoint', () => {
    expect(detail).toContain('getReportEvidence(id)');
    expect(detail).toContain('Promise.all(reportIds.map');
  });

  test('direct /incident/<memberId> loading delegates to the operational detail for admins only', () => {
    expect(route).toMatch(/report && isAdmin\) return <OperationalIncidentDetail/);
  });
});
