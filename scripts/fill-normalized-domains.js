const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ptbefsrvvcrjrfxxtogt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0YmVmc3J2dmNyanJmeHh0b2d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjIyMzIsImV4cCI6MjA3OTc5ODIzMn0.dGFxCU1q0uzc6HrZCUOJY3tp9_QHlFmUmqe2jtzVviA'
);

/**
 * Извлечь главный домен из URL
 * https://www.example.com/path → example.com
 */
function extractMainDomain(url) {
  if (!url) return null;
  
  try {
    // Добавить протокол если его нет
    let fullUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      fullUrl = 'https://' + url;
    }
    
    const urlObj = new URL(fullUrl);
    let hostname = urlObj.hostname.toLowerCase();
    
    // Убрать www
    hostname = hostname.replace(/^www\./, '');
    
    return hostname;
  } catch (error) {
    console.warn('Failed to extract domain from:', url, error.message);
    return null;
  }
}

async function fillNormalizedDomains() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║     ЗАПОЛНЕНИЕ normalized_domain В СУЩЕСТВУЮЩИХ ЗАПИСЯХ        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Шаг 1: Получить все записи с website, но без normalized_domain
    console.log('📊 Шаг 1: Поиск записей с website, но без normalized_domain...\n');
    
    const { data: records, error } = await supabase
      .from('pending_companies')
      .select('company_id, company_name, website, normalized_domain, email, validation_score, stage2_status, stage3_status, stage4_status, created_at')
      .not('website', 'is', null)
      .is('normalized_domain', null);

    if (error) {
      console.error('❌ Ошибка при получении данных:', error);
      return;
    }

    console.log(`   Найдено записей для обновления: ${records.length}\n`);

    if (records.length === 0) {
      console.log('✅ Все записи уже имеют normalized_domain!\n');
      return;
    }

    // Шаг 2: Показать примеры
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 ПРИМЕРЫ ЗАПИСЕЙ ДЛЯ ОБНОВЛЕНИЯ (первые 10):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    records.slice(0, 10).forEach((record, i) => {
      const domain = extractMainDomain(record.website);
      console.log(`${i + 1}. ${record.company_name}`);
      console.log(`   website: ${record.website}`);
      console.log(`   → normalized_domain: ${domain || 'INVALID'}`);
      console.log('');
    });

    // Шаг 3: Обновить записи
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 Шаг 2: Обновление записей...\n');

    let updated = 0;
    let duplicates = 0;
    let skipped = 0;
    const duplicatesList = [];

    for (const record of records) {
      const normalizedDomain = extractMainDomain(record.website);
      
      if (!normalizedDomain) {
        console.log(`⚠️  Пропущено: ${record.company_name} (некорректный website: ${record.website})`);
        skipped++;
        continue;
      }

      // Обновить normalized_domain
      const { error: updateError } = await supabase
        .from('pending_companies')
        .update({ normalized_domain: normalizedDomain })
        .eq('company_id', record.company_id);

      if (updateError) {
        // Проверить, не duplicate ли это
        if (updateError.code === '23505') {
          console.log(`🔴 Дубликат: ${record.company_name} → ${normalizedDomain}`);
          duplicates++;
          
          // Сохранить информацию о дубликате для последующей обработки
          duplicatesList.push({
            company_id: record.company_id,
            company_name: record.company_name,
            website: record.website,
            normalized_domain: normalizedDomain,
            email: record.email,
            validation_score: record.validation_score,
            created_at: record.created_at
          });
        } else {
          console.log(`❌ Ошибка обновления: ${record.company_name} - ${updateError.message}`);
          skipped++;
        }
      } else {
        updated++;
        if (updated % 50 === 0) {
          console.log(`   ✅ Обновлено: ${updated}/${records.length}`);
        }
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ЗАПОЛНЕНИЕ ЗАВЕРШЕНО');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`📊 ИТОГО:`);
    console.log(`   • Всего найдено: ${records.length}`);
    console.log(`   • Успешно обновлено: ${updated}`);
    console.log(`   • Дубликаты (не обновлено): ${duplicates}`);
    console.log(`   • Пропущено (некорректный URL): ${skipped}\n`);

    // Шаг 4: Обработка дубликатов
    if (duplicates > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️  ОБРАБОТКА ДУБЛИКАТОВ');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log(`Найдено ${duplicates} дубликатов. Проверяю существующие записи...\n`);

      let mergedCount = 0;
      let deletedCount = 0;

      for (const duplicate of duplicatesList) {
        // Найти существующую запись с этим доменом
        const { data: existing, error: findError } = await supabase
          .from('pending_companies')
          .select('company_id, company_name, website, email, validation_score, stage2_status, stage3_status, stage4_status, created_at')
          .eq('normalized_domain', duplicate.normalized_domain)
          .neq('company_id', duplicate.company_id)
          .limit(1);

        if (findError || !existing || existing.length === 0) {
          console.log(`   ⚠️  Не найдена существующая запись для: ${duplicate.company_name}`);
          continue;
        }

        const existingRecord = existing[0];
        
        console.log(`\n   🔍 Дубликат: ${duplicate.company_name}`);
        console.log(`      Домен: ${duplicate.normalized_domain}`);
        console.log(`      Существующая: ${existingRecord.company_name} (создана: ${existingRecord.created_at})`);
        console.log(`      Дубликат:     ${duplicate.company_name} (создана: ${duplicate.created_at})`);

        // Решение: Оставить запись с ЛУЧШИМИ данными
        const shouldKeepExisting = (
          // Приоритет 1: Есть email
          (existingRecord.email && !duplicate.email) ||
          // Приоритет 2: Выше validation_score
          ((existingRecord.validation_score || 0) > (duplicate.validation_score || 0)) ||
          // Приоритет 3: Более поздние стадии
          (existingRecord.stage4_status === 'completed' && duplicate.stage4_status !== 'completed') ||
          (existingRecord.stage3_status === 'completed' && duplicate.stage3_status !== 'completed') ||
          // Приоритет 4: Раньше создана
          (new Date(existingRecord.created_at) < new Date(duplicate.created_at))
        );

        if (shouldKeepExisting) {
          // Оставить существующую, удалить дубликат
          console.log(`      ✅ Оставляем существующую (лучше данные)`);
          
          // Если у дубликата есть email, а у существующей нет - обновить
          if (duplicate.email && !existingRecord.email) {
            await supabase
              .from('pending_companies')
              .update({ email: duplicate.email })
              .eq('company_id', existingRecord.company_id);
            console.log(`      🎁 Скопирован email из дубликата`);
            mergedCount++;
          }
          
          // Удалить дубликат
          await supabase
            .from('pending_companies')
            .delete()
            .eq('company_id', duplicate.company_id);
          console.log(`      🗑️  Удален дубликат`);
          deletedCount++;
        } else {
          // Оставить дубликат, удалить существующую (и обновить domain у дубликата)
          console.log(`      ✅ Оставляем дубликат (лучше данные)`);
          
          // Если у существующей есть email, а у дубликата нет - скопировать
          if (existingRecord.email && !duplicate.email) {
            await supabase
              .from('pending_companies')
              .update({ email: existingRecord.email })
              .eq('company_id', duplicate.company_id);
            console.log(`      🎁 Скопирован email из существующей`);
            mergedCount++;
          }
          
          // Удалить существующую
          await supabase
            .from('pending_companies')
            .delete()
            .eq('company_id', existingRecord.company_id);
          console.log(`      🗑️  Удалена существующая`);
          
          // Теперь можно обновить normalized_domain у дубликата
          await supabase
            .from('pending_companies')
            .update({ normalized_domain: duplicate.normalized_domain })
            .eq('company_id', duplicate.company_id);
          console.log(`      ✅ Обновлен normalized_domain`);
          deletedCount++;
          updated++;
        }
      }

      console.log(`\n   📊 Обработано дубликатов:`);
      console.log(`      • Удалено: ${deletedCount}`);
      console.log(`      • Слияние данных: ${mergedCount}`);
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 ВСЕ ГОТОВО!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`✅ Финальная статистика:`);
    console.log(`   • Записей обновлено: ${updated}`);
    console.log(`   • Дубликатов удалено: ${duplicates > 0 ? 'да' : 'нет'}\n`);

  } catch (err) {
    console.error('❌ Критическая ошибка:', err);
  }
}

fillNormalizedDomains().catch(console.error);

