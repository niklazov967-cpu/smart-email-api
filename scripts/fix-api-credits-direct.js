require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixTable() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                   ║');
  console.log('║      🔧 FIXING api_credits_log TABLE                              ║');
  console.log('║                                                                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  console.log('📋 SQL to execute:\n');
  
  const sql = `
ALTER TABLE public.api_credits_log 
ADD COLUMN IF NOT EXISTS request_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS response_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS model_name TEXT;
`;

  console.log(sql);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('⚠️  Anon Key не имеет прав на ALTER TABLE.');
  console.log('📝 Выполните этот SQL в Supabase SQL Editor:\n');
  console.log('   https://ptbefsrvvcrjrfxxtogt.supabase.co\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

fixTable();
