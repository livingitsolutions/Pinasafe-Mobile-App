import { Audio } from 'expo-av';
import type { IncidentAlert } from './alertAudio.types';

export type { IncidentAlert } from './alertAudio.types';

class ReactNativeAudioAlertService {
  private sound: Audio.Sound | null = null;
  private isPlaying = false;
  private activeAlerts: Map<string, IncidentAlert> = new Map();
  private alertInterval: ReturnType<typeof setTimeout> | null = null;
  private isInitialized = false;
  private listeners: Set<(alerts: IncidentAlert[]) => void> = new Set();

  constructor() {
    this.initializeAudio();
  }

  private async initializeAudio() {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        allowsRecordingIOS: false,
        interruptionModeIOS: 2,
        interruptionModeAndroid: 1,
      });
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize audio:', error);
    }
  }

  private notifyListeners() {
    const alerts = Array.from(this.activeAlerts.values());
    this.listeners.forEach(listener => listener(alerts));
  }

  addListener(listener: (alerts: IncidentAlert[]) => void) {
    this.listeners.add(listener);
    this.notifyListeners();
  }

  removeListener(listener: (alerts: IncidentAlert[]) => void) {
    this.listeners.delete(listener);
  }

  getActiveAlerts(): IncidentAlert[] {
    return Array.from(this.activeAlerts.values());
  }

  private async playAlertSound(priority: string = 'high') {
    if (!this.isInitialized || this.isPlaying) return;

    try {
      this.isPlaying = true;

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        allowsRecordingIOS: false,
        interruptionModeIOS: 2,
        interruptionModeAndroid: 1,
      });

      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/emergency-beep.mp3'),
        {
          shouldPlay: true,
          volume: 1.0,
          isMuted: false,
          isLooping: false,
        }
      );

      this.sound = sound;

      await sound.setVolumeAsync(1.0);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          this.isPlaying = false;
          sound.unloadAsync();
        }
      });

      await sound.playAsync();
    } catch (error) {
      console.error('Error playing alert sound:', error);
      this.isPlaying = false;
    }
  }

  startContinuousAlert(
    reportId: string,
    incidentType: string,
    priority: string,
    location: string = 'Unknown',
    description?: string,
    status?: string,
    assignedTeamId?: string
  ) {
    if (this.activeAlerts.has(reportId)) {
      return;
    }

    const alert: IncidentAlert = {
      reportId,
      incidentType,
      location,
      priority,
      timestamp: new Date(),
      description,
      status,
      assignedTeamId,
    };

    this.activeAlerts.set(reportId, alert);
    console.log(`🔊 STARTING ALERT for ${incidentType} at ${location} (Priority: ${priority}, Status: ${status})`);

    this.notifyListeners();

    if (!this.alertInterval && this.activeAlerts.size > 0) {
      this.playAlertLoop();
    }
  }

  private async playAlertLoop() {
    if (this.activeAlerts.size === 0) {
      this.stopContinuousAlerts();
      return;
    }

    await this.playAlertSound();

    this.alertInterval = setTimeout(() => {
      this.playAlertLoop();
    }, 5000);
  }

  stopContinuousAlertForReport(reportId: string) {
    if (this.activeAlerts.has(reportId)) {
      const alert = this.activeAlerts.get(reportId);
      this.activeAlerts.delete(reportId);
      console.log(`🔇 STOPPED ALERT for ${alert?.incidentType}`);

      this.notifyListeners();

      if (this.activeAlerts.size === 0) {
        this.stopContinuousAlerts();
      }
    }
  }

  stopContinuousAlerts() {
    console.log('🔇 STOPPING ALL ALERTS');
    if (this.alertInterval) {
      clearTimeout(this.alertInterval);
      this.alertInterval = null;
    }

    if (this.sound) {
      this.sound.unloadAsync();
      this.sound = null;
    }

    this.activeAlerts.clear();
    this.isPlaying = false;
    this.notifyListeners();
  }

  async playAcknowledgment() {
    if (!this.isInitialized) return;

    try {
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/emergency-beep.mp3'),
        {
          shouldPlay: true,
          volume: 1.0,
          isMuted: false,
        }
      );

      await sound.setVolumeAsync(1.0);
      await sound.playAsync();

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch (error) {
      console.error('Error playing acknowledgment sound:', error);
    }
  }

  async playIncidentAlert(incidentType: string, priority: string = 'high') {
    console.log(`🔊 AUDIO ALERT: ${incidentType.toUpperCase()} - ${priority.toUpperCase()} PRIORITY`);
    await this.playAlertSound(priority);
  }

  getActiveAlertCount(): number {
    return this.activeAlerts.size;
  }

  isAudioSupported(): boolean {
    return this.isInitialized;
  }
}

export const reactNativeAudioAlertService = new ReactNativeAudioAlertService();
