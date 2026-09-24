import { audioAlertService } from './AudioAlertService';
import type { IncidentAlert, IncidentAlertListener } from './alertAudio.types';

class WebAlertAudioService {
  private activeAlerts = new Map<string, IncidentAlert>();
  private listeners = new Set<IncidentAlertListener>();

  private notifyListeners() {
    const alerts = this.getActiveAlerts();
    this.listeners.forEach((listener) => listener(alerts));
  }

  addListener(listener: IncidentAlertListener) {
    this.listeners.add(listener);
    this.notifyListeners();
  }

  removeListener(listener: IncidentAlertListener) {
    this.listeners.delete(listener);
  }

  getActiveAlerts(): IncidentAlert[] {
    return Array.from(this.activeAlerts.values());
  }

  startContinuousAlert(
    reportId: string,
    incidentType: string,
    priority: string,
    location: string = 'Unknown',
    description?: string,
    status?: string,
    assignedTeamId?: string,
  ) {
    if (this.activeAlerts.has(reportId)) return;

    this.activeAlerts.set(reportId, {
      reportId,
      incidentType,
      priority,
      location,
      description,
      status,
      assignedTeamId,
      timestamp: new Date(),
    });
    this.notifyListeners();

    // Web Audio can be blocked until a user gesture. The shared web service
    // resolves without throwing when an AudioContext cannot be started.
    void audioAlertService.playIncidentAlert(incidentType, priority);
  }

  stopContinuousAlertForReport(reportId: string) {
    if (!this.activeAlerts.delete(reportId)) return;
    audioAlertService.stopContinuousAlertForReport(reportId);
    this.notifyListeners();
  }

  stopContinuousAlerts() {
    this.activeAlerts.clear();
    audioAlertService.stopContinuousAlert();
    this.notifyListeners();
  }

  async playAcknowledgment() {
    await audioAlertService.playAcknowledgment();
  }

  async playIncidentAlert(incidentType: string, priority: string = 'high') {
    await audioAlertService.playIncidentAlert(incidentType, priority);
  }

  getActiveAlertCount(): number {
    return this.activeAlerts.size;
  }

  isAudioSupported(): boolean {
    return audioAlertService.isAudioSupported();
  }
}

export type { IncidentAlert } from './alertAudio.types';
export const reactNativeAudioAlertService = new WebAlertAudioService();
