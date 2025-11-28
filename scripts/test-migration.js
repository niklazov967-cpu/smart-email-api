#!/usr/bin/env node

/**
 * Тестовый скрипт для миграции на новую систему переводов
 * 
 * Выполняет:
 * 1. Создание таблицы pending_companies_ru
 * 2. Миграцию данных из translations
 * 3. Проверку API endpoints
 * 4. Валидацию данных
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function executeSqlFile(filePath) {
  console.log(`\n📄 Executing SQL file: ${filePath}`);
  
  const sql = fs.readFileSync(filePath, 'utf8');
  
  // Разбить на отдельные запросы по точке с запятой
  const queries = sql
    .split(';')
    .map(q => q.trim())
    .filter(q => q.length > 0 && !q.startsWith('--'));
  
  for (const query of queries) {
    if (query.includes('COMMENT ON')) {
      // Пропускаем COMMENT ON - Supabase REST API не поддерживает
      continue;
    }
    
    const { data, error } = await supabase.rpc('exec_sql', { query });
    
    if (error) {
      console.error(`❌ SQL Error:`, error.message);
      return false;
    }
    
    if (data && Array.isArray(data) && data.length > 0) {
      console.log(`   ✅`, data[0]);
    }
  }
  
  return true;
}

async function testApiEndpoint(url, description) {
  console.log(`\n🔍 Testing: ${description}`);
  console.log(`   URL: ${url}`);
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.success !== false) {
      console.log(`   ✅ Success`);
      console.log(`   Data:`, JSON.stringify(data, null, 2).split('\n').slice(0, 10).join('\n'));
      return data;
    } else {
      console.log(`   ❌ Failed:`, data.error);
      return null;
    }
  } catch (error) {
    console.log(`   ❌ Error:`, error.message);
    return null;
  }
}

async function checkTableExists(tableName) {
  const { data, error } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true });
  
  if (error) {
    return false;
  }
  
  return true;
}

async function main() {
  console.log('🚀 Starting migration test...\n');
  
  // Шаг 1: Проверить существование старой таблицы translations
  console.log('📊 Step 1: Check existing translations table');
  const hasTranslations = await checkTableExists('translations');
  
  if (hasTranslations) {
    const { count } = await supabase
      .from('translations')
      .select('*', { count: 'exact', head: true });
    
    console.log(`   ✅ Found ${count} translation records`);
  } else {
    console.log(`   ⚠️  No translations table found (this is OK if starting fresh)`);
  }
  
  // Шаг 2: Создать новую таблицу pending_companies_ru
  console.log('\n📊 Step 2: Create pending_companies_ru table');
  
  // Проверить существует ли уже
  const hasRuTable = await checkTableExists('pending_companies_ru');
  
  if (hasRuTable) {
    console.log(`   ⚠️  Table pending_companies_ru already exists`);
    console.log(`   💡 Skipping creation (run DROP TABLE if you want to recreate)`);
  } else {
    // Создать через SQL скрипт (но Supabase REST API не поддерживает CREATE TABLE)
    console.log(`   ⚠️  Cannot create table via REST API`);
    console.log(`   📝 Please run this SQL manually in Supabase SQL Editor:`);
    console.log(`      File: database/create-companies-ru-table.sql`);
    console.log(`\n   Press Ctrl+C to stop, or Enter to continue (assuming table exists)...`);
    
    // Ждем подтверждения пользователя
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });
  }
  
  // Шаг 3: Проверить что таблица создана
  console.log('\n📊 Step 3: Verify pending_companies_ru table');
  const ruTableExists = await checkTableExists('pending_companies_ru');
  
  if (!ruTableExists) {
    console.log(`   ❌ Table pending_companies_ru not found!`);
    console.log(`   Please create it manually in Supabase SQL Editor`);
    process.exit(1);
  }
  
  console.log(`   ✅ Table exists`);
  
  // Шаг 4: Миграция данных (только если есть старая таблица)
  if (hasTranslations) {
    console.log('\n📊 Step 4: Migrate data from translations');
    console.log(`   ⚠️  Cannot execute complex SQL via REST API`);
    console.log(`   📝 Please run this SQL manually in Supabase SQL Editor:`);
    console.log(`      File: database/migrate-translations-to-ru-table.sql`);
    console.log(`\n   Press Enter when migration is complete...`);
    
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });
  } else {
    console.log('\n📊 Step 4: Skip migration (no translations table)');
  }
  
  // Шаг 5: Проверить данные
  console.log('\n📊 Step 5: Check migrated data');
  
  const { data: ruData, error: ruError, count: ruCount } = await supabase
    .from('pending_companies_ru')
    .select('*', { count: 'exact' })
    .limit(5);
  
  if (ruError) {
    console.log(`   ❌ Error:`, ruError.message);
  } else {
    console.log(`   ✅ Found ${ruCount} records in pending_companies_ru`);
    
    if (ruData && ruData.length > 0) {
      console.log(`   Sample record:`);
      console.log(`      - company_id: ${ruData[0].company_id}`);
      console.log(`      - company_name_ru: ${ruData[0].company_name_ru || '(not translated)'}`);
      console.log(`      - translation_status: ${ruData[0].translation_status}`);
    }
  }
  
  // Шаг 6: Проверить статистику
  console.log('\n📊 Step 6: Check translation statistics');
  
  const { data: stats } = await supabase
    .from('pending_companies_ru')
    .select('translation_status');
  
  if (stats) {
    const statusCounts = {
      completed: 0,
      partial: 0,
      pending: 0,
      failed: 0
    };
    
    stats.forEach(s => {
      if (statusCounts[s.translation_status] !== undefined) {
        statusCounts[s.translation_status]++;
      }
    });
    
    console.log(`   ✅ Statistics:`);
    console.log(`      - Total: ${stats.length}`);
    console.log(`      - Completed: ${statusCounts.completed}`);
    console.log(`      - Partial: ${statusCounts.partial}`);
    console.log(`      - Pending: ${statusCounts.pending}`);
    console.log(`      - Failed: ${statusCounts.failed}`);
  }
  
  // Шаг 7: Проверить API endpoints (если сервер запущен)
  console.log('\n📊 Step 7: Test API endpoints');
  console.log(`   💡 Make sure server is running (npm start)`);
  
  await testApiEndpoint(
    'http://localhost:3000/api/debug/translations/stats',
    'Translation stats endpoint'
  );
  
  const companiesData = await testApiEndpoint(
    'http://localhost:3000/api/debug/companies?include_translations=true&limit=3',
    'Companies with translations'
  );
  
  if (companiesData && companiesData.companies && companiesData.companies.length > 0) {
    const firstCompany = companiesData.companies[0];
    console.log(`\n   📋 Sample company structure:`);
    console.log(`      - company_name: ${firstCompany.company_name}`);
    console.log(`      - pending_companies_ru: ${firstCompany.pending_companies_ru ? 'YES' : 'NO'}`);
    
    if (firstCompany.pending_companies_ru) {
      console.log(`      - company_name_ru: ${firstCompany.pending_companies_ru.company_name_ru || '(empty)'}`);
      console.log(`      - translation_status: ${firstCompany.pending_companies_ru.translation_status}`);
    }
  }
  
  // Итоги
  console.log('\n✅ Migration test completed!');
  console.log('\n📝 Next steps:');
  console.log('   1. Restart server: npm start');
  console.log('   2. Restart worker: npm run translate:stop && npm run translate:start');
  console.log('   3. Open http://localhost:3000/results.html');
  console.log('   4. Verify Russian translations are displayed');
  
  process.exit(0);
}

main().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});

