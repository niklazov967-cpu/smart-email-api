#!/usr/bin/env node

/**
 * 🔄 RESTORE CHECKPOINT - Восстановление системы из checkpoint
 * 
 * Восстанавливает:
 * 1. Git код (переключает на нужный коммит)
 * 2. База данных (полная замена данных)
 * 3. Зависимости (npm install)
 * 
 * ⚠️  ВНИМАНИЕ: Это действие удалит текущие данные в БД!
 * 
 * Usage: node scripts/restore-checkpoint.js <version>
 * Example: node scripts/restore-checkpoint.js v3.0.0
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function restoreCheckpoint(version, skipConfirmation = false) {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log(`║     🔄 ВОССТАНОВЛЕНИЕ CHECKPOINT ${version.padEnd(28)}║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const checkpointFile = path.join(__dirname, '..', 'checkpoints', version, 'checkpoint.json');

  // Проверяем существование checkpoint
  if (!fs.existsSync(checkpointFile)) {
    console.error(`❌ Checkpoint ${version} не найден!`);
    console.error(`   Путь: ${checkpointFile}`);
    console.error('\n📁 Доступные checkpoints:');
    
    const checkpointsDir = path.join(__dirname, '..', 'checkpoints');
    if (fs.existsSync(checkpointsDir)) {
      const available = fs.readdirSync(checkpointsDir)
        .filter(f => fs.statSync(path.join(checkpointsDir, f)).isDirectory());
      
      if (available.length > 0) {
        available.forEach(v => console.log(`   • ${v}`));
      } else {
        console.log('   (нет checkpoints)');
      }
    }
    
    process.exit(1);
  }

  // Загружаем checkpoint
  const checkpoint = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));

  console.log('📦 Информация о checkpoint:\n');
  console.log(`   Версия:         ${checkpoint.version}`);
  console.log(`   Создан:         ${new Date(checkpoint.created_at).toLocaleString('ru-RU')}`);
  console.log(`   Git Commit:     ${checkpoint.git_commit_short || 'N/A'}`);
  console.log(`   Git Branch:     ${checkpoint.git_branch || 'N/A'}`);
  console.log(`   Компаний:       ${checkpoint.metadata.total_companies}`);
  console.log(`   С email:        ${checkpoint.metadata.with_email}`);
  console.log(`   Проверено AI:   ${checkpoint.metadata.validated}`);
  console.log(`   Средний score:  ${checkpoint.metadata.average_score}`);

  // Подтверждение
  if (!skipConfirmation) {
    console.log('\n⚠️  ВНИМАНИЕ! Это действие:');
    console.log('   1. Переключит Git на коммит ' + (checkpoint.git_commit_short || 'N/A'));
    console.log('   2. Удалит ВСЕ текущие данные в базе данных');
    console.log('   3. Восстановит данные из checkpoint');
    console.log('   4. Обновит зависимости (npm install)\n');

    const answer = await askQuestion('Продолжить? (yes/no): ');
    if (answer.toLowerCase() !== 'yes') {
      console.log('\n❌ Отменено пользователем');
      process.exit(0);
    }
  }

  try {
    // 1. Восстановление Git
    if (checkpoint.git_commit) {
      console.log('\n📦 Восстановление Git...');
      try {
        // Сохраняем текущие изменения (если есть)
        try {
          execSync('git stash', { stdio: 'pipe' });
          console.log('   ✅ Текущие изменения сохранены в stash');
        } catch (e) {
          // Нет изменений для stash
        }

        // Переключаемся на нужный коммит
        execSync(`git checkout ${checkpoint.git_commit}`, { stdio: 'inherit' });
        console.log(`   ✅ Переключено на commit ${checkpoint.git_commit_short}`);

        // Создаем новую ветку для работы
        const branchName = `restored-${version}-${Date.now()}`;
        try {
          execSync(`git checkout -b ${branchName}`, { stdio: 'pipe' });
          console.log(`   ✅ Создана ветка ${branchName}`);
        } catch (e) {
          console.log('   ⚠️  Ветка уже существует или не удалось создать');
        }

      } catch (error) {
        console.error('   ❌ Ошибка Git:', error.message);
        console.log('   ⚠️  Продолжаем без восстановления Git...');
      }
    }

    // 2. Восстановление базы данных
    console.log('\n💾 Восстановление базы данных...');

    // pending_companies
    console.log('   🗑️  Очистка pending_companies...');
    const { error: deleteCompaniesError } = await supabase
      .from('pending_companies')
      .delete()
      .neq('company_id', '00000000-0000-0000-0000-000000000000'); // Удаляем все
    
    if (deleteCompaniesError) throw deleteCompaniesError;

    console.log(`   📊 Восстановление pending_companies (${checkpoint.database.pending_companies.length} записей)...`);
    
    // Вставляем партиями по 100
    const batchSize = 100;
    for (let i = 0; i < checkpoint.database.pending_companies.length; i += batchSize) {
      const batch = checkpoint.database.pending_companies.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('pending_companies')
        .upsert(batch, { onConflict: 'company_id' });
      
      if (insertError) throw insertError;
      
      process.stdout.write(`\r   📊 Восстановлено: ${Math.min(i + batchSize, checkpoint.database.pending_companies.length)}/${checkpoint.database.pending_companies.length}`);
    }
    console.log('\n   ✅ pending_companies восстановлена');

    // pending_companies_ru
    if (checkpoint.database.pending_companies_ru && checkpoint.database.pending_companies_ru.length > 0) {
      console.log('   🗑️  Очистка pending_companies_ru...');
      const { error: deleteRuError } = await supabase
        .from('pending_companies_ru')
        .delete()
        .neq('company_id', '00000000-0000-0000-0000-000000000000');
      
      if (deleteRuError && deleteRuError.code !== 'PGRST116') throw deleteRuError;

      console.log(`   📊 Восстановление pending_companies_ru (${checkpoint.database.pending_companies_ru.length} записей)...`);
      
      for (let i = 0; i < checkpoint.database.pending_companies_ru.length; i += batchSize) {
        const batch = checkpoint.database.pending_companies_ru.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from('pending_companies_ru')
          .upsert(batch, { onConflict: 'company_id' });
        
        if (insertError) throw insertError;
        
        process.stdout.write(`\r   📊 Восстановлено: ${Math.min(i + batchSize, checkpoint.database.pending_companies_ru.length)}/${checkpoint.database.pending_companies_ru.length}`);
      }
      console.log('\n   ✅ pending_companies_ru восстановлена');
    }

    // search_sessions
    console.log('   🗑️  Очистка search_sessions...');
    const { error: deleteSessionsError } = await supabase
      .from('search_sessions')
      .delete()
      .neq('session_id', '00000000-0000-0000-0000-000000000000');
    
    if (deleteSessionsError) throw deleteSessionsError;

    console.log(`   📊 Восстановление search_sessions (${checkpoint.database.search_sessions.length} записей)...`);
    
    for (let i = 0; i < checkpoint.database.search_sessions.length; i += batchSize) {
      const batch = checkpoint.database.search_sessions.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('search_sessions')
        .upsert(batch, { onConflict: 'session_id' });
      
      if (insertError) throw insertError;
    }
    console.log('   ✅ search_sessions восстановлена');

    // system_settings
    if (checkpoint.database.system_settings && checkpoint.database.system_settings.length > 0) {
      console.log('   🗑️  Очистка system_settings...');
      const { error: deleteSettingsError } = await supabase
        .from('system_settings')
        .delete()
        .neq('key', 'non-existent-key');
      
      if (deleteSettingsError && deleteSettingsError.code !== 'PGRST116') throw deleteSettingsError;

      console.log(`   📊 Восстановление system_settings (${checkpoint.database.system_settings.length} записей)...`);
      const { error: insertError } = await supabase
        .from('system_settings')
        .upsert(checkpoint.database.system_settings, { onConflict: 'key' });
      
      if (insertError) throw insertError;
      console.log('   ✅ system_settings восстановлена');
    }

    // 3. Обновление зависимостей
    console.log('\n📦 Обновление зависимостей...');
    try {
      execSync('npm install', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
      console.log('   ✅ Зависимости обновлены');
    } catch (error) {
      console.log('   ⚠️  Ошибка npm install, но продолжаем...');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ CHECKPOINT ВОССТАНОВЛЕН УСПЕШНО!\n');
    console.log(`   Версия:       ${checkpoint.version}`);
    console.log(`   Коммит:       ${checkpoint.git_commit_short || 'N/A'}`);
    console.log(`   Компаний:     ${checkpoint.metadata.total_companies}`);
    console.log(`   С email:      ${checkpoint.metadata.with_email}`);
    console.log(`   Проверено AI: ${checkpoint.metadata.validated}`);
    console.log('\n🔄 Перезапустите сервер:');
    console.log('   npm start');
    console.log('\n🚀 Для деплоя на Railway:');
    console.log('   railway up');
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ ОШИБКА при восстановлении checkpoint:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Запуск
const version = process.argv[2];
const skipConfirmation = process.argv.includes('--yes') || process.argv.includes('-y');

if (!version) {
  console.error('❌ Использование: node scripts/restore-checkpoint.js <version>');
  console.error('   Пример: node scripts/restore-checkpoint.js v3.0.0');
  process.exit(1);
}

restoreCheckpoint(version, skipConfirmation)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

