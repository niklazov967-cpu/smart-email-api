#!/usr/bin/env node
/**
 * Сброс параметров Stage 3 для компаний без email
 * 
 * Этот скрипт находит все компании с сайтом, но без email и выставляет им параметры,
 * чтобы они попали в очередь на поиск email (Stage 3).
 * 
 * Условия:
 * - website IS NOT NULL (есть сайт)
 * - email IS NULL или пустой (нет email)
 * - stage3_status будет сброшен в NULL (чтобы Stage 3 их обработал)
 * - current_stage >= 2 (чтобы Stage 2 был завершен)
 * 
 * Usage:
 *   node scripts/reset-stage3-for-companies-without-email.js [--dry-run]
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

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🔄 Сброс Stage 3 для компаний без email');
  console.log('═══════════════════════════════════════════════════════');
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - изменения НЕ будут применены\n');
  }
  
  // Найти все компании с сайтом, но без email
  console.log('\n🔍 Поиск компаний с сайтом, но без email...\n');
  
  const { data: companies, error: fetchError } = await supabase
    .from('pending_companies')
    .select('company_id, company_name, website, email, stage3_status, current_stage, stage2_status')
    .not('website', 'is', null)  // Есть сайт
    .or('email.is.null,email.eq.')  // Нет email
    .gte('current_stage', 1); // Минимум Stage 1 завершен
  
  if (fetchError) {
    console.error('❌ Ошибка при получении компаний:', fetchError.message);
    process.exit(1);
  }
  
  console.log(`📊 Найдено компаний с сайтом, но без email: ${companies.length}\n`);
  
  if (companies.length === 0) {
    console.log('✅ Все компании с сайтом уже имеют email!\n');
    return;
  }
  
  // Статистика по текущим статусам
  const statusCounts = {};
  const stage2StatusCounts = {};
  const currentStageCounts = {};
  
  companies.forEach(c => {
    const status = c.stage3_status || 'NULL';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    
    const stage2Status = c.stage2_status || 'NULL';
    stage2StatusCounts[stage2Status] = (stage2StatusCounts[stage2Status] || 0) + 1;
    
    const currentStage = c.current_stage;
    currentStageCounts[currentStage] = (currentStageCounts[currentStage] || 0) + 1;
  });
  
  console.log('📈 Текущие статусы Stage 3:');
  Object.keys(statusCounts).forEach(status => {
    console.log(`   ${status}: ${statusCounts[status]} компаний`);
  });
  console.log('');
  
  console.log('📈 Текущие статусы Stage 2:');
  Object.keys(stage2StatusCounts).forEach(status => {
    console.log(`   ${status}: ${stage2StatusCounts[status]} компаний`);
  });
  console.log('');
  
  console.log('📈 Текущие этапы обработки:');
  Object.keys(currentStageCounts).sort().forEach(stage => {
    console.log(`   Stage ${stage}: ${currentStageCounts[stage]} компаний`);
  });
  console.log('');
  
  // Показать примеры
  console.log('📋 Примеры компаний (первые 10):');
  companies.slice(0, 10).forEach((c, i) => {
    console.log(`   ${i + 1}. ${c.company_name}`);
    console.log(`      Website: ${c.website || 'N/A'}`);
    console.log(`      stage2_status: ${c.stage2_status || 'NULL'}`);
    console.log(`      stage3_status: ${c.stage3_status || 'NULL'} → NULL`);
    console.log(`      current_stage: ${c.current_stage} → 2`);
  });
  
  if (companies.length > 10) {
    console.log(`   ... и еще ${companies.length - 10} компаний\n`);
  }
  
  // Обновить все компании
  if (!DRY_RUN) {
    console.log('\n🔄 Обновление записей...\n');
    
    const companyIds = companies.map(c => c.company_id);
    
    const { data: updated, error: updateError } = await supabase
      .from('pending_companies')
      .update({
        stage3_status: null,         // Сбросить статус Stage 3
        current_stage: 2,             // Готов для Stage 3 (Stage 2 завершен)
        contacts_json: null,          // Очистить старые контакты
        stage3_raw_data: null,        // Очистить старые данные
        updated_at: new Date().toISOString()
      })
      .in('company_id', companyIds)
      .select();
    
    if (updateError) {
      console.error('❌ Ошибка при обновлении:', updateError.message);
      process.exit(1);
    }
    
    console.log(`✅ Обновлено записей: ${updated?.length || 0}`);
  }
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  📊 ИТОГОВАЯ СТАТИСТИКА');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Компаний с сайтом, но без email: ${companies.length}`);
  console.log(`  Будут добавлены в очередь Stage 3: ${companies.length}`);
  console.log(`  Параметры:`);
  console.log(`    - stage3_status: NULL (готов для обработки)`);
  console.log(`    - current_stage: 2 (Stage 2 завершен, готов для Stage 3)`);
  console.log(`    - contacts_json: NULL (очищены старые контакты)`);
  console.log(`    - stage3_raw_data: NULL (очищены старые данные)`);
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN - для реального выполнения запустите без --dry-run');
  } else {
    console.log('\n✅ Изменения применены! Компании готовы для Stage 3.');
  }
  
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(console.error);

