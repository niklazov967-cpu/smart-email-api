#!/usr/bin/env node
/**
 * Сброс параметров Stage 2 для компаний без сайта
 * 
 * Этот скрипт находит все компании без сайта и выставляет им параметры,
 * чтобы они попали в очередь на поиск сайта (Stage 2).
 * 
 * Условия:
 * - website IS NULL или пустой
 * - stage2_status будет сброшен в NULL (чтобы Stage 2 их обработал)
 * - current_stage >= 1 (чтобы Stage 1 был завершен)
 * 
 * Usage:
 *   node scripts/reset-stage2-for-companies-without-website.js [--dry-run]
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
  console.log('  🔄 Сброс Stage 2 для компаний без сайта');
  console.log('═══════════════════════════════════════════════════════');
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - изменения НЕ будут применены\n');
  }
  
  // Найти все компании без сайта
  console.log('\n🔍 Поиск компаний без сайта...\n');
  
  const { data: companies, error: fetchError } = await supabase
    .from('pending_companies')
    .select('company_id, company_name, website, stage2_status, current_stage')
    .or('website.is.null,website.eq.')
    .gte('current_stage', 1); // Только те у кого завершен Stage 1
  
  if (fetchError) {
    console.error('❌ Ошибка при получении компаний:', fetchError.message);
    process.exit(1);
  }
  
  console.log(`📊 Найдено компаний без сайта: ${companies.length}\n`);
  
  if (companies.length === 0) {
    console.log('✅ Все компании уже имеют сайты!\n');
    return;
  }
  
  // Статистика по текущим статусам
  const statusCounts = {};
  companies.forEach(c => {
    const status = c.stage2_status || 'NULL';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });
  
  console.log('📈 Текущие статусы Stage 2:');
  Object.keys(statusCounts).forEach(status => {
    console.log(`   ${status}: ${statusCounts[status]} компаний`);
  });
  console.log('');
  
  // Показать примеры
  console.log('📋 Примеры компаний (первые 10):');
  companies.slice(0, 10).forEach((c, i) => {
    console.log(`   ${i + 1}. ${c.company_name}`);
    console.log(`      stage2_status: ${c.stage2_status || 'NULL'} → NULL`);
    console.log(`      current_stage: ${c.current_stage} → 1`);
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
        stage2_status: null,        // Сбросить статус Stage 2
        current_stage: 1,            // Вернуть на Stage 1 (готов для Stage 2)
        website_status: null,        // Сбросить старый статус (если был)
        stage2_raw_data: null,       // Очистить старые данные
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
  console.log(`  Компаний без сайта: ${companies.length}`);
  console.log(`  Будут добавлены в очередь Stage 2: ${companies.length}`);
  console.log(`  Параметры:`);
  console.log(`    - stage2_status: NULL (готов для обработки)`);
  console.log(`    - current_stage: 1 (Stage 1 завершен)`);
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN - для реального выполнения запустите без --dry-run');
  } else {
    console.log('\n✅ Изменения применены! Компании готовы для Stage 2.');
  }
  
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(console.error);

