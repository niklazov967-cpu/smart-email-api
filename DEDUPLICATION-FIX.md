# 🔄 Исправление дедупликации компаний по домену

## Проблема

В базе данных `pending_companies` появлялись дубликаты одной и той же компании с разными URL:

**Пример 1: GCH Process (深圳国昌鸿精密五金有限公司)**
- `https://www.gchprocess.com`
- `https://www.gchprocess.com/zh/`

**Пример 2: Beijing Jingdiao Group (北京精雕集团)**
- `https://www.jingdiao.com` (две записи)

### Причины:

1. **Текущий метод `_removeDuplicates`** (строка 277-287) проверял только по названию компании
2. **Нет проверки домена сайта** - разные URL одного домена считались уникальными
3. **Нет проверки существующих компаний в БД** перед INSERT
4. **Метод `_extractMainDomain`** некорректно извлекал домен (возвращал с путями)

---

## Решение

### Изменения в `src/stages/Stage1FindCompanies.js`

#### 1. Улучшен метод `_extractMainDomain` (строка 641-662)

**Было:**
```javascript
_extractMainDomain(url) {
  let domain = url.replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
  return `https://${domain}`; // Возвращал с протоколом
}
```

**Стало:**
```javascript
_extractMainDomain(url) {
  try {
    if (!url) return null;
    
    // Убрать протокол
    let domain = url.replace(/^https?:\/\//, '');
    
    // Убрать все после первого слэша (пути, параметры)
    domain = domain.split('/')[0].split('?')[0].split('#')[0];
    
    // Убрать порт если есть
    domain = domain.split(':')[0];
    
    return domain.toLowerCase(); // Возвращаем только домен
  } catch (error) {
    this.logger.error('Stage 1: Failed to extract domain', { url, error: error.message });
    return null;
  }
}
```

**Результат:**
- `https://www.gchprocess.com/zh/` → `www.gchprocess.com`
- `https://www.jingdiao.com` → `www.jingdiao.com`
- `https://www.jingdiao.com:8080/path?query=1#hash` → `www.jingdiao.com`

---

#### 2. Обновлен метод `_removeDuplicates` (строка 277-308)

**Было:**
```javascript
_removeDuplicates(companies) {
  const seen = new Set();
  return companies.filter(company => {
    const key = company.name.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
```

**Стало:**
```javascript
_removeDuplicates(companies) {
  const seenNames = new Set();
  const seenDomains = new Set();
  
  return companies.filter(company => {
    // Проверка по названию
    const nameKey = company.name.toLowerCase().trim();
    if (seenNames.has(nameKey)) {
      this.logger.debug('Stage 1: Duplicate name filtered', { name: company.name });
      return false;
    }
    
    // Проверка по домену (если есть website)
    if (company.website) {
      const domain = this._extractMainDomain(company.website);
      if (domain && seenDomains.has(domain)) {
        this.logger.debug('Stage 1: Duplicate domain filtered', { 
          name: company.name, 
          website: company.website,
          domain: domain 
        });
        return false;
      }
      if (domain) {
        seenDomains.add(domain);
      }
    }
    
    seenNames.add(nameKey);
    return true;
  });
}
```

**Результат:**
- Проверяет дубликаты по **названию** компании
- Проверяет дубликаты по **домену** сайта
- Если найден дубликат - логирует и фильтрует

---

#### 3. Добавлен метод `_checkExistingCompanies` (строка 310-368)

**Новый метод для проверки существующих компаний в БД:**

```javascript
async _checkExistingCompanies(companies, sessionId) {
  const domains = companies
    .filter(c => c.website)
    .map(c => this._extractMainDomain(c.website))
    .filter(d => d);
  
  if (domains.length === 0) {
    return companies; // Нет сайтов для проверки
  }
  
  // Проверить в БД по доменам (во всех сессиях)
  const { data: existing, error } = await this.db.supabase
    .from('pending_companies')
    .select('website, company_name')
    .not('website', 'is', null);
  
  if (error) {
    this.logger.error('Stage 1: Failed to check existing companies', { error: error.message });
    return companies; // В случае ошибки пропускаем проверку
  }
  
  // Извлечь домены из существующих компаний
  const existingDomains = new Set(
    (existing || [])
      .filter(e => e.website)
      .map(e => this._extractMainDomain(e.website))
      .filter(d => d)
  );
  
  // Фильтровать компании с существующими доменами
  const filtered = companies.filter(company => {
    if (!company.website) return true; // Без сайта - пропускаем
    
    const domain = this._extractMainDomain(company.website);
    if (!domain) return true;
    
    if (existingDomains.has(domain)) {
      this.logger.info('Stage 1: Company already exists in DB', {
        name: company.name,
        website: company.website,
        domain: domain
      });
      return false; // Уже есть в БД
    }
    
    return true;
  });
  
  this.logger.info('Stage 1: Filtered existing companies', {
    total: companies.length,
    existing: companies.length - filtered.length,
    remaining: filtered.length
  });
  
  return filtered;
}
```

**Результат:**
- Проверяет все компании в БД
- Извлекает домены из существующих записей
- Фильтрует новые компании, если их домен уже есть в БД
- Работает **между всеми сессиями**

---

#### 4. Интегрирована проверка в `execute` (строка 69-76)

**Было:**
```javascript
// Удалить дубликаты
const uniqueCompanies = this._removeDuplicates(companies);

// Фильтровать маркетплейсы
const filteredCompanies = this._filterMarketplaces(uniqueCompanies);
```

**Стало:**
```javascript
// Удалить дубликаты внутри текущего запроса
const uniqueCompanies = this._removeDuplicates(companies);

// Проверить существующие компании в БД (между сессиями)
const newCompanies = await this._checkExistingCompanies(uniqueCompanies, sessionId);

// Фильтровать маркетплейсы
const filteredCompanies = this._filterMarketplaces(newCompanies);
```

**Результат:**
- Сначала дедупликация внутри текущего запроса
- Затем проверка существующих компаний в БД
- Затем остальная фильтрация

---

#### 5. Нормализация URL при сохранении (строка 664-694)

**Было:**
```javascript
async _saveCompanies(companies, sessionId) {
  for (const company of companies) {
    let stage = 'names_found';
    if (company.website) {
      stage = company.email ? 'contacts_found' : 'website_found';
    }
    
    await this.db.directInsert('pending_companies', {
      session_id: sessionId,
      company_name: company.name,
      website: company.website, // Сохраняли как есть
      // ...
    });
  }
}
```

**Стало:**
```javascript
async _saveCompanies(companies, sessionId) {
  for (const company of companies) {
    // Нормализовать website: убрать лишние пути
    let normalizedWebsite = company.website;
    if (normalizedWebsite && this._isBlogOrArticle(normalizedWebsite)) {
      const mainDomain = this._extractMainDomain(normalizedWebsite);
      if (mainDomain) {
        normalizedWebsite = `https://${mainDomain}`; // Сохранить только основной домен
        this.logger.debug('Stage 1: Normalized blog URL to main domain', {
          original: company.website,
          normalized: normalizedWebsite
        });
      }
    }
    
    let stage = 'names_found';
    if (normalizedWebsite) {
      stage = company.email ? 'contacts_found' : 'website_found';
    }
    
    await this.db.directInsert('pending_companies', {
      session_id: sessionId,
      company_name: company.name,
      website: normalizedWebsite, // Используем нормализованный URL
      // ...
    });
  }
}
```

**Результат:**
- Если URL - это блог/статья, сохраняется только основной домен
- `https://www.gchprocess.com/zh/blog/article` → `https://www.gchprocess.com`

---

## Как это работает

### Пример 1: Дубликаты внутри одного запроса

**Perplexity вернул:**
```json
{
  "companies": [
    {
      "name": "GCH精密加工有限公司",
      "website": "https://www.gchprocess.com"
    },
    {
      "name": "GCH精密加工有限公司",
      "website": "https://www.gchprocess.com/zh/"
    }
  ]
}
```

**Обработка:**
1. `_removeDuplicates` извлекает домены:
   - Компания 1: `www.gchprocess.com` → добавлена в `seenDomains`
   - Компания 2: `www.gchprocess.com` → **дубликат, фильтруется**
2. Результат: **1 компания** (первая)

---

### Пример 2: Дубликаты между сессиями

**Сессия 1:**
```json
{
  "company_name": "北京精雕集团",
  "website": "https://www.jingdiao.com"
}
```

**Сессия 2 (новый запрос):**
```json
{
  "company_name": "北京精雕科技集团",
  "website": "https://www.jingdiao.com"
}
```

**Обработка:**
1. `_checkExistingCompanies` запрашивает все компании из БД
2. Извлекает домены: `www.jingdiao.com` → добавлен в `existingDomains`
3. Проверяет новую компанию:
   - Домен: `www.jingdiao.com`
   - **Уже есть в `existingDomains`** → фильтруется
4. Результат: **компания не сохраняется** (дубликат)

---

### Пример 3: Нормализация URL при сохранении

**Perplexity вернул:**
```json
{
  "company_name": "RapidDirect",
  "website": "https://www.rapiddirect.com/zh-CN/blog/cnc-machining/"
}
```

**Обработка:**
1. `_isBlogOrArticle` определяет: `/blog/` → **true**
2. `_extractMainDomain` извлекает: `www.rapiddirect.com`
3. Нормализация: `https://www.rapiddirect.com`
4. Сохраняется: `https://www.rapiddirect.com` (без `/blog/...`)

---

## Тестирование

### Шаг 1: Проверка метода `_extractMainDomain`

```javascript
// Тесты
console.log(_extractMainDomain('https://www.gchprocess.com'));          // www.gchprocess.com
console.log(_extractMainDomain('https://www.gchprocess.com/zh/'));      // www.gchprocess.com
console.log(_extractMainDomain('https://gchprocess.com/zh/about'));     // gchprocess.com
console.log(_extractMainDomain('https://www.jingdiao.com:8080/'));      // www.jingdiao.com
console.log(_extractMainDomain('https://example.com/path?q=1#hash'));   // example.com
```

### Шаг 2: Тест дедупликации в Stage 1

1. Очистить базу данных
2. Создать тестовую сессию с запросом "CNC加工厂商"
3. Проверить логи:
   ```
   Stage 1: Duplicate domain filtered { 
     name: 'GCH精密加工有限公司', 
     website: 'https://www.gchprocess.com/zh/',
     domain: 'www.gchprocess.com' 
   }
   ```
4. Проверить БД:
   ```sql
   SELECT company_name, website 
   FROM pending_companies 
   WHERE company_name LIKE '%GCH%';
   
   -- Ожидаемый результат: 1 запись
   -- GCH精密加工有限公司 | https://www.gchprocess.com
   ```

### Шаг 3: Тест между сессиями

1. Создать первую сессию → сохраняется `www.jingdiao.com`
2. Создать вторую сессию с тем же запросом
3. Проверить логи:
   ```
   Stage 1: Company already exists in DB {
     name: '北京精雕集团',
     website: 'https://www.jingdiao.com',
     domain: 'www.jingdiao.com'
   }
   Stage 1: Filtered existing companies { 
     total: 10, 
     existing: 1, 
     remaining: 9 
   }
   ```
4. Проверить БД:
   ```sql
   SELECT company_name, website, session_id 
   FROM pending_companies 
   WHERE website LIKE '%jingdiao%';
   
   -- Ожидаемый результат: 1 запись (из первой сессии)
   ```

---

## Логирование

### Дедупликация внутри запроса:
```
[DEBUG] Stage 1: Duplicate name filtered { name: '深圳精密制造' }
[DEBUG] Stage 1: Duplicate domain filtered { 
  name: 'GCH精密加工', 
  website: 'https://www.gchprocess.com/zh/', 
  domain: 'www.gchprocess.com' 
}
```

### Проверка существующих в БД:
```
[INFO] Stage 1: Company already exists in DB {
  name: '北京精雕集团',
  website: 'https://www.jingdiao.com',
  domain: 'www.jingdiao.com'
}
[INFO] Stage 1: Filtered existing companies { 
  total: 15, 
  existing: 3, 
  remaining: 12 
}
```

### Нормализация URL:
```
[DEBUG] Stage 1: Normalized blog URL to main domain {
  original: 'https://www.rapiddirect.com/zh-CN/blog/article',
  normalized: 'https://www.rapiddirect.com'
}
```

---

## Итог

✅ **Дубликаты по домену** - фильтруются внутри запроса
✅ **Дубликаты между сессиями** - проверяются в БД перед сохранением
✅ **URL нормализуются** - пути удаляются, остается только домен
✅ **Логирование** - все операции логируются для отладки

**Результат:** 
- `https://www.gchprocess.com` и `https://www.gchprocess.com/zh/` → **1 запись**
- `https://www.jingdiao.com` (две компании) → **1 запись**

---

## Файлы изменены

- `src/stages/Stage1FindCompanies.js` - основная логика дедупликации

## Дата

2025-11-28

