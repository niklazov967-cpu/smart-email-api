#!/usr/bin/env node
/**
 * Применяет миграцию 003: Composite UNIQUE constraint
 * 
 * Usage: node scripts/apply-migration-003.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║      🚀 ПРИМЕНЕНИЕ МИГРАЦИИ 003: Composite UNIQUE            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  
  try {
    // Шаг 1: Проверка текущих дубликатов
    console.log('📊 ШАГ 1: Проверка текущих дубликатов...');
    
    const { data: allCompanies } = await supabase
      .from('pending_companies')
      .select('company_id, company_name, normalized_domain, created_at')
      .not('normalized_domain', 'is', null);
    
    const compositeMap = new Map();
    allCompanies?.forEach(c => {
      const key = `${c.company_name}::${c.normalized_domain}`;
      if (!compositeMap.has(key)) {
        compositeMap.set(key, []);
      }
      compositeMap.get(key).push(c);
    });
    
    const duplicates = Array.from(compositeMap.entries())
      .filter(([_, companies]) => companies.length > 1);
    
    console.log(`   Записей с normalized_domain: ${allCompanies?.length || 0}`);
    console.log(`   Дубликатов по (name+domain): ${duplicates.length}\n`);
    
    // Шаг 2: Удалить дубликаты (оставить старейшие)
    if (duplicates.length > 0) {
      console.log('🗑️  ШАГ 2: Удаление дубликатов...');
      let totalRemoved = 0;
      
      for (const [key, companies] of duplicates) {
        // Сортировать по created_at (старейшие первые)
        companies.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        
        // Оставить первый (самый старый), удалить остальные
        const toKeep = companies[0];
        const toRemove = companies.slice(1);
        
        console.log(`   ${key}: сохранить ${toKeep.company_id.substring(0, 8)}..., удалить ${toRemove.length}`);
        
        for (const company of toRemove) {
          const { error } = await supabase
            .from('pending_companies')
            .delete()
            .eq('company_id', company.company_id);
          
          if (error) {
            console.error(`   ❌ Ошибка удаления ${company.company_id}:`, error.message);
          } else {
            totalRemoved++;
          }
        }
      }
      
      console.log(`   ✅ Удалено дубликатов: ${totalRemoved}\n`);
    } else {
      console.log('   ✅ Дубликатов не найдено\n');
    }
    
    // Шаг 3: Создать индекс (через SQL, если есть доступ к pg)
    console.log('⚠️  ШАГ 3: Создание UNIQUE индекса...');
    console.log('   Индекс нужно создать вручную в Railway dashboard:');
    console.log('   ');
    console.log('   CREATE UNIQUE INDEX IF NOT EXISTS idx_company_name_domain ');
    console.log('   ON pending_companies(company_name, normalized_domain) ');
    console.log('   WHERE normalized_domain IS NOT NULL;');
    console.log('');
    console.log('   Или через: railway run bash');
    console.log('   Затем: apt-get update && apt-get install -y postgresql-client');
    console.log('   Затем: psql $DATABASE_URL < database/migrations/003-composite-unique.sql\n');
    
    // Финальная проверка
    console.log('📊 ФИНАЛЬНАЯ ПРОВЕРКА:');
    const { count: totalCount } = await supabase
      .from('pending_companies')
      .select('*', { count: 'exact', head: true });
    
    const { count: withDomainCount } = await supabase
      .from('pending_companies')
      .select('*', { count: 'exact', head: true })
      .not('normalized_domain', 'is', null);
    
    console.log(`   Всего записей: ${totalCount}`);
    console.log(`   С normalized_domain: ${withDomainCount} (${((withDomainCount/totalCount)*100).toFixed(1)}%)`);
    
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ МИГРАЦИЯ ЗАВЕРШЕНА                      ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('\n⚠️  Не забудьте создать UNIQUE индекс вручную (см. выше)!\n');
    
  } catch (error) {
    console.error('\n❌ ОШИБКА ПРИ ПРИМЕНЕНИИ МИГРАЦИИ:', error.message);
    process.exit(1);
  }
}

applyMigration();

