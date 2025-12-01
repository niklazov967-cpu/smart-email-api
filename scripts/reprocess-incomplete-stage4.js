/**
 * Скрипт для повторной обработки компаний, не прошедших Stage 4
 * Находит компании без validation_score и помечает их для обработки
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function reprocessIncompleteStage4() {
  try {
    console.log('🔍 Поиск компаний без Stage 4...\n');

    // 1. Получить все компании
    const { data: allCompanies, error: allError } = await supabase
      .from('pending_companies')
      .select('company_id, company_name, email, website, stage4_status, validation_score, current_stage');

    if (allError) {
      throw new Error(`Ошибка получения компаний: ${allError.message}`);
    }

    console.log(`📊 Всего компаний в БД: ${allCompanies.length}`);

    // 2. Найти компании без validation_score (не прошли Stage 4)
    const withoutStage4 = allCompanies.filter(c => 
      !c.validation_score || c.validation_score === 0 || c.validation_score === null
    );

    console.log(`❌ Без Stage 4 (validation_score): ${withoutStage4.length}`);

    // 3. Показать детальную статистику
    const byStage4Status = {};
    withoutStage4.forEach(c => {
      const status = c.stage4_status || 'null';
      byStage4Status[status] = (byStage4Status[status] || 0) + 1;
    });

    console.log('\n📈 Детальная статистика по stage4_status:');
    Object.entries(byStage4Status).forEach(([status, count]) => {
      console.log(`   ${status}: ${count} компаний`);
    });

    // 4. Показать примеры компаний
    console.log('\n📋 Примеры компаний без Stage 4 (первые 10):');
    withoutStage4.slice(0, 10).forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.company_name}`);
      console.log(`      Email: ${c.email || 'НЕТ'}`);
      console.log(`      Website: ${c.website || 'НЕТ'}`);
      console.log(`      Stage 4: ${c.stage4_status || 'null'}`);
      console.log(`      Current stage: ${c.current_stage || 'null'}`);
      console.log('');
    });

    if (withoutStage4.length === 0) {
      console.log('✅ Все компании уже прошли Stage 4!');
      return;
    }

    // 5. Спросить подтверждение (автоматически да для скрипта)
    console.log(`\n⚠️  Будет помечено для обработки: ${withoutStage4.length} компаний`);
    console.log('Это установит:');
    console.log('   • stage4_status = null');
    console.log('   • current_stage = 3 (если есть website/email) или 2 (если нет)');
    console.log('   • validation_score = null');
    console.log('\nПродолжаем...\n');

    // 6. Обновить каждую компанию
    let updated = 0;
    let errors = 0;

    for (const company of withoutStage4) {
      try {
        // Определить на какой stage вернуть
        let targetStage = 1;
        
        if (company.website || company.email) {
          targetStage = 3; // Есть данные, можно на Stage 4
        } else if (company.website) {
          targetStage = 2; // Есть сайт, нужен email
        }

        const { error } = await supabase
          .from('pending_companies')
          .update({
            stage4_status: null,
            current_stage: targetStage,
            validation_score: null
          })
          .eq('company_id', company.company_id);

        if (error) {
          console.error(`❌ Ошибка для ${company.company_name}: ${error.message}`);
          errors++;
        } else {
          updated++;
          if (updated % 50 === 0) {
            console.log(`   ✅ Обновлено: ${updated}/${withoutStage4.length}`);
          }
        }
      } catch (err) {
        console.error(`❌ Ошибка для ${company.company_name}: ${err.message}`);
        errors++;
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ЗАВЕРШЕНО');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Успешно обновлено: ${updated}`);
    console.log(`❌ Ошибок: ${errors}`);
    console.log(`📊 Всего обработано: ${withoutStage4.length}`);
    console.log('\n🚀 Теперь запустите Stage 2, 3, 4 для обработки этих компаний');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

// Запуск
reprocessIncompleteStage4()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
