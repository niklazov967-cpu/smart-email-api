#!/usr/bin/env node
/**
 * Проверка дубликатов по email в базе данных
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
  console.log('  📧 Проверка дубликатов по email');
  console.log('═══════════════════════════════════════════════════════\n');
  
  // 1. Получить все компании с email
  const { data: companies, error } = await supabase
    .from('pending_companies')
    .select('company_id, company_name, email, website, validation_score, created_at')
    .not('email', 'is', null)
    .neq('email', '');
  
  if (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
  
  console.log(`📊 Всего компаний с email: ${companies.length}\n`);
  
  // 2. Найти дубликаты
  const emailMap = new Map();
  companies.forEach(c => {
    const email = c.email.toLowerCase().trim();
    if (!emailMap.has(email)) {
      emailMap.set(email, []);
    }
    emailMap.get(email).push(c);
  });
  
  // 3. Показать только те email которые встречаются больше 1 раза
  const duplicates = Array.from(emailMap.entries()).filter(([email, comps]) => comps.length > 1);
  
  console.log(`📧 Уникальных email: ${emailMap.size}`);
  console.log(`🔄 Email с дубликатами: ${duplicates.length}`);
  console.log(`📊 Всего дубликатов: ${companies.length - emailMap.size}\n`);
  
  if (duplicates.length > 0) {
    console.log('📋 Список email с дубликатами:\n');
    
    duplicates.sort((a, b) => b[1].length - a[1].length); // Сортировка по количеству
    
    duplicates.forEach(([email, comps], index) => {
      console.log(`${index + 1}. Email: ${email} (${comps.length} компаний)`);
      comps.forEach((c, i) => {
        console.log(`   ${i + 1}) ${c.company_name}`);
        console.log(`      Score: ${c.validation_score || 'N/A'}, Website: ${c.website ? 'Yes' : 'No'}`);
        console.log(`      Created: ${new Date(c.created_at).toLocaleDateString('ru-RU')}`);
      });
      console.log('');
    });
  }
  
  console.log('═══════════════════════════════════════════════════════');
  console.log('  📊 ИТОГОВАЯ СТАТИСТИКА');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Всего компаний с email: ${companies.length}`);
  console.log(`  Уникальных email: ${emailMap.size}`);
  console.log(`  Email с дубликатами: ${duplicates.length}`);
  console.log(`  Всего записей-дубликатов: ${companies.length - emailMap.size}`);
  console.log(``);
  console.log(`  После дедупликации останется: ${emailMap.size} компаний`);
  console.log(`  Будет удалено: ${companies.length - emailMap.size} дубликатов`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(console.error);

