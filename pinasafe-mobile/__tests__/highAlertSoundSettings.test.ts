import React from 'react';
import HighAlertSoundSettings from '../components/HighAlertSoundSettings';
import { collectElements, collectText } from './support/tree';

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: jest.fn(),
  useRef: jest.fn(() => ({ current: null })),
  useCallback: (callback: unknown) => callback,
  useEffect: jest.fn(),
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'web', select: ({ web, default: fallback }: { web?: unknown; default?: unknown }) => web ?? fallback },
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  View: 'View',
}));
jest.mock('lucide-react-native', () => ({ Check: 'Check', Play: 'Play', Square: 'Square' }));
jest.mock('@/components/ui', () => ({ Banner: 'Banner', Button: 'Button', Dialog: 'Dialog' }));

const { useState } = jest.requireMock('react') as { useState: jest.Mock };

type Setters = { setPreviewing: jest.Mock; setTesting: jest.Mock; setNote: jest.Mock };

function render(overrides: Record<string, unknown> = {}, state: { previewingId?: string | null; testing?: boolean; note?: unknown } = {}) {
  const setters: Setters = { setPreviewing: jest.fn(), setTesting: jest.fn(), setNote: jest.fn() };
  const values: [unknown, jest.Mock][] = [
    [state.previewingId ?? null, setters.setPreviewing],
    [state.testing ?? false, setters.setTesting],
    [state.note ?? null, setters.setNote],
  ];
  useState.mockImplementation(() => values.shift());
  const controller = { testAlert: jest.fn().mockResolvedValue(undefined), stopTest: jest.fn(), testDurationMs: () => 1000 };
  const props = {
    visible: true, onClose: jest.fn(), audioSupported: true, soundEnabled: true, soundBusy: false, soundState: 'enabled',
    selectedToneId: 'pinasafe-standard', controller, onToggleSound: jest.fn(), onSelectTone: jest.fn(), ...overrides,
  };
  const tree = HighAlertSoundSettings(props as never);
  return { tree, elements: collectElements(tree), props, controller, setters };
}

const byLabel = (elements: React.ReactElement<Record<string, unknown>>[], label: string) =>
  elements.find(element => element.props.label === label || element.props.accessibilityLabel === label);

describe('High Alert sound settings', () => {
  beforeEach(() => jest.clearAllMocks());

  test('lists every tone with a single selected indicator on the default', () => {
    const { elements, tree } = render();
    const radios = elements.filter(element => element.props.accessibilityRole === 'radio');
    expect(radios).toHaveLength(5);
    expect(radios.filter(radio => (radio.props.accessibilityState as { checked: boolean }).checked)).toHaveLength(1);
    expect(byLabel(elements, 'PinaSafe Standard, default')?.props.accessibilityState).toEqual({ checked: true });
    expect(collectText(tree).filter(text => text === 'Selected')).toHaveLength(1);
  });

  test('selecting a tone reports the choice', () => {
    const { elements, props } = render();
    (byLabel(elements, 'Command Bell')!.props.onPress as () => void)();
    expect(props.onSelectTone).toHaveBeenCalledWith('command-bell');
  });

  test('the selected indicator follows the saved choice', () => {
    const { elements } = render({ selectedToneId: 'rising-chime' });
    expect(byLabel(elements, 'Rising Chime')?.props.accessibilityState).toEqual({ checked: true });
    expect(byLabel(elements, 'PinaSafe Standard, default')?.props.accessibilityState).toEqual({ checked: false });
  });

  test('each tone has Preview, and the playing tone shows Stop preview', () => {
    const idle = render();
    expect(idle.elements.filter(element => element.type === 'Button' && element.props.label === 'Preview')).toHaveLength(5);
    const playing = render({}, { previewingId: 'double-pulse' });
    const stop = playing.elements.filter(element => element.props.label === 'Stop preview');
    expect(stop).toHaveLength(1);
    (stop[0].props.onPress as () => void)();
    expect(playing.setters.setPreviewing).toHaveBeenCalledWith(null);
  });

  test('the on/off switch reflects and toggles High Alert sound', () => {
    const on = render();
    const toggle = byLabel(on.elements, 'High Alert sound')!;
    expect(toggle.props.accessibilityRole).toBe('switch');
    expect((toggle.props.accessibilityState as { checked: boolean }).checked).toBe(true);
    (toggle.props.onPress as () => void)();
    expect(on.props.onToggleSound).toHaveBeenCalledWith(false);
    const off = render({ soundEnabled: false });
    (byLabel(off.elements, 'High Alert sound')!.props.onPress as () => void)();
    expect(off.props.onToggleSound).toHaveBeenCalledWith(true);
    expect(collectText(off.tree).join(' ')).toContain('Visual High Alerts still appear');
  });

  test('Test High Alert plays through the alarm controller', async () => {
    const { elements, controller, setters } = render();
    await (byLabel(elements, 'Test High Alert')!.props.onPress as () => Promise<void>)();
    await Promise.resolve();
    expect(controller.testAlert).toHaveBeenCalledTimes(1);
    expect(setters.setTesting).toHaveBeenCalledWith(true);
  });

  test('Test High Alert while muted explains instead of playing', async () => {
    const { elements, controller, setters } = render({ soundEnabled: false });
    await (byLabel(elements, 'Test High Alert')!.props.onPress as () => Promise<void>)();
    expect(controller.testAlert).not.toHaveBeenCalled();
    expect(setters.setNote).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'High Alert sound is off' }));
  });

  test('a failed test shows a calm warning and no crash', async () => {
    const { elements, controller, setters } = render();
    controller.testAlert.mockRejectedValueOnce(new Error('blocked'));
    (byLabel(elements, 'Test High Alert')!.props.onPress as () => void)();
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    expect(setters.setNote).toHaveBeenLastCalledWith(expect.objectContaining({ tone: 'warning', title: 'Test sound did not play' }));
    expect(setters.setTesting).toHaveBeenLastCalledWith(false);
  });

  test('a playback warning offers a way back to the default tone', () => {
    const note = { tone: 'warning', title: 'Preview unavailable', message: 'x' };
    const { elements, props } = render({ selectedToneId: 'command-bell' }, { note });
    (byLabel(elements, 'Use default tone')!.props.onPress as () => void)();
    expect(props.onSelectTone).toHaveBeenCalledWith('pinasafe-standard');
    expect(byLabel(render({}, { note }).elements, 'Use default tone')).toBeUndefined();
  });

  test('while testing, Stop test replaces Test High Alert', () => {
    const { elements, controller } = render({}, { testing: true });
    expect(byLabel(elements, 'Test High Alert')).toBeUndefined();
    (byLabel(elements, 'Stop test')!.props.onPress as () => void)();
    expect(controller.stopTest).toHaveBeenCalled();
  });

  test('unsupported devices disable testing and say visual alerts remain', () => {
    const { elements, tree } = render({ audioSupported: false });
    expect(byLabel(elements, 'Test High Alert')?.props.disabled).toBe(true);
    expect(collectText(tree).join(' ')).toContain('Visual High Alerts still appear');
  });
});
