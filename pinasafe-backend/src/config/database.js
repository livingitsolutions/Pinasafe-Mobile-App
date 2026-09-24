const { createClient } = require('@supabase/supabase-js');

let supabase;

const JWT_SECRET_PLACEHOLDER = 'replace-with-a-strong-random-secret';

const validateConfiguration = () => {
  const requiredConfiguration = [
    ['SUPABASE_URL', process.env.SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY],
    ['JWT_SECRET', process.env.JWT_SECRET]
  ];

  for (const [name, value] of requiredConfiguration) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Missing required backend configuration: ${name}`);
    }
  }

  if (
    process.env.JWT_SECRET === JWT_SECRET_PLACEHOLDER
    || process.env.JWT_SECRET.length < 32
  ) {
    throw new Error('Invalid backend configuration: JWT_SECRET');
  }
};

async function connectDatabase() {
  try {
    validateConfiguration();

    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase.from('users').select('count').limit(1);
    if (error && error.code !== 'PGRST116') {
      console.warn('Supabase connection warning:', error.message);
    }

    console.log('✅ Supabase connection established successfully');
    return supabase;
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    throw error;
  }
}

function getClient() {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Call connectDatabase() first.');
  }
  return supabase;
}

async function executeQuery(query, params = []) {
  throw new Error('executeQuery is deprecated. Use Supabase client methods instead.');
}

async function executeQuerySingle(query, params = []) {
  throw new Error('executeQuerySingle is deprecated. Use Supabase client methods instead.');
}

async function executeInsert(query, params = []) {
  throw new Error('executeInsert is deprecated. Use Supabase client methods instead.');
}

module.exports = {
  connectDatabase,
  getClient,
  validateConfiguration,
  executeQuery,
  executeQuerySingle,
  executeInsert
};
