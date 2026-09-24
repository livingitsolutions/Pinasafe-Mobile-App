export interface IncidentAlert {
  reportId: string;
  incidentType: string;
  location: string;
  priority: string;
  timestamp: Date;
  description?: string;
  status?: string;
  assignedTeamId?: string;
}

export type IncidentAlertListener = (alerts: IncidentAlert[]) => void;
