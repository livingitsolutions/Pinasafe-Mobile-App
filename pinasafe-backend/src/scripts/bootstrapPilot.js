const bcrypt = require('bcryptjs');
const readline = require('node:readline');
const { createClient } = require('@supabase/supabase-js');

const EXPECTED_TARGET = 'pinasafe-production-new';
const PROJECT_REF_PATTERN = /^[a-z0-9]+$/;

const required = (env, name) => {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing bootstrap configuration: ${name}`);
  }
  return value.trim();
};

const projectRefFromUrl = (value) => {
  const rawMatch = value.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i);
  if (!rawMatch) throw new Error('Invalid SUPABASE_URL');

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid SUPABASE_URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Invalid SUPABASE_URL');
  }
  return normalizeProjectRef(rawMatch[1], 'SUPABASE_URL project ref');
};

const normalizeProjectRef = (value, label) => {
  if (typeof value !== 'string') throw new Error(`Invalid ${label}`);
  const normalized = value.trim().toLowerCase();
  if (!PROJECT_REF_PATTERN.test(normalized)) throw new Error(`Invalid ${label}`);
  return normalized;
};

const normalizeEmail = (email) => email.trim().toLowerCase();
const normalizeName = (name) => name.trim().toLowerCase();

const validatePassword = (password, label) => {
  if (typeof password !== 'string' || password.length < 6) {
    throw new Error(`${label} must be at least 6 characters`);
  }
};

const validateInputs = (input) => {
  const requiredValues = [
    ['rescueName', input.rescueName], ['rescueContactNumber', input.rescueContactNumber],
    ['fireName', input.fireName], ['fireContactNumber', input.fireContactNumber],
    ['rescueAdminEmail', input.rescueAdminEmail], ['rescueAdminName', input.rescueAdminName],
    ['fireAdminEmail', input.fireAdminEmail], ['fireAdminName', input.fireAdminName]
  ];
  requiredValues.forEach(([label, value]) => {
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`Missing bootstrap input: ${label}`);
  });
  if (normalizeName(input.rescueName) === normalizeName(input.fireName)) throw new Error('Organization names must be different');
  if (normalizeEmail(input.rescueAdminEmail) === normalizeEmail(input.fireAdminEmail)) throw new Error('Admin emails must be different');
  validatePassword(input.rescueAdminPassword, 'Rescue admin password');
  validatePassword(input.fireAdminPassword, 'Fire admin password');
};

const assertConfiguration = (env) => {
  if (required(env, 'DB_BOOTSTRAP_TARGET') !== EXPECTED_TARGET) throw new Error('Invalid DB_BOOTSTRAP_TARGET');
  const expectedProjectRef = normalizeProjectRef(required(env, 'DB_BOOTSTRAP_EXPECTED_PROJECT_REF'), 'DB_BOOTSTRAP_EXPECTED_PROJECT_REF');
  const actualProjectRef = projectRefFromUrl(required(env, 'SUPABASE_URL'));
  const rawLegacyRefs = env.DB_BOOTSTRAP_LEGACY_PROJECT_REFS;
  if (rawLegacyRefs !== undefined && typeof rawLegacyRefs !== 'string') {
    throw new Error('Invalid DB_BOOTSTRAP_LEGACY_PROJECT_REFS');
  }
  const legacyRefs = !rawLegacyRefs || rawLegacyRefs.trim() === ''
    ? []
    : rawLegacyRefs.split(',').map((ref) => normalizeProjectRef(ref, 'DB_BOOTSTRAP_LEGACY_PROJECT_REFS entry'));
  if (legacyRefs.includes(actualProjectRef)) throw new Error('Refusing configured legacy Supabase project');
  if (actualProjectRef !== expectedProjectRef) throw new Error('SUPABASE_URL project ref does not match expected project ref');
  if (normalizeProjectRef(required(env, 'DB_BOOTSTRAP_CONFIRMATION'), 'DB_BOOTSTRAP_CONFIRMATION') !== expectedProjectRef) throw new Error('Incorrect bootstrap confirmation');
  required(env, 'SUPABASE_SERVICE_ROLE_KEY');
  return { expectedProjectRef, actualProjectRef };
};

const schemaPreflight = async (client) => {
  const checks = [
    ['organizations', 'id, name, type, contact_number, is_active'],
    ['users', 'id, email, password_hash, name, role, organization_id, must_change_password'],
    ['emergency_reports', 'id'], ['evidence_upload_sessions', 'id'], ['report_evidence', 'id']
  ];
  for (const [table, columns] of checks) {
    const { error } = await client.from(table).select(columns).limit(1);
    if (error) throw new Error(`Schema preflight failed for ${table}`);
  }
};

const conflictPreflight = async (client, input) => {
  const names = [input.rescueName.trim(), input.fireName.trim()];
  const emails = [normalizeEmail(input.rescueAdminEmail), normalizeEmail(input.fireAdminEmail)];
  const { data: organizations, error: organizationError } = await client.from('organizations').select('id, name').in('name', names);
  if (organizationError) throw new Error('Organization conflict preflight failed');
  if (organizations?.length) throw new Error('Organization conflict detected');
  const { data: users, error: userError } = await client.from('users').select('id, email').in('email', emails);
  if (userError) throw new Error('Admin conflict preflight failed');
  if (users?.length) throw new Error('Admin conflict detected');
};

const readPassword = (prompt, { stdin = process.stdin, stdout = process.stdout } = {}) => new Promise((resolve, reject) => {
  if (
    !stdin.isTTY
    || !stdout.isTTY
    || typeof stdin.setRawMode !== 'function'
    || typeof stdin.isRaw !== 'boolean'
    || typeof stdin.isPaused !== 'function'
    || typeof stdin.pause !== 'function'
    || typeof stdout.write !== 'function'
  ) {
    reject(new Error('Secure password input requires an interactive TTY'));
    return;
  }

  const originalRawMode = stdin.isRaw;
  const wasPaused = typeof stdin.isPaused === 'function' ? stdin.isPaused() : false;
  let value = '';
  let settled = false;

  const cleanup = () => {
    let cleanupError;
    for (const [event, listener] of [['data', onData], ['error', onError], ['end', onEnd], ['close', onClose]]) {
      try {
        stdin.removeListener(event, listener);
      } catch (error) {
        cleanupError ||= error;
      }
    }
    try {
      if (stdin.isRaw !== originalRawMode) stdin.setRawMode(originalRawMode);
    } finally {
      if (wasPaused && typeof stdin.pause === 'function' && !stdin.isPaused()) stdin.pause();
    }
    if (cleanupError) throw cleanupError;
  };

  const finish = (error, result) => {
    if (settled) return;
    settled = true;
    try {
      cleanup();
    } catch {
      reject(new Error('Unable to restore terminal state'));
      return;
    }
    if (error) reject(error);
    else resolve(result);
  };

  const onData = (chunk) => {
    try {
      for (const character of chunk.toString()) {
        if (character === '\n' || character === '\r' || character === '\u0004') {
          stdout.write('\n');
          finish(null, value);
          return;
        }
        if (character === '\u0003') {
          finish(new Error('Password input cancelled'));
          return;
        }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else value += character;
      }
    } catch {
      finish(new Error('Secure password input failed'));
    }
  };
  const onError = () => finish(new Error('Secure password input failed'));
  const onEnd = () => finish(new Error('Password input ended before completion'));
  const onClose = () => finish(new Error('Password input closed before completion'));

  try {
    stdin.on('data', onData);
    stdin.on('error', onError);
    stdin.on('end', onEnd);
    stdin.on('close', onClose);
    if (!originalRawMode) stdin.setRawMode(true);
    stdout.write(prompt);
  } catch {
    finish(new Error('Secure password input failed'));
  }
});

const collectInput = async (env) => {
  const input = {
    rescueName: required(env, 'DB_BOOTSTRAP_RESCUE_NAME'), rescueContactNumber: required(env, 'DB_BOOTSTRAP_RESCUE_CONTACT_NUMBER'),
    fireName: required(env, 'DB_BOOTSTRAP_FIRE_NAME'), fireContactNumber: required(env, 'DB_BOOTSTRAP_FIRE_CONTACT_NUMBER'),
    rescueAdminEmail: normalizeEmail(required(env, 'DB_BOOTSTRAP_RESCUE_ADMIN_EMAIL')), rescueAdminName: required(env, 'DB_BOOTSTRAP_RESCUE_ADMIN_NAME'),
    fireAdminEmail: normalizeEmail(required(env, 'DB_BOOTSTRAP_FIRE_ADMIN_EMAIL')), fireAdminName: required(env, 'DB_BOOTSTRAP_FIRE_ADMIN_NAME')
  };
  input.rescueAdminPassword = await readPassword('Rescue admin password: ');
  input.fireAdminPassword = await readPassword('Fire admin password: ');
  return input;
};

const bootstrap = async ({ env = process.env, client, input, hash = bcrypt.hash } = {}) => {
  const target = assertConfiguration(env);
  const supabase = client || createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const values = input || await collectInput(env);
  validateInputs(values);
  await schemaPreflight(supabase);
  await conflictPreflight(supabase, values);
  const [rescueHash, fireHash] = await Promise.all([hash(values.rescueAdminPassword, 12), hash(values.fireAdminPassword, 12)]);
  const { error } = await supabase.rpc('bootstrap_pilot_atomic', {
    p_rescue_name: values.rescueName.trim(), p_rescue_contact_number: values.rescueContactNumber.trim(),
    p_fire_name: values.fireName.trim(), p_fire_contact_number: values.fireContactNumber.trim(),
    p_rescue_admin_email: normalizeEmail(values.rescueAdminEmail), p_rescue_admin_name: values.rescueAdminName.trim(), p_rescue_admin_password_hash: rescueHash,
    p_fire_admin_email: normalizeEmail(values.fireAdminEmail), p_fire_admin_name: values.fireAdminName.trim(), p_fire_admin_password_hash: fireHash
  });
  if (error) throw new Error('Atomic pilot bootstrap failed');
  return { target: target.actualProjectRef, records: ['rescue organization', 'fire organization', 'rescue admin user', 'fire admin user'] };
};

if (require.main === module) {
  bootstrap().then((result) => console.log(`Bootstrap completed for ${result.target}: four records created.`)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { EXPECTED_TARGET, projectRefFromUrl, normalizeProjectRef, validateInputs, assertConfiguration, schemaPreflight, conflictPreflight, readPassword, bootstrap };