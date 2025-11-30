#!/usr/bin/env node
/**
 * Проверка количества компаний в базе данных
 * 
 * Проверяет реальное количество компаний по различным критериям
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  📊 Проверка количества компаний в базе');
  console.log('═══════════════════════════════════════════════════════\n');
  
  // 1. ВСЕГО компаний
  const { data: allCompanies, error: allError } = await supabase
    .from('pending_companies')
    .select('company_id', { count: 'exact' });
  
  if (allError) {
    console.error('❌ Ошибка:', allError.message);
    process.exit(1);
  }
  
  console.log(`📊 ВСЕГО компаний в базе: ${allCompanies.length}\n`);
  
  // 2. Компании с email
  const { data: withEmail, error: emailError } = await supabase
    .from('pending_companies')
    .select('company_id', { count: 'exact' })
    .not('email', 'is', null)
    .neq('email', '');
  
  console.log(`📧 Компаний с email: ${withEmail?.length || 0}`);
  
  // 3. Компании с сайтом
  const { data: withWebsite, error: websiteError } = await supabase
    .from('pending_companies')
    .select('company_id', { count: 'exact' })
    .not('website', 'is', null)
    .neq('website', '');
  
  console.log(`🌐 Компаний с сайтом: ${withWebsite?.length || 0}`);
  
  // 4. Компании без email
  const { data: withoutEmail, error: noEmailError } = await supabase
    .from('pending_companies')
    .select('company_id', { count: 'exact' })
    .or('email.is.null,email.eq.');
  
  console.log(`❌ Компаний без email: ${withoutEmail?.length || 0}`);
  
  // 5. Компании без сайта
  const { data: withoutWebsite, error: noWebsiteError } = await supabase
    .from('pending_companies')
    .select('company_id', { count: 'exact' })
    .or('website.is.null,website.eq.');
  
  console.log(`❌ Компаний без сайта: ${withoutWebsite?.length || 0}\n`);
  
  // 6. По current_stage
  console.log('📈 По этапам обработки:');
  for (let stage = 1; stage <= 4; stage++) {
    const { data, error } = await supabase
      .from('pending_companies')
      .select('company_id', { count: 'exact' })
      .eq('current_stage', stage);
    
    console.log(`   Stage ${stage}: ${data?.length || 0} компаний`);
  }
  
  console.log('');
  
  // 7. По stage2_status
  console.log('📊 Stage 2 статусы:');
  const stage2Statuses = ['NULL', 'completed', 'failed', 'skipped'];
  for (const status of stage2Statuses) {
    const { data, error } = await supabase
      .from('pending_companies')
      .select('company_id', { count: 'exact' });
    
    let query = supabase.from('pending_companies').select('company_id', { count: 'exact' });
    if (status === 'NULL') {
      query = query.is('stage2_status', null);
    } else {
      query = query.eq('stage2_status', status);
    }
    
    const { data: result } = await query;
    console.log(`   ${status}: ${result?.length || 0} компаний`);
  }
  
  console.log('');
  
  // 8. По stage3_status
  console.log('📊 Stage 3 статусы:');
  const stage3Statuses = ['NULL', 'completed', 'failed', 'skipped'];
  for (const status of stage3Statuses) {
    let query = supabase.from('pending_companies').select('company_id', { count: 'exact' });
    if (status === 'NULL') {
      query = query.is('stage3_status', null);
    } else {
      query = query.eq('stage3_status', status);
    }
    
    const { data: result } = await query;
    console.log(`   ${status}: ${result?.length || 0} компаний`);
  }
  
  console.log('');
  
  // 9. По stage4_status
  console.log('📊 Stage 4 статусы:');
  const stage4Statuses = ['NULL', 'completed', 'failed'];
  for (const status of stage4Statuses) {
    let query = supabase.from('pending_companies').select('company_id', { count: 'exact' });
    if (status === 'NULL') {
      query = query.is('stage4_status', null);
    } else {
      query = query.eq('stage4_status', status);
    }
    
    const { data: result } = await query;
    console.log(`   ${status}: ${result?.length || 0} компаний`);
  }
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  📊 ИТОГОВАЯ СВОДКА');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Всего компаний: ${allCompanies.length}`);
  console.log(`  С email: ${withEmail?.length || 0} (${((withEmail?.length || 0) / allCompanies.length * 100).toFixed(1)}%)`);
  console.log(`  С сайтом: ${withWebsite?.length || 0} (${((withWebsite?.length || 0) / allCompanies.length * 100).toFixed(1)}%)`);
  console.log(`  Без email: ${withoutEmail?.length || 0} (${((withoutEmail?.length || 0) / allCompanies.length * 100).toFixed(1)}%)`);
  console.log(`  Без сайта: ${withoutWebsite?.length || 0} (${((withoutWebsite?.length || 0) / allCompanies.length * 100).toFixed(1)}%)`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(console.error);

