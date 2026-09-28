jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const { bootstrap, assertConfiguration, projectRefFromUrl, validateInputs, readPassword } = require('../scripts/bootstrapPilot');
const { createClient } = require('@supabase/supabase-js');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

const migration = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/20260929000100_create_atomic_pilot_bootstrap.sql'),
  'utf8'
);

class MockTty extends EventEmitter {
  constructor({ isTTY = true, raw = false, paused = true } = {}) {
    super();
    this.isTTY = isTTY;
    this.isRaw = raw;
    this.paused = paused;
    this.setRawMode = jest.fn((value) => { this.isRaw = value; });
  }

  on(event, listener) {
    const result = super.on(event, listener);
    if (event === 'data') this.paused = false;
    return result;
  }

  isPaused() { return this.paused; }
  pause() { this.paused = true; return this; }
}

const createPromptStreams = (options = {}) => {
  const { stdoutIsTTY = true, ...stdinOptions } = options;
  const stdin = new MockTty(stdinOptions);
  const stdout = { isTTY: stdoutIsTTY, write: jest.fn() };
  return { stdin, stdout };
};

const env = (values = {}) => ({
  DB_BOOTSTRAP_TARGET: 'pinasafe-production-new',
  DB_BOOTSTRAP_EXPECTED_PROJECT_REF: 'newpilot',
  SUPABASE_URL: 'https://newpilot.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'never-log-this',
  DB_BOOTSTRAP_CONFIRMATION: 'newpilot',
  ...values
});

const input = (values = {}) => ({
  rescueName: 'Rescue Pilot', rescueContactNumber: '09170000001', fireName: 'Fire Pilot', fireContactNumber: '09170000002',
  rescueAdminEmail: 'rescue@example.test', rescueAdminName: 'Rescue Admin', rescueAdminPassword: 'rescue12',
  fireAdminEmail: 'fire@example.test', fireAdminName: 'Fire Admin', fireAdminPassword: 'fire12', ...values
});

const client = ({ tableData = {} } = {}) => ({
  from: jest.fn((table) => ({
    select: jest.fn(() => ({
      limit: jest.fn(async () => ({ data: tableData[table] || [], error: tableData[`${table}Error`] || null })),
      in: jest.fn(async () => ({ data: tableData[table] || [], error: tableData[`${table}Error`] || null }))
    }))
  })),
  rpc: jest.fn(async () => ({ data: null, error: null }))
});

describe('secure pilot bootstrap', () => {
  test('defines serialized, one-time, service-role-only database execution', () => {
    expect(migration).toMatch(/pg_advisory_xact_lock\s*\(/i);
    expect(migration).not.toMatch(/pg_advisory_lock\s*\(/i);
    expect(migration).toMatch(/pinasafe_bootstrap_state[\s\S]*bootstrap_key text PRIMARY KEY/i);
    expect(migration).toMatch(/IF EXISTS \([\s\S]*pinasafe_bootstrap_state[\s\S]*BOOTSTRAP_ALREADY_COMPLETED/i);
    expect(migration).toMatch(/INSERT INTO public\.pinasafe_bootstrap_state[\s\S]*pinasafe-pilot/i);
    expect(migration).toMatch(/SECURITY INVOKER SET search_path = public/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/i);
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.pinasafe_bootstrap_state FROM PUBLIC/i);
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.pinasafe_bootstrap_state FROM anon/i);
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.pinasafe_bootstrap_state FROM authenticated/i);
    expect(migration).toMatch(/GRANT SELECT, INSERT ON TABLE public\.pinasafe_bootstrap_state TO service_role/i);
    const markerTable = migration.match(/CREATE TABLE IF NOT EXISTS public\.pinasafe_bootstrap_state \(([\s\S]*?)\);/i)?.[1] || '';
    expect(markerTable).not.toMatch(/password|email|name|secret/i);
    expect(migration).not.toMatch(/DELETE\s+FROM|ON CONFLICT[\s\S]*DO UPDATE/i);
    expect(migration).toMatch(/WHEN OTHERS THEN[\s\S]*RAISE EXCEPTION 'BOOTSTRAP_FAILED'/i);
    expect(migration).not.toMatch(/RAISE EXCEPTION[^;]*\|\|/i);
  });

  test('validates normalized duplicate inputs and requested conflicts in the RPC', () => {
    expect(migration).toMatch(/regexp_replace\(coalesce\(p_rescue_name, ''\), '\^\[\[:space:\]\]\+\|\[\[:space:\]\]\+\$', '', 'g'\)/i);
    expect(migration).toMatch(/lower\(v_rescue_name\) = lower\(v_fire_name\)/i);
    expect(migration).toMatch(/v_rescue_admin_email = v_fire_admin_email/i);
    expect(migration).toMatch(/lower\(regexp_replace\(coalesce\(name, ''\), '\^\[\[:space:\]\]\+\|\[\[:space:\]\]\+\$', '', 'g'\)\)/i);
    expect(migration).toMatch(/lower\(regexp_replace\(coalesce\(email, ''\), '\^\[\[:space:\]\]\+\|\[\[:space:\]\]\+\$', '', 'g'\)\)/i);
    expect(migration).toMatch(/VALUES \(v_rescue_name, 'rescue', v_rescue_contact_number, true\)/i);
    expect(migration).toMatch(/VALUES \(v_fire_name, 'fire', v_fire_contact_number, true\)/i);
    expect(migration).toMatch(/VALUES \(v_rescue_admin_email, p_rescue_admin_password_hash, v_rescue_admin_name/i);
    expect(migration).toMatch(/VALUES \(v_fire_admin_email, p_fire_admin_password_hash, v_fire_admin_name/i);
    expect(migration).toMatch(/p_rescue_admin_password_hash ~ '\^\[\[:space:\]\]\*\$'/i);
    expect(migration).toMatch(/p_fire_admin_password_hash ~ '\^\[\[:space:\]\]\*\$'/i);
    expect(migration).toMatch(/BOOTSTRAP_CONFLICT/);
    expect(migration).toMatch(/BOOTSTRAP_INVALID_INPUT/);
  });

  test.each(['   ', '\t\t', '\n\n', '\r\n\t \f\v'])('SQL whitespace normalization rejects blank input %j', (value) => {
    const sqlWhitespace = /^[\s]*$/u;
    expect(sqlWhitespace.test(value)).toBe(true);
    expect(migration).toMatch(/\[\[:space:\]\]/);
    expect(migration).toMatch(/IF v_rescue_name = ''[\s\S]*p_rescue_admin_password_hash ~ '\^\[\[:space:\]\]\*\$'/);
  });

  test('SQL normalization catches duplicate names and emails differing by whitespace and case', () => {
    const normalizeBoundary = (value) => value.replace(/^\s+|\s+$/gu, '').toLowerCase();
    expect(normalizeBoundary('\t Rescue HQ \n')).toBe(normalizeBoundary('rescue hq'));
    expect(normalizeBoundary('\r\nADMIN@EXAMPLE.TEST\t')).toBe(normalizeBoundary('admin@example.test'));
    expect(migration).toMatch(/lower\(v_rescue_name\) = lower\(v_fire_name\)/i);
    expect(migration).toMatch(/v_rescue_admin_email = v_fire_admin_email/i);
    expect(migration).toMatch(/WHERE lower\(regexp_replace\(coalesce\(name/i);
    expect(migration).toMatch(/WHERE lower\(regexp_replace\(coalesce\(email/i);
  });

  test('project refs canonicalize case and surrounding whitespace and validate every legacy entry', () => {
    const base = env();
    expect(assertConfiguration({ ...base, DB_BOOTSTRAP_LEGACY_PROJECT_REFS: ' oldref ' }).actualProjectRef).toBe('newpilot');
    for (const legacy of ['newpilot', 'NEWPILOT', ' NewPilot ']) {
      expect(() => assertConfiguration({ ...base, DB_BOOTSTRAP_LEGACY_PROJECT_REFS: legacy })).toThrow(/legacy/);
    }
    for (const malformed of ['bad-ref', 'oldref,', ',oldref', 'old ref']) {
      expect(() => assertConfiguration({ ...base, DB_BOOTSTRAP_LEGACY_PROJECT_REFS: malformed })).toThrow(/DB_BOOTSTRAP_LEGACY_PROJECT_REFS/);
    }
    expect(assertConfiguration({ ...base, DB_BOOTSTRAP_LEGACY_PROJECT_REFS: ' \t ' }).actualProjectRef).toBe('newpilot');
    expect(assertConfiguration({ ...base, DB_BOOTSTRAP_LEGACY_PROJECT_REFS: 'otherref' }).actualProjectRef).toBe('newpilot');
    expect(assertConfiguration({ ...base, DB_BOOTSTRAP_EXPECTED_PROJECT_REF: ' NEWPILOT ', DB_BOOTSTRAP_CONFIRMATION: ' NewPilot ' }).actualProjectRef).toBe('newpilot');
    expect(() => assertConfiguration({ ...base, DB_BOOTSTRAP_EXPECTED_PROJECT_REF: 'newpilot.evil' })).toThrow(/EXPECTED_PROJECT_REF/);
    expect(() => assertConfiguration({ ...base, DB_BOOTSTRAP_CONFIRMATION: 'newpilot-extra' })).toThrow(/CONFIRMATION/);
  });

  test.each([
    [{ DB_BOOTSTRAP_TARGET: 'wrong' }], [{ SUPABASE_URL: 'https://other.supabase.co' }],
    [{ DB_BOOTSTRAP_LEGACY_PROJECT_REFS: 'newpilot' }], [{ SUPABASE_URL: 'not-a-url' }],
    [{ DB_BOOTSTRAP_CONFIRMATION: '' }], [{ DB_BOOTSTRAP_CONFIRMATION: 'wrong' }]
  ])('rejects unsafe target configuration before database access: %j', async (values) => {
    const mock = client();
    await expect(bootstrap({ env: env(values), client: mock, input: input() })).rejects.toThrow();
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  test('rejects malformed and non-Supabase URLs exactly', () => {
    expect(() => projectRefFromUrl('https://newpilot.supabase.co.evil.test')).toThrow();
    expect(() => projectRefFromUrl('http://newpilot.supabase.co')).toThrow();
  });

  test.each([
    'https://@newpilot.supabase.co',
    'https://:@newpilot.supabase.co',
    'https://newpilot.supabase.co?',
    'https://newpilot.supabase.co#',
    'https://newpilot.supabase.co/?',
    'https://newpilot.supabase.co/#',
    'https://newpilot.supabase.co:443',
    'http://newpilot.supabase.co',
    'https://newpilot.supabase.co/path',
    'https://newpilot.supabase.co.evil.example',
    'https://evil.newpilot.supabase.co'
  ])('rejects noncanonical URL before constructing the Supabase client: %s', async (url) => {
    createClient.mockClear();
    await expect(bootstrap({ env: env({ SUPABASE_URL: url }), input: input() })).rejects.toThrow(/SUPABASE_URL/);
    expect(createClient).not.toHaveBeenCalled();
  });

  test.each([
    ['https://newpilot.supabase.co', 'newpilot'],
    ['https://newpilot.supabase.co/', 'newpilot'],
    ['https://NEWPILOT.supabase.co', 'newpilot']
  ])('accepts canonical Supabase URL form %s', (url, expectedRef) => {
    expect(projectRefFromUrl(url)).toBe(expectedRef);
    expect(assertConfiguration(env({ SUPABASE_URL: url })).actualProjectRef).toBe(expectedRef);
  });

  test.each([
    [{ rescueName: ' same ', fireName: 'SAME' }],
    [{ rescueAdminEmail: 'Admin@Example.test', fireAdminEmail: ' admin@example.test ' }],
    [{ rescueAdminPassword: 'short' }]
  ])('rejects invalid input before database access: %j', async (values) => {
    const mock = client();
    await expect(bootstrap({ env: env(), client: mock, input: input(values) })).rejects.toThrow();
    expect(mock.from).not.toHaveBeenCalled();
  });

  test.each([
    [{ organizations: [{ id: 'org-1' }] }], [{ users: [{ id: 'user-1' }] }],
    [{ organizationsError: { message: 'schema failure' } }], [{ usersError: { message: 'schema failure' } }]
  ])('refuses existing or partial state without writes: %j', async (tableData) => {
    const mock = client({ tableData });
    await expect(bootstrap({ env: env(), client: mock, input: input() })).rejects.toThrow();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  test('creates the frozen four-record plan with hashed passwords and no secret logging', async () => {
    const mock = client();
    const logs = jest.spyOn(console, 'log').mockImplementation(() => {});
    await expect(bootstrap({ env: env(), client: mock, input: input(), hash: async (value) => `hash:${value}` })).resolves.toEqual(expect.objectContaining({ records: expect.any(Array) }));
    expect(mock.rpc).toHaveBeenCalledWith('bootstrap_pilot_atomic', expect.objectContaining({
      p_rescue_name: 'Rescue Pilot', p_fire_name: 'Fire Pilot', p_rescue_admin_email: 'rescue@example.test', p_fire_admin_email: 'fire@example.test',
      p_rescue_admin_password_hash: 'hash:rescue12', p_fire_admin_password_hash: 'hash:fire12'
    }));
    expect(JSON.stringify(logs.mock.calls)).not.toContain('rescue12');
    expect(JSON.stringify(logs.mock.calls)).not.toContain('never-log-this');
    logs.mockRestore();
  });

  test('accepts the application password contract and target gates', () => {
    expect(() => assertConfiguration(env())).not.toThrow();
    expect(() => validateInputs(input())).not.toThrow();
  });

  test.each([{ isTTY: false }, { stdoutIsTTY: false }])('refuses non-TTY password input before installing listeners or changing terminal state: %j', async (options) => {
    const { stdin, stdout } = createPromptStreams(options);
    await expect(readPassword('Password: ', { stdin, stdout })).rejects.toThrow(/interactive TTY/);
    expect(stdin.listenerCount('data')).toBe(0);
    expect(stdin.setRawMode).not.toHaveBeenCalled();
    expect(stdout.write).not.toHaveBeenCalled();
  });

  test('restores raw and paused state, removes listeners, and never echoes password on success', async () => {
    const { stdin, stdout } = createPromptStreams();
    const pending = readPassword('Password: ', { stdin, stdout });
    stdin.emit('data', Buffer.from('private-password'));
    stdin.emit('data', Buffer.from('\r'));
    await expect(pending).resolves.toBe('private-password');
    expect(stdin.isRaw).toBe(false);
    expect(stdin.isPaused()).toBe(true);
    expect(stdin.setRawMode).toHaveBeenCalledWith(true);
    expect(stdin.setRawMode).toHaveBeenLastCalledWith(false);
    expect(['data', 'error', 'end', 'close'].every((event) => stdin.listenerCount(event) === 0)).toBe(true);
    expect(stdout.write.mock.calls).toEqual([['Password: '], ['\n']]);
    expect(JSON.stringify(stdout.write.mock.calls)).not.toContain('private-password');
  });

  test('preserves a terminal that was already in raw mode', async () => {
    const { stdin, stdout } = createPromptStreams({ raw: true, paused: false });
    const pending = readPassword('Password: ', { stdin, stdout });
    stdin.emit('data', Buffer.from('ok\n'));
    await expect(pending).resolves.toBe('ok');
    expect(stdin.isRaw).toBe(true);
    expect(stdin.setRawMode).not.toHaveBeenCalled();
    expect(stdin.isPaused()).toBe(false);
    expect(['data', 'error', 'end', 'close'].every((event) => stdin.listenerCount(event) === 0)).toBe(true);
  });

  test.each([
    ['Ctrl-C', (stdin) => stdin.emit('data', Buffer.from('\u0003'))],
    ['stdin error', (stdin) => stdin.emit('error', new Error('sensitive stream detail'))],
    ['stdin end', (stdin) => stdin.emit('end')],
    ['stdin close', (stdin) => stdin.emit('close')]
  ])('restores terminal state and removes listeners after %s', async (_label, trigger) => {
    const { stdin, stdout } = createPromptStreams();
    const pending = readPassword('Password: ', { stdin, stdout });
    trigger(stdin);
    await expect(pending).rejects.toThrow();
    expect(stdin.isRaw).toBe(false);
    expect(stdin.isPaused()).toBe(true);
    expect(['data', 'error', 'end', 'close'].every((event) => stdin.listenerCount(event) === 0)).toBe(true);
    expect(stdout.write.mock.calls.some(([text]) => String(text).includes('sensitive'))).toBe(false);
  });

  test('restores terminal state and removes listeners when prompt setup throws', async () => {
    const { stdin, stdout } = createPromptStreams();
    stdout.write.mockImplementationOnce(() => { throw new Error('private output failure'); });
    await expect(readPassword('Password: ', { stdin, stdout })).rejects.toThrow(/Secure password input failed/);
    expect(stdin.isRaw).toBe(false);
    expect(stdin.isPaused()).toBe(true);
    expect(['data', 'error', 'end', 'close'].every((event) => stdin.listenerCount(event) === 0)).toBe(true);
  });

  test('terminal state is restored before a later password validation rejection', async () => {
    const { stdin, stdout } = createPromptStreams();
    const pending = readPassword('Password: ', { stdin, stdout });
    stdin.emit('data', Buffer.from('short'));
    stdin.emit('data', Buffer.from('\n'));
    const password = await pending;
    expect(() => validateInputs(input({ rescueAdminPassword: password }))).toThrow(/at least 6 characters/);
    expect(stdin.isRaw).toBe(false);
    expect(stdin.isPaused()).toBe(true);
    expect(['data', 'error', 'end', 'close'].every((event) => stdin.listenerCount(event) === 0)).toBe(true);
  });
});
