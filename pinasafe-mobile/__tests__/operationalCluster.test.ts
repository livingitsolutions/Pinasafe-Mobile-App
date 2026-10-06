import type { OperationalCluster, OperationalMemberReport } from '../types/operationalCluster';
import {
  COORDINATES_ONLY_LOCATION_COPY,
  LOCATION_UNAVAILABLE_COPY,
  buildSingleReportOperational,
  canDispatchMember,
  filterOperationalClusters,
  findOperationalClusterForReport,
  formatReportCount,
  getNavigationTargetId,
  getOperationalLocation,
  getScopedMembers,
} from '../utils/operationalCluster';

const member = (overrides: Partial<OperationalMemberReport> = {}): OperationalMemberReport => ({
  id: 'r-1', organization_id: 'org-1', assigned_team_id: null, type: 'fire', description: 'Smoke',
  latitude: 10, longitude: 124, priority: 'medium', status: 'pending', created_at: '2026-10-05T01:00:00.000Z',
  coordinates: { latitude: 10, longitude: 124 }, ...overrides,
});

const cluster = (overrides: Partial<OperationalCluster> = {}): OperationalCluster => ({
  operationalId: 'c-1', clusterId: 'c-1', type: 'fire', status: 'pending', location: 'Main Street',
  latitude: 10, longitude: 124, coordinates: { latitude: 10, longitude: 124 },
  firstReportedAt: '2026-10-05T01:00:00.000Z', latestReportedAt: '2026-10-05T02:00:00.000Z',
  reportCount: 2, distinctReporterCount: 1, priority: 'high', assignedTeams: [],
  memberReports: [member({ id: 'c-1' }), member({ id: 'r-2', created_at: '2026-10-05T02:00:00.000Z' })], ...overrides,
});

describe('operational cluster helpers', () => {
  test('report count copy', () => {
    expect(formatReportCount(1)).toBe('1 Report');
    expect(formatReportCount(2)).toBe('2 Reports');
    expect(formatReportCount(7)).toBe('7 Reports');
  });

  test('readable location is shown as-is', () => {
    expect(getOperationalLocation(cluster())).toMatchObject({ kind: 'address', text: 'Main Street' });
  });

  test.each([null, '', '   ', 'Unknown location', ' UNKNOWN LOCATION '])('unavailable location %p with valid coordinates is truthful', location => {
    expect(getOperationalLocation(cluster({ location }))).toMatchObject({ kind: 'coordinates-only', text: COORDINATES_ONLY_LOCATION_COPY });
    expect(getOperationalLocation(cluster({ location })).mapUrl).toContain('openstreetmap.org');
  });

  test('no location and no coordinates is unavailable with no map', () => {
    expect(getOperationalLocation(cluster({ location: null, coordinates: null }))).toEqual({
      kind: 'unavailable', text: LOCATION_UNAVAILABLE_COPY, mapUrl: null,
    });
  });

  test('valid coordinates keep Open in Maps even with a readable address; invalid ones do not', () => {
    expect(getOperationalLocation(cluster()).mapUrl).toBe('https://www.openstreetmap.org/?mlat=10&mlon=124#map=17/10/124');
    expect(getOperationalLocation(cluster({ coordinates: { latitude: 0, longitude: 0 } })).mapUrl).not.toBeNull();
    expect(getOperationalLocation(cluster({ coordinates: { latitude: 91, longitude: 0 } })).mapUrl).toBeNull();
  });

  test('navigation prefers the anchor when in scope', () => {
    expect(getNavigationTargetId(cluster(), 'org-1')).toBe('c-1');
  });

  test('navigation never uses a foreign-organization anchor', () => {
    const mixed = cluster({
      memberReports: [
        member({ id: 'c-1', organization_id: 'org-2', created_at: '2026-10-05T00:00:00.000Z' }),
        member({ id: 'r-3', created_at: '2026-10-05T03:00:00.000Z' }),
        member({ id: 'r-2', created_at: '2026-10-05T02:00:00.000Z' }),
      ],
    });
    expect(getNavigationTargetId(mixed, 'org-1')).toBe('r-2');
    expect(getScopedMembers(mixed, 'org-1').map(item => item.id)).toEqual(['r-2', 'r-3']);
  });

  test('navigation for an unclustered item uses the report id; empty scope has no target', () => {
    const single = cluster({ operationalId: 'solo', clusterId: null, memberReports: [member({ id: 'solo' })] });
    expect(getNavigationTargetId(single, 'org-1')).toBe('solo');
    expect(getNavigationTargetId(cluster({ memberReports: [] }), 'org-1')).toBeNull();
  });

  test('finds the operational item containing a member report (direct deep link)', () => {
    const other = cluster({ operationalId: 'c-9', clusterId: 'c-9', memberReports: [member({ id: 'c-9' })] });
    expect(findOperationalClusterForReport([other, cluster()], 'r-2')?.operationalId).toBe('c-1');
    expect(findOperationalClusterForReport([other], 'r-2')).toBeNull();
  });

  test('filters by aggregate status and keeps resolved reachable', () => {
    const list = [cluster({ status: 'resolved', operationalId: 'a' }), cluster({ status: 'pending', operationalId: 'b' })];
    expect(filterOperationalClusters(list, 'all')).toHaveLength(2);
    expect(filterOperationalClusters(list, 'resolved').map(item => item.operationalId)).toEqual(['a']);
    expect(filterOperationalClusters(list, 'dispatched')).toEqual([]);
  });

  test('only admins can dispatch pending members', () => {
    expect(canDispatchMember({ status: 'pending' }, 'admin')).toBe(true);
    expect(canDispatchMember({ status: 'dispatched' }, 'admin')).toBe(false);
    expect(canDispatchMember({ status: 'pending' }, 'responder')).toBe(false);
    expect(canDispatchMember({ status: 'pending' }, undefined)).toBe(false);
  });

  test('builds a truthful single-report operational view', () => {
    const single = buildSingleReportOperational({
      id: 'solo', type: 'road', description: 'Crash', location: 'Unknown location', priority: 'weird',
      status: 'pending', created_at: '2026-10-05T01:00:00.000Z', coordinates: { latitude: 10, longitude: 124 },
    });
    expect(single).toMatchObject({ operationalId: 'solo', clusterId: null, reportCount: 1, distinctReporterCount: 0, location: null, priority: null, status: 'pending' });
    expect(single.memberReports).toHaveLength(1);
    expect(single.memberReports[0].description).toBe('Crash');
  });
});
