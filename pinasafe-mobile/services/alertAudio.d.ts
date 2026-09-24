import type { IncidentAlert, IncidentAlertListener } from './alertAudio.types';

export interface AlertAudioService {
  addListener(listener: IncidentAlertListener): void;
  removeListener(listener: IncidentAlertListener): void;
  getActiveAlerts(): IncidentAlert[];
  startContinuousAlert(
    reportId: string,
    incidentType: string,
    priority: string,
    location?: string,
    description?: string,
    status?: string,
    assignedTeamId?: string,
  ): void;
  stopContinuousAlertForReport(reportId: string): void;
  stopContinuousAlerts(): void;
  playAcknowledgment(): Promise<void>;
  playIncidentAlert(incidentType: string, priority?: string): Promise<void>;
  getActiveAlertCount(): number;
  isAudioSupported(): boolean;
}

export type { IncidentAlert } from './alertAudio.types';
export const reactNativeAudioAlertService: AlertAudioService;
