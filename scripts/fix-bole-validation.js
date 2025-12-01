/**
 * Исправление validation_score для 博乐（BOLE）
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const COMPANY_ID = 'acead61f-2a05-4752-a52d-b3f1577c1699';

async function fixBoleValidation() {
  try {
    console.log('🔧 Исправление 博乐（BOLE）...\n');

    // Получить данные компании
    const { data: company, error: fetchError } = await supabase
      .from('pending_companies')
      .select('*')
      .eq('company_id', COMPANY_ID)
      .single();

    if (fetchError) throw fetchError;

    console.log('📋 Текущие данные:');
    console.log(`   Название: ${company.company_name}`);
    console.log(`   Email: ${company.email}`);
    console.log(`   Website: ${company.website}`);
    console.log(`   Stage 4: ${company.stage4_status}`);
    console.log(`   Score: ${company.validation_score}`);
    console.log(`   Description: ${company.description?.substring(0, 100)}...`);
    console.log('');

    // Сбросить stage4_status чтобы компания была обработана снова
    console.log('🔄 Сброс stage4_status для повторной обработки...');
    
    const { error: updateError } = await supabase
      .from('pending_companies')
      .update({
        stage4_status: null,
        current_stage: 3 // Вернуть на Stage 3 (есть email и website)
      })
      .eq('company_id', COMPANY_ID);

    if (updateError) throw updateError;

    console.log('✅ Компания помечена для повторной обработки!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 СЛЕДУЮЩИЙ ШАГ:\n');
    console.log('Запустите Stage 4 на Railway:');
    console.log('   Компания будет обработана автоматически');
    console.log('   Должна получить validation_score');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

fixBoleValidation()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
