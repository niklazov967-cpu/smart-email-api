#!/usr/bin/env node

/**
 * 🎯 CHECKPOINT MANAGER - Управление checkpoints
 * 
 * Команды:
 *   list              - Показать все checkpoints
 *   create <version>  - Создать новый checkpoint
 *   restore <version> - Восстановить checkpoint
 *   info <version>    - Показать информацию о checkpoint
 * 
 * Usage: node scripts/checkpoint.js <command> [args]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const checkpointsDir = path.join(__dirname, '..', 'checkpoints');

function listCheckpoints() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                   📦 ДОСТУПНЫЕ CHECKPOINTS                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  if (!fs.existsSync(checkpointsDir)) {
    console.log('❌ Нет checkpoints\n');
    return;
  }

  const checkpoints = fs.readdirSync(checkpointsDir)
    .filter(f => fs.statSync(path.join(checkpointsDir, f)).isDirectory())
    .sort()
    .reverse();

  if (checkpoints.length === 0) {
    console.log('❌ Нет checkpoints\n');
    return;
  }

  checkpoints.forEach((version, index) => {
    const checkpointFile = path.join(checkpointsDir, version, 'checkpoint.json');
    
    if (fs.existsSync(checkpointFile)) {
      const checkpoint = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
      const created = new Date(checkpoint.created_at);
      const size = (JSON.stringify(checkpoint).length / 1024 / 1024).toFixed(2);
      
      console.log(`${index + 1}. ${version}`);
      console.log(`   📅 Создан: ${created.toLocaleString('ru-RU')}`);
      console.log(`   📦 Commit: ${checkpoint.git_commit_short || 'N/A'}`);
      console.log(`   📊 Компаний: ${checkpoint.metadata.total_companies} (${checkpoint.metadata.with_email} с email, ${checkpoint.metadata.validated} проверено AI)`);
      console.log(`   💾 Размер: ${size} MB`);
      console.log('');
    } else {
      console.log(`${index + 1}. ${version} (⚠️  неполный checkpoint)`);
      console.log('');
    }
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 Используйте: node scripts/checkpoint.js restore <version>');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

function showInfo(version) {
  const checkpointFile = path.join(checkpointsDir, version, 'checkpoint.json');
  
  if (!fs.existsSync(checkpointFile)) {
    console.error(`❌ Checkpoint ${version} не найден!`);
    return;
  }

  const checkpoint = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
  
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log(`║               CHECKPOINT ${version.padEnd(40)}║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log('📦 Git информация:');
  console.log(`   Commit:  ${checkpoint.git_commit_short || 'N/A'} (${checkpoint.git_commit || 'N/A'})`);
  console.log(`   Branch:  ${checkpoint.git_branch || 'N/A'}`);
  console.log('');
  
  console.log('📅 Временная метка:');
  console.log(`   Создан:  ${new Date(checkpoint.created_at).toLocaleString('ru-RU')}`);
  console.log('');
  
  console.log('📊 Статистика базы данных:');
  console.log(`   Всего компаний:    ${checkpoint.metadata.total_companies}`);
  console.log(`   С email:           ${checkpoint.metadata.with_email}`);
  console.log(`   Проверено AI:      ${checkpoint.metadata.validated}`);
  console.log(`   Средний score:     ${checkpoint.metadata.average_score}`);
  console.log(`   Сессий:            ${checkpoint.metadata.sessions}`);
  console.log(`   Переводов:         ${checkpoint.metadata.translations}`);
  console.log('');
  
  console.log('💾 Таблицы:');
  console.log(`   pending_companies:    ${checkpoint.database.pending_companies.length} записей`);
  console.log(`   pending_companies_ru: ${checkpoint.database.pending_companies_ru.length} записей`);
  console.log(`   search_sessions:      ${checkpoint.database.search_sessions.length} записей`);
  console.log(`   system_settings:      ${checkpoint.database.system_settings.length} записей`);
  console.log('');
  
  const size = (JSON.stringify(checkpoint).length / 1024 / 1024).toFixed(2);
  console.log(`📦 Размер: ${size} MB`);
  console.log('');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 Для восстановления:');
  console.log(`   node scripts/checkpoint.js restore ${version}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

function showHelp() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                  🎯 CHECKPOINT MANAGER                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log('КОМАНДЫ:\n');
  console.log('  list');
  console.log('    Показать все доступные checkpoints\n');
  
  console.log('  create <version>');
  console.log('    Создать новый checkpoint');
  console.log('    Пример: node scripts/checkpoint.js create v3.0.0\n');
  
  console.log('  restore <version>');
  console.log('    Восстановить checkpoint (код + база данных)');
  console.log('    Пример: node scripts/checkpoint.js restore v3.0.0\n');
  
  console.log('  save-context <version> [text]');
  console.log('    Сохранить контекст разговора для checkpoint');
  console.log('    Пример: node scripts/checkpoint.js save-context v3.0.0 "Стабильная версия"');
  console.log('    Без текста - интерактивный ввод\n');
  
  console.log('  info <version>');
  console.log('    Показать детальную информацию о checkpoint');
  console.log('    Пример: node scripts/checkpoint.js info v3.0.0\n');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 Checkpoint включает:');
  console.log('   ✅ Git коммит (точная версия кода)');
  console.log('   ✅ База данных (все таблицы)');
  console.log('   ✅ Метаданные (статистика, дата)');
  console.log('   ✅ Контекст разговора (опционально)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Парсинг команд
const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case 'list':
  case 'ls':
    listCheckpoints();
    break;
  
  case 'create':
    if (!arg) {
      console.error('❌ Использование: node scripts/checkpoint.js create <version>');
      process.exit(1);
    }
    execSync(`node scripts/create-checkpoint.js ${arg}`, { stdio: 'inherit' });
    break;
  
  case 'restore':
    if (!arg) {
      console.error('❌ Использование: node scripts/checkpoint.js restore <version>');
      process.exit(1);
    }
    execSync(`node scripts/restore-checkpoint.js ${arg}`, { stdio: 'inherit' });
    break;
  
  case 'save-context':
  case 'context':
    if (!arg) {
      console.error('❌ Использование: node scripts/checkpoint.js save-context <version> [text]');
      process.exit(1);
    }
    const contextArgs = process.argv.slice(4).join(' ');
    if (contextArgs) {
      execSync(`node scripts/save-context.js ${arg} "${contextArgs}"`, { stdio: 'inherit' });
    } else {
      execSync(`node scripts/save-context.js ${arg}`, { stdio: 'inherit' });
    }
    break;
  
  case 'info':
    if (!arg) {
      console.error('❌ Использование: node scripts/checkpoint.js info <version>');
      process.exit(1);
    }
    showInfo(arg);
    break;
  
  case 'help':
  case '--help':
  case '-h':
  default:
    showHelp();
    break;
}

