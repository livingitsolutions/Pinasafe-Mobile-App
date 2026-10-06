export type AlertToneAudience = 'command-center' | 'responder';

export interface AlertToneNote {
  frequency: number;
  startSec: number;
  durationSec: number;
  peakGain: number;
  wave: OscillatorType;
}

export interface AlertTone {
  id: string;
  name: string;
  description: string;
  repeatMs: number;
  audiences: readonly AlertToneAudience[];
  notes: readonly AlertToneNote[];
}

const note = (frequency: number, startSec: number, durationSec: number, peakGain = 0.16, wave: OscillatorType = 'sine'): AlertToneNote => ({
  frequency, startSec, durationSec, peakGain, wave,
});

// All tones are synthesized in the browser from these note lists; no recorded or third-party audio is used.
export const ALERT_TONES: readonly AlertTone[] = [
  {
    id: 'pinasafe-standard',
    name: 'PinaSafe Standard',
    description: 'Single clear beep. The original PinaSafe alert.',
    repeatMs: 1500,
    audiences: ['command-center', 'responder'],
    notes: [note(880, 0, 0.25)],
  },
  {
    id: 'double-pulse',
    name: 'Double Pulse',
    description: 'Two quick beeps, easy to notice in a busy room.',
    repeatMs: 1500,
    audiences: ['command-center'],
    notes: [note(988, 0, 0.12), note(988, 0.2, 0.12)],
  },
  {
    id: 'rising-chime',
    name: 'Rising Chime',
    description: 'Three ascending notes with a softer character.',
    repeatMs: 1800,
    audiences: ['command-center'],
    notes: [note(659, 0, 0.16, 0.14, 'triangle'), note(880, 0.18, 0.16, 0.14, 'triangle'), note(1109, 0.36, 0.24, 0.14, 'triangle')],
  },
  {
    id: 'command-bell',
    name: 'Command Bell',
    description: 'Warm two-note bell with a longer ring.',
    repeatMs: 2000,
    audiences: ['command-center'],
    notes: [note(784, 0, 0.6, 0.14, 'triangle'), note(1175, 0, 0.45, 0.06, 'sine')],
  },
  {
    id: 'triple-tick',
    name: 'Triple Tick',
    description: 'Three short, crisp ticks with a steady rhythm.',
    repeatMs: 1600,
    audiences: ['command-center'],
    notes: [note(1047, 0, 0.08, 0.12, 'square'), note(1047, 0.16, 0.08, 0.12, 'square'), note(1047, 0.32, 0.08, 0.12, 'square')],
  },
];

export const DEFAULT_ALERT_TONE_ID = 'pinasafe-standard';

export function getAlertTonesFor(audience: AlertToneAudience): AlertTone[] {
  return ALERT_TONES.filter(tone => tone.audiences.includes(audience));
}

export function findAlertTone(id: unknown, audience?: AlertToneAudience): AlertTone | null {
  if (typeof id !== 'string') return null;
  const tone = ALERT_TONES.find(candidate => candidate.id === id);
  if (!tone || (audience && !tone.audiences.includes(audience))) return null;
  return tone;
}

export function resolveAlertTone(id: unknown, audience?: AlertToneAudience): AlertTone {
  return findAlertTone(id, audience) ?? ALERT_TONES.find(tone => tone.id === DEFAULT_ALERT_TONE_ID)!;
}

export function getAlertToneLengthSec(tone: AlertTone): number {
  return Math.max(...tone.notes.map(item => item.startSec + item.durationSec));
}

export function scheduleAlertTone(
  context: AudioContext,
  tone: AlertTone,
  track: (oscillator: OscillatorNode) => void,
  offsetSec = 0,
): void {
  const base = context.currentTime + offsetSec;
  for (const item of tone.notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = base + item.startSec;
    const attack = Math.min(0.025, item.durationSec / 4);
    track(oscillator);
    if (item.wave !== 'sine') oscillator.type = item.wave;
    oscillator.frequency.setValueAtTime(item.frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(item.peakGain, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + item.durationSec - 0.01);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + item.durationSec);
  }
}

export type AlertTonePreviewResult = 'playing' | 'unavailable';

// Plays a short sample of a tone on its own audio context so previews never touch a live alarm.
export class AlertTonePreviewPlayer {
  private context: AudioContext | null = null;
  private oscillators = new Set<OscillatorNode>();
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;

  constructor(private readonly onEnded: () => void = () => {}) {}

  static isSupported(): boolean {
    return typeof window !== 'undefined' && typeof window.AudioContext !== 'undefined';
  }

  async play(toneId: string, cycles = 2, audience: AlertToneAudience = 'command-center'): Promise<AlertTonePreviewResult> {
    this.stop();
    const tone = findAlertTone(toneId, audience);
    if (!tone || !AlertTonePreviewPlayer.isSupported()) return 'unavailable';
    const attempt = ++this.attempt;
    try {
      if (!this.context || this.context.state === 'closed') this.context = new window.AudioContext();
      const context = this.context;
      await context.resume();
      if (attempt !== this.attempt) return 'unavailable';
      if (context.state !== 'running') return 'unavailable';
      for (let cycle = 0; cycle < cycles; cycle += 1) {
        scheduleAlertTone(context, tone, oscillator => this.track(oscillator), (cycle * tone.repeatMs) / 1000);
      }
      const totalMs = ((cycles - 1) * tone.repeatMs) + (getAlertToneLengthSec(tone) * 1000) + 50;
      this.endTimer = setTimeout(() => {
        this.endTimer = null;
        if (attempt === this.attempt) this.onEnded();
      }, totalMs);
      return 'playing';
    } catch {
      this.stop();
      return 'unavailable';
    }
  }

  stop(): void {
    this.attempt += 1;
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = null;
    for (const oscillator of this.oscillators) {
      try {
        oscillator.stop();
      } catch {
        // Already stopped on its own.
      }
    }
    this.oscillators.clear();
  }

  dispose(): void {
    this.stop();
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') void context.close();
  }

  private track(oscillator: OscillatorNode): void {
    this.oscillators.add(oscillator);
    oscillator.onended = () => this.oscillators.delete(oscillator);
  }
}
