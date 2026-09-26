const { createClient } = require('@supabase/supabase-js');
const { isIP } = require('node:net');
const { parseCorsOrigins } = require('./cors');
const safeLogger = require('../utils/safeLogger');

let supabase;

const JWT_SECRET_PLACEHOLDER = 'replace-with-a-strong-random-secret';
const EVIDENCE_STORAGE_BUCKET_PLACEHOLDERS = new Set([
  'your-private-evidence-bucket',
  'replace-with-a-real-bucket-name',
  'example-bucket',
  'placeholder-bucket',
  'bucket-name'
]);

const getAIEndpointUrl = () => {
  const value = process.env.AI_ENDPOINT_URL;

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Missing required backend configuration: AI_ENDPOINT_URL');
  }

  let endpoint;
  try {
    endpoint = new URL(value);
  } catch (error) {
    throw new Error('Invalid backend configuration: AI_ENDPOINT_URL');
  }

  const hostname = endpoint.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    endpoint.protocol !== 'https:'
    || !hostname
    || endpoint.username
    || endpoint.password
    || endpoint.search
    || endpoint.hash
    || value.includes('?')
    || value.includes('#')
    || hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || isIP(hostname) !== 0
  ) {
    throw new Error('Invalid backend configuration: AI_ENDPOINT_URL');
  }

  return endpoint.href;
};

const getEvidenceStorageBucket = () => {
  const value = process.env.EVIDENCE_STORAGE_BUCKET;

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Missing required backend configuration: EVIDENCE_STORAGE_BUCKET');
  }

  const bucket = value.trim();
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(bucket)
    || EVIDENCE_STORAGE_BUCKET_PLACEHOLDERS.has(bucket.toLowerCase())
    || /^(your|replace|example|placeholder)[._-]/i.test(bucket)
  ) {
    throw new Error('Invalid backend configuration: EVIDENCE_STORAGE_BUCKET');
  }

  return bucket;
};

const validateConfiguration = () => {
  const requiredConfiguration = [
    ['SUPABASE_URL', process.env.SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY],
    ['JWT_SECRET', process.env.JWT_SECRET],
    ['EVIDENCE_STORAGE_BUCKET', process.env.EVIDENCE_STORAGE_BUCKET],
    ['AI_ENDPOINT_URL', process.env.AI_ENDPOINT_URL]
  ];

  for (const [name, value] of requiredConfiguration) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Missing required backend configuration: ${name}`);
    }
  }

  parseCorsOrigins(process.env.CORS_ORIGIN);
  getEvidenceStorageBucket();
  getAIEndpointUrl();

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
      safeLogger.warn('database.connection_warning');
    }

    console.log('✅ Supabase connection established successfully');
    return supabase;
  } catch (error) {
    safeLogger.error('database.connection_failed');
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
  getAIEndpointUrl,
  getEvidenceStorageBucket,
  parseCorsOrigins,
  validateConfiguration,
  executeQuery,
  executeQuerySingle,
  executeInsert
};
