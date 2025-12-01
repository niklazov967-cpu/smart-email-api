/**
 * Проверка компаний без validation_score
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkMissingValidation() {
  try {
    console.log('🔍 Поиск компаний без validation_score...\n');

    // Получить все компании
    const { data: allCompanies, error: allError } = await supabase
      .from('pending_companies')
      .select('company_id, company_name, email, website, stage4_status, validation_score, current_stage, session_id')
      .order('company_id', { ascending: true });

    if (allError) throw allError;

    console.log(`📊 Всего компаний: ${allCompanies.length}`);

    // Найти компании БЕЗ validation_score
    const withoutScore = allCompanies.filter(c => 
      !c.validation_score || c.validation_score === 0
    );

    console.log(`❌ Без validation_score: ${withoutScore.length}\n`);

    if (withoutScore.length === 0) {
      console.log('✅ Все компании имеют validation_score!');
      return;
    }

    // Детальная статистика
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 КОМПАНИИ БЕЗ VALIDATION_SCORE:\n');

    withoutScore.forEach((c, i) => {
      console.log(`${i + 1}. ${c.company_name}`);
      console.log(`   ID: ${c.company_id}`);
      console.log(`   Email: ${c.email || 'НЕТ'}`);
      console.log(`   Website: ${c.website || 'НЕТ'}`);
      console.log(`   Stage 4: ${c.stage4_status || 'null'}`);
      console.log(`   Current Stage: ${c.current_stage || 'null'}`);
      console.log(`   Session: ${c.session_id || 'null'}`);
      console.log(`   Score: ${c.validation_score || 'null'}`);
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n💡 ВОЗМОЖНЫЕ ПРИЧИНЫ:\n');
    
    const byStage4Status = {};
    withoutScore.forEach(c => {
      const status = c.stage4_status || 'null';
      byStage4Status[status] = (byStage4Status[status] || 0) + 1;
    });

    console.log('По stage4_status:');
    Object.entries(byStage4Status).forEach(([status, count]) => {
      console.log(`   ${status}: ${count} компаний`);
    });

    const byCurrentStage = {};
    withoutScore.forEach(c => {
      const stage = c.current_stage || 'null';
      byCurrentStage[stage] = (byCurrentStage[stage] || 0) + 1;
    });

    console.log('\nПо current_stage:');
    Object.entries(byCurrentStage).forEach(([stage, count]) => {
      console.log(`   Stage ${stage}: ${count} компаний`);
    });

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
}

checkMissingValidation()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
