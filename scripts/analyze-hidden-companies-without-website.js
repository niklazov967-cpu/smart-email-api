#!/usr/bin/env node
/**
 * Анализ скрытых компаний без сайта (прошли Stage 2, но сайт не найден)
 * 
 * Этот скрипт находит компании которые:
 * - Не имеют сайт
 * - Уже прошли Stage 2 (stage2_status = 'completed' или 'failed')
 * - НЕ видны в очереди на главной странице
 * 
 * Usage:
 *   node scripts/analyze-hidden-companies-without-website.js
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
  console.log('  🔍 Анализ скрытых компаний без сайта');
  console.log('═══════════════════════════════════════════════════════\n');
  
  // 1. Все компании без сайта
  const { data: allWithoutWebsite, error: allError } = await supabase
    .from('pending_companies')
    .select('company_id, company_name, stage2_status, current_stage')
    .or('website.is.null,website.eq.')
    .gte('current_stage', 1);
  
  if (allError) {
    console.error('❌ Ошибка:', allError.message);
    process.exit(1);
  }
  
  console.log(`📊 ВСЕГО компаний без сайта: ${allWithoutWebsite.length}\n`);
  
  // 2. Разбивка по stage2_status
  const statusCounts = {};
  allWithoutWebsite.forEach(c => {
    const status = c.stage2_status || 'NULL';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });
  
  console.log('📈 Разбивка по stage2_status:');
  Object.keys(statusCounts).sort().forEach(status => {
    console.log(`   ${status}: ${statusCounts[status]} компаний`);
  });
  console.log('');
  
  // 3. СКРЫТЫЕ компании (прошли Stage 2, но сайт не найден)
  const hidden = allWithoutWebsite.filter(c => 
    c.stage2_status === 'completed' || c.stage2_status === 'failed'
  );
  
  console.log(`🔒 СКРЫТЫЕ компании (прошли Stage 2, сайт не найден): ${hidden.length}`);
  
  const hiddenByStatus = {};
  hidden.forEach(c => {
    hiddenByStatus[c.stage2_status] = (hiddenByStatus[c.stage2_status] || 0) + 1;
  });
  
  Object.keys(hiddenByStatus).forEach(status => {
    console.log(`   stage2_status = '${status}': ${hiddenByStatus[status]} компаний`);
  });
  console.log('');
  
  // 4. ВИДИМЫЕ компании (готовы для Stage 2)
  const visible = allWithoutWebsite.filter(c => 
    c.stage2_status === null && c.current_stage >= 1
  );
  
  console.log(`✅ ВИДИМЫЕ компании (готовы для Stage 2): ${visible.length}\n`);
  
  // 5. Примеры скрытых компаний
  if (hidden.length > 0) {
    console.log('📋 Примеры СКРЫТЫХ компаний (первые 15):');
    hidden.slice(0, 15).forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.company_name}`);
      console.log(`      stage2_status: ${c.stage2_status}`);
      console.log(`      current_stage: ${c.current_stage}`);
    });
    
    if (hidden.length > 15) {
      console.log(`   ... и еще ${hidden.length - 15} компаний`);
    }
    console.log('');
  }
  
  // 6. Анализ по current_stage
  const stageDistribution = {};
  allWithoutWebsite.forEach(c => {
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
  console.log(`  Всего компаний без сайта: ${allWithoutWebsite.length}`);
  console.log(``);
  console.log(`  ✅ ВИДИМЫЕ (в очереди Stage 2): ${visible.length}`);
  console.log(`     - stage2_status = NULL`);
  console.log(`     - current_stage >= 1`);
  console.log(`     - Показываются на главной странице`);
  console.log(``);
  console.log(`  🔒 СКРЫТЫЕ (прошли Stage 2, сайт не найден): ${hidden.length}`);
  console.log(`     - stage2_status = 'completed' или 'failed'`);
  console.log(`     - НЕ показываются на главной странице`);
  console.log(`     - Можно вернуть в очередь скриптом reset-stage2`);
  console.log(``);
  console.log(`  Процент скрытых: ${allWithoutWebsite.length > 0 ? ((hidden.length / allWithoutWebsite.length) * 100).toFixed(1) : 0}%`);
  console.log('═══════════════════════════════════════════════════════\n');
  
  // 8. Рекомендации
  if (hidden.length > 0) {
    console.log('💡 РЕКОМЕНДАЦИИ:\n');
    console.log(`   Для возврата ${hidden.length} скрытых компаний в очередь Stage 2:`);
    console.log('   node scripts/reset-stage2-for-companies-without-website.js\n');
    console.log('   Это сбросит stage2_status в NULL и компании появятся в очереди.');
    console.log('');
  }
}

main().catch(console.error);

