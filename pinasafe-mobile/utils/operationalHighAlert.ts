import type { OperationalCluster } from '@/types/operationalCluster';
import { DEFAULT_ALERT_TONE_ID, findAlertTone, getAlertToneLengthSec, resolveAlertTone, scheduleAlertTone, type AlertTone } from '@/utils/alertTones';

const AUDIO_PREFERENCE_KEY = 'pinasafe.highAlertAudioEnabled';
const TONE_PREFERENCE_PREFIX = 'pinasafe.highAlertTone.admin.';

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

function tonePreferenceKey(userId: string | null | undefined): string {
  return `${TONE_PREFERENCE_PREFIX}${userId || 'device'}`;
}

export function readOperationalHighAlertTone(userId: string | null | undefined): string {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_ALERT_TONE_ID;
  const stored = window.localStorage.getItem(tonePreferenceKey(userId));
  return findAlertTone(stored, 'command-center')?.id ?? DEFAULT_ALERT_TONE_ID;
}

export function saveOperationalHighAlertTone(userId: string | null | undefined, toneId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Alert tone preference storage is unavailable.');
  }
  window.localStorage.setItem(tonePreferenceKey(userId), resolveAlertTone(toneId, 'command-center').id);
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
  private tone: AlertTone = resolveAlertTone(DEFAULT_ALERT_TONE_ID);

  constructor(
    private readonly platform: string,
    private readonly onPlaybackUnavailable: () => void = () => {},
    private readonly onStateChange: (state: OperationalHighAlertAudioState) => void = () => {},
  ) {}

  get state(): OperationalHighAlertAudioState {
    return this.currentState;
  }

  get toneId(): string {
    return this.tone.id;
  }

  setTone(toneId: string): string {
    const next = resolveAlertTone(toneId);
    if (next.id === this.tone.id) return next.id;
    this.tone = next;
    if (this.timer) {
      this.stopRepeating();
      this.syncTimer();
    }
    return next.id;
  }

  async testAlert(cycles = 3): Promise<void> {
    if (!isOperationalHighAlertAudioSupported(this.platform)) {
      this.reportUnavailable();
      throw new Error('Operational alert sound is unsupported on this platform.');
    }
    if (!this.preferenceEnabled) throw new Error('Alert sound is muted.');
    const context = this.getContext();
    await context.resume();
    if (context.state !== 'running' || !this.preferenceEnabled) {
      if (this.activeOperationalIds.size > 0) this.requireActivation();
      throw new Error('Alert sound requires browser activation.');
    }
    // With a live High Alert the repeating alarm is the test; scheduling extra cycles would overlap it.
    if (this.activeOperationalIds.size > 0) {
      if (!this.unlocked || !this.timer) this.onContextUnlocked();
      return;
    }
    this.unlocked = true;
    this.activationRequired = false;
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      scheduleAlertTone(context, this.tone, oscillator => this.trackOscillator(oscillator), (cycle * this.tone.repeatMs) / 1000);
    }
  }

  stopTest(): void {
    if (this.activeOperationalIds.size === 0) this.stopCurrentTones();
  }

  testDurationMs(cycles = 3): number {
    return ((cycles - 1) * this.tone.repeatMs) + (getAlertToneLengthSec(this.tone) * 1000);
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
      this.timer = setInterval(() => this.playToneSafely(), this.tone.repeatMs);
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

    scheduleAlertTone(this.context, this.tone, oscillator => this.trackOscillator(oscillator));
  }

  private trackOscillator(oscillator: OscillatorNode): void {
    this.oscillators.add(oscillator);
    oscillator.onended = () => this.oscillators.delete(oscillator);
  }
}
