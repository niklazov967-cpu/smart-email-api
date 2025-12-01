#!/usr/bin/env node

/**
 * Cleanup TLD Duplicates
 * 
 * Находит и объединяет компании с одинаковым base_domain, но разными TLD
 * Приоритет: .cn > .com.cn > .com > остальные
 * 
 * Алгоритм:
 * 1. Найти все группы с одинаковым base_domain
 * 2. Для каждой группы выбрать лучшую запись (TLD + score + email + date)
 * 3. Слить данные из других записей в лучшую
 * 4. Удалить остальные записи
 */

const { createClient } = require('@supabase/supabase-js');
const domainPriorityManager = require('../src/utils/DomainPriorityManager');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function cleanupTldDuplicates() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║              CLEANUP TLD DUPLICATES                            ║
╚════════════════════════════════════════════════════════════════╝
`);

  // 1. Получить все компании с normalized_domain
  console.log('📊 Шаг 1: Получение всех компаний из БД...\n');
  
  const { data: companies, error } = await supabase
    .from('pending_companies')
    .select('*')
    .not('normalized_domain', 'is', null)
    .order('created_at');

  if (error) {
    console.error('❌ Ошибка при получении данных:', error);
    return;
  }

  console.log(`   Всего записей с normalized_domain: ${companies.length}\n`);

  // 2. Группировка по base_domain
  console.log('📦 Шаг 2: Группировка по base_domain...\n');
  
  const baseDomainGroups = {};
  
  for (const company of companies) {
    const baseDomain = domainPriorityManager.extractBaseDomain(company.normalized_domain);
    if (!baseDomain) continue;
    
    if (!baseDomainGroups[baseDomain]) {
      baseDomainGroups[baseDomain] = [];
    }
    baseDomainGroups[baseDomain].push(company);
  }

  // 3. Найти группы с дубликатами
  const tldDuplicates = [];
  
  for (const [baseDomain, group] of Object.entries(baseDomainGroups)) {
    if (group.length > 1) {
      const uniqueDomains = [...new Set(group.map(c => c.normalized_domain))];
      if (uniqueDomains.length > 1) {
        tldDuplicates.push({ baseDomain, companies: group, domains: uniqueDomains });
      }
    }
  }

  console.log(`   Найдено групп с разными TLD: ${tldDuplicates.length}\n`);

  if (tldDuplicates.length === 0) {
    console.log('✅ В БД НЕТ TLD-дубликатов! Cleanup не требуется.\n');
    return;
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🔧 Шаг 3: Обработка дубликатов...`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  let totalMerged = 0;
  let totalDeleted = 0;

  for (let i = 0; i < tldDuplicates.length; i++) {
    const { baseDomain, companies: group, domains } = tldDuplicates[i];
    
    console.log(`\n${i + 1}/${tldDuplicates.length}. 🟡 ${baseDomain} (${domains.length} доменов)`);
    console.log(`   Домены: ${domains.join(', ')}\n`);

    // Выбрать лучшую запись
    const best = domainPriorityManager.selectBestRecord(group);
    const toDelete = group.filter(c => c.company_id !== best.company_id);

    console.log(`   ✅ Keeping: ${best.company_name}`);
    console.log(`      domain: ${best.normalized_domain}`);
    console.log(`      TLD: ${domainPriorityManager.extractTld(best.normalized_domain)}`);
    console.log(`      email: ${best.email || 'none'}`);
    console.log(`      score: ${best.validation_score || 0}`);

    if (toDelete.length > 0) {
      console.log(`\n   🗑️  Deleting: ${toDelete.length} records`);
    }

    // Слияние данных
    let merged = false;
    for (const duplicate of toDelete) {
      console.log(`\n      - ${duplicate.company_name}`);
      console.log(`        domain: ${duplicate.normalized_domain}`);
      console.log(`        TLD: ${domainPriorityManager.extractTld(duplicate.normalized_domain)}`);

      const updates = {};

      // Если у дубликата есть email, а у best нет → скопировать
      if (duplicate.email && !best.email) {
        updates.email = duplicate.email;
        console.log(`        📧 Merging email: ${duplicate.email}`);
        merged = true;
      }

      // Если у дубликата лучший validation_score → скопировать
      if ((duplicate.validation_score || 0) > (best.validation_score || 0)) {
        updates.validation_score = duplicate.validation_score;
        console.log(`        💯 Merging score: ${duplicate.validation_score}`);
        merged = true;
      }

      // Слить tags
      if (duplicate.tags && duplicate.tags.length > 0) {
        const bestTags = best.tags || [];
        const mergedTags = [...new Set([...bestTags, ...duplicate.tags])];
        if (mergedTags.length > bestTags.length) {
          updates.tags = mergedTags;
          console.log(`        🏷️  Merging tags: +${mergedTags.length - bestTags.length} new`);
          merged = true;
        }
      }

      // Применить обновления к best
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('pending_companies')
          .update(updates)
          .eq('company_id', best.company_id);

        if (updateError) {
          console.error(`        ❌ Failed to merge data: ${updateError.message}`);
        }
      }

      // Удалить дубликат
      const { error: deleteError } = await supabase
        .from('pending_companies')
        .delete()
        .eq('company_id', duplicate.company_id);

      if (deleteError) {
        console.error(`        ❌ Failed to delete: ${deleteError.message}`);
      } else {
        console.log(`        ✅ Deleted`);
        totalDeleted++;
      }
    }

    if (merged) {
      totalMerged++;
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ CLEANUP ЗАВЕРШЕН`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  console.log(`📊 ИТОГО:`);
  console.log(`   • Обработано групп: ${tldDuplicates.length}`);
  console.log(`   • Записей удалено: ${totalDeleted}`);
  console.log(`   • Записей со слиянием данных: ${totalMerged}`);
  console.log(`   • Записей осталось: ${companies.length - totalDeleted}\n`);

  // Финальная проверка
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🔍 Финальная проверка уникальности...`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const { data: afterCleanup } = await supabase
    .from('pending_companies')
    .select('normalized_domain')
    .not('normalized_domain', 'is', null);

  const afterBaseDomainGroups = {};
  for (const company of afterCleanup) {
    const baseDomain = domainPriorityManager.extractBaseDomain(company.normalized_domain);
    if (!baseDomain) continue;
    if (!afterBaseDomainGroups[baseDomain]) {
      afterBaseDomainGroups[baseDomain] = [];
    }
    afterBaseDomainGroups[baseDomain].push(company);
  }

  const remainingDuplicates = Object.values(afterBaseDomainGroups)
    .filter(group => {
      if (group.length <= 1) return false;
      const uniqueDomains = [...new Set(group.map(c => c.normalized_domain))];
      return uniqueDomains.length > 1;
    });

  if (remainingDuplicates.length === 0) {
    console.log(`   ✅ TLD-дубликаты полностью устранены!\n`);
  } else {
    console.log(`   ⚠️  Осталось ${remainingDuplicates.length} групп с TLD-дубликатами`);
    console.log(`       (возможно, требуется повторный запуск)\n`);
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

cleanupTldDuplicates().catch(console.error);

