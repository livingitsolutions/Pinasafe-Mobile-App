import fs from 'fs';
import path from 'path';
import {
  ALERT_TONES,
  AlertTonePreviewPlayer,
  DEFAULT_ALERT_TONE_ID,
  findAlertTone,
  getAlertToneLengthSec,
  getAlertTonesFor,
  resolveAlertTone,
} from '../utils/alertTones';
import {
  OperationalHighAlertAudioController,
  readOperationalHighAlertTone,
  saveOperationalHighAlertTone,
} from '../utils/operationalHighAlert';

type FakeOscillator = {
  type?: string;
  frequency: { setValueAtTime: jest.Mock };
  connect: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  onended?: () => void;
};

let oscillators: FakeOscillator[];
let contexts: { state: string; resume: jest.Mock; close: jest.Mock; createOscillator: jest.Mock }[];
let resumeBehavior: () => Promise<void>;
let contextState: string;
let store: Map<string, string>;

function installWindow(withStorage = true) {
  const createAudioContext = jest.fn(() => {
    const context = {
      state: contextState,
      currentTime: 0,
      destination: {},
      resume: jest.fn(() => resumeBehavior()),
      close: jest.fn().mockResolvedValue(undefined),
      createOscillator: jest.fn(() => {
        const oscillator: FakeOscillator = { frequency: { setValueAtTime: jest.fn() }, connect: jest.fn(), start: jest.fn(), stop: jest.fn() };
        oscillators.push(oscillator);
        return oscillator;
      }),
      createGain: jest.fn(() => ({ gain: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() }, connect: jest.fn() })),
    };
    contexts.push(context);
    return context;
  });
  const localStorage = withStorage ? {
    getItem: jest.fn((key: string) => store.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => { store.set(key, value); }),
  } : undefined;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext: createAudioContext, localStorage } });
}

const frequencies = () => oscillators.map(item => item.frequency.setValueAtTime.mock.calls[0][0]);
const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

beforeEach(() => {
  jest.useFakeTimers();
  oscillators = [];
  contexts = [];
  store = new Map();
  contextState = 'running';
  resumeBehavior = () => Promise.resolve();
  installWindow();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  Reflect.deleteProperty(globalThis, 'window');
});

describe('alert tone catalog', () => {
  test('offers 4 to 6 command-center tones with unique ids', () => {
    const tones = getAlertTonesFor('command-center');
    expect(tones.length).toBeGreaterThanOrEqual(4);
    expect(tones.length).toBeLessThanOrEqual(6);
    expect(new Set(ALERT_TONES.map(tone => tone.id)).size).toBe(ALERT_TONES.length);
  });

  test('the default tone is the original PinaSafe 880 Hz beep repeating every 1.5 s', () => {
    const tone = resolveAlertTone(DEFAULT_ALERT_TONE_ID);
    expect(tone.name).toBe('PinaSafe Standard');
    expect(tone.repeatMs).toBe(1500);
    expect(tone.notes).toEqual([{ frequency: 880, startSec: 0, durationSec: 0.25, peakGain: 0.16, wave: 'sine' }]);
    expect(tone.audiences).toEqual(expect.arrayContaining(['command-center', 'responder']));
  });

  test('every tone finishes before it repeats and stays at a moderate volume', () => {
    for (const tone of ALERT_TONES) {
      expect(getAlertToneLengthSec(tone) * 1000).toBeLessThan(tone.repeatMs);
      tone.notes.forEach(item => {
        expect(item.peakGain).toBeLessThanOrEqual(0.2);
        expect(item.frequency).toBeGreaterThan(200);
      });
    }
  });

  test('tones are synthesized: the catalog references no audio files', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'utils', 'alertTones.ts'), 'utf8');
    expect(source).not.toMatch(/\.(mp3|wav|ogg|m4a|aac)\b|require\(|import\s+\w+\s+from\s+['"].*assets/);
  });

  test.each([['missing-tone'], [''], [null], [42], [undefined]])('unknown tone %p falls back to the default', id => {
    expect(findAlertTone(id)).toBeNull();
    expect(resolveAlertTone(id).id).toBe(DEFAULT_ALERT_TONE_ID);
  });
});

describe('alert tone preference', () => {
  test('defaults to the standard tone when nothing is saved', () => {
    expect(readOperationalHighAlertTone('admin-1')).toBe(DEFAULT_ALERT_TONE_ID);
  });

  test('persists the selection per user', () => {
    saveOperationalHighAlertTone('admin-1', 'command-bell');
    expect(readOperationalHighAlertTone('admin-1')).toBe('command-bell');
    expect(readOperationalHighAlertTone('admin-2')).toBe(DEFAULT_ALERT_TONE_ID);
    expect([...store.keys()]).toEqual(['pinasafe.highAlertTone.admin.admin-1']);
  });

  test('stores only the tone id', () => {
    saveOperationalHighAlertTone('admin-1', 'double-pulse');
    expect([...store.values()]).toEqual(['double-pulse']);
  });

  test('a corrupted or removed saved tone reads back as the default', () => {
    store.set('pinasafe.highAlertTone.admin.admin-1', 'retired-tone');
    expect(readOperationalHighAlertTone('admin-1')).toBe(DEFAULT_ALERT_TONE_ID);
  });

  test('saving an unknown tone stores the default instead', () => {
    saveOperationalHighAlertTone('admin-1', 'not-a-tone');
    expect(store.get('pinasafe.highAlertTone.admin.admin-1')).toBe(DEFAULT_ALERT_TONE_ID);
  });

  test('missing storage reads the default and reports a save failure', () => {
    installWindow(false);
    expect(readOperationalHighAlertTone('admin-1')).toBe(DEFAULT_ALERT_TONE_ID);
    expect(() => saveOperationalHighAlertTone('admin-1', 'command-bell')).toThrow();
  });
});

describe('High Alert controller uses the selected tone', () => {
  const activeController = async (toneId?: string) => {
    const controller = new OperationalHighAlertAudioController('web', jest.fn(), jest.fn());
    if (toneId) controller.setTone(toneId);
    controller.setEnabled(true);
    controller.syncOperationalAlerts(['incident-1']);
    await flush();
    return controller;
  };

  test('a new controller uses the default tone', async () => {
    const controller = await activeController();
    expect(controller.toneId).toBe(DEFAULT_ALERT_TONE_ID);
    expect(frequencies()).toEqual([880]);
  });

  test('the selected tone plays its full pattern', async () => {
    await activeController('double-pulse');
    expect(frequencies()).toEqual([988, 988]);
  });

  test('the alarm repeats at the selected tone interval', async () => {
    await activeController('command-bell');
    expect(oscillators).toHaveLength(2);
    jest.advanceTimersByTime(1999);
    expect(oscillators).toHaveLength(2);
    jest.advanceTimersByTime(1);
    expect(oscillators).toHaveLength(4);
  });

  test('changing the tone while the alarm repeats switches the next repetition', async () => {
    const controller = await activeController();
    controller.setTone('triple-tick');
    jest.advanceTimersByTime(1600);
    expect(frequencies().slice(1)).toEqual([1047, 1047, 1047]);
  });

  test('an unknown tone keeps the alarm working with the default', async () => {
    const controller = await activeController('missing-tone');
    expect(controller.toneId).toBe(DEFAULT_ALERT_TONE_ID);
    expect(frequencies()).toEqual([880]);
  });

  test('mute stops the selected tone and unmute resumes it', async () => {
    const controller = await activeController('double-pulse');
    controller.setEnabled(false);
    expect(controller.state).toBe('muted');
    oscillators.forEach(item => expect(item.stop).toHaveBeenCalledWith());
    const count = oscillators.length;
    jest.advanceTimersByTime(5000);
    expect(oscillators).toHaveLength(count);
    controller.setEnabled(true);
    await flush();
    expect(oscillators.length).toBeGreaterThan(count);
  });

  test('a response team assignment still silences the alarm', async () => {
    const controller = await activeController('rising-chime');
    controller.syncOperationalAlerts([]);
    const count = oscillators.length;
    jest.advanceTimersByTime(10000);
    expect(oscillators).toHaveLength(count);
    expect(controller.state).toBe('enabled');
  });

  test('blocked autoplay asks for activation without throwing or dropping the alert', async () => {
    contextState = 'suspended';
    resumeBehavior = () => Promise.reject(new Error('NotAllowedError'));
    const controller = new OperationalHighAlertAudioController('web', jest.fn(), jest.fn());
    controller.setTone('command-bell');
    controller.setEnabled(true);
    expect(() => controller.syncOperationalAlerts(['incident-1'])).not.toThrow();
    await flush();
    expect(controller.state).toBe('activation-required');
    expect(oscillators).toHaveLength(0);
  });
});

describe('Test High Alert', () => {
  test('plays three cycles of the selected tone without an incident', async () => {
    const controller = new OperationalHighAlertAudioController('web');
    controller.setTone('double-pulse');
    await controller.testAlert();
    expect(frequencies()).toEqual([988, 988, 988, 988, 988, 988]);
    expect(controller.testDurationMs()).toBe(3320);
    jest.advanceTimersByTime(10000);
    expect(oscillators).toHaveLength(6);
  });

  test('stopping the test silences it', async () => {
    const controller = new OperationalHighAlertAudioController('web');
    await controller.testAlert();
    controller.stopTest();
    oscillators.forEach(item => expect(item.stop).toHaveBeenCalledWith());
  });

  test('is refused while muted and plays nothing', async () => {
    const controller = new OperationalHighAlertAudioController('web');
    controller.setEnabled(false);
    await expect(controller.testAlert()).rejects.toThrow('muted');
    expect(oscillators).toHaveLength(0);
  });

  test('a browser that blocks sound rejects the test safely', async () => {
    contextState = 'suspended';
    const controller = new OperationalHighAlertAudioController('web');
    await expect(controller.testAlert()).rejects.toThrow();
    expect(oscillators).toHaveLength(0);
  });

  test('with a live High Alert the test does not stack a second sound', async () => {
    const controller = new OperationalHighAlertAudioController('web');
    controller.setEnabled(true);
    controller.syncOperationalAlerts(['incident-1']);
    await flush();
    const count = oscillators.length;
    await controller.testAlert();
    expect(oscillators).toHaveLength(count);
  });

  test('native platforms report unavailable', async () => {
    const onUnavailable = jest.fn();
    const controller = new OperationalHighAlertAudioController('ios', onUnavailable);
    await expect(controller.testAlert()).rejects.toThrow();
    expect(onUnavailable).toHaveBeenCalled();
  });
});

describe('tone preview', () => {
  test('previews the chosen tone on its own audio context', async () => {
    const controller = new OperationalHighAlertAudioController('web');
    controller.setEnabled(true);
    controller.syncOperationalAlerts(['incident-1']);
    await flush();
    const player = new AlertTonePreviewPlayer();
    await expect(player.play('rising-chime', 1)).resolves.toBe('playing');
    expect(contexts).toHaveLength(2);
    expect(frequencies().slice(-3)).toEqual([659, 880, 1109]);
  });

  test('stop preview stops every scheduled note and the end callback does not fire', async () => {
    const onEnded = jest.fn();
    const player = new AlertTonePreviewPlayer(onEnded);
    await player.play('double-pulse');
    player.stop();
    oscillators.forEach(item => expect(item.stop).toHaveBeenCalledWith());
    jest.advanceTimersByTime(10000);
    expect(onEnded).not.toHaveBeenCalled();
  });

  test('the end callback fires after the preview finishes', async () => {
    const onEnded = jest.fn();
    const player = new AlertTonePreviewPlayer(onEnded);
    await player.play(DEFAULT_ALERT_TONE_ID, 1);
    jest.advanceTimersByTime(400);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['missing tone', () => {}, 'missing-tone'],
    ['blocked audio', () => { resumeBehavior = () => Promise.reject(new Error('blocked')); }, 'command-bell'],
    ['suspended audio', () => { contextState = 'suspended'; }, 'command-bell'],
    ['no audio support', () => { Object.defineProperty(globalThis, 'window', { configurable: true, value: {} }); }, 'command-bell'],
  ])('%s reports unavailable instead of throwing', async (_label, arrange, toneId) => {
    arrange();
    await expect(new AlertTonePreviewPlayer().play(toneId)).resolves.toBe('unavailable');
    expect(oscillators).toHaveLength(0);
  });
});

describe('responder assignment audio is unaffected', () => {
  const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

  test('the responder alert never selects a tone, so it keeps the standard beep', () => {
    const source = read('components/ResponderAssignmentAlert.tsx');
    expect(source).not.toMatch(/setTone|alertTones|HighAlertSoundSettings|readOperationalHighAlertTone/);
  });

  test.each([
    'services/alertAudio.web.ts',
    'services/alertAudio.native.ts',
    'services/AudioAlertService.ts',
    'services/ReactNativeAudioAlertService.ts',
    'utils/responderAssignmentAlert.ts',
  ])('%s does not use the Command Center tone catalog', file => {
    expect(read(file)).not.toMatch(/alertTones|highAlertTone/);
  });

  test('a controller without a tone choice plays the standard 880 Hz beep every 1.5 s', async () => {
    const controller = new OperationalHighAlertAudioController('web');
    controller.setEnabled(true);
    controller.syncOperationalAlerts(['assignment-1']);
    await flush();
    jest.advanceTimersByTime(1500);
    expect(frequencies()).toEqual([880, 880]);
  });
});
