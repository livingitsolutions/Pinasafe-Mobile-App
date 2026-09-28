import { isClientRuntime } from '../utils/clientRuntime';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

describe('client runtime detection', () => {
  test('excludes web SSR but includes web browser runtime', () => {
    expect(isClientRuntime('web', false)).toBe(false);
    expect(isClientRuntime('web', true)).toBe(true);
  });

  test.each(['android', 'ios'])('includes %s without a browser window', platform => {
    expect(isClientRuntime(platform, false)).toBe(true);
  });
});
