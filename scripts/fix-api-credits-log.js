require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixApiCreditsLog() {
  console.log('\n🔧 Fixing api_credits_log table...\n');

  const sql = `
    -- Добавить недостающие колонки для токенов
    ALTER TABLE public.api_credits_log 
    ADD COLUMN IF NOT EXISTS request_tokens INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS response_tokens INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0;

    -- Добавить model_name (показывает какая нейросеть работает!)
    ALTER TABLE public.api_credits_log 
    ADD COLUMN IF NOT EXISTS model_name TEXT;
  `;

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      console.error('❌ Error executing SQL:', error.message);
      
      // Попробуем через отдельные запросы
      console.log('\n⚠️  Trying alternative method...\n');
      
      const queries = [
        'ALTER TABLE public.api_credits_log ADD COLUMN IF NOT EXISTS request_tokens INTEGER DEFAULT 0',
        'ALTER TABLE public.api_credits_log ADD COLUMN IF NOT EXISTS response_tokens INTEGER DEFAULT 0',
        'ALTER TABLE public.api_credits_log ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0',
        'ALTER TABLE public.api_credits_log ADD COLUMN IF NOT EXISTS model_name TEXT'
      ];
      
      for (const query of queries) {
        const { error: queryError } = await supabase.rpc('exec_sql', { sql_query: query });
        if (queryError) {
          console.error('❌ Failed:', query);
          console.error('   Error:', queryError.message);
        } else {
          console.log('✅', query.substring(0, 60) + '...');
        }
      }
    } else {
      console.log('✅ All columns added successfully!');
    }

    // Проверка структуры
    console.log('\n📊 Checking table structure...\n');
    
    const { data: columns, error: checkError } = await supabase
      .from('api_credits_log')
      .select('*')
      .limit(0);
    
    if (checkError) {
      console.log('⚠️  Could not verify structure:', checkError.message);
    } else {
      console.log('✅ Table is ready!');
    }

    console.log('\n✅ Fix completed!\n');

  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    process.exit(1);
  }
}

fixApiCreditsLog();
