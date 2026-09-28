import { resolveRoleRoute } from '../utils/roleRouting';

describe('resolveRoleRoute (F2 role/routing contract)', () => {
  test('I. admin routes to the admin shell', () => {
    expect(resolveRoleRoute('admin')).toBe('/(tabs-admin)/dashboard');
  });

  test('J. responder routes to the responder shell', () => {
    expect(resolveRoleRoute('responder')).toBe('/(tabs-responder)/dispatch');
  });

  test('K. citizen routes to the citizen shell', () => {
    expect(resolveRoleRoute('citizen')).toBe('/(tabs-citizen)/emergency-main');
  });

  test('L. super_admin does not route to citizen UI', () => {
    const route = resolveRoleRoute('super_admin');
    expect(route).not.toBe('/(tabs-citizen)/emergency-main');
    expect(route).toBe('/(tabs-admin)/dashboard');
  });

  test('unknown/undefined role falls back to citizen shell (pre-existing default)', () => {
    expect(resolveRoleRoute(undefined)).toBe('/(tabs-citizen)/emergency-main');
  });
});
