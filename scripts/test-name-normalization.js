#!/usr/bin/env node
/**
 * Тест нормализации названий компаний
 * 
 * Проверяет работу _normalizeCompanyName() на известных дубликатах из базы
 * 
 * Usage: node scripts/test-name-normalization.js
 */

// Функция нормализации (копия из Stage1FindCompanies.js)
function normalizeCompanyName(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }
  
  try {
    return name
      .toLowerCase()
      .trim()
      // Убрать все внутренние пробелы
      .replace(/\s+/g, '')
      // Убрать скобки и их содержимое
      .replace(/\([^)]*\)/g, '')    // Латинские круглые скобки ()
      .replace(/（[^）]*）/g, '')    // Китайские круглые скобки （）
      .replace(/\[[^\]]*\]/g, '')   // Квадратные скобки []
      .replace(/【[^】]*】/g, '')    // Китайские квадратные скобки 【】
      // Убрать специальные символы и пунктуацию
      .replace(/[.,!?;:，。！？；：、]/g, '')
      // Убрать лишние дефисы и подчеркивания
      .replace(/[-_]+/g, '')
      // Убрать точки в конце
      .replace(/\.+$/g, '');
  } catch (error) {
    console.error('Error normalizing name:', name, error.message);
    return name.toLowerCase().trim();
  }
}

// Тест-кейсы из реального анализа БД
const testCases = [
  // Группа 1: "韦肯 (Wayken)"
  {
    group: '韦肯 (Wayken)',
    names: [
      '韦肯 (Wayken)',
      '韦肯',
      '韦肯(Wayken)',
      '韦肯 Wayken',
      ' 韦肯 (Wayken) '
    ],
    expectedNormalized: '韦肯'
  },
  
  // Группа 2: "星速 (Star Rapid)"
  {
    group: '星速 (Star Rapid)',
    names: [
      '星速 (Star Rapid)',
      '星速',
      '星速(Star Rapid)',
      ' 星速 '
    ],
    expectedNormalized: '星速'
  },
  
  // Группа 3: "俊英 (Junyingufacturing)"
  {
    group: '俊英 (Junyingufacturing)',
    names: [
      '俊英 (Junyingufacturing)',
      '俊英',
      '俊英(Junyingufacturing)'
    ],
    expectedNormalized: '俊英'
  },
  
  // Группа 4: "尼斯快速 (Nice Rapid)"
  {
    group: '尼斯快速 (Nice Rapid)',
    names: [
      '尼斯快速 (Nice Rapid)',
      '尼斯快速',
      '尼斯快速(Nice Rapid)'
    ],
    expectedNormalized: '尼斯快速'
  },
  
  // Группа 5: "骏盈 (Junying Manufacturing)"
  {
    group: '骏盈 (Junying Manufacturing)',
    names: [
      '骏盈 (Junying Manufacturing)',
      '骏盈',
      '骏盈(Junying Manufacturing)'
    ],
    expectedNormalized: '骏盈'
  },
  
  // Группа 6: "快速直接 (RapidDirect)"
  {
    group: '快速直接 (RapidDirect)',
    names: [
      '快速直接 (RapidDirect)',
      '快速直接',
      '快速直接(RapidDirect)'
    ],
    expectedNormalized: '快速直接'
  },
  
  // Группа 7: Пунктуация и символы
  {
    group: 'Punctuation Test',
    names: [
      '博瀚精密制造(苏州)有限公司',
      '博瀚精密制造（苏州）有限公司',
      '博瀚精密制造 (苏州) 有限公司',
      '博瀚精密制造苏州有限公司'
    ],
    expectedNormalized: '博瀚精密制造苏州有限公司'
  },
  
  // Группа 8: Квадратные скобки
  {
    group: 'Brackets Test',
    names: [
      '协能(福建)拉链工业有限公司',
      '协能【福建】拉链工业有限公司',
      '协能[福建]拉链工业有限公司',
      '协能 (福建) 拉链工业有限公司'
    ],
    expectedNormalized: '协能福建拉链工业有限公司'
  }
];

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║         🧪 ТЕСТ НОРМАЛИЗАЦИИ НАЗВАНИЙ КОМПАНИЙ                ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

testCases.forEach((testCase, groupIndex) => {
  console.log(`\n📦 Группа ${groupIndex + 1}: ${testCase.group}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Ожидаемый результат: "${testCase.expectedNormalized}"\n`);
  
  const normalizedResults = new Set();
  
  testCase.names.forEach((name, idx) => {
    totalTests++;
    const normalized = normalizeCompanyName(name);
    normalizedResults.add(normalized);
    
    const passed = normalized === testCase.expectedNormalized;
    const icon = passed ? '✅' : '❌';
    
    if (passed) {
      passedTests++;
    } else {
      failedTests++;
    }
    
    console.log(`${icon} ${idx + 1}. "${name}"`);
    console.log(`   → "${normalized}"`);
    if (!passed) {
      console.log(`   ⚠️  Ожидалось: "${testCase.expectedNormalized}"`);
    }
  });
  
  // Проверка уникальности
  if (normalizedResults.size === 1) {
    console.log(`\n✅ Все варианты нормализовались в ОДИН ключ`);
  } else {
    console.log(`\n❌ ОШИБКА: Получено ${normalizedResults.size} разных ключей:`);
    normalizedResults.forEach(result => {
      console.log(`   - "${result}"`);
    });
  }
});

console.log('\n\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║                       📊 ИТОГИ ТЕСТИРОВАНИЯ                   ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log(`\nВсего тестов: ${totalTests}`);
console.log(`✅ Пройдено: ${passedTests} (${((passedTests/totalTests)*100).toFixed(1)}%)`);
console.log(`❌ Провалено: ${failedTests} (${((failedTests/totalTests)*100).toFixed(1)}%)`);

if (failedTests === 0) {
  console.log('\n🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!');
  console.log('✅ Нормализация названий работает корректно');
  console.log('✅ Дубликаты будут корректно определяться');
  process.exit(0);
} else {
  console.log('\n⚠️  ЕСТЬ ПРОВАЛЕННЫЕ ТЕСТЫ!');
  console.log('❌ Нормализация требует доработки');
  process.exit(1);
}

