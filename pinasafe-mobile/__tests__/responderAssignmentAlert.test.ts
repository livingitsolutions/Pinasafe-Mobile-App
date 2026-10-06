import fs from 'node:fs';
import path from 'node:path';
import {
  getEligibleAssignmentAlerts,
  readResponderAssignmentAudioPreference,
  RESPONDER_ASSIGNMENT_AUDIO_PREFERENCE_KEY,
  saveResponderAssignmentAudioPreference,
} from '../utils/responderAssignmentAlert';
import { OperationalHighAlertAudioController } from '../utils/operationalHighAlert';

const responder = { role: 'responder', teamId: 'team-1' };
const report = (overrides: Partial<{ id: string; status: string; assigned_team_id: string | null }> = {}) => ({
  id: 'r-1',
  status: 'dispatched',
  assigned_team_id: 'team-1',
  ...overrides,
});

describe('responder assignment alert eligibility (server state only)', () => {
  test('active for a dispatched report assigned to the responder team', () => {
    expect(getEligibleAssignmentAlerts([report()], responder).map(r => r.id)).toEqual(['r-1']);
  });

  test('absent after responding', () => {
    expect(getEligibleAssignmentAlerts([report({ status: 'responding' })], responder)).toEqual([]);
  });

  test('absent after resolved', () => {
    expect(getEligibleAssignmentAlerts([report({ status: 'resolved' })], responder)).toEqual([]);
  });

  test('no responder alarm for unassigned pending incidents', () => {
    expect(getEligibleAssignmentAlerts([report({ status: 'pending', assigned_team_id: null })], responder)).toEqual([]);
  });

  test('absent for another team, admins, users without a team, and signed-out users', () => {
    const reports = [report({ assigned_team_id: 'team-2' })];
    expect(getEligibleAssignmentAlerts(reports, responder)).toEqual([]);
    expect(getEligibleAssignmentAlerts([report()], { role: 'admin', teamId: 'team-1' })).toEqual([]);
    expect(getEligibleAssignmentAlerts([report()], { role: 'responder' })).toEqual([]);
    expect(getEligibleAssignmentAlerts([report()], null)).toEqual([]);
  });
});

describe('responder assignment audio preference', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: jest.fn((key: string) => store[key] ?? null),
          setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
        },
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  test('defaults ON', () => {
    expect(readResponderAssignmentAudioPreference()).toBe(true);
  });

  test('mute and unmute persist under a key separate from admin High Alert', () => {
    saveResponderAssignmentAudioPreference(false);
    expect(readResponderAssignmentAudioPreference()).toBe(false);
    saveResponderAssignmentAudioPreference(true);
    expect(readResponderAssignmentAudioPreference()).toBe(true);
    expect(RESPONDER_ASSIGNMENT_AUDIO_PREFERENCE_KEY).toBe('pinasafe.responderAssignmentAudioEnabled');
    expect(Object.keys(store)).toEqual(['pinasafe.responderAssignmentAudioEnabled']);
    expect(store['pinasafe.highAlertAudioEnabled']).toBeUndefined();
  });
});

describe('responder assignment audio playback', () => {
  let context: AudioContext;

  beforeEach(() => {
    jest.useFakeTimers();
    const node = { connect: jest.fn(), start: jest.fn(), stop: jest.fn(), frequency: { setValueAtTime: jest.fn() } };
    const gain = { connect: jest.fn(), gain: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() } };
    context = {
      state: 'running',
      currentTime: 0,
      destination: {},
      resume: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      createOscillator: jest.fn(() => node),
      createGain: jest.fn(() => gain),
    } as unknown as AudioContext;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { AudioContext: jest.fn(() => context) },
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    Reflect.deleteProperty(globalThis, 'window');
  });

  test('repeats while eligible, stops on mute, resumes on unmute, and stops once nothing is eligible', async () => {
    const controller = new OperationalHighAlertAudioController('web');
    controller.setEnabled(true);
    controller.syncOperationalAlerts(getEligibleAssignmentAlerts([report()], responder).map(r => r.id));
    await Promise.resolve();
    await Promise.resolve();
    expect(jest.getTimerCount()).toBe(1);

    controller.setEnabled(false);
    expect(controller.state).toBe('muted');
    expect(jest.getTimerCount()).toBe(0);

    controller.setEnabled(true, false);
    await controller.activate();
    expect(jest.getTimerCount()).toBe(1);

    controller.syncOperationalAlerts(getEligibleAssignmentAlerts([report({ status: 'responding' })], responder).map(r => r.id));
    expect(jest.getTimerCount()).toBe(0);
    controller.dispose();
  });
});

describe('single responder alarm system', () => {
  const root = path.resolve(__dirname, '..');
  const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

  test('the legacy context alarm no longer raises team assignment alarms for responders', () => {
    const source = read('contexts/EmergencyContext.tsx').replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toMatch(/'TEAM ASSIGNMENT: '/);
    expect(source).toMatch(/const legacyAdminAlarm = user\?\.role === 'admin';/);
  });

  test('the Respond action label is used everywhere responders acknowledge a dispatch', () => {
    for (const file of ['app/(tabs-responder)/dispatch.tsx', 'app/incident/[id].tsx', 'components/ResponderAssignmentAlert.tsx']) {
      const source = read(file);
      expect(source).toMatch(/'Respond'|"Respond"/);
      expect(source).not.toMatch(/Start responding|Accept Dispatch|Acknowledge/i);
    }
  });

  test('admin High Alert keeps its own preference key', () => {
    expect(read('utils/operationalHighAlert.ts')).toMatch(/const AUDIO_PREFERENCE_KEY = 'pinasafe\.highAlertAudioEnabled';/);
  });
});
