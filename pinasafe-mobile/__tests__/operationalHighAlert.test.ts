import type { OperationalCluster } from '../types/operationalCluster';
import {
  getActiveOperationalAlertIds,
  getOperationalHighAlertPresentation,
  isOperationalHighAlertAudioSupported,
  OperationalHighAlertAudioController,
  readOperationalHighAlertAudioPreference,
  saveOperationalHighAlertAudioPreference,
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

  test('two distinct reports are corroborated and active when unassigned', () => {
    expect(getOperationalHighAlertPresentation(cluster())).toEqual({
      corroborated: true,
      active: true,
      assigned: false,
      label: 'URGENT — CORROBORATED HIGH ALERT',
    });
  });

  test('legacy acknowledgement does not silence an unassigned corroborated alert', () => {
    expect(getOperationalHighAlertPresentation(cluster({ acknowledged: true })).active).toBe(true);
  });

  test('authoritative assignment stops a corroborated alert without changing the visual assigned state', () => {
    const assigned = cluster({ assignedTeams: [{ id: 'team-1' }] });
    expect(getOperationalHighAlertPresentation(assigned)).toEqual({
      corroborated: true,
      active: false,
      assigned: true,
      label: 'CORROBORATED INCIDENT',
    });
  });

  test('resolved and uncorroborated incidents are not active', () => {
    expect(getActiveOperationalAlertIds([
      cluster(),
      cluster({ operationalId: 'op-2', acknowledged: true }),
      cluster({ operationalId: 'op-3', status: 'resolved' }),
      cluster({ operationalId: 'op-4', corroborated: false }),
      cluster({ operationalId: 'op-5', assignedTeams: [{ id: 'team-1' }] }),
    ])).toEqual(['op-1', 'op-2']);
  });
});

describe('High Alert audio preference', () => {
  let localStorageMock: Storage;

  beforeEach(() => {
    localStorageMock = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
      key: jest.fn(() => null),
      length: 0,
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: localStorageMock, AudioContext: jest.fn() },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  test('no stored preference defaults to enabled', () => {
    expect(readOperationalHighAlertAudioPreference()).toBe(true);
  });

  test('explicit mute and re-enable preferences persist as booleans', () => {
    saveOperationalHighAlertAudioPreference(false);
    expect(localStorageMock.setItem).toHaveBeenLastCalledWith('pinasafe.highAlertAudioEnabled', 'false');
    (localStorageMock.getItem as jest.Mock).mockReturnValue('false');
    expect(readOperationalHighAlertAudioPreference()).toBe(false);

    saveOperationalHighAlertAudioPreference(true);
    expect(localStorageMock.setItem).toHaveBeenLastCalledWith('pinasafe.highAlertAudioEnabled', 'true');
    (localStorageMock.getItem as jest.Mock).mockReturnValue('true');
    expect(readOperationalHighAlertAudioPreference()).toBe(true);
  });
});

describe('operational High Alert audio controller', () => {
  let context: AudioContext;
  let oscillator: OscillatorNode;
  let createAudioContext: jest.Mock;
  let stateChange: jest.Mock;
  let localStorageMock: Storage;

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
    localStorageMock = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
      key: jest.fn(() => null),
      length: 0,
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { AudioContext: createAudioContext, localStorage: localStorageMock },
    });
    stateChange = jest.fn();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    Reflect.deleteProperty(globalThis, 'window');
  });

  test('enabled preference automatically attempts playback for an active alert', async () => {
    const controller = new OperationalHighAlertAudioController('web', jest.fn(), stateChange);
    controller.setEnabled(true);
    controller.syncOperationalAlerts(getActiveOperationalAlertIds([cluster()]));
    await Promise.resolve();
    await Promise.resolve();

    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.createOscillator).toHaveBeenCalledTimes(1);
    expect(stateChange).toHaveBeenLastCalledWith('enabled');
    expect(jest.getTimerCount()).toBe(1);
    controller.dispose();
  });

  test('browser autoplay rejection remains enabled and exposes deliberate activation', async () => {
    (context as { state: AudioContextState }).state = 'suspended';
    context.resume = jest.fn().mockRejectedValue(new Error('autoplay blocked'));
    const controller = new OperationalHighAlertAudioController('web', jest.fn(), stateChange);
    controller.syncOperationalAlerts(['op-1']);
    await Promise.resolve();

    expect(context.createOscillator).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    expect(stateChange).toHaveBeenLastCalledWith('activation-required');

    (context as { state: AudioContextState }).state = 'running';
    context.resume = jest.fn().mockResolvedValue(undefined);
    await controller.activate();
    expect(context.createOscillator).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);
    controller.dispose();
  });

  test('mute stops repeating sound and re-enable resumes only for an active alert', async () => {
    const controller = new OperationalHighAlertAudioController('web', jest.fn(), stateChange);
    controller.syncOperationalAlerts(['op-1']);
    await Promise.resolve();
    await Promise.resolve();
    expect(jest.getTimerCount()).toBe(1);

    controller.setEnabled(false);
    expect(stateChange).toHaveBeenLastCalledWith('muted');
    expect(jest.getTimerCount()).toBe(0);
    controller.setEnabled(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(jest.getTimerCount()).toBe(1);
    controller.dispose();
  });

  test('authoritative assignment stops the repeat loop and any current tone', async () => {
    const controller = new OperationalHighAlertAudioController('web');
    controller.syncOperationalAlerts(getActiveOperationalAlertIds([cluster()]));
    await Promise.resolve();
    await Promise.resolve();
    expect(jest.getTimerCount()).toBe(1);

    controller.syncOperationalAlerts(getActiveOperationalAlertIds([
      cluster({ assignedTeams: [{ id: 'team-1' }] }),
    ]));
    expect(jest.getTimerCount()).toBe(0);
    expect(oscillator.stop).toHaveBeenCalledWith();
    controller.dispose();
  });

  test('no active alert produces no tone even when preference is enabled', async () => {
    const controller = new OperationalHighAlertAudioController('web');
    controller.setEnabled(true);
    controller.syncOperationalAlerts([]);
    await Promise.resolve();

    expect(createAudioContext).not.toHaveBeenCalled();
    expect(oscillator.start).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    controller.dispose();
  });

  test('refresh restores preference and reports activation-required if audio is still suspended', async () => {
    saveOperationalHighAlertAudioPreference(true);
    (context as { state: AudioContextState }).state = 'suspended';
    context.resume = jest.fn().mockRejectedValue(new Error('interaction required'));
    const restoredPreference = readOperationalHighAlertAudioPreference();
    const controller = new OperationalHighAlertAudioController('web', jest.fn(), stateChange);
    controller.setEnabled(restoredPreference);
    controller.syncOperationalAlerts(['op-1']);
    await Promise.resolve();

    expect(restoredPreference).toBe(true);
    expect(stateChange).toHaveBeenLastCalledWith('activation-required');
    expect(oscillator.start).not.toHaveBeenCalled();
    controller.dispose();
  });

  test('native platforms cannot construct browser audio', async () => {
    const unavailable = jest.fn();
    const controller = new OperationalHighAlertAudioController('android', unavailable, stateChange);
    controller.syncOperationalAlerts(['op-1']);

    expect(isOperationalHighAlertAudioSupported('android')).toBe(false);
    expect(createAudioContext).not.toHaveBeenCalled();
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(getOperationalHighAlertPresentation(cluster())).toMatchObject({ active: true });
    controller.dispose();
  });
});
