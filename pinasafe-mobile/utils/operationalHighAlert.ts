import type { OperationalCluster } from '@/types/operationalCluster';

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

export class OperationalHighAlertAudioController {
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private activeOperationalIds = new Set<string>();
  private enabled = false;

  constructor(
    private readonly platform: string,
    private readonly onPlaybackUnavailable: () => void = () => {},
  ) {}

  async enable(): Promise<void> {
    if (!isOperationalHighAlertAudioSupported(this.platform)) {
      throw new Error('Operational alert sound is unsupported on this platform.');
    }

    const context = this.context ?? new window.AudioContext();
    this.context = context;
    await context.resume();
    if (context.state !== 'running') {
      throw new Error('Alert sound could not be enabled.');
    }

    this.playTone();
    this.enabled = true;
    this.syncTimer();
  }

  syncOperationalAlerts(operationalIds: string[]): void {
    const wasActive = this.activeOperationalIds.size > 0;
    this.activeOperationalIds = new Set(operationalIds);
    const isActive = this.activeOperationalIds.size > 0;

    if (this.enabled && isActive && !wasActive) {
      this.playToneSafely();
    }
    this.syncTimer();
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.enabled = false;
    this.activeOperationalIds.clear();
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') void context.close();
  }

  private syncTimer(): void {
    const shouldRepeat = this.enabled && this.activeOperationalIds.size > 0;
    if (shouldRepeat && !this.timer) {
      this.timer = setInterval(() => this.playToneSafely(), 1500);
    } else if (!shouldRepeat && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private playToneSafely(): void {
    try {
      this.playTone();
    } catch {
      this.enabled = false;
      this.syncTimer();
      this.onPlaybackUnavailable();
    }
  }

  private playTone(): void {
    if (!this.context || this.context.state !== 'running') {
      throw new Error('Alert audio context is not running.');
    }

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const start = this.context.currentTime;
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
