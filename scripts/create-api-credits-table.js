/**
 * Create api_credits_log table via Supabase API
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTable() {
  console.log('\n🔧 Создание таблицы api_credits_log...\n');
  
  // SQL для создания таблицы
  const sql = `
    CREATE TABLE IF NOT EXISTS public.api_credits_log (
      log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID REFERENCES search_sessions(session_id),
      stage VARCHAR(50),
      timestamp TIMESTAMP DEFAULT NOW(),
      tokens_used INTEGER DEFAULT 0,
      cost_usd DECIMAL(10, 6) DEFAULT 0,
      api_provider VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_api_credits_session 
      ON api_credits_log(session_id);
      
    CREATE INDEX IF NOT EXISTS idx_api_credits_timestamp 
      ON api_credits_log(timestamp);
  `;
  
  try {
    // Используем rpc для выполнения SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      console.error('❌ Ошибка:', error.message);
      console.log('\n⚠️  Supabase Anon Key не имеет прав на создание таблиц.');
      console.log('Выполните SQL вручную в Supabase Dashboard:\n');
      console.log(sql);
      process.exit(1);
    }
    
    console.log('✅ Таблица api_credits_log создана!\n');
    
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
    console.log('\n⚠️  Необходимо выполнить SQL вручную в Supabase Dashboard:');
    console.log('\n' + sql + '\n');
    process.exit(1);
  }
}

createTable();

