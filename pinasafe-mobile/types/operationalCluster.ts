export type OperationalStatus = 'pending' | 'dispatched' | 'responding' | 'resolved';
export type OperationalPriority = 'low' | 'medium' | 'high' | 'critical';

export interface OperationalCoordinates {
  latitude: number;
  longitude: number;
}

export interface OperationalMemberReport {
  id: string;
  organization_id: string | null;
  assigned_team_id: string | null;
  type: string;
  description: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  priority: string | null;
  status: string | null;
  created_at: string | null;
  resolved_at?: string | null;
  updated_at?: string | null;
  coordinates: OperationalCoordinates | null;
}

export interface OperationalCluster {
  operationalId: string;
  clusterId: string | null;
  type: string | null;
  status: OperationalStatus;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinates: OperationalCoordinates | null;
  firstReportedAt: string | null;
  latestReportedAt: string | null;
  reportCount: number;
  distinctReporterCount: number;
  corroborated: boolean;
  acknowledged: boolean;
  priority: OperationalPriority | null;
  assignedTeams: { id: string }[];
  memberReports: OperationalMemberReport[];
}
