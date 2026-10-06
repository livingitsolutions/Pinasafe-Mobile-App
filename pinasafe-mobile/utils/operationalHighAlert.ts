import type { OperationalCluster } from '@/types/operationalCluster';

const AUDIO_PREFERENCE_KEY = 'pinasafe.highAlertAudioEnabled';

export type OperationalHighAlertAudioState =
  | 'enabled'
  | 'activation-required'
  | 'muted'
  | 'unavailable';

export interface OperationalHighAlertPresentation {
  corroborated: boolean;
  active: boolean;
  assigned: boolean;
  label: 'URGENT — CORROBORATED HIGH ALERT' | 'CORROBORATED INCIDENT' | 'CORROBORATED';
}

export function getOperationalHighAlertPresentation(
  cluster: Pick<OperationalCluster, 'corroborated' | 'status' | 'assignedTeams'>,
): OperationalHighAlertPresentation {
  const corroborated = cluster.corroborated === true;
  const assigned = cluster.assignedTeams.length > 0;
  const active = corroborated && cluster.status !== 'resolved' && !assigned;
  return {
    corroborated,
    active,
    assigned: corroborated && assigned,
    label: active
      ? 'URGENT — CORROBORATED HIGH ALERT'
      : corroborated && assigned && cluster.status !== 'resolved'
        ? 'CORROBORATED INCIDENT'
        : 'CORROBORATED',
  };
}

export function getActiveOperationalAlertIds(
  clusters: Pick<OperationalCluster, 'operationalId' | 'corroborated' | 'status' | 'assignedTeams'>[],
): string[] {
  return clusters
    .filter(cluster => getOperationalHighAlertPresentation(cluster).active)
    .map(cluster => cluster.operationalId);
}

export function isOperationalHighAlertAudioSupported(platform: string): boolean {
  return platform === 'web'
    && typeof window !== 'undefined'
    && typeof window.AudioContext !== 'undefined';
}

export function readOperationalHighAlertAudioPreference(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return true;
  return window.localStorage.getItem(AUDIO_PREFERENCE_KEY) !== 'false';
}

export function saveOperationalHighAlertAudioPreference(enabled: boolean): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Alert sound preference storage is unavailable.');
  }
  window.localStorage.setItem(AUDIO_PREFERENCE_KEY, String(enabled));
}

export class OperationalHighAlertAudioController {
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private activeOperationalIds = new Set<string>();
  private oscillators = new Set<OscillatorNode>();
  private preferenceEnabled = true;
  private unlocked = false;
  private activationRequired = false;
  private playbackAttempt = 0;
  private currentState: OperationalHighAlertAudioState = 'enabled';

  constructor(
    private readonly platform: string,
    private readonly onPlaybackUnavailable: () => void = () => {},
    private readonly onStateChange: (state: OperationalHighAlertAudioState) => void = () => {},
  ) {}

  get state(): OperationalHighAlertAudioState {
    return this.currentState;
  }

  setEnabled(enabled: boolean, attemptPlayback = true): void {
    this.playbackAttempt += 1;
    this.preferenceEnabled = enabled;
    this.activationRequired = false;
    if (!enabled) {
      this.unlocked = false;
      this.stopRepeating();
      this.stopCurrentTones();
      this.reportState('muted');
      return;
    }

    if (attemptPlayback && this.activeOperationalIds.size > 0) {
      this.tryAutomaticPlayback();
    } else {
      this.reportState('enabled');
    }
  }

  async activate(): Promise<void> {
    if (!isOperationalHighAlertAudioSupported(this.platform)) {
      this.reportUnavailable();
      throw new Error('Operational alert sound is unsupported on this platform.');
    }
    if (!this.preferenceEnabled) {
      throw new Error('Alert sound is muted.');
    }

    this.activationRequired = false;
    const playbackAttempt = ++this.playbackAttempt;
    try {
      const context = this.getContext();
      await context.resume();
      if (playbackAttempt !== this.playbackAttempt) return;
      if (context.state !== 'running') {
        this.requireActivation();
        throw new Error('Alert sound requires browser activation.');
      }
      this.unlocked = true;
      if (this.activeOperationalIds.size > 0) this.playTone();
      this.syncTimer();
      this.reportState('enabled');
    } catch (error) {
      if (playbackAttempt !== this.playbackAttempt) return;
      if (this.context && this.context.state !== 'running') {
        this.requireActivation();
      } else {
        this.reportUnavailable();
      }
      throw error;
    }
  }

  async enable(): Promise<void> {
    this.setEnabled(true);
    await this.activate();
  }

  syncOperationalAlerts(operationalIds: string[]): void {
    const wasActive = this.activeOperationalIds.size > 0;
    this.activeOperationalIds = new Set(operationalIds);
    const isActive = this.activeOperationalIds.size > 0;

    if (!isActive) {
      this.playbackAttempt += 1;
      this.activationRequired = false;
      this.stopRepeating();
      this.stopCurrentTones();
      if (this.preferenceEnabled) this.reportState('enabled');
      return;
    }
    if (!this.preferenceEnabled) return;

    if (this.unlocked && this.context?.state === 'running') {
      if (!wasActive) this.playToneSafely();
      this.syncTimer();
    } else if (!this.activationRequired) {
      this.tryAutomaticPlayback();
    }
  }

  dispose(): void {
    this.playbackAttempt += 1;
    this.stopRepeating();
    this.stopCurrentTones();
    this.activeOperationalIds.clear();
    this.unlocked = false;
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') void context.close();
  }

  private getContext(): AudioContext {
    if (!this.context) this.context = new window.AudioContext();
    return this.context;
  }

  private tryAutomaticPlayback(): void {
    if (!isOperationalHighAlertAudioSupported(this.platform)) {
      this.reportUnavailable();
      return;
    }

    try {
      const playbackAttempt = ++this.playbackAttempt;
      const context = this.getContext();
      const resume = context.resume();
      if (context.state !== 'running') {
        this.requireActivation();
        void resume.then(() => {
          if (playbackAttempt === this.playbackAttempt
            && context.state === 'running'
            && this.preferenceEnabled
            && this.activeOperationalIds.size > 0) {
            this.onContextUnlocked();
          }
        }).catch(() => {
          if (playbackAttempt === this.playbackAttempt) this.requireActivation();
        });
        return;
      }
      void resume.then(() => {
        if (playbackAttempt !== this.playbackAttempt) return;
        if (context.state !== 'running' || !this.preferenceEnabled || this.activeOperationalIds.size === 0) {
          if (context.state !== 'running') this.requireActivation();
          return;
        }
        this.onContextUnlocked();
      }).catch(() => {
        if (playbackAttempt === this.playbackAttempt) this.requireActivation();
      });
    } catch {
      if (this.context && this.context.state !== 'running') {
        this.requireActivation();
      } else {
        this.reportUnavailable();
      }
    }
  }

  private onContextUnlocked(): void {
    this.unlocked = true;
    this.activationRequired = false;
    this.playToneSafely();
    this.syncTimer();
    this.reportState('enabled');
  }

  private requireActivation(): void {
    this.unlocked = false;
    this.activationRequired = true;
    this.stopRepeating();
    this.reportState('activation-required');
  }

  private reportUnavailable(): void {
    this.unlocked = false;
    this.stopRepeating();
    this.onPlaybackUnavailable();
    this.reportState('unavailable');
  }

  private reportState(state: OperationalHighAlertAudioState): void {
    this.currentState = state;
    this.onStateChange(state);
  }

  private syncTimer(): void {
    const shouldRepeat = this.preferenceEnabled
      && this.unlocked
      && this.context?.state === 'running'
      && this.activeOperationalIds.size > 0;
    if (shouldRepeat && !this.timer) {
      this.timer = setInterval(() => this.playToneSafely(), 1500);
    } else if (!shouldRepeat) {
      this.stopRepeating();
    }
  }

  private stopRepeating(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private stopCurrentTones(): void {
    for (const oscillator of this.oscillators) {
      try {
        oscillator.stop();
      } catch {
        // An oscillator may have stopped naturally before the authoritative assignment poll.
      }
    }
    this.oscillators.clear();
  }

  private playToneSafely(): void {
    try {
      this.playTone();
    } catch {
      if (this.context && this.context.state !== 'running') {
        this.requireActivation();
      } else {
        this.reportUnavailable();
      }
    }
  }

  private playTone(): void {
    if (!this.preferenceEnabled || this.activeOperationalIds.size === 0) return;
    if (!this.context || this.context.state !== 'running') {
      throw new Error('Alert audio context is not running.');
    }

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const start = this.context.currentTime;
    this.oscillators.add(oscillator);
    oscillator.onended = () => this.oscillators.delete(oscillator);
    oscillator.frequency.setValueAtTime(880, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.25);
  }
}
