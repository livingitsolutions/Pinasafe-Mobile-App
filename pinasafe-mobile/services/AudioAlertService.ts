export interface AlertSound {
  type: 'emergency' | 'urgent' | 'normal' | 'acknowledgment';
  duration: number;
  pattern: 'continuous' | 'beep' | 'pulse' | 'siren';
  volume: number;
}

class AudioAlertService {
  private audioContext: AudioContext | null = null;
  private isPlaying = false;
  private currentAlert: any = null;
  private isInitialized = false;
  private continuousAlertInterval: any = null;
  private activeReportIds: Set<string> = new Set();

  constructor() {
    // Don't initialize immediately - wait for user interaction
  }

  private initializeAudioContext() {
    if (this.isInitialized) return;

    try {
      // Check if we're in a web environment and AudioContext is available
      if (typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.isInitialized = true;
      }
    } catch (error) {
      // Silently fail - audio not available in this environment
    }

    // Mark as initialized even if audio is not available to prevent repeated attempts
    this.isInitialized = true;
  }

  // Generate beep sound using Web Audio API
  private generateBeep(frequency: number = 800, duration: number = 200, volume: number = 0.3): Promise<void> {
    return new Promise((resolve) => {
      // Initialize audio context on first use
      if (!this.isInitialized) {
        this.initializeAudioContext();
      }
      
      if (!this.audioContext) {
        // Fallback: just resolve without playing sound
        resolve();
        return;
      }

      // Resume audio context if suspended (required by browsers)
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration / 1000);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration / 1000);

      setTimeout(() => resolve(), duration);
    });
  }

  // Play emergency alert pattern
  async playEmergencyAlert(alertType: 'critical' | 'high' | 'medium' | 'low' = 'high'): Promise<void> {
    if (this.isPlaying) {
      this.stopAlert();
    }

    this.isPlaying = true;

    const patterns = {
      critical: {
        beeps: 5,
        frequency: 1000,
        duration: 300,
        interval: 200,
        volume: 0.5,
        repeat: 3,
        repeatInterval: 1000,
      },
      high: {
        beeps: 3,
        frequency: 800,
        duration: 250,
        interval: 250,
        volume: 0.4,
        repeat: 2,
        repeatInterval: 1500,
      },
      medium: {
        beeps: 2,
        frequency: 600,
        duration: 200,
        interval: 300,
        volume: 0.3,
        repeat: 1,
        repeatInterval: 0,
      },
      low: {
        beeps: 1,
        frequency: 500,
        duration: 150,
        interval: 0,
        volume: 0.2,
        repeat: 1,
        repeatInterval: 0,
      },
    };

    const pattern = patterns[alertType];

    try {
      for (let repeat = 0; repeat < pattern.repeat && this.isPlaying; repeat++) {
        for (let i = 0; i < pattern.beeps && this.isPlaying; i++) {
          await this.generateBeep(pattern.frequency, pattern.duration, pattern.volume);
          
          if (i < pattern.beeps - 1 && this.isPlaying) {
            await this.delay(pattern.interval);
          }
        }

        if (repeat < pattern.repeat - 1 && pattern.repeatInterval > 0 && this.isPlaying) {
          await this.delay(pattern.repeatInterval);
        }
      }
    } catch (error) {
      console.error('Error playing emergency alert:', error);
    } finally {
      this.isPlaying = false;
    }
  }

  // Play incident type specific alert
  async playIncidentAlert(incidentType: string, priority: string = 'high'): Promise<void> {
    const alertPriority = priority as 'critical' | 'high' | 'medium' | 'low';

    console.log(`🔊 AUDIO ALERT: ${incidentType.toUpperCase()} - ${priority.toUpperCase()} PRIORITY`);

    // Play the beeping pattern
    await this.playEmergencyAlert(alertPriority);
  }

  // Start continuous alert for pending incidents
  startContinuousAlert(reportId: string, incidentType: string, priority: string = 'high'): void {
    if (this.activeReportIds.has(reportId)) {
      return;
    }

    this.activeReportIds.add(reportId);
    console.log(`🔊 STARTING CONTINUOUS ALERT for report ${reportId}`);

    if (!this.continuousAlertInterval && this.activeReportIds.size > 0) {
      this.playContinuousAlertLoop(incidentType, priority);
    }
  }

  // Play continuous loop
  private async playContinuousAlertLoop(incidentType: string, priority: string): Promise<void> {
    if (this.activeReportIds.size === 0) {
      this.stopContinuousAlert();
      return;
    }

    const alertPriority = priority as 'critical' | 'high' | 'medium' | 'low';
    await this.playEmergencyAlert(alertPriority);

    this.continuousAlertInterval = setTimeout(() => {
      this.playContinuousAlertLoop(incidentType, priority);
    }, 3000);
  }

  // Stop continuous alert for a specific report
  stopContinuousAlertForReport(reportId: string): void {
    if (this.activeReportIds.has(reportId)) {
      this.activeReportIds.delete(reportId);
      console.log(`🔇 STOPPED CONTINUOUS ALERT for report ${reportId}`);

      if (this.activeReportIds.size === 0) {
        this.stopContinuousAlert();
      }
    }
  }

  // Stop all continuous alerts
  stopContinuousAlert(): void {
    console.log(`🔇 STOPPING ALL CONTINUOUS ALERTS`);
    if (this.continuousAlertInterval) {
      clearTimeout(this.continuousAlertInterval);
      this.continuousAlertInterval = null;
    }
    this.activeReportIds.clear();
    this.stopAlert();
  }

  // Get active alert count
  getActiveAlertCount(): number {
    return this.activeReportIds.size;
  }

  // Play acknowledgment sound
  async playAcknowledgment(): Promise<void> {
    try {
      await this.generateBeep(400, 100, 0.2);
      await this.delay(50);
      await this.generateBeep(600, 100, 0.2);
    } catch (error) {
      console.error('Error playing acknowledgment sound:', error);
    }
  }

  // Stop current alert
  stopAlert(): void {
    this.isPlaying = false;
    if (this.currentAlert) {
      clearTimeout(this.currentAlert);
      this.currentAlert = null;
    }
  }

  // Utility delay function
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Check if audio is supported
  isAudioSupported(): boolean {
    return !!this.audioContext;
  }

  // Get current playing status
  isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }

  // Play test beep
  async playTestBeep(): Promise<void> {
    console.log('🔊 Playing test beep...');
    await this.generateBeep(800, 200, 0.3);
  }
}

export const audioAlertService = new AudioAlertService();