// const { createClient } = require('@supabase/supabase-js');

// let supabase;

// const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
// const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// async function connectDatabase() {
//   try {
//     if (!supabaseUrl || !supabaseKey) {
//       throw new Error('Missing Supabase credentials');
//     }

//     supabase = createClient(supabaseUrl, supabaseKey);

//     const { data, error } = await supabase.from('users').select('count').limit(1);
//     if (error && error.code !== 'PGRST116') {
//       console.warn('Supabase connection warning:', error.message);
//     }

//     console.log('✅ Supabase connection established successfully');
//     return supabase;
//   } catch (error) {
//     console.error('❌ Supabase connection failed:', error);
//     throw error;
//   }
// }

// function getClient() {
//   if (!supabase) {
//     throw new Error('Supabase client not initialized. Call connectDatabase() first.');
//   }
//   return supabase;
// }

// async function executeQuery(query, params = []) {
//   throw new Error('executeQuery is deprecated. Use Supabase client methods instead.');
// }

// async function executeQuerySingle(query, params = []) {
//   throw new Error('executeQuerySingle is deprecated. Use Supabase client methods instead.');
// }

// async function executeInsert(query, params = []) {
//   throw new Error('executeInsert is deprecated. Use Supabase client methods instead.');
// }

// module.exports = {
//   connectDatabase,
//   getClient,
//   executeQuery,
//   executeQuerySingle,
//   executeInsert
// };

const { createClient } = require('@supabase/supabase-js');

let supabase;

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function connectDatabase() {
  try {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }

    supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase.from('users').select('count').limit(1);
    if (error && error.code !== 'PGRST116') {
      console.warn('Supabase connection warning:', error.message);
    }

    console.log('✅ Supabase connection established successfully');
    return supabase;
  } catch (error) {
    console.error('❌ Supabase connection failed:', error);
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
  executeQuery,
  executeQuerySingle,
  executeInsert
};
