import type { OperationalCluster } from '../types/operationalCluster';
import {
  getActiveOperationalAlertIds,
  getOperationalHighAlertPresentation,
  isOperationalHighAlertAudioSupported,
  OperationalHighAlertAudioController,
} from '../utils/operationalHighAlert';

const cluster = (overrides: Partial<OperationalCluster> = {}): OperationalCluster => ({
  operationalId: 'op-1',
  clusterId: 'cluster-1',
  type: 'fire',
  status: 'pending',
  location: null,
  latitude: null,
  longitude: null,
  coordinates: null,
  firstReportedAt: null,
  latestReportedAt: null,
  reportCount: 2,
  distinctReporterCount: 2,
  corroborated: true,
  acknowledged: false,
  priority: 'high',
  assignedTeams: [],
  memberReports: [],
  ...overrides,
});

describe('operational corroborated High Alert state', () => {
  test('high priority alone does not display a corroborated alert', () => {
    expect(getOperationalHighAlertPresentation(cluster({
      reportCount: 1,
      distinctReporterCount: 1,
      corroborated: false,
      priority: 'high',
    }))).toMatchObject({ corroborated: false, active: false });
  });

  test('two reports from the same reporter do not display a corroborated alert', () => {
    expect(getOperationalHighAlertPresentation(cluster({
      reportCount: 2,
      distinctReporterCount: 1,
      corroborated: false,
    })).corroborated).toBe(false);
  });

  test('two reports from distinct reporters display the backend corroborated alert', () => {
    expect(getOperationalHighAlertPresentation(cluster({
      reportCount: 2,
      distinctReporterCount: 2,
      corroborated: true,
    }))).toEqual({
      corroborated: true,
      active: true,
      acknowledged: false,
      label: 'CORROBORATED HIGH ALERT',
    });
  });

  test('acknowledgement keeps the alert visibly corroborated but inactive', () => {
    expect(getOperationalHighAlertPresentation(cluster({ acknowledged: true }))).toEqual({
      corroborated: true,
      active: false,
      acknowledged: true,
      label: 'CORROBORATED HIGH ALERT',
    });
  });

  test('resolved incidents are not active and operational incidents are tracked independently', () => {
    expect(getActiveOperationalAlertIds([
      cluster(),
      cluster({ operationalId: 'op-2', acknowledged: true }),
      cluster({ operationalId: 'op-3', status: 'resolved' }),
      cluster({ operationalId: 'op-4', corroborated: false }),
    ])).toEqual(['op-1']);
  });
});

describe('operational High Alert audio controller', () => {
  let context: AudioContext;
  let oscillator: OscillatorNode;
  let createAudioContext: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    oscillator = {
      frequency: { setValueAtTime: jest.fn() },
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    } as unknown as OscillatorNode;
    const gain = {
      gain: {
        setValueAtTime: jest.fn(),
        exponentialRampToValueAtTime: jest.fn(),
      },
      connect: jest.fn(),
    } as unknown as GainNode;
    context = {
      state: 'running',
      currentTime: 0,
      destination: {},
      resume: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      createOscillator: jest.fn(() => oscillator),
      createGain: jest.fn(() => gain),
    } as unknown as AudioContext;
    createAudioContext = jest.fn(() => context);
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { AudioContext: createAudioContext },
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    Reflect.deleteProperty(globalThis, 'window');
  });

  test('sound starts only after explicit enable and repeated polls do not restart the loop', async () => {
    expect(isOperationalHighAlertAudioSupported('web')).toBe(true);
    const controller = new OperationalHighAlertAudioController('web');
    controller.syncOperationalAlerts(['op-1']);
    expect(createAudioContext).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);

    await controller.enable();
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.createOscillator).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);

    controller.syncOperationalAlerts(['op-1']);
    controller.syncOperationalAlerts(['op-1']);
    controller.syncOperationalAlerts(['op-1', 'op-2']);
    expect(jest.getTimerCount()).toBe(1);
    expect(context.createOscillator).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1500);
    expect(context.createOscillator).toHaveBeenCalledTimes(2);
    controller.syncOperationalAlerts([]);
    expect(jest.getTimerCount()).toBe(0);
    controller.dispose();
  });

  test('playback failure reports sound unavailability without changing visual alert state', async () => {
    const unavailable = jest.fn();
    const controller = new OperationalHighAlertAudioController('web', unavailable);
    controller.syncOperationalAlerts(['op-1']);
    await controller.enable();
    context.createOscillator = jest.fn(() => {
      throw new Error('playback failed');
    });

    jest.advanceTimersByTime(1500);
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(getOperationalHighAlertPresentation(cluster())).toMatchObject({
      corroborated: true,
      active: true,
    });
    expect(jest.getTimerCount()).toBe(0);
    controller.dispose();
  });

  test('native platforms do not construct browser audio and cannot become audio-enabled', async () => {
    const controller = new OperationalHighAlertAudioController('android', jest.fn());
    controller.syncOperationalAlerts(['op-1']);

    expect(isOperationalHighAlertAudioSupported('android')).toBe(false);
    await expect(controller.enable()).rejects.toThrow('unsupported on this platform');
    expect(createAudioContext).not.toHaveBeenCalled();
    expect(context.resume).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    expect(getOperationalHighAlertPresentation(cluster())).toMatchObject({
      corroborated: true,
      active: true,
    });
    controller.dispose();
  });

  test('web without AudioContext is safely unsupported', () => {
    Reflect.deleteProperty(window, 'AudioContext');
    expect(isOperationalHighAlertAudioSupported('web')).toBe(false);
  });
});
