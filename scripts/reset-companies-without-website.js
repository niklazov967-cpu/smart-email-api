/**
 * Скрипт для пометки всех записей без website для повторной обработки
 * Сбрасывает stage2_status, stage3_status, stage4_status → null
 * Устанавливает current_stage = 1 (готов для Stage 2)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetCompaniesWithoutWebsite() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║     RESET COMPANIES WITHOUT WEBSITE FOR REPROCESSING          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Получить все компании без website
    console.log('📊 Шаг 1: Получение компаний без website...\n');
    
    const { data: companies, error: fetchError } = await supabase
      .from('pending_companies')
      .select('company_id, company_name, email, stage2_status, stage3_status, stage4_status, current_stage')
      .is('website', null);

    if (fetchError) {
      throw new Error(`Failed to fetch companies: ${fetchError.message}`);
    }

    console.log(`   Найдено компаний без website: ${companies.length}\n`);

    if (companies.length === 0) {
      console.log('✅ Нет компаний без website. Скрипт завершен.\n');
      return;
    }

    // 2. Показать статистику
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📈 СТАТИСТИКА ДО СБРОСА');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const stats = {
      withEmail: companies.filter(c => c.email).length,
      withoutEmail: companies.filter(c => !c.email).length,
      stage2Pending: companies.filter(c => !c.stage2_status).length,
      stage2Failed: companies.filter(c => c.stage2_status === 'failed').length,
      stage2Completed: companies.filter(c => c.stage2_status === 'completed').length,
      stage3Pending: companies.filter(c => !c.stage3_status).length,
      stage3Failed: companies.filter(c => c.stage3_status === 'failed').length,
      stage3Completed: companies.filter(c => c.stage3_status === 'completed').length,
      stage4Pending: companies.filter(c => !c.stage4_status).length,
      stage4Completed: companies.filter(c => c.stage4_status === 'completed').length,
    };

    console.log(`   Компаний с email: ${stats.withEmail}`);
    console.log(`   Компаний без email: ${stats.withoutEmail}`);
    console.log('');
    console.log(`   Stage 2 статус:`);
    console.log(`      - pending/null: ${stats.stage2Pending}`);
    console.log(`      - failed: ${stats.stage2Failed}`);
    console.log(`      - completed: ${stats.stage2Completed}`);
    console.log('');
    console.log(`   Stage 3 статус:`);
    console.log(`      - pending/null: ${stats.stage3Pending}`);
    console.log(`      - failed: ${stats.stage3Failed}`);
    console.log(`      - completed: ${stats.stage3Completed}`);
    console.log('');
    console.log(`   Stage 4 статус:`);
    console.log(`      - pending/null: ${stats.stage4Pending}`);
    console.log(`      - completed: ${stats.stage4Completed}`);
    console.log('');

    // 3. Показать примеры
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 ПРИМЕРЫ (первые 10)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    companies.slice(0, 10).forEach((company, index) => {
      console.log(`   ${index + 1}. ${company.company_name}`);
      console.log(`      email: ${company.email || 'none'}`);
      console.log(`      stage2: ${company.stage2_status || 'null'}`);
      console.log(`      stage3: ${company.stage3_status || 'null'}`);
      console.log(`      stage4: ${company.stage4_status || 'null'}`);
      console.log(`      current_stage: ${company.current_stage}`);
      console.log('');
    });

    if (companies.length > 10) {
      console.log(`   ... и еще ${companies.length - 10} компаний\n`);
    }

    // 4. Подтверждение
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  ВНИМАНИЕ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`   Будет обновлено ${companies.length} записей:\n`);
    console.log('   ✓ stage2_status → null');
    console.log('   ✓ stage3_status → null');
    console.log('   ✓ stage4_status → null');
    console.log('   ✓ current_stage → 1 (готов для Stage 2)');
    console.log('   ✓ updated_at → текущее время\n');
    console.log('   Существующие email НЕ затрутся (защита работает)');
    console.log('   После сброса компании будут обработаны в Stage 2, 3, 4\n');

    // 5. Выполнить сброс
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 Шаг 2: Сброс статусов...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: updated, error: updateError } = await supabase
      .from('pending_companies')
      .update({
        stage2_status: null,
        stage3_status: null,
        stage4_status: null,
        current_stage: 1, // Готов для Stage 2
        updated_at: new Date().toISOString()
      })
      .is('website', null)
      .select('company_id');

    if (updateError) {
      throw new Error(`Failed to update companies: ${updateError.message}`);
    }

    console.log(`   ✅ Успешно обновлено: ${updated.length} записей\n`);

    // 6. Финальная статистика
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ СБРОС ЗАВЕРШЕН');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`   📊 Всего записей обновлено: ${updated.length}`);
    console.log(`   📊 С email: ${stats.withEmail}`);
    console.log(`   📊 Без email: ${stats.withoutEmail}\n`);
    console.log('   Все записи готовы для повторной обработки:');
    console.log('   • Stage 2: Поиск website (Perplexity)');
    console.log('   • Stage 2 Retry: Поиск website (DeepSeek) если Stage 2 failed');
    console.log('   • Stage 3: Поиск email (Perplexity)');
    console.log('   • Stage 3 Retry: Поиск email (DeepSeek) если Stage 3 failed');
    console.log('   • Stage 4: AI валидация (DeepSeek)\n');
    console.log('   ✅ Существующие email защищены от затирания');
    console.log('   ✅ TLD priority система защитит website от downgrade\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Запуск
resetCompaniesWithoutWebsite();

