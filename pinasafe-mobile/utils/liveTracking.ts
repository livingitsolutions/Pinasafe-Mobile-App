export const PUBLISH_INTERVAL_MS = 7000;
export const STALE_AFTER_MS = 30000;
const MAX_FIX_AGE_MS = 60000;

export interface GeoFix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
}

export interface GeolocationSource {
  /** Must prompt the user; resolves false when denied or unsupported. */
  requestPermission(): Promise<boolean>;
  watch(onFix: (fix: GeoFix) => void, onError: (message: string) => void): Promise<() => void>;
}

export type PublishOutcome = 'ok' | 'ignored' | 'stop' | 'error';

export type LiveTrackingStopReason = 'user' | 'not_responding' | 'unauthorized' | 'disposed';

export type LiveTrackingState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'active'; lastPublishedAt: number | null; publishError: boolean }
  | { phase: 'unavailable'; message: string }
  | { phase: 'stopped'; reason: LiveTrackingStopReason };

export const LOCATION_UNAVAILABLE = 'Live location unavailable';

export function isValidFix(fix: GeoFix | null | undefined): fix is GeoFix {
  return Boolean(fix)
    && Number.isFinite(fix!.latitude) && fix!.latitude >= -90 && fix!.latitude <= 90
    && Number.isFinite(fix!.longitude) && fix!.longitude >= -180 && fix!.longitude <= 180
    && Number.isFinite(fix!.timestamp)
    && (fix!.accuracy === null || (Number.isFinite(fix!.accuracy) && fix!.accuracy >= 0));
}

/**
 * Publishes real device fixes only, at most once per interval, and never starts
 * without an explicit start() call.
 */
export class LiveTrackingController {
  private state: LiveTrackingState = { phase: 'idle' };
  private unwatch: (() => void) | null = null;
  private lastAttemptAt = -Infinity;
  private lastFixTimestamp = -Infinity;
  private inFlight = false;
  private session = 0;

  constructor(private readonly options: {
    source: GeolocationSource;
    publish: (fix: GeoFix) => Promise<PublishOutcome>;
    onChange: (state: LiveTrackingState) => void;
    now?: () => number;
    intervalMs?: number;
  }) {}

  getState(): LiveTrackingState { return this.state; }

  isWatching(): boolean { return this.unwatch !== null; }

  async start(): Promise<void> {
    if (this.state.phase === 'starting' || this.state.phase === 'active') return;
    const session = ++this.session;
    this.setState({ phase: 'starting' });

    let granted = false;
    try { granted = await this.options.source.requestPermission(); } catch { granted = false; }
    if (session !== this.session) return;
    if (!granted) {
      this.setState({ phase: 'unavailable', message: 'Location permission was denied or is not supported on this device.' });
      return;
    }

    try {
      const unwatch = await this.options.source.watch(
        fix => { if (session === this.session) void this.handleFix(fix); },
        message => { if (session === this.session) this.fail(message); }
      );
      if (session !== this.session) { unwatch(); return; }
      this.unwatch = unwatch;
      this.lastAttemptAt = -Infinity;
      this.setState({ phase: 'active', lastPublishedAt: null, publishError: false });
    } catch {
      if (session === this.session) this.fail('Location services are unavailable.');
    }
  }

  stop(reason: LiveTrackingStopReason = 'user'): void {
    const wasRunning = this.state.phase === 'starting' || this.state.phase === 'active';
    this.session++;
    this.clearWatch();
    if (wasRunning) this.setState({ phase: 'stopped', reason });
  }

  dispose(): void {
    this.session++;
    this.clearWatch();
  }

  private async handleFix(fix: GeoFix): Promise<void> {
    if (this.state.phase !== 'active' || !isValidFix(fix)) return;
    const now = this.now();
    if (fix.timestamp <= this.lastFixTimestamp || now - fix.timestamp > MAX_FIX_AGE_MS) return;
    if (this.inFlight || now - this.lastAttemptAt < (this.options.intervalMs ?? PUBLISH_INTERVAL_MS)) return;

    const session = this.session;
    this.inFlight = true;
    this.lastAttemptAt = now;
    let outcome: PublishOutcome;
    try { outcome = await this.options.publish(fix); } catch { outcome = 'error'; }
    this.inFlight = false;
    if (session !== this.session || this.state.phase !== 'active') return;

    if (outcome === 'stop') { this.stop('not_responding'); return; }
    if (outcome === 'ok') {
      this.lastFixTimestamp = fix.timestamp;
      this.setState({ phase: 'active', lastPublishedAt: this.now(), publishError: false });
    } else if (outcome === 'error') {
      this.setState({ ...this.state, publishError: true });
    }
  }

  private fail(message: string): void {
    this.session++;
    this.clearWatch();
    this.setState({ phase: 'unavailable', message });
  }

  private clearWatch(): void {
    const unwatch = this.unwatch;
    this.unwatch = null;
    this.inFlight = false;
    if (unwatch) { try { unwatch(); } catch { /* watcher already gone */ } }
  }

  private now(): number { return (this.options.now ?? Date.now)(); }

  private setState(next: LiveTrackingState): void {
    this.state = next;
    this.options.onChange(next);
  }
}

/** Maps a publish API failure to a controller outcome. 403/409 end the session. */
export function classifyPublishError(status: number | null, code?: string): PublishOutcome {
  if (status === 409 && code === 'out_of_order') return 'ignored';
  if (status === 403 || status === 404 || status === 409) return 'stop';
  return 'error';
}

export type LocationFreshness = 'fresh' | 'stale';

export function getLocationFreshness(capturedAt: string | null | undefined, now: number): LocationFreshness | null {
  const captured = capturedAt ? Date.parse(capturedAt) : NaN;
  if (!Number.isFinite(captured)) return null;
  return now - captured > STALE_AFTER_MS ? 'stale' : 'fresh';
}

export function formatLocationAge(capturedAt: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(capturedAt)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ago`;
}
