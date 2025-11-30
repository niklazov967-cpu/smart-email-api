#!/usr/bin/env node

/**
 * DEDUPLICATION SCRIPT for pending_companies
 * 
 * Удаляет дубликаты компаний по домену сайта
 * Безопасно с DRY RUN режимом
 * 
 * Usage:
 *   node scripts/deduplicate-pending-companies.js --dry-run  # Только просмотр
 *   node scripts/deduplicate-pending-companies.js --execute  # Реальное удаление
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Настройки
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// Проверка переменных окружения
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ ERROR: Missing environment variables');
  console.error('   Set SUPABASE_URL and SUPABASE_ANON_KEY in .env file');
  process.exit(1);
}

// Инициализация Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Извлечь чистый домен из URL
 */
function extractCleanDomain(url) {
  if (!url) return null;
  
  try {
    // Убрать протокол
    let domain = url.replace(/^https?:\/\//, '');
    
    // Убрать www.
    domain = domain.replace(/^www\./, '');
    
    // Убрать путь и параметры
    domain = domain.split('/')[0].split('?')[0].split('#')[0];
    
    // Убрать порт
    domain = domain.split(':')[0];
    
    return domain.toLowerCase();
  } catch (error) {
    console.error(`Error extracting domain from ${url}:`, error.message);
    return null;
  }
}

/**
 * Шаг 1: Анализ дубликатов
 */
async function analyzeDuplicates() {
  console.log('\n📊 ШАГ 1: Анализ дубликатов\n');
  console.log('─'.repeat(80));
  
  // Получить все компании с сайтами
  const { data: companies, error } = await supabase
    .from('pending_companies')
    .select('company_id, company_name, website, email, created_at, stage')
    .not('website', 'is', null)
    .not('website', 'eq', '');
  
  if (error) {
    console.error('❌ Error fetching companies:', error.message);
    return null;
  }
  
  console.log(`✅ Загружено компаний: ${companies.length}`);
  
  // Группировать по домену
  const domainGroups = new Map();
  
  companies.forEach(company => {
    const domain = extractCleanDomain(company.website);
    if (!domain) return;
    
    if (!domainGroups.has(domain)) {
      domainGroups.set(domain, []);
    }
    domainGroups.get(domain).push(company);
  });
  
  // Найти дубликаты
  const duplicates = [];
  domainGroups.forEach((group, domain) => {
    if (group.length > 1) {
      duplicates.push({
        domain,
        count: group.length,
        companies: group.sort((a, b) => 
          new Date(a.created_at) - new Date(b.created_at)
        )
      });
    }
  });
  
  console.log(`\n🔍 Найдено уникальных доменов: ${domainGroups.size}`);
  console.log(`⚠️  Найдено доменов с дубликатами: ${duplicates.length}`);
  
  if (duplicates.length === 0) {
    console.log('\n✅ Дубликатов не найдено! База чистая.');
    return null;
  }
  
  // Сортировать по количеству дубликатов
  duplicates.sort((a, b) => b.count - a.count);
  
  // Показать топ-10 дубликатов
  console.log('\n📋 ТОП-10 доменов с дубликатами:\n');
  console.log('─'.repeat(80));
  
  duplicates.slice(0, 10).forEach((dup, index) => {
    console.log(`\n${index + 1}. ${dup.domain} (${dup.count} дубликата)`);
    dup.companies.forEach((company, idx) => {
      const action = idx === 0 ? '✅ KEEP' : '❌ DELETE';
      console.log(`   ${action} - ${company.company_name}`);
      console.log(`      URL: ${company.website}`);
      console.log(`      Email: ${company.email || 'нет'}`);
      console.log(`      Created: ${new Date(company.created_at).toLocaleString()}`);
    });
  });
  
  // Подсчет статистики
  let totalToDelete = 0;
  duplicates.forEach(dup => {
    totalToDelete += dup.count - 1; // Оставляем 1, удаляем остальные
  });
  
  console.log('\n─'.repeat(80));
  console.log('\n📊 СТАТИСТИКА:\n');
  console.log(`   Всего компаний в БД: ${companies.length}`);
  console.log(`   Доменов с дубликатами: ${duplicates.length}`);
  console.log(`   Всего дубликатов: ${totalToDelete}`);
  console.log(`   После очистки останется: ${companies.length - totalToDelete}`);
  
  return {
    companies,
    duplicates,
    totalToDelete
  };
}

/**
 * Шаг 2: Удаление дубликатов
 */
async function deleteDuplicates(analysis) {
  if (!analysis || analysis.totalToDelete === 0) {
    console.log('\n✅ Нечего удалять');
    return;
  }
  
  console.log('\n🗑️  ШАГ 2: Удаление дубликатов\n');
  console.log('─'.repeat(80));
  
  // Собрать ID для удаления
  const idsToDelete = [];
  
  analysis.duplicates.forEach(dup => {
    // Оставляем первую компанию (самую старую), удаляем остальные
    dup.companies.slice(1).forEach(company => {
      idsToDelete.push(company.company_id);
    });
  });
  
  console.log(`\n⚠️  Будет удалено записей: ${idsToDelete.length}`);
  
  // Удаление порциями по 100
  const batchSize = 100;
  let deleted = 0;
  
  for (let i = 0; i < idsToDelete.length; i += batchSize) {
    const batch = idsToDelete.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from('pending_companies')
      .delete()
      .in('company_id', batch);
    
    if (error) {
      console.error(`❌ Error deleting batch ${i / batchSize + 1}:`, error.message);
      continue;
    }
    
    deleted += batch.length;
    console.log(`   ✅ Удалено ${deleted}/${idsToDelete.length} записей`);
  }
  
  console.log(`\n✅ УДАЛЕНИЕ ЗАВЕРШЕНО: ${deleted} записей удалено`);
  
  return deleted;
}

/**
 * Шаг 3: Проверка после удаления
 */
async function verifyDeduplication() {
  console.log('\n✅ ШАГ 3: Проверка результата\n');
  console.log('─'.repeat(80));
  
  const { data: companies, error } = await supabase
    .from('pending_companies')
    .select('company_id, website')
    .not('website', 'is', null)
    .not('website', 'eq', '');
  
  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }
  
  // Проверить дубликаты
  const domains = new Map();
  companies.forEach(company => {
    const domain = extractCleanDomain(company.website);
    if (!domain) return;
    
    if (!domains.has(domain)) {
      domains.set(domain, 0);
    }
    domains.set(domain, domains.get(domain) + 1);
  });
  
  const duplicatesCount = Array.from(domains.values()).filter(count => count > 1).length;
  
  console.log(`\n📊 Всего компаний: ${companies.length}`);
  console.log(`📊 Уникальных доменов: ${domains.size}`);
  console.log(`📊 Дубликатов: ${duplicatesCount}`);
  
  if (duplicatesCount === 0) {
    console.log('\n✅ УСПЕХ! Дубликатов не обнаружено. База чистая.');
  } else {
    console.log(`\n⚠️  ВНИМАНИЕ! Все еще есть ${duplicatesCount} дубликатов`);
    console.log('   Запустите скрипт еще раз');
  }
}

/**
 * Главная функция
 */
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run') || !args.includes('--execute');
  
  console.log('\n' + '═'.repeat(80));
  console.log('🔄 ДЕДУПЛИКАЦИЯ pending_companies');
  console.log('═'.repeat(80));
  
  if (isDryRun) {
    console.log('\n🛡️  РЕЖИМ: DRY RUN (только просмотр, без удаления)');
    console.log('   Для реального удаления: node scripts/deduplicate-pending-companies.js --execute');
  } else {
    console.log('\n⚠️  РЕЖИМ: EXECUTE (реальное удаление!)');
    console.log('   Это удалит дубликаты из базы данных НАВСЕГДА');
    
    // Подтверждение
    console.log('\n❓ Продолжить? (нажмите Ctrl+C для отмены)');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  try {
    // Шаг 1: Анализ
    const analysis = await analyzeDuplicates();
    
    if (!analysis) {
      console.log('\n✅ Завершено. Дубликатов нет.');
      process.exit(0);
    }
    
    if (isDryRun) {
      console.log('\n🛡️  DRY RUN завершен. Данные НЕ были изменены.');
      console.log('   Для реального удаления запустите с флагом --execute');
      process.exit(0);
    }
    
    // Шаг 2: Удаление
    await deleteDuplicates(analysis);
    
    // Шаг 3: Проверка
    await verifyDeduplication();
    
    console.log('\n' + '═'.repeat(80));
    console.log('✅ ДЕДУПЛИКАЦИЯ ЗАВЕРШЕНА УСПЕШНО');
    console.log('═'.repeat(80) + '\n');
    
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Запуск
main();

