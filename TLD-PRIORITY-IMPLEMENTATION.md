# TLD Priority System - Implementation Plan

## Проблема

В базе данных есть дубликаты компаний с разными TLD:
- `wayken.cn`, `wayken.com`, `wayken.net` - это одна компания
- `gensun.com`, `gensun.com.cn` - это одна компания
- Всего **23 группы** с **27 дубликатами**

Для китайских поставщиков приоритет: `.cn` > `.com.cn` > `.com` > остальные

---

## Решение: DomainPriorityManager

✅ Создан `src/utils/DomainPriorityManager.js`

### Функционал:
- `extractBaseDomain(domain)` - извлечь wayken из wayken.cn
- `extractTld(domain)` - извлечь .cn из wayken.cn
- `getTldPriority(domain)` - получить числовой приоритет
- `isSameCompany(domain1, domain2)` - проверка одной компании
- `selectBest(domains)` - выбрать лучший домен из массива
- `selectBestRecord(records)` - выбрать лучшую запись для слияния

### Приоритеты TLD:
1. `.cn` - китайский национальный (ВЫСШИЙ)
2. `.com.cn` - китайский коммерческий
3. `.net.cn` - китайский сетевой
4. `.org.cn` - китайские организации
5. `.com` - международный коммерческий
6. `.net`, `.co`, `.org`, `.io`, `.asia` и т.д.

---

## План интеграции

### Этап 1: Stage 1 (Поиск компаний) - КРИТИЧНО ✅

**Где:** `src/stages/Stage1FindCompanies.js`

**Что делать:**
1. Импортировать `DomainPriorityManager`
2. В методе `_checkExistingCompanies()`:
   - При проверке существующих компаний использовать `base_domain`
   - Если найдена компания с тем же `base_domain` → это дубликат
   - Пример: если в БД есть `wayken.com`, а AI нашел `wayken.cn`:
     - Это одна компания (base_domain = `wayken`)
     - Сравнить приоритеты: `.cn` (1) vs `.com` (5) → `.cn` лучше
     - Обновить существующую запись на `.cn` (если она лучше)
     - Или пропустить новую запись (если существующая лучше)

3. В методе `_deduplicateCompanies()`:
   - Дедупликация по `base_domain` вместо `normalized_domain`
   - Для дубликатов внутри одного запроса выбрать лучший TLD

**Код:**
```javascript
// В начале файла
const domainPriorityManager = require('../utils/DomainPriorityManager');

// В _checkExistingCompanies()
async _checkExistingCompanies(companies) {
  // Группировка по base_domain
  const baseDomainMap = {};
  for (const company of companies) {
    if (!company.website) continue;
    const baseDomain = domainPriorityManager.extractBaseDomain(company.website);
    if (!baseDomainMap[baseDomain]) {
      baseDomainMap[baseDomain] = [];
    }
    baseDomainMap[baseDomain].push(company);
  }

  // Проверка каждого base_domain в БД
  const existing = [];
  for (const [baseDomain, companyGroup] of Object.entries(baseDomainMap)) {
    const { data } = await this.db.supabase
      .from('pending_companies')
      .select('company_id, company_name, normalized_domain, website')
      .ilike('normalized_domain', `%${baseDomain}%`); // Примерный запрос
    
    if (data && data.length > 0) {
      // Найдена существующая компания с этим base_domain
      for (const existingCompany of data) {
        const existingBaseDomain = domainPriorityManager.extractBaseDomain(existingCompany.normalized_domain);
        if (existingBaseDomain === baseDomain) {
          existing.push(...companyGroup);
        }
      }
    }
  }

  return existing;
}

// В _deduplicateCompanies()
_deduplicateCompanies(companies) {
  const baseDomainMap = new Map();
  
  for (const company of companies) {
    const baseDomain = domainPriorityManager.extractBaseDomain(company.website || '');
    if (!baseDomain) continue;
    
    if (!baseDomainMap.has(baseDomain)) {
      baseDomainMap.set(baseDomain, []);
    }
    baseDomainMap.get(baseDomain).push(company);
  }
  
  // Для каждой группы выбрать лучшую по TLD
  const deduplicated = [];
  for (const [baseDomain, group] of baseDomainMap.entries()) {
    if (group.length === 1) {
      deduplicated.push(group[0]);
    } else {
      // Выбрать лучший домен
      const best = group.reduce((best, current) => {
        const comparison = domainPriorityManager.compare(
          current.website,
          best.website
        );
        return comparison < 0 ? current : best;
      });
      deduplicated.push(best);
      this.logger.info('Stage 1: TLD deduplication', {
        baseDomain,
        kept: best.website,
        removed: group.filter(c => c !== best).map(c => c.website)
      });
    }
  }
  
  return deduplicated;
}
```

**Результат:** Новые компании с разными TLD не будут добавляться в БД

---

### Этап 2: Stage 2/3/4 (Поиск website/email) - МЕНЕЕ КРИТИЧНО

**Где:** 
- `src/stages/Stage2FindWebsites.js`
- `src/stages/Stage2Retry.js`
- `src/stages/Stage3AnalyzeContacts.js`
- `src/stages/Stage3Retry.js`
- `src/stages/Stage4AnalyzeServices.js`

**Что делать:**
Когда AI находит website для компании:
1. Проверить `base_domain` найденного website
2. Сравнить с `base_domain` текущего website компании (если есть)
3. Если `base_domain` тот же, но новый TLD лучше → обновить website
4. Если `base_domain` отличается → обновить (это другая компания/новая информация)

**Код (для Stage 2):**
```javascript
const domainPriorityManager = require('../utils/DomainPriorityManager');

async _findWebsite(company) {
  // ... existing code ...
  
  if (result.website) {
    let finalWebsite = result.website;
    
    // Если у компании уже есть website, сравнить TLD
    if (company.website) {
      const isSameCompany = domainPriorityManager.isSameCompany(
        company.website,
        result.website
      );
      
      if (isSameCompany) {
        // Та же компания, но возможно другой TLD
        const comparison = domainPriorityManager.compare(
          result.website,
          company.website
        );
        
        if (comparison < 0) {
          // Новый TLD лучше
          this.logger.info('Stage 2: Better TLD found', {
            company: company.company_name,
            old: company.website,
            new: result.website,
            priority: 'new wins'
          });
          finalWebsite = result.website;
        } else {
          // Старый TLD лучше или равен
          this.logger.info('Stage 2: Keeping existing TLD', {
            company: company.company_name,
            existing: company.website,
            found: result.website,
            priority: 'existing wins'
          });
          finalWebsite = company.website; // Оставить старый
        }
      }
    }
    
    const normalizedDomain = this._extractMainDomain(finalWebsite);
    const updateData = {
      website: finalWebsite,
      normalized_domain: normalizedDomain,
      // ... rest of update data
    };
    
    await this.db.update('pending_companies', company.company_id, updateData);
  }
}
```

**Результат:** Если AI найдет `wayken.com`, но в БД уже есть `wayken.cn`, система оставит `.cn` (приоритет выше)

---

### Этап 3: Cleanup существующих дубликатов

**Скрипт:** `scripts/cleanup-tld-duplicates.js`

**Логика:**
1. Найти все группы с одинаковым `base_domain`
2. Для каждой группы:
   - Использовать `selectBestRecord()` для выбора лучшей записи
   - Критерии: TLD приоритет → validation_score → наличие email → дата создания
   - Слить данные (email, tags, scores) из худших записей в лучшую
   - Удалить худшие записи

**Код:**
```javascript
const domainPriorityManager = require('../src/utils/DomainPriorityManager');

async function cleanupTldDuplicates() {
  // 1. Получить все компании
  const { data: companies } = await supabase
    .from('pending_companies')
    .select('*')
    .not('normalized_domain', 'is', null);
  
  // 2. Группировка по base_domain
  const baseDomainGroups = {};
  for (const company of companies) {
    const baseDomain = domainPriorityManager.extractBaseDomain(company.normalized_domain);
    if (!baseDomainGroups[baseDomain]) {
      baseDomainGroups[baseDomain] = [];
    }
    baseDomainGroups[baseDomain].push(company);
  }
  
  // 3. Обработка дубликатов
  for (const [baseDomain, group] of Object.entries(baseDomainGroups)) {
    if (group.length <= 1) continue;
    
    // Выбрать лучшую запись
    const best = domainPriorityManager.selectBestRecord(group);
    const toDelete = group.filter(c => c.company_id !== best.company_id);
    
    console.log(`\n🔍 ${baseDomain}:`);
    console.log(`   ✅ Keeping: ${best.company_name} (${best.normalized_domain})`);
    console.log(`   🗑️  Deleting: ${toDelete.length} records`);
    
    // Слияние данных
    for (const duplicate of toDelete) {
      // Если у дубликата есть email, а у best нет → скопировать
      if (duplicate.email && !best.email) {
        await supabase
          .from('pending_companies')
          .update({ email: duplicate.email })
          .eq('company_id', best.company_id);
        console.log(`      📧 Merged email from ${duplicate.normalized_domain}`);
      }
      
      // Удалить дубликат
      await supabase
        .from('pending_companies')
        .delete()
        .eq('company_id', duplicate.company_id);
    }
  }
}
```

**Результат:** 23 группы → 23 лучшие записи, остальные удалены

---

## Приоритет реализации

### 🔥 КРИТИЧНО (сделать сейчас):
1. ✅ Создан `DomainPriorityManager`
2. ⏳ Интегрировать в **Stage 1** (дедупликация)
3. ⏳ Создать cleanup скрипт для существующих дубликатов

### 📝 ВАЖНО (следующий шаг):
4. ⏳ Интегрировать в **Stage 2/3/4** (при нахождении website)

### 🎯 ОПЦИОНАЛЬНО (на будущее):
5. ⏳ Добавить поле `base_domain` в таблицу БД
6. ⏳ Создать UNIQUE constraint на `base_domain`
7. ⏳ Обновить миграции

---

## Вопросы для обсуждения

1. **Применять ли приоритеты в Stage 2/3/4?**
   - ✅ ДА - если нужна максимальная точность
   - ⚠️  НЕТ - если достаточно Stage 1 + cleanup

2. **Как обрабатывать разные email для одного base_domain?**
   - Пример: `wayken.cn` → `info@wayken.cn`, `wayken.com` → `info@wayken.com`
   - Вариант А: Оставить только email с лучшим TLD
   - Вариант Б: Сохранить все email в массиве
   - **Рекомендация:** Вариант А (оставить один лучший)

3. **Что делать с проблемными группами (9 шт)?**
   - Где email не совпадает с base_domain
   - Пример: `cyanbat.cn` → `cyanbat88@gmail.com`
   - **Рекомендация:** Ручная проверка после автоматического cleanup

---

## Тестирование

✅ Создан `scripts/test-domain-priority.js`

Тесты показывают:
- `wayken.cn` побеждает `wayken.com` ✅
- `gensun.com.cn` побеждает `gensun.com` ✅
- `isSameCompany()` правильно определяет одну компанию ✅
- Все TLD приоритеты работают корректно ✅

---

## Следующие шаги

1. **Сейчас:** Интегрировать `DomainPriorityManager` в Stage 1
2. **Затем:** Создать и запустить cleanup скрипт
3. **Проверить:** База данных без TLD-дубликатов
4. **Опционально:** Интегрировать в Stage 2/3/4

**Готов начать реализацию?** 🚀

