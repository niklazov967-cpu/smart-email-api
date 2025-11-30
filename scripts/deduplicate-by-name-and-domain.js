#!/usr/bin/env node
/**
 * Дедупликация pending_companies по company_name и normalized_domain
 * 
 * Стратегия:
 * 1. Найти дубликаты по company_name
 * 2. Для каждой группы дубликатов:
 *    - Выбрать "лучшую" запись (с email > без email, с website > без website, старше по created_at)
 *    - Объединить данные (merge emails, websites если отличаются)
 *    - Удалить остальные записи
 * 
 * Usage:
 *   node scripts/deduplicate-by-name-and-domain.js [--dry-run]
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

function extractMainDomain(url) {
  if (!url) return null;
  try {
    const match = url.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i);
    return match ? match[1].toLowerCase().replace(/\.$/, '') : null;
  } catch (e) {
    return null;
  }
}

function scoreCompany(company) {
  let score = 0;
  
  // Email важнее всего
  if (company.email && company.email.trim() !== '') score += 100;
  
  // Website важен
  if (company.website && company.website.trim() !== '') score += 50;
  
  // normalized_domain заполнен
  if (company.normalized_domain) score += 30;
  
  // Описание есть
  if (company.description && company.description.length > 50) score += 10;
  
  // Validation score (если есть)
  if (company.validation_score) score += company.validation_score;
  
  // Старше = лучше (первая найденная компания)
  const ageBonus = -Math.floor((Date.now() - new Date(company.created_at).getTime()) / (1000 * 60 * 60 * 24)); // Отрицательные дни
  score += ageBonus * 0.1;
  
  return score;
}

async function findDuplicatesByName() {
  console.log('\n🔍 Поиск дубликатов по company_name...\n');
  
  // Получить все компании
  const { data: allCompanies, error } = await supabase
    .from('pending_companies')
    .select('company_name, company_id');
  
  if (error) {
    console.error('❌ Ошибка при получении компаний:', error.message);
    return [];
  }
  
  // Посчитать дубликаты в JavaScript
  const nameCount = {};
  for (const company of allCompanies) {
    const name = company.company_name;
    nameCount[name] = (nameCount[name] || 0) + 1;
  }
  
  // Найти имена с дубликатами
  const duplicateNames = Object.keys(nameCount).filter(name => nameCount[name] > 1);
  
  const result = duplicateNames.map(name => ({
    company_name: name,
    count: nameCount[name]
  }));
  
  console.log(`📊 Найдено ${result.length} групп дубликатов\n`);
  return result;
}

async function getCompaniesForName(companyName) {
  const { data, error } = await supabase
    .from('pending_companies')
    .select('*')
    .eq('company_name', companyName)
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error(`❌ Ошибка при получении компаний для "${companyName}":`, error.message);
    return [];
  }
  
  return data;
}

async function deduplicateGroup(companies) {
  if (companies.length <= 1) return { kept: 0, removed: 0 };
  
  const companyName = companies[0].company_name;
  console.log(`\n📦 Обработка группы: ${companyName} (${companies.length} записей)`);
  
  // Рассчитать score для каждой компании
  const scored = companies.map(c => ({
    ...c,
    score: scoreCompany(c)
  }));
  
  // Отсортировать по score (лучшая первой)
  scored.sort((a, b) => b.score - a.score);
  
  const best = scored[0];
  const toRemove = scored.slice(1);
  
  console.log(`   ✅ Лучшая запись: ID=${best.company_id}, Score=${best.score.toFixed(1)}`);
  console.log(`      Email: ${best.email || 'N/A'}`);
  console.log(`      Website: ${best.website || 'N/A'}`);
  console.log(`      Domain: ${best.normalized_domain || 'N/A'}`);
  
  // Проверить нужно ли обновить "лучшую" запись данными из дубликатов
  let needsUpdate = false;
  const updates = {};
  
  for (const dup of toRemove) {
    // Если у дубликата есть email, а у best нет - взять email
    if (dup.email && !best.email) {
      updates.email = dup.email;
      needsUpdate = true;
      console.log(`      📧 Добавлен email из дубликата: ${dup.email}`);
    }
    
    // Если у дубликата есть website, а у best нет - взять website
    if (dup.website && !best.website) {
      updates.website = dup.website;
      needsUpdate = true;
      console.log(`      🌐 Добавлен website из дубликата: ${dup.website}`);
    }
    
    // Если у дубликата есть normalized_domain, а у best нет - взять его
    if (dup.normalized_domain && !best.normalized_domain) {
      updates.normalized_domain = dup.normalized_domain;
      needsUpdate = true;
      console.log(`      🔗 Добавлен normalized_domain из дубликата: ${dup.normalized_domain}`);
    }
  }
  
  // Обновить лучшую запись если нужно
  if (needsUpdate && !DRY_RUN) {
    const { error: updateError } = await supabase
      .from('pending_companies')
      .update(updates)
      .eq('company_id', best.company_id);
    
    if (updateError) {
      console.error(`   ❌ Ошибка при обновлении записи ${best.company_id}:`, updateError.message);
    } else {
      console.log(`   ✅ Запись ${best.company_id} обновлена`);
    }
  }
  
  // Удалить дубликаты
  const idsToRemove = toRemove.map(c => c.company_id);
  console.log(`   🗑️  Удаление ${idsToRemove.length} дубликатов: ${idsToRemove.join(', ')}`);
  
  if (!DRY_RUN) {
    const { error: deleteError } = await supabase
      .from('pending_companies')
      .delete()
      .in('company_id', idsToRemove);
    
    if (deleteError) {
      console.error(`   ❌ Ошибка при удалении дубликатов:`, deleteError.message);
      return { kept: 0, removed: 0 };
    }
  }
  
  return { kept: 1, removed: idsToRemove.length };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🔄 Дедупликация pending_companies');
  console.log('═══════════════════════════════════════════════════════');
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - изменения НЕ будут применены\n');
  }
  
  // Найти группы дубликатов
  const duplicateGroups = await findDuplicatesByName();
  
  if (duplicateGroups.length === 0) {
    console.log('✅ Дубликатов не найдено!\n');
    return;
  }
  
  let totalKept = 0;
  let totalRemoved = 0;
  
  // Обработать каждую группу
  for (const group of duplicateGroups) {
    const companies = await getCompaniesForName(group.company_name);
    const result = await deduplicateGroup(companies);
    totalKept += result.kept;
    totalRemoved += result.removed;
  }
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  📊 ИТОГОВАЯ СТАТИСТИКА');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Групп дубликатов обработано: ${duplicateGroups.length}`);
  console.log(`  Записей оставлено: ${totalKept}`);
  console.log(`  Записей удалено: ${totalRemoved}`);
  console.log(`  Экономия места: ${totalRemoved} записей`);
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN - для реального выполнения запустите без --dry-run');
  }
  
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(console.error);

