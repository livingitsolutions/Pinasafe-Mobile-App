const { validateConfiguration } = require('../config/database');

const configurationNames = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
  'VITE_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_URL'
];

const setConfiguration = (values = {}) => {
  configurationNames.forEach((name) => {
    delete process.env[name];
  });

  Object.assign(process.env, values);
};

describe('backend configuration validation', () => {
  afterEach(() => {
    configurationNames.forEach((name) => {
      delete process.env[name];
    });
  });

  test.each([
    ['SUPABASE_URL', { SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key', JWT_SECRET: 'a'.repeat(32) }],
    ['SUPABASE_SERVICE_ROLE_KEY', { SUPABASE_URL: 'https://example.supabase.co', JWT_SECRET: 'a'.repeat(32) }],
    ['JWT_SECRET', { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key' }]
  ])('rejects missing %s', (name, values) => {
    setConfiguration(values);

    expect(() => validateConfiguration()).toThrow(new RegExp(name));
  });

  test('rejects a JWT secret shorter than 32 characters', () => {
    setConfiguration({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      JWT_SECRET: 'too-short'
    });

    expect(() => validateConfiguration()).toThrow(/JWT_SECRET/);
  });

  test('rejects the committed JWT secret placeholder', () => {
    setConfiguration({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      JWT_SECRET: 'replace-with-a-strong-random-secret'
    });

    expect(() => validateConfiguration()).toThrow(/JWT_SECRET/);
  });

  test('accepts valid required backend configuration', () => {
    setConfiguration({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      JWT_SECRET: 'a'.repeat(32)
    });

    expect(() => validateConfiguration()).not.toThrow();
  });

  test('does not accept browser-prefixed Supabase URLs as backend configuration', () => {
    setConfiguration({
      VITE_SUPABASE_URL: 'https://browser.example.supabase.co',
      EXPO_PUBLIC_SUPABASE_URL: 'https://mobile.example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      JWT_SECRET: 'a'.repeat(32)
    });

    expect(() => validateConfiguration()).toThrow(/SUPABASE_URL/);
  });
});
