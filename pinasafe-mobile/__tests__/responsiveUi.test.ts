import React from 'react';
import { ActionGroup, Button, Field, IconButton, Input, ListRow, PageHeader, ResponsiveGrid, Screen, Section } from '@/components/ui';
import { useTabBarPresentation } from '@/components/ui/useTabBarPresentation';
import { collectElements, collectText } from './support/tree';

let mockWidth = 320;
jest.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator', Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
  Platform: { OS: 'web', select: (options: { web?: unknown; default?: unknown }) => options.web ?? options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  useWindowDimensions: () => ({ width: mockWidth, height: 700 }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 34, left: 0, right: 0 }) }));
jest.mock('lucide-react-native', () => ({ AlertCircle: 'AlertCircle', ChevronRight: 'ChevronRight', Inbox: 'Inbox', X: 'X' }));

type Props = Record<string, unknown>;
function flatten(style: unknown): Props {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return style && typeof style === 'object' ? style as Props : {};
}

describe.each([320, 360, 375, 390, 430, 768, 1280])('shared layout at %ipx', width => {
  beforeEach(() => { mockWidth = width; });

  test('header, Back and Refresh actions remain present and operable', () => {
    const back = jest.fn();
    const refresh = jest.fn();
    const tree = PageHeader({
      title: 'Incident at a long, readable location',
      navigation: IconButton({ label: 'Go back', onPress: back, children: null }),
      action: React.createElement(Button, { label: 'Refresh', onPress: refresh }),
    });
    const controls = collectElements(tree).filter(element => element.type === 'Pressable');
    (controls.find(element => element.props.accessibilityLabel === 'Go back')!.props.onPress as () => void)();
    (controls.find(element => element.props.accessibilityLabel === 'Refresh')!.props.onPress as () => void)();
    expect(back).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(collectText(tree)).toContain('Back');
  });

  test('identity rows stack on mobile without truncating locations or metadata', () => {
    const location = 'A very long street and barangay location that must remain readable';
    const details = 'responder-with-a-long-address@example.test · +63 912 345 6789';
    const open = jest.fn();
    const tree = ListRow({ title: location, subtitle: details, onPress: open });
    expect(flatten(tree.props.style instanceof Function ? tree.props.style({ pressed: false }) : tree.props.style).flexDirection).toBe(width < 680 ? 'column' : 'row');
    expect(collectText(tree)).toEqual(expect.arrayContaining([location, details]));
    expect(collectElements(tree).filter(element => element.type === 'Text').every(element => element.props.numberOfLines === undefined)).toBe(true);
    (tree.props.onPress as () => void)();
    expect(open).toHaveBeenCalledTimes(1);
  });

  test('action groups stack on mobile and retain every action', () => {
    const tree = ActionGroup({ children: ['Respond', 'Open details'].map(label => React.createElement(Button, { key: label, label, onPress: jest.fn() })) });
    expect(flatten(tree.props.style).flexDirection).toBe(width < 680 ? 'column' : 'row');
    expect(collectElements(tree).filter(element => element.type === 'Pressable')).toHaveLength(2);
  });

  test('grids avoid fixed minimum widths on narrow screens and screens reserve safe top spacing', () => {
    const grid = ResponsiveGrid({ children: React.createElement('Text', null, 'Incident count') });
    const children = React.Children.toArray(grid.props.children) as React.ReactElement<Props>[];
    expect(flatten(children[0].props.style).maxWidth).toBe('100%');
    if (width < 680) expect(flatten(children[0].props.style)).toMatchObject({ flexBasis: '100%', minWidth: 0 });
    const screen = Screen({ children: 'Screen content' });
    const inner = collectElements(screen).find(element => flatten(element.props.style).maxWidth === 1180)!;
    expect(flatten(inner.props.style).paddingTop).toBeGreaterThanOrEqual(36);
    expect(flatten(inner.props.style).paddingBottom).toBeGreaterThanOrEqual(34);
  });
});

test('button targets, busy state and wrapping remain accessible', () => {
  const tree = Button({ label: 'Submit emergency report', onPress: jest.fn(), loading: true });
  expect(tree.props.accessibilityState).toEqual({ disabled: true, busy: true });
  const styles = tree.props.style({ pressed: false });
  expect(flatten(styles).minHeight).toBeGreaterThanOrEqual(44);
  const text = collectElements(tree).find(element => element.type === 'Text')!;
  expect(flatten(text.props.style).flexShrink).toBe(1);
  expect(collectText(tree)).toContain('Submit emergency report…');
});

test('fields pass their visible label to unlabeled inputs', () => {
  const tree = Field({ label: 'Team name', children: React.createElement(Input, { value: '' }) });
  expect(collectElements(tree).find(element => element.type === 'TextInput')!.props.accessibilityLabel).toBe('Team name');
});

test('section actions remain outside the title on narrow screens', () => {
  mockWidth = 320;
  const tree = Section({ title: 'Needs attention', action: React.createElement(Button, { label: 'Open full queue', onPress: jest.fn() }), children: null });
  expect(collectElements(tree).some(element => element.props.accessibilityLabel === 'Open full queue')).toBe(true);
});

test('tab bars reserve the device safe area with consistent readable labels', () => {
  const presentation = useTabBarPresentation();
  expect(presentation.tabBarStyle.height).toBe(98);
  expect(presentation.tabBarStyle.paddingBottom).toBe(42);
  expect(presentation.tabBarLabelStyle.fontSize).toBe(12);
  expect(presentation.tabBarActiveBackgroundColor).toBeTruthy();
});
