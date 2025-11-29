/**
 * Clear Database Script
 * Clears all data from Supabase tables
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

async function clearDatabase() {
  console.log('\n🧹 Очистка базы данных...\n');
  
  // Очистка компаний
  console.log('   Очистка pending_companies...');
  await supabase.from('pending_companies').delete().gte('company_id', '00000000-0000-0000-0000-000000000000');
  console.log('   ✅ pending_companies очищена');
  
  console.log('   Очистка pending_companies_ru...');
  await supabase.from('pending_companies_ru').delete().gte('id', 0);
  console.log('   ✅ pending_companies_ru очищена');
  
  // Очистка сессий
  console.log('   Очистка search_sessions...');
  await supabase.from('search_sessions').delete().gte('session_id', '00000000-0000-0000-0000-000000000000');
  console.log('   ✅ search_sessions очищена');
  
  console.log('   Очистка session_queries...');
  await supabase.from('session_queries').delete().gte('query_id', '00000000-0000-0000-0000-000000000000');
  console.log('   ✅ session_queries очищена');
  
  // Очистка кэша и логов
  console.log('   Очистка perplexity_cache...');
  await supabase.from('perplexity_cache').delete().gte('cache_id', '00000000-0000-0000-0000-000000000000');
  console.log('   ✅ perplexity_cache очищена');
  
  console.log('   Очистка sonar_api_calls...');
  await supabase.from('sonar_api_calls').delete().gte('call_id', '00000000-0000-0000-0000-000000000000');
  console.log('   ✅ sonar_api_calls очищена');
  
  // Проверка
  console.log('\n📊 Проверка очистки:\n');
  const tables = ['pending_companies', 'pending_companies_ru', 'search_sessions', 'session_queries', 'perplexity_cache', 'sonar_api_calls'];
  
  for (const table of tables) {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    console.log(`   ${table}: ${count} записей`);
  }
  
  console.log('\n✅ База данных полностью очищена!\n');
}

clearDatabase().catch(console.error);
