import type { OperationalCluster, OperationalMemberReport } from '@/types/operationalCluster';
import { getEmergencyReportMapUrl } from '@/utils/mapUrl';

export const OPERATIONAL_FILTERS = ['all', 'pending', 'dispatched', 'responding', 'resolved'] as const;
export type OperationalFilter = typeof OPERATIONAL_FILTERS[number];

export const COORDINATES_ONLY_LOCATION_COPY = 'Exact address unavailable — coordinates available';
export const LOCATION_UNAVAILABLE_COPY = 'Location unavailable';

export function formatReportCount(count: number): string {
  return `${count} ${count === 1 ? 'Report' : 'Reports'}`;
}

export function getOperationalLocation(cluster: Pick<OperationalCluster, 'location' | 'coordinates'>): {
  text: string;
  kind: 'address' | 'coordinates-only' | 'unavailable';
  mapUrl: string | null;
} {
  const mapUrl = getEmergencyReportMapUrl(cluster.coordinates);
  const address = typeof cluster.location === 'string' ? cluster.location.trim() : '';
  if (address && address.toLowerCase() !== 'unknown location') return { text: address, kind: 'address', mapUrl };
  if (mapUrl) return { text: COORDINATES_ONLY_LOCATION_COPY, kind: 'coordinates-only', mapUrl };
  return { text: LOCATION_UNAVAILABLE_COPY, kind: 'unavailable', mapUrl: null };
}

function compareMembers(left: OperationalMemberReport, right: OperationalMemberReport): number {
  const leftTime = Date.parse(left.created_at ?? '');
  const rightTime = Date.parse(right.created_at ?? '');
  const leftValue = Number.isNaN(leftTime) ? Number.MAX_SAFE_INTEGER : leftTime;
  const rightValue = Number.isNaN(rightTime) ? Number.MAX_SAFE_INTEGER : rightTime;
  return leftValue - rightValue || left.id.localeCompare(right.id);
}

export function getScopedMembers(cluster: OperationalCluster, organizationId?: string | null): OperationalMemberReport[] {
  const members = Array.isArray(cluster.memberReports) ? cluster.memberReports : [];
  return (organizationId ? members.filter(member => member.organization_id === organizationId) : members)
    .slice()
    .sort(compareMembers);
}

/** Anchor member when it is in scope, otherwise the earliest scoped member. */
export function getNavigationTargetId(cluster: OperationalCluster, organizationId?: string | null): string | null {
  const members = getScopedMembers(cluster, organizationId);
  const anchor = cluster.clusterId ? members.find(member => member.id === cluster.clusterId) : undefined;
  return (anchor ?? members[0])?.id ?? null;
}

export function findOperationalClusterForReport(
  clusters: OperationalCluster[],
  reportId: string,
): OperationalCluster | null {
  return clusters.find(cluster => cluster.memberReports?.some(member => member.id === reportId)) ?? null;
}

export function filterOperationalClusters(clusters: OperationalCluster[], filter: OperationalFilter): OperationalCluster[] {
  return clusters.filter(cluster => filter === 'all' || cluster.status === filter);
}

export function canDispatchMember(member: Pick<OperationalMemberReport, 'status'>, role?: string | null): boolean {
  return role === 'admin' && member.status === 'pending';
}

export function formatOperationalTime(value: string | null | undefined): string {
  if (!value || Number.isNaN(Date.parse(value))) return 'Time unavailable';
  return new Date(value).toLocaleString();
}

export type SingleReportSource = {
  id: string;
  type?: string | null;
  description?: string | null;
  location?: string | null;
  priority?: string | null;
  status?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
  updated_at?: string | null;
  assigned_team_id?: string | null;
  organization_id?: string | null;
  coordinates?: { latitude: number; longitude: number } | null;
};

/** Truthful one-report view used only when the operational list cannot supply this report. */
export function buildSingleReportOperational(report: SingleReportSource): OperationalCluster {
  const status = (['pending', 'dispatched', 'responding', 'resolved'] as const).find(value => value === report.status) ?? 'pending';
  const priority = (['low', 'medium', 'high', 'critical'] as const).find(value => value === report.priority) ?? null;
  const coordinates = getEmergencyReportMapUrl(report.coordinates) ? report.coordinates ?? null : null;
  const location = typeof report.location === 'string' && report.location.trim().toLowerCase() !== 'unknown location' && report.location.trim()
    ? report.location
    : null;

  return {
    operationalId: report.id,
    clusterId: null,
    type: report.type ?? null,
    status,
    location,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    coordinates,
    firstReportedAt: report.created_at ?? null,
    latestReportedAt: report.created_at ?? null,
    reportCount: 1,
    // Reporter identity is unavailable in this fallback; do not infer corroboration.
    distinctReporterCount: 0,
    corroborated: false,
    acknowledged: false,
    priority,
    assignedTeams: report.assigned_team_id ? [{ id: report.assigned_team_id }] : [],
    memberReports: [{
      id: report.id,
      organization_id: report.organization_id ?? null,
      assigned_team_id: report.assigned_team_id ?? null,
      type: report.type ?? '',
      description: report.description ?? null,
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      priority: report.priority ?? null,
      status: report.status ?? null,
      created_at: report.created_at ?? null,
      resolved_at: report.resolved_at ?? null,
      updated_at: report.updated_at ?? null,
      coordinates,
    }],
  };
}
