#!/usr/bin/env node

/**
 * Анализ дубликатов с разными TLD (top-level domain)
 * 
 * Проблема:
 * - wayken.cn, wayken.com, wayken.net - это одна компания
 * - email обычно одинаковый (или отличается только доменом)
 * 
 * Решение:
 * - Извлечь базовый домен (без TLD)
 * - Найти группы с одинаковым базовым доменом
 * - Проверить email для подтверждения
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Извлечь базовый домен без TLD
 * wayken.cn → wayken
 * star-rapid.com → star-rapid
 * xy-global.co.uk → xy-global
 */
function extractBaseDomain(domain) {
  if (!domain) return null;
  
  // Удалить www. и протокол
  let clean = domain.toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
  
  // Удалить TLD (последняя часть после точки)
  // Обработка составных TLD (.co.uk, .com.cn и т.д.)
  const parts = clean.split('.');
  
  if (parts.length === 1) return clean; // Нет TLD
  
  // Для составных TLD (.co.uk, .com.cn)
  if (parts.length > 2 && ['co', 'com', 'net', 'org', 'gov', 'edu'].includes(parts[parts.length - 2])) {
    return parts.slice(0, -2).join('.');
  }
  
  // Обычный TLD (.com, .cn, .net)
  return parts.slice(0, -1).join('.');
}

/**
 * Извлечь базовый email домен
 * info@wayken.cn → wayken
 * sales@wayken.com → wayken
 */
function extractEmailBaseDomain(email) {
  if (!email || !email.includes('@')) return null;
  const domain = email.split('@')[1];
  return extractBaseDomain(domain);
}

async function analyzeTldDuplicates() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║        АНАЛИЗ ДУБЛИКАТОВ С РАЗНЫМИ TLD (wayken.cn vs .com)    ║
╚════════════════════════════════════════════════════════════════╝
`);

  // Получить все записи с normalized_domain
  const { data: companies, error } = await supabase
    .from('pending_companies')
    .select('company_id, company_name, normalized_domain, website, email, created_at')
    .not('normalized_domain', 'is', null)
    .order('normalized_domain');

  if (error) {
    console.error('❌ Ошибка при получении данных:', error);
    return;
  }

  console.log(`📊 Всего записей с normalized_domain: ${companies.length}\n`);

  // Группировка по базовому домену
  const baseDomainGroups = {};
  
  for (const company of companies) {
    const baseDomain = extractBaseDomain(company.normalized_domain);
    if (!baseDomain) continue;
    
    if (!baseDomainGroups[baseDomain]) {
      baseDomainGroups[baseDomain] = [];
    }
    baseDomainGroups[baseDomain].push(company);
  }

  // Найти группы с несколькими TLD
  const tldDuplicates = [];
  
  for (const [baseDomain, group] of Object.entries(baseDomainGroups)) {
    if (group.length > 1) {
      // Проверить, действительно ли это разные TLD
      const uniqueDomains = [...new Set(group.map(c => c.normalized_domain))];
      if (uniqueDomains.length > 1) {
        tldDuplicates.push({
          baseDomain,
          companies: group,
          domains: uniqueDomains
        });
      }
    }
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🔍 РЕЗУЛЬТАТЫ АНАЛИЗА:`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  
  console.log(`   Найдено групп с разными TLD: ${tldDuplicates.length}\n`);

  if (tldDuplicates.length === 0) {
    console.log('   ✅ В БД НЕТ дубликатов с разными TLD!\n');
    return;
  }

  // Сортировка по количеству доменов в группе
  tldDuplicates.sort((a, b) => b.domains.length - a.domains.length);

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📋 ТОП-20 ГРУПП С РАЗНЫМИ TLD:`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const topGroups = tldDuplicates.slice(0, 20);
  
  for (let i = 0; i < topGroups.length; i++) {
    const { baseDomain, companies: group, domains } = topGroups[i];
    
    console.log(`   ${i + 1}. 🟡 ${baseDomain} (${domains.length} доменов):`);
    console.log(`      Домены: ${domains.join(', ')}\n`);
    
    for (const company of group) {
      const emailBaseDomain = extractEmailBaseDomain(company.email);
      const emailMatch = emailBaseDomain === baseDomain ? '✅' : '❌';
      
      console.log(`      ${emailMatch} ${company.company_name}`);
      console.log(`         domain: ${company.normalized_domain}`);
      console.log(`         email: ${company.email || 'none'}`);
      console.log(`         created: ${company.created_at?.substring(0, 10) || 'unknown'}`);
    }
    console.log('');
  }

  // Статистика по email
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 СТАТИСТИКА:`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  let totalDuplicates = 0;
  let sameEmailBase = 0;
  let differentEmailBase = 0;
  let noEmail = 0;

  for (const { baseDomain, companies: group } of tldDuplicates) {
    totalDuplicates += group.length - 1; // Минус 1, т.к. одна запись должна остаться
    
    const emailBases = group
      .map(c => extractEmailBaseDomain(c.email))
      .filter(Boolean);
    
    if (emailBases.length === 0) {
      noEmail++;
    } else if (emailBases.every(eb => eb === baseDomain)) {
      sameEmailBase++;
    } else {
      differentEmailBase++;
    }
  }

  console.log(`   Всего групп: ${tldDuplicates.length}`);
  console.log(`   Всего дубликатов: ${totalDuplicates} записей\n`);
  console.log(`   Групп с одинаковым email базовым доменом: ${sameEmailBase} ✅`);
  console.log(`   Групп с разным email базовым доменом: ${differentEmailBase} ⚠️`);
  console.log(`   Групп без email: ${noEmail} ❓\n`);

  // Рекомендации
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`💡 РЕКОМЕНДАЦИИ:`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  if (sameEmailBase > 0) {
    console.log(`   ✅ ${sameEmailBase} групп можно безопасно объединить`);
    console.log(`      (email базовый домен совпадает с website)\n`);
  }

  if (differentEmailBase > 0) {
    console.log(`   ⚠️  ${differentEmailBase} групп требуют ручной проверки`);
    console.log(`      (email базовый домен отличается)\n`);
  }

  if (noEmail > 0) {
    console.log(`   ❓ ${noEmail} групп без email`);
    console.log(`      (требуют проверки или поиска email в Stage 3)\n`);
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🛠️  ВОЗМОЖНЫЕ РЕШЕНИЯ:`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  console.log(`   1️⃣  Автоматическое слияние (для групп с одинаковым email):`);
  console.log(`      - Оставить запись с .com (международный стандарт)`);
  console.log(`      - Или запись с лучшим validation_score`);
  console.log(`      - Или самую раннюю запись\n`);

  console.log(`   2️⃣  Добавить поле base_domain в таблицу:`);
  console.log(`      - Хранить wayken (без TLD)`);
  console.log(`      - UNIQUE constraint на base_domain`);
  console.log(`      - Хранить массив известных TLD: ['.cn', '.com', '.net']\n`);

  console.log(`   3️⃣  Улучшить дедупликацию в Stage 1:`);
  console.log(`      - Проверять не только normalized_domain`);
  console.log(`      - Но и base_domain (без TLD)`);
  console.log(`      - Если base_domain совпадает → это дубликат\n`);

  console.log(`   4️⃣  Ручная проверка и исправление:`);
  console.log(`      - Для групп с разными email`);
  console.log(`      - Могут быть разные компании с похожими доменами\n`);

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

analyzeTldDuplicates().catch(console.error);

