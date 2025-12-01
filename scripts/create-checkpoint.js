#!/usr/bin/env node

/**
 * 🔒 CREATE CHECKPOINT - Создание полного checkpoint системы
 * 
 * Сохраняет:
 * 1. Текущее состояние базы данных (все таблицы)
 * 2. Git коммит hash
 * 3. Метаданные (дата, версия, статистика)
 * 
 * Usage: node scripts/create-checkpoint.js <version>
 * Example: node scripts/create-checkpoint.js v3.0.0
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function createCheckpoint(version) {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log(`║     🔒 СОЗДАНИЕ CHECKPOINT ${version.padEnd(35)}║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const checkpointDir = path.join(__dirname, '..', 'checkpoints', version);
  
  // Создаем директорию если её нет
  if (!fs.existsSync(checkpointDir)) {
    fs.mkdirSync(checkpointDir, { recursive: true });
  }

  const checkpoint = {
    version,
    created_at: new Date().toISOString(),
    git_commit: null,
    git_branch: null,
    database: {},
    metadata: {}
  };

  try {
    // 1. Получаем Git информацию
    console.log('📦 Git информация...');
    try {
      checkpoint.git_commit = execSync('git rev-parse HEAD').toString().trim();
      checkpoint.git_branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
      checkpoint.git_commit_short = checkpoint.git_commit.substring(0, 7);
      console.log(`   ✅ Commit: ${checkpoint.git_commit_short}`);
      console.log(`   ✅ Branch: ${checkpoint.git_branch}`);
    } catch (error) {
      console.log('   ⚠️  Git info недоступна');
    }

    // 2. Backup базы данных
    console.log('\n💾 Backup базы данных...');
    
    // pending_companies
    console.log('   📊 pending_companies...');
    const { data: companies, error: companiesError } = await supabase
      .from('pending_companies')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (companiesError) throw companiesError;
    checkpoint.database.pending_companies = companies;
    console.log(`   ✅ ${companies.length} записей`);

    // pending_companies_ru
    console.log('   📊 pending_companies_ru...');
    const { data: companiesRu, error: companiesRuError } = await supabase
      .from('pending_companies_ru')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (companiesRuError && companiesRuError.code !== 'PGRST116') {
      throw companiesRuError;
    }
    checkpoint.database.pending_companies_ru = companiesRu || [];
    console.log(`   ✅ ${(companiesRu || []).length} записей`);

    // search_sessions
    console.log('   📊 search_sessions...');
    const { data: sessions, error: sessionsError } = await supabase
      .from('search_sessions')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (sessionsError) throw sessionsError;
    checkpoint.database.search_sessions = sessions;
    console.log(`   ✅ ${sessions.length} записей`);

    // system_settings
    console.log('   📊 system_settings...');
    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('*');
    
    if (settingsError && settingsError.code !== 'PGRST116') {
      throw settingsError;
    }
    checkpoint.database.system_settings = settings || [];
    console.log(`   ✅ ${(settings || []).length} записей`);

    // 3. Собираем статистику
    console.log('\n📊 Статистика...');
    const withEmail = companies.filter(c => c.email).length;
    const validated = companies.filter(c => c.validation_score && c.validation_score > 0).length;
    const avgScore = companies
      .filter(c => c.validation_score && c.validation_score > 0)
      .reduce((sum, c) => sum + c.validation_score, 0) / validated || 0;

    checkpoint.metadata = {
      total_companies: companies.length,
      with_email: withEmail,
      validated: validated,
      average_score: Math.round(avgScore * 10) / 10,
      sessions: sessions.length,
      translations: (companiesRu || []).length
    };

    console.log(`   • Всего компаний: ${checkpoint.metadata.total_companies}`);
    console.log(`   • С email: ${checkpoint.metadata.with_email}`);
    console.log(`   • Проверено AI: ${checkpoint.metadata.validated}`);
    console.log(`   • Средний score: ${checkpoint.metadata.average_score}`);

    // 4. Сохраняем checkpoint
    console.log('\n💾 Сохранение checkpoint...');
    const checkpointFile = path.join(checkpointDir, 'checkpoint.json');
    fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2));
    console.log(`   ✅ Сохранено: ${checkpointFile}`);

    // 5. Создаем README
    const readmeContent = `# Checkpoint ${version}

Создан: ${new Date().toLocaleString('ru-RU')}
Git Commit: ${checkpoint.git_commit_short || 'N/A'}
Git Branch: ${checkpoint.git_branch || 'N/A'}

## Статистика базы данных

- **Всего компаний:** ${checkpoint.metadata.total_companies}
- **С email:** ${checkpoint.metadata.with_email}
- **Проверено AI:** ${checkpoint.metadata.validated}
- **Средний score:** ${checkpoint.metadata.average_score}
- **Сессий:** ${checkpoint.metadata.sessions}
- **Переводов:** ${checkpoint.metadata.translations}

## Таблицы

- \`pending_companies\`: ${companies.length} записей
- \`pending_companies_ru\`: ${(companiesRu || []).length} записей
- \`search_sessions\`: ${sessions.length} записей
- \`system_settings\`: ${(settings || []).length} записей

## Размер checkpoint

${(JSON.stringify(checkpoint).length / 1024 / 1024).toFixed(2)} MB

## Восстановление

\`\`\`bash
node scripts/restore-checkpoint.js ${version}
\`\`\`

Это вернёт:
1. ✅ Git код к коммиту ${checkpoint.git_commit_short || 'N/A'}
2. ✅ База данных к состоянию на ${new Date().toLocaleString('ru-RU')}
3. ✅ Все настройки и сессии
`;

    fs.writeFileSync(path.join(checkpointDir, 'README.md'), readmeContent);

    // 6. Создаем быстрый доступ
    const quickInfoFile = path.join(checkpointDir, 'info.txt');
    const quickInfo = `
╔════════════════════════════════════════════════════════════════╗
║               CHECKPOINT ${version}                              ║
╚════════════════════════════════════════════════════════════════╝

📅 Создан: ${new Date().toLocaleString('ru-RU')}
📦 Commit:  ${checkpoint.git_commit_short || 'N/A'}
🌿 Branch:  ${checkpoint.git_branch || 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 СТАТИСТИКА:

   ${checkpoint.metadata.total_companies} компаний
   ${checkpoint.metadata.with_email} с email
   ${checkpoint.metadata.validated} проверено AI
   ${checkpoint.metadata.average_score} средний score

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔄 ВОССТАНОВЛЕНИЕ:

   node scripts/restore-checkpoint.js ${version}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    fs.writeFileSync(quickInfoFile, quickInfo);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ CHECKPOINT СОЗДАН УСПЕШНО!\n');
    console.log(`📁 Директория: checkpoints/${version}/`);
    console.log(`📄 Файл: checkpoint.json`);
    console.log(`📊 Размер: ${(JSON.stringify(checkpoint).length / 1024 / 1024).toFixed(2)} MB`);
    console.log('\n🔄 Для восстановления выполните:');
    console.log(`   node scripts/restore-checkpoint.js ${version}`);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return checkpoint;

  } catch (error) {
    console.error('\n❌ ОШИБКА при создании checkpoint:', error.message);
    throw error;
  }
}

// Запуск
const version = process.argv[2] || 'v3.0.0';
createCheckpoint(version)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

