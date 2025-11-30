#!/usr/bin/env node
/**
 * Анализ скрытых компаний без email (прошли Stage 3, но email не найден)
 * 
 * Этот скрипт находит компании которые:
 * - Имеют сайт
 * - Не имеют email
 * - Уже прошли Stage 3 (stage3_status = 'completed' или 'failed')
 * - НЕ видны в очереди на главной странице
 * 
 * Usage:
 *   node scripts/analyze-hidden-companies-without-email.js
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
  console.log('  🔍 Анализ скрытых компаний без email');
  console.log('═══════════════════════════════════════════════════════\n');
  
  // 1. Все компании с сайтом, но без email
  const { data: allWithoutEmail, error: allError } = await supabase
    .from('pending_companies')
    .select('company_id, company_name, website, stage3_status, current_stage')
    .not('website', 'is', null)
    .or('email.is.null,email.eq.');
  
  if (allError) {
    console.error('❌ Ошибка:', allError.message);
    process.exit(1);
  }
  
  console.log(`📊 ВСЕГО компаний с сайтом, но без email: ${allWithoutEmail.length}\n`);
  
  // 2. Разбивка по stage3_status
  const statusCounts = {};
  allWithoutEmail.forEach(c => {
    const status = c.stage3_status || 'NULL';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });
  
  console.log('📈 Разбивка по stage3_status:');
  Object.keys(statusCounts).sort().forEach(status => {
    console.log(`   ${status}: ${statusCounts[status]} компаний`);
  });
  console.log('');
  
  // 3. СКРЫТЫЕ компании (прошли Stage 3, но email не найден)
  const hidden = allWithoutEmail.filter(c => 
    c.stage3_status === 'completed' || c.stage3_status === 'failed'
  );
  
  console.log(`🔒 СКРЫТЫЕ компании (прошли Stage 3, email не найден): ${hidden.length}`);
  
  const hiddenByStatus = {};
  hidden.forEach(c => {
    hiddenByStatus[c.stage3_status] = (hiddenByStatus[c.stage3_status] || 0) + 1;
  });
  
  Object.keys(hiddenByStatus).forEach(status => {
    console.log(`   stage3_status = '${status}': ${hiddenByStatus[status]} компаний`);
  });
  console.log('');
  
  // 4. ВИДИМЫЕ компании (готовы для Stage 3)
  const visible = allWithoutEmail.filter(c => 
    c.stage3_status === null && c.current_stage >= 2
  );
  
  console.log(`✅ ВИДИМЫЕ компании (готовы для Stage 3): ${visible.length}\n`);
  
  // 5. Примеры скрытых компаний
  if (hidden.length > 0) {
    console.log('📋 Примеры СКРЫТЫХ компаний (первые 15):');
    hidden.slice(0, 15).forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.company_name}`);
      console.log(`      Website: ${c.website}`);
      console.log(`      stage3_status: ${c.stage3_status}`);
      console.log(`      current_stage: ${c.current_stage}`);
    });
    
    if (hidden.length > 15) {
      console.log(`   ... и еще ${hidden.length - 15} компаний`);
    }
    console.log('');
  }
  
  // 6. Анализ по current_stage
  const stageDistribution = {};
  allWithoutEmail.forEach(c => {
    stageDistribution[c.current_stage] = (stageDistribution[c.current_stage] || 0) + 1;
  });
  
  console.log('📊 Распределение по current_stage:');
  Object.keys(stageDistribution).sort().forEach(stage => {
    console.log(`   Stage ${stage}: ${stageDistribution[stage]} компаний`);
  });
  console.log('');
  
  // 7. Итоговая сводка
  console.log('═══════════════════════════════════════════════════════');
  console.log('  📊 ИТОГОВАЯ СВОДКА');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Всего компаний с сайтом, но без email: ${allWithoutEmail.length}`);
  console.log(``);
  console.log(`  ✅ ВИДИМЫЕ (в очереди Stage 3): ${visible.length}`);
  console.log(`     - stage3_status = NULL`);
  console.log(`     - current_stage >= 2`);
  console.log(`     - Показываются на главной странице`);
  console.log(``);
  console.log(`  🔒 СКРЫТЫЕ (прошли Stage 3, email не найден): ${hidden.length}`);
  console.log(`     - stage3_status = 'completed' или 'failed'`);
  console.log(`     - НЕ показываются на главной странице`);
  console.log(`     - Можно вернуть в очередь скриптом reset-stage3`);
  console.log(``);
  console.log(`  Процент скрытых: ${((hidden.length / allWithoutEmail.length) * 100).toFixed(1)}%`);
  console.log('═══════════════════════════════════════════════════════\n');
  
  // 8. Рекомендации
  if (hidden.length > 0) {
    console.log('💡 РЕКОМЕНДАЦИИ:\n');
    console.log(`   Для возврата ${hidden.length} скрытых компаний в очередь Stage 3:`);
    console.log('   node scripts/reset-stage3-for-companies-without-email.js\n');
    console.log('   Это сбросит stage3_status в NULL и компании появятся в очереди.');
    console.log('');
  }
}

main().catch(console.error);

