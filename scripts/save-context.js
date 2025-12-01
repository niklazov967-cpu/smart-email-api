#!/usr/bin/env node

/**
 * 💬 SAVE CONVERSATION CONTEXT - Сохранение контекста разговора
 * 
 * Сохраняет текущий контекст разговора в checkpoint для полного восстановления
 * 
 * Usage: node scripts/save-context.js <version> <context-text>
 * Example: node scripts/save-context.js v3.0.0 "Стабильная версия после релиза"
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function saveContext(version, contextText = null) {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log(`║     💬 СОХРАНЕНИЕ КОНТЕКСТА ${version.padEnd(32)}║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const checkpointDir = path.join(__dirname, '..', 'checkpoints', version);
  
  if (!fs.existsSync(checkpointDir)) {
    console.error(`❌ Checkpoint ${version} не найден!`);
    console.error('   Сначала создайте checkpoint:');
    console.error(`   node scripts/checkpoint.js create ${version}`);
    process.exit(1);
  }

  // Если текст не передан, запрашиваем интерактивно
  if (!contextText) {
    console.log('📝 Опишите текущее состояние проекта и разговора:');
    console.log('   (Нажмите Enter дважды для завершения)\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const lines = [];
    let emptyLineCount = 0;

    for await (const line of rl) {
      if (line.trim() === '') {
        emptyLineCount++;
        if (emptyLineCount >= 2) {
          break;
        }
      } else {
        emptyLineCount = 0;
        lines.push(line);
      }
    }

    rl.close();
    contextText = lines.join('\n');
  }

  if (!contextText || contextText.trim() === '') {
    console.error('❌ Контекст не может быть пустым!');
    process.exit(1);
  }

  // Создаем объект контекста
  const context = {
    version,
    saved_at: new Date().toISOString(),
    context: contextText,
    metadata: {
      length: contextText.length,
      lines: contextText.split('\n').length
    }
  };

  // Сохраняем контекст
  const contextFile = path.join(checkpointDir, 'context.json');
  fs.writeFileSync(contextFile, JSON.stringify(context, null, 2));

  // Создаем текстовую версию для удобства чтения
  const contextTextFile = path.join(checkpointDir, 'CONTEXT.md');
  const contextMarkdown = `# Контекст разговора для ${version}

Сохранён: ${new Date().toLocaleString('ru-RU')}

## Описание текущего состояния

${contextText}

---

**Примечание:** Этот контекст будет показан при восстановлении checkpoint ${version}
`;
  
  fs.writeFileSync(contextTextFile, contextMarkdown);

  console.log('✅ Контекст сохранён!\n');
  console.log(`📁 Файлы:`);
  console.log(`   • context.json - JSON данные`);
  console.log(`   • CONTEXT.md   - текстовая версия`);
  console.log(`\n📊 Статистика:`);
  console.log(`   • Символов: ${context.metadata.length}`);
  console.log(`   • Строк: ${context.metadata.lines}`);
  console.log(`\n💡 При восстановлении checkpoint ${version} этот контекст будет показан!`);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Запуск
const version = process.argv[2];
const contextText = process.argv.slice(3).join(' ');

if (!version) {
  console.error('❌ Использование: node scripts/save-context.js <version> [context]');
  console.error('   Пример: node scripts/save-context.js v3.0.0 "Стабильная версия"');
  console.error('\n   Если контекст не указан, будет запрошен интерактивно');
  process.exit(1);
}

saveContext(version, contextText || null)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  });

