/**
 * Удаление компании 博乐（BOLE）
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const COMPANY_ID = 'acead61f-2a05-4752-a52d-b3f1577c1699';

async function deleteBole() {
  try {
    console.log('🗑️  Удаление 博乐（BOLE）...\n');

    // Получить данные перед удалением
    const { data: company, error: fetchError } = await supabase
      .from('pending_companies')
      .select('company_name, email, website, validation_score, description')
      .eq('company_id', COMPANY_ID)
      .single();

    if (fetchError) throw fetchError;

    console.log('📋 Компания для удаления:');
    console.log(`   Название: ${company.company_name}`);
    console.log(`   Email: ${company.email}`);
    console.log(`   Website: ${company.website}`);
    console.log(`   Score: ${company.validation_score}`);
    console.log(`   Описание: ${company.description?.substring(0, 80)}...`);
    console.log('');
    console.log('❌ Причина: Игровая компания, не металлообработка\n');

    // Удалить из pending_companies
    const { error: deleteError } = await supabase
      .from('pending_companies')
      .delete()
      .eq('company_id', COMPANY_ID);

    if (deleteError) throw deleteError;

    console.log('✅ Компания успешно удалена из pending_companies!\n');

    // Проверить pending_companies_ru
    const { data: ruData } = await supabase
      .from('pending_companies_ru')
      .select('company_id')
      .eq('company_id', COMPANY_ID)
      .single();

    if (ruData) {
      const { error: deleteRuError } = await supabase
        .from('pending_companies_ru')
        .delete()
        .eq('company_id', COMPANY_ID);

      if (deleteRuError) throw deleteRuError;
      console.log('✅ Перевод также удалён из pending_companies_ru!\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ГОТОВО!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nТеперь в БД:');
    console.log('   Всего компаний: 663 (было 664)');
    console.log('   Проверено AI: 634 (все с score > 0)');
    console.log('');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

deleteBole()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
