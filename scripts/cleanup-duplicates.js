const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ptbefsrvvcrjrfxxtogt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0YmVmc3J2dmNyanJmeHh0b2d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjIyMzIsImV4cCI6MjA3OTc5ODIzMn0.dGFxCU1q0uzc6HrZCUOJY3tp9_QHlFmUmqe2jtzVviA'
);

// Функция нормализации имени компании (как в Stage1FindCompanies.js)
function normalizeCompanyName(name) {
  if (!name) return null;
  return name
    .toLowerCase()
    .replace(/\s+/g, '')           // Убрать все пробелы
    .replace(/[()（）]/g, '')       // Убрать скобки
    .replace(/[.,，。]/g, '');      // Убрать точки и запятые
}

async function cleanupDuplicates() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║              ОЧИСТКА ДУБЛИКАТОВ В pending_companies            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Получаем все записи
    const { data: allRecords, error } = await supabase
      .from('pending_companies')
      .select('company_name, website, email, normalized_domain, created_at, stage2_status, stage3_status, stage4_status, validation_score')
      .order('created_at', { ascending: true }); // Старые первыми

    if (error) {
      console.error('❌ Ошибка при получении данных:', error);
      return;
    }

    console.log(`📊 Всего записей: ${allRecords.length}\n`);

    // Группируем по normalized company name + normalized domain
    const groupMap = {};
    
    allRecords.forEach((record, index) => {
      const normalizedName = normalizeCompanyName(record.company_name);
      const domain = record.normalized_domain || 'null';
      const key = `${normalizedName}___${domain}`;
      
      if (!groupMap[key]) {
        groupMap[key] = [];
      }
      
      groupMap[key].push({ ...record, originalIndex: index });
    });

    // Находим группы с дубликатами
    const duplicateGroups = Object.entries(groupMap)
      .filter(([key, records]) => records.length > 1)
      .map(([key, records]) => ({ key, records }));

    console.log(`🔍 Найдено групп с дубликатами: ${duplicateGroups.length}\n`);

    if (duplicateGroups.length === 0) {
      console.log('✅ Дубликатов не найдено, очистка не требуется!\n');
      return;
    }

    let totalDeleted = 0;
    let totalKept = 0;

    for (const { key, records } of duplicateGroups) {
      const [normalizedName, domain] = key.split('___');
      
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📦 Группа: ${records[0].company_name} (${domain})`);
      console.log(`   Всего записей: ${records.length}`);

      // Сортируем записи по приоритету:
      // 1. Есть email (высший приоритет)
      // 2. Есть website
      // 3. Пройдена stage4
      // 4. Пройдена stage3
      // 5. Пройдена stage2
      // 6. Выше validation_score
      // 7. Раньше создана (created_at)
      
      const sortedRecords = [...records].sort((a, b) => {
        // 1. Email
        if (a.email && !b.email) return -1;
        if (!a.email && b.email) return 1;
        
        // 2. Website
        if (a.website && !b.website) return -1;
        if (!a.website && b.website) return 1;
        
        // 3. Stage 4
        if (a.stage4_status === 'completed' && b.stage4_status !== 'completed') return -1;
        if (a.stage4_status !== 'completed' && b.stage4_status === 'completed') return 1;
        
        // 4. Stage 3
        if (a.stage3_status === 'completed' && b.stage3_status !== 'completed') return -1;
        if (a.stage3_status !== 'completed' && b.stage3_status === 'completed') return 1;
        
        // 5. Stage 2
        if (a.stage2_status === 'completed' && b.stage2_status !== 'completed') return -1;
        if (a.stage2_status !== 'completed' && b.stage2_status === 'completed') return 1;
        
        // 6. Validation score
        const scoreA = a.validation_score || 0;
        const scoreB = b.validation_score || 0;
        if (scoreA !== scoreB) return scoreB - scoreA;
        
        // 7. Created at (раньше лучше)
        return new Date(a.created_at) - new Date(b.created_at);
      });

      const recordToKeep = sortedRecords[0];
      const recordsToDelete = sortedRecords.slice(1);

      console.log(`   ✅ ОСТАВЛЯЕМ:`);
      console.log(`      - ${recordToKeep.company_name}`);
      console.log(`        website: ${recordToKeep.website || 'none'}`);
      console.log(`        email: ${recordToKeep.email || 'none'}`);
      console.log(`        stages: 2=${recordToKeep.stage2_status || 'none'}, 3=${recordToKeep.stage3_status || 'none'}, 4=${recordToKeep.stage4_status || 'none'}`);
      console.log(`        created: ${recordToKeep.created_at}`);

      if (recordsToDelete.length > 0) {
        console.log(`   ❌ УДАЛЯЕМ: ${recordsToDelete.length} записей`);
        
        for (const record of recordsToDelete) {
          // Удаляем по уникальной комбинации полей
          const { error: deleteError } = await supabase
            .from('pending_companies')
            .delete()
            .eq('company_name', record.company_name)
            .eq('created_at', record.created_at);

          if (deleteError) {
            console.log(`      ⚠️  Ошибка удаления: ${deleteError.message}`);
          } else {
            console.log(`      🗑️  Удалено: ${record.company_name} (created: ${record.created_at})`);
            totalDeleted++;
          }
        }
      }

      totalKept++;
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ОЧИСТКА ЗАВЕРШЕНА');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`📊 ИТОГО:`);
    console.log(`   • Групп обработано: ${duplicateGroups.length}`);
    console.log(`   • Записей оставлено: ${totalKept}`);
    console.log(`   • Записей удалено: ${totalDeleted}`);
    console.log(`   • Итого в БД: ${allRecords.length - totalDeleted}\n`);

  } catch (err) {
    console.error('❌ Критическая ошибка:', err);
  }
}

cleanupDuplicates().catch(console.error);

