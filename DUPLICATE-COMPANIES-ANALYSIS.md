# Анализ проблемы дубликатов компаний

## 🐛 Проблема

При параллельном запуске нескольких Stage 1 (на разных сайтах/сессиях) в таблицу `pending_companies` попадают **дубликаты компаний** по одному и тому же домену.

### Пример из логов Railway:
```
info: Stage 1: Company already exists in DB {"domain":"xometry.asia","name":"Xometry择幂科技"}
info: Stage 1: Company already exists in DB {"domain":"lsrpf.com","name":"LS Manufacturing"}
info: Stage 1: Company already exists in DB {"domain":"komacut.com","name":"Komacut科玛科特"}
```

## 🔍 Корень проблемы: RACE CONDITION

### Текущий flow Stage 1:

```
Session A (Start)                    Session B (Start)
       |                                    |
       v                                    v
1. AI запрос компаний              1. AI запрос компаний
   (получает Xometry)                  (получает Xometry)
       |                                    |
       v                                    v
2. Локальная дедупликация          2. Локальная дедупликация
   (уникальна в рамках сессии)        (уникальна в рамках сессии)
       |                                    |
       v                                    v
3. Проверка в БД                   3. Проверка в БД
   SELECT * WHERE website           SELECT * WHERE website
   LIKE '%xometry.asia%'            LIKE '%xometry.asia%'
       |                                    |
       v                                    v
   ❌ НЕ НАЙДЕНО                    ❌ НЕ НАЙДЕНО
   (потому что Session B еще        (потому что Session A еще
    не добавила)                     не добавила)
       |                                    |
       v                                    v
4. INSERT компания                 4. INSERT компания
   ✅ Xometry добавлена             ✅ Xometry добавлена
       |                                    |
       v                                    v
   РЕЗУЛЬТАТ: ДУБЛИКАТ В БД! 🔴
```

### Почему это происходит:

1. **Отсутствие атомарности**: Проверка (SELECT) и вставка (INSERT) - это **две отдельные операции**
2. **Time window**: Между SELECT и INSERT в Session A, Session B тоже делает SELECT
3. **LIKE query**: `WHERE website LIKE '%domain%'` не эффективен для уникальности
4. **Нет constraint**: БД **не блокирует** вставку дубликатов на уровне схемы

## ✅ Решение: Multi-layer Protection

### Подход 1: DATABASE LEVEL (Самый надежный)

#### 1.1. Добавить UNIQUE constraint на нормализованный домен

**Проблема текущей схемы:**
```sql
CREATE TABLE pending_companies (
  website TEXT,  -- НЕТ UNIQUE constraint
  ...
);
```

**Решение:**
```sql
-- Добавить колонку для нормализованного домена
ALTER TABLE pending_companies 
ADD COLUMN normalized_domain TEXT;

-- Создать индекс для ускорения проверок
CREATE INDEX idx_pending_companies_normalized_domain 
ON pending_companies(normalized_domain);

-- Добавить UNIQUE constraint (с учетом NULL для компаний без сайтов)
CREATE UNIQUE INDEX idx_pending_companies_unique_domain 
ON pending_companies(normalized_domain) 
WHERE normalized_domain IS NOT NULL;
```

**Как работает:**
- `normalized_domain` = `xometry.asia`, `lsrpf.com` (без https://, www, путей)
- UNIQUE INDEX блокирует вставку дубликатов **на уровне БД**
- Если Session A пытается INSERT, Session B получит **constraint violation error**
- Решает race condition полностью

#### 1.2. Обработка конфликтов в коде

```javascript
async _saveCompanies(companies, sessionId) {
  for (const company of companies) {
    const domain = this._extractMainDomain(company.website);
    
    try {
      await this.db.supabase
        .from('pending_companies')
        .insert({
          session_id: sessionId,
          company_name: company.name,
          website: company.website,
          normalized_domain: domain,  // NEW
          ...
        });
      
      this.logger.info('Stage 1: Company saved', { 
        name: company.name, 
        domain 
      });
      
    } catch (error) {
      // Если constraint violation - это нормально, компания уже добавлена
      if (error.code === '23505') {  // PostgreSQL unique violation
        this.logger.info('Stage 1: Company already exists (concurrent insert)', {
          name: company.name,
          domain
        });
        continue; // Пропустить, не падать
      }
      
      throw error;  // Другие ошибки - пробросить
    }
  }
}
```

### Подход 2: APPLICATION LEVEL (Дополнительная защита)

#### 2.1. Использовать INSERT ... ON CONFLICT (Upsert)

```javascript
async _saveCompanies(companies, sessionId) {
  for (const company of companies) {
    const domain = this._extractMainDomain(company.website);
    
    const { data, error } = await this.db.supabase
      .from('pending_companies')
      .upsert({
        normalized_domain: domain,  // UNIQUE key
        session_id: sessionId,
        company_name: company.name,
        website: company.website,
        ...
      }, {
        onConflict: 'normalized_domain',  // Если exists - обновить
        ignoreDuplicates: true             // Или просто игнорировать
      });
    
    if (error) {
      this.logger.error('Failed to save company', { error, company });
    }
  }
}
```

#### 2.2. Batch INSERT с deduplication

```javascript
async _saveCompanies(companies, sessionId) {
  // Получить все существующие домены за один запрос (эффективнее)
  const domains = companies.map(c => this._extractMainDomain(c.website)).filter(d => d);
  
  const { data: existing, error } = await this.db.supabase
    .from('pending_companies')
    .select('normalized_domain')
    .in('normalized_domain', domains);
  
  const existingDomains = new Set(existing?.map(e => e.normalized_domain) || []);
  
  // Фильтровать только новые
  const newCompanies = companies.filter(c => {
    const domain = this._extractMainDomain(c.website);
    return domain && !existingDomains.has(domain);
  });
  
  // Batch insert (быстрее)
  if (newCompanies.length > 0) {
    await this.db.supabase
      .from('pending_companies')
      .insert(newCompanies.map(c => ({
        session_id: sessionId,
        company_name: c.name,
        website: c.website,
        normalized_domain: this._extractMainDomain(c.website),
        ...
      })));
  }
}
```

### Подход 3: TRANSACTION LOCK (Сложный, но 100% надежный)

```javascript
async _saveCompanies(companies, sessionId) {
  // Начать транзакцию с блокировкой
  const { data, error } = await this.db.supabase.rpc('save_companies_atomic', {
    companies_json: JSON.stringify(companies),
    session_id: sessionId
  });
}
```

**PostgreSQL функция:**
```sql
CREATE OR REPLACE FUNCTION save_companies_atomic(
  companies_json TEXT,
  session_id UUID
) RETURNS void AS $$
DECLARE
  company JSONB;
BEGIN
  -- Блокировка таблицы на время вставки
  LOCK TABLE pending_companies IN EXCLUSIVE MODE;
  
  FOR company IN SELECT * FROM jsonb_array_elements(companies_json::jsonb)
  LOOP
    INSERT INTO pending_companies (...)
    VALUES (...)
    ON CONFLICT (normalized_domain) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

## 📊 Рекомендуемое решение

### Фаза 1: Миграция БД (Критично)

1. ✅ Добавить `normalized_domain` колонку
2. ✅ Заполнить существующие записи
3. ✅ Создать UNIQUE INDEX
4. ✅ Обновить код для использования `normalized_domain`

### Фаза 2: Обработка конфликтов (Важно)

1. ✅ Обернуть INSERT в try-catch
2. ✅ Логировать concurrent inserts (не ошибку)
3. ✅ Использовать upsert с `ignoreDuplicates`

### Фаза 3: Оптимизация (Опционально)

1. Batch checking существующих доменов
2. Кэширование проверок в рамках одного запроса
3. Advisory locks для критических секций

## 🚀 План внедрения

### Шаг 1: SQL Migration
```sql
-- 1. Добавить колонку
ALTER TABLE pending_companies 
ADD COLUMN normalized_domain TEXT;

-- 2. Заполнить существующие записи
UPDATE pending_companies 
SET normalized_domain = 
  regexp_replace(
    regexp_replace(
      lower(website), 
      '^https?://(www\.)?', ''
    ), 
    '/.*$', ''
  )
WHERE website IS NOT NULL;

-- 3. Создать unique index
CREATE UNIQUE INDEX idx_pending_companies_unique_domain 
ON pending_companies(normalized_domain) 
WHERE normalized_domain IS NOT NULL;
```

### Шаг 2: Code Update
```javascript
// src/stages/Stage1FindCompanies.js

async _saveCompanies(companies, sessionId) {
  let saved = 0;
  let duplicates = 0;
  
  for (const company of companies) {
    const domain = this._extractMainDomain(company.website);
    
    try {
      const { error } = await this.db.supabase
        .from('pending_companies')
        .insert({
          session_id: sessionId,
          company_name: company.name,
          website: company.website,
          normalized_domain: domain,
          email: company.email,
          description: company.description,
          // ... other fields
        });
      
      if (error) {
        if (error.code === '23505') {
          // Unique constraint violation - компания уже exists
          duplicates++;
          this.logger.info('Stage 1: Duplicate domain skipped (concurrent)', {
            name: company.name,
            domain
          });
          continue;
        }
        throw error;
      }
      
      saved++;
      this.logger.info('Stage 1: Company saved', {
        name: company.name,
        domain
      });
      
    } catch (error) {
      this.logger.error('Failed to save company', {
        error: error.message,
        company: company.name
      });
      throw error;
    }
  }
  
  this.logger.info('Stage 1: Save summary', {
    total: companies.length,
    saved,
    duplicates
  });
}
```

## ✅ Ожидаемый результат

После внедрения:

1. ❌ **ДО**: При параллельном запуске → дубликаты в БД
2. ✅ **ПОСЛЕ**: При параллельном запуске → 1 запись в БД, остальные gracefully skipped

**Лог будет:**
```
Session A: Stage 1: Company saved (xometry.asia)
Session B: Stage 1: Duplicate domain skipped (concurrent) (xometry.asia)
```

## 📈 Дополнительные преимущества

1. **Быстрее**: `normalized_domain` с индексом → быстрая проверка
2. **Чище**: Гарантия уникальности на уровне БД
3. **Меньше багов**: Constraint защищает от race conditions
4. **Проще код**: Не нужны сложные блокировки в приложении

## 🔍 Тестирование

### Тест 1: Параллельный запуск
```bash
# Terminal 1
curl -X POST http://localhost:3000/api/sessions/{id}/stage1

# Terminal 2 (сразу после)
curl -X POST http://localhost:3000/api/sessions/{id2}/stage1
```

**Ожидаемо:**
- В БД: 1 запись для каждого домена
- Логи: "Duplicate domain skipped (concurrent)"

### Тест 2: Повторный запуск
```bash
# Запустить Stage 1 дважды подряд
curl -X POST http://localhost:3000/api/sessions/{id}/stage1
curl -X POST http://localhost:3000/api/sessions/{id}/stage1
```

**Ожидаемо:**
- Второй запуск: все компании skipped (уже существуют)

---

**Status:** Ready to implement
**Priority:** HIGH (критическая проблема для production)
**Effort:** ~2 hours (migration + code + testing)

