const { parseCorsOrigins } = require('../config/cors');
const { validateConfiguration } = require('../config/database');

const configurationNames = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
  'CORS_ORIGIN',
  'VITE_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_URL'
];

const validConfiguration = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  JWT_SECRET: 'a'.repeat(32),
  CORS_ORIGIN: 'http://localhost:8081'
};

const setConfiguration = (values = {}) => {
  configurationNames.forEach((name) => {
    delete process.env[name];
  });

  Object.assign(process.env, validConfiguration, values);

  Object.keys(values).forEach((name) => {
    if (values[name] === undefined) {
      delete process.env[name];
    }
  });
};

describe('backend configuration validation', () => {
  afterEach(() => {
    configurationNames.forEach((name) => {
      delete process.env[name];
    });
  });

  test.each([
    ['SUPABASE_URL', { SUPABASE_URL: undefined }],
    ['SUPABASE_SERVICE_ROLE_KEY', { SUPABASE_SERVICE_ROLE_KEY: undefined }],
    ['JWT_SECRET', { JWT_SECRET: undefined }],
    ['CORS_ORIGIN', { CORS_ORIGIN: undefined }]
  ])('rejects missing %s', (name, values) => {
    setConfiguration(values);

    expect(() => validateConfiguration()).toThrow(new RegExp(name));
  });

  test('rejects a JWT secret shorter than 32 characters', () => {
    setConfiguration({
      JWT_SECRET: 'too-short'
    });

    expect(() => validateConfiguration()).toThrow(/JWT_SECRET/);
  });

  test('rejects the committed JWT secret placeholder', () => {
    setConfiguration({
      JWT_SECRET: 'replace-with-a-strong-random-secret'
    });

    expect(() => validateConfiguration()).toThrow(/JWT_SECRET/);
  });

  test('accepts valid required backend configuration', () => {
    setConfiguration({
      ...validConfiguration
    });

    expect(() => validateConfiguration()).not.toThrow();
  });

  test('does not accept browser-prefixed Supabase URLs as backend configuration', () => {
    setConfiguration({
      VITE_SUPABASE_URL: 'https://browser.example.supabase.co',
      EXPO_PUBLIC_SUPABASE_URL: 'https://mobile.example.supabase.co',
      SUPABASE_URL: undefined
    });

    expect(() => validateConfiguration()).toThrow(/SUPABASE_URL/);
  });

  test.each([
    '',
    '   ',
    '*',
    'ftp://example.com',
    'https://example.com/path',
    'https://example.com?query=value',
    'https://example.com#fragment',
    'https://user:password@example.com',
    'http://localhost:8081,,https://example.com'
  ])('rejects invalid CORS_ORIGIN value %j', (corsOrigin) => {
    expect(() => parseCorsOrigins(corsOrigin)).toThrow(/CORS_ORIGIN/);
  });

  test('parses and deduplicates valid CORS origins', () => {
    expect(parseCorsOrigins(
      ' http://localhost:8081/, https://example.com, http://localhost:8081 '
    )).toEqual([
      'http://localhost:8081',
      'https://example.com'
    ]);
  });
});
