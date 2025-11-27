# 🔄 Как работает система: Полный процесс

## 📖 Пошаговое объяснение от запросов до тегов

---

## 🎯 Этап 0: Подготовка (Генерация запросов)

### Что происходит:
Пользователь вводит основную тему поиска, система генерирует 10-15 под-запросов.

### Пример:

**Входные данные:**
```
Основная тема: "CNC обработка титановых деталей"
```

**Система отправляет промпт в Perplexity Sonar Pro:**
```
Создай 10-15 поисковых запросов на китайском языке
для поиска производителей CNC титановых деталей.

Запросы должны быть:
- Разнообразными (разные формулировки)
- Специфичными (конкретные услуги)
- На китайском языке
```

**Perplexity возвращает:**
```json
{
  "queries": [
    {
      "query_cn": "精密CNC钛合金加工",
      "query_ru": "Прецизионная CNC обработка титановых сплавов",
      "relevance": 95,
      "is_main": true
    },
    {
      "query_cn": "钛合金零件定制加工",
      "query_ru": "Индивидуальная обработка титановых деталей",
      "relevance": 90
    },
    // ... еще 8-13 запросов
  ]
}
```

**Сохранение в БД:**
```sql
INSERT INTO session_queries 
  (session_id, query_cn, query_ru, relevance, is_main, is_selected)
VALUES 
  ('abc-123', '精密CNC钛合金加工', 'Прецизионная...', 95, true, true),
  ('abc-123', '钛合金零件定制加工', 'Индивидуальная...', 90, false, false);
```

**Пользователь выбирает:** 5-10 самых релевантных запросов (ставит галочки)

---

## 🏢 Stage 1: Поиск компаний

### Что происходит:
Для КАЖДОГО выбранного запроса система ищет 8-12 компаний.

### Детальный процесс:

#### 1. Система берёт первый запрос
```javascript
query = "精密CNC钛合金加工"
```

#### 2. Формирует промпт для Perplexity
```
Используй поиск в интернете для поиска реальных производителей.

ЗАДАЧА: Найти лучших производителей в Китае по этому критерию:
精密CNC钛合金加工

ТРЕБОВАНИЯ:
1. Только производители (не дилеры, не торговцы)
2. Компании, которые сами производят продукцию
3. Компании с официальными веб-сайтами
4. Действующие компании (не закрытые)

РЕЗУЛЬТАТ: JSON формат, от 8 до 12 компаний:
{
  "companies": [
    {
      "name": "完整的公司名",
      "website": "https://example.com",
      "email": "info@example.com",
      "phone": "+86-xxx-xxxx-xxxx",
      "brief_description": "краткое описание услуг компании",
      "likely_domain_extension": ".cn"
    }
  ]
}
```

#### 3. Perplexity ищет в интернете
```
[Perplexity внутренний процесс]
1. Запрос в Google/Bing: "精密CNC钛合金加工 中国制造商"
2. Анализ результатов поиска:
   - Alibaba профили компаний
   - 1688.com каталоги
   - Официальные сайты компаний
   - Новостные статьи о компаниях
3. Извлечение информации
4. Форматирование в JSON
```

#### 4. Perplexity возвращает результат
```json
{
  "companies": [
    {
      "name": "深圳拓发精密制造有限公司",
      "website": "https://www.tuofa-cncmachining.com",
      "email": "info@tuofa.com",
      "phone": "+86-755-2345-6789",
      "brief_description": "专业从事钛合金CNC精密加工，提供航空航天和医疗设备零件制造",
      "likely_domain_extension": ".com"
    },
    {
      "name": "东莞骏盈精密五金制品有限公司",
      "website": "https://www.junying-prototype.com",
      "email": "sales@junying.com",
      "phone": "+86-769-8188-8888",
      "brief_description": "快速原型制造和小批量生产，专注钛合金和铝合金加工",
      "likely_domain_extension": ".com"
    },
    {
      "name": "苏州鸿达精密机械有限公司",
      "website": "https://www.hongda-precision.com.cn",
      "email": null,
      "phone": "+86-512-6789-1234",
      "brief_description": "医疗器械精密零件制造，钛合金CNC加工",
      "likely_domain_extension": ".cn"
    },
    {
      "name": "深圳万合精密制造",
      "website": null,
      "email": null,
      "phone": null,
      "brief_description": "汽车零部件和工业设备精密加工",
      "likely_domain_extension": ".cn"
    },
    // ... еще 6-8 компаний
  ],
  "total": 10,
  "note": "Компании найдены через Alibaba, 1688 и официальные сайты"
}
```

#### 5. Система парсит и сохраняет
```javascript
companies.forEach(company => {
  // Определяем stage в зависимости от данных
  let stage = 'names_found';
  if (company.website) {
    stage = (company.email || company.phone) 
      ? 'contacts_found'  // Есть сайт + контакты
      : 'website_found';  // Только сайт
  }
  
  db.query(`
    INSERT INTO pending_companies 
    (session_id, company_name, website, email, phone, description, stage)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [
    sessionId,
    company.name,
    company.website,
    company.email,
    company.phone,
    company.description,
    stage
  ]);
});
```

#### 6. Результат в БД
```
pending_companies table:

company_id | company_name              | website                    | email            | phone           | stage           | description
-----------|---------------------------|----------------------------|------------------|-----------------|-----------------|-------------
uuid-1     | 深圳拓发精密制造有限公司      | tuofa-cncmachining.com     | info@tuofa.com   | +86-755-...     | contacts_found  | 专业从事钛合金...
uuid-2     | 东莞骏盈精密五金制品有限公司  | junying-prototype.com      | sales@junying... | +86-769-...     | contacts_found  | 快速原型制造...
uuid-3     | 苏州鸿达精密机械有限公司      | hongda-precision.com.cn    | NULL             | +86-512-...     | website_found   | 医疗器械精密...
uuid-4     | 深圳万合精密制造             | NULL                       | NULL             | NULL            | names_found     | 汽车零部件...
```

#### 7. Повторяется для всех запросов
```
Запрос 1: "精密CNC钛合金加工" → 10 компаний
Запрос 2: "钛合金零件定制加工" → 9 компаний
Запрос 3: "医疗钛合金零件加工" → 11 компаний
Запрос 4: "航空航天钛合金加工" → 8 компаний
...

Итого: ~50 компаний (с дубликатами)
Уникальных: ~35 компаний
```

---

## 🌐 Stage 2: Поиск сайтов (Оптимизированный!)

### Что происходит:
Ищем сайты ТОЛЬКО для компаний БЕЗ website из Stage 1.

### Детальный процесс:

#### 1. Фильтрация компаний
```sql
SELECT * FROM pending_companies 
WHERE session_id = 'abc-123'
  AND stage = 'names_found'
  AND (website IS NULL OR website = '');
```

**Результат:**
```
1 компания: 深圳万合精密制造 (website = NULL)
34 компании пропущены (уже есть website)
```

#### 2. Для каждой компании БЕЗ сайта
```javascript
company = "深圳万合精密制造"
```

#### 3. Промпт для Perplexity
```
Найди официальный веб-сайт компании из Китая.

КОМПАНИЯ: 深圳万合精密制造

ТРЕБОВАНИЯ:
1. Только официальные сайты (заканчиваются на .cn, .com.cn, .net.cn или .com)
2. НЕ маркетплейсы (Alibaba, 1688, Made-in-China)
3. Основной домен компании, не подразделений

РЕЗУЛЬТАТ: Только URL в формате https://www.example.cn

Если не найдено: выведи "NOT_FOUND"
```

#### 4. Perplexity возвращает
```
https://www.wanhe-manufacturing.com
```

#### 5. Обновление в БД
```sql
UPDATE pending_companies 
SET 
  website = 'https://www.wanhe-manufacturing.com',
  stage = 'website_found'
WHERE company_id = 'uuid-4';
```

### Итог Stage 2:
```
Обработано: 1 компания
Найдено сайтов: 1
Токенов потрачено: 300
Время: 5 секунд

VS старая система:
Обработано бы: 35 компаний
Токенов: 10,500
Время: 2 минуты
```

---

## 📧 Stage 3: Поиск контактов

### Что происходит:
Для компаний с website, но БЕЗ email/phone - ищем контакты на сайте.

### Детальный процесс:

#### 1. Фильтрация
```sql
SELECT * FROM pending_companies 
WHERE session_id = 'abc-123'
  AND stage = 'website_found'
  AND (email IS NULL OR phone IS NULL);
```

**Результат:**
```
2 компании:
- 苏州鸿达精密机械有限公司 (website есть, email нет)
- 深圳万合精密制造 (website есть, контактов нет)
```

#### 2. Промпт для Perplexity
```
Найди контактную информацию на официальном сайте компании.

КОМПАНИЯ: 苏州鸿达精密机械有限公司
САЙТ: https://www.hongda-precision.com.cn

ЗАДАЧА:
1. Зайди на сайт
2. Найди страницу "联系我们" (Контакты) или "Contact Us"
3. Извлеки email и телефон

РЕЗУЛЬТАТ: JSON формат
{
  "email": "найденный email или null",
  "phone": "найденный телефон или null",
  "contact_page": "URL страницы контактов"
}
```

#### 3. Perplexity возвращает
```json
{
  "email": "contact@hongda-precision.com.cn",
  "phone": "+86-512-6789-1234",
  "contact_page": "https://www.hongda-precision.com.cn/contact"
}
```

#### 4. Обновление БД
```sql
UPDATE pending_companies 
SET 
  email = 'contact@hongda-precision.com.cn',
  phone = '+86-512-6789-1234',
  contact_page = 'https://www.hongda-precision.com.cn/contact',
  stage = 'contacts_found'
WHERE company_id = 'uuid-3';
```

---

## 🔍 Stage 4: Анализ услуг

### Что происходит:
Для каждой компании анализируем её сайт и определяем список услуг.

### Детальный процесс:

#### 1. Получаем компании
```sql
SELECT * FROM pending_companies 
WHERE session_id = 'abc-123'
  AND stage = 'contacts_found'
  AND website IS NOT NULL;
```

#### 2. Промпт для Perplexity
```
Проанализируй веб-сайт компании и определи её услуги.

КОМПАНИЯ: 深圳拓发精密制造有限公司
САЙТ: https://www.tuofa-cncmachining.com
ОПИСАНИЕ: 专业从事钛合金CNC精密加工，提供航空航天和医疗设备零件制造

ЗАДАЧА:
1. Изучи сайт компании
2. Определи основные услуги/продукты
3. Классифицируй по категориям

РЕЗУЛЬТАТ: JSON формат
{
  "services": [
    {
      "category": "CNC Machining",
      "subcategories": ["5-axis CNC", "Titanium machining"],
      "confidence": 95
    },
    {
      "category": "Rapid Prototyping",
      "subcategories": ["3D printing", "Vacuum casting"],
      "confidence": 80
    }
  ],
  "main_activity": "краткое описание основной деятельности"
}
```

#### 3. Perplexity анализирует сайт
```
[Perplexity процесс]
1. Загружает главную страницу
2. Ищет страницу "Услуги" / "Products"
3. Анализирует текст
4. Извлекает ключевые слова
5. Классифицирует услуги
```

#### 4. Возвращает результат
```json
{
  "services": [
    {
      "category": "CNC Machining",
      "subcategories": [
        "5-axis CNC milling",
        "Titanium alloy machining",
        "Aluminum machining",
        "Precision turning"
      ],
      "confidence": 95
    },
    {
      "category": "Surface Treatment",
      "subcategories": [
        "Anodizing",
        "Powder coating",
        "Sandblasting"
      ],
      "confidence": 85
    },
    {
      "category": "Rapid Prototyping",
      "subcategories": [
        "3D printing",
        "CNC prototyping"
      ],
      "confidence": 70
    }
  ],
  "main_activity": "CNC precision machining for aerospace and medical industries"
}
```

#### 5. Сохранение в БД
```sql
UPDATE pending_companies 
SET 
  services = '{"services": [...]}'::jsonb,
  main_activity = 'CNC precision machining for...',
  stage = 'services_analyzed'
WHERE company_id = 'uuid-1';
```

---

## 🏷️ Stage 5: Генерация тегов

### Что происходит:
На основе услуг, описания и основной темы - генерируем теги для фильтрации.

### Детальный процесс:

#### 1. Получаем данные компании
```javascript
company = {
  name: "深圳拓发精密制造有限公司",
  website: "tuofa-cncmachining.com",
  description: "专业从事钛合金CNC精密加工...",
  main_activity: "CNC precision machining for aerospace...",
  services: [
    { category: "CNC Machining", subcategories: [...] },
    { category: "Surface Treatment", subcategories: [...] }
  ]
}

mainTopic = "CNC обработка титановых деталей"
```

#### 2. Промпт для DeepSeek (или Perplexity)
```
Проанализируй компанию и создай список тегов для классификации.

КОМПАНИЯ: 深圳拓发精密制造有限公司
ОПИСАНИЕ: 专业从事钛合金CNC精密加工，提供航空航天和医疗设备零件制造
УСЛУГИ:
- CNC Machining (5-axis, Titanium, Aluminum)
- Surface Treatment (Anodizing, Powder coating)
- Rapid Prototyping

ОСНОВНАЯ ТЕМА ПОИСКА: "CNC обработка титановых деталей"

ЗАДАЧА: Создай 5-10 тегов для классификации компании

ТЕГИ ДОЛЖНЫ ВКЛЮЧАТЬ:
1. Материалы (titanium, aluminum, steel...)
2. Технологии (CNC, 5-axis, turning...)
3. Индустрии (aerospace, medical, automotive...)
4. Размер (small-batch, mass-production...)
5. Сертификации (ISO9001, AS9100...)

РЕЗУЛЬТАТ: JSON формат
{
  "tags": [
    { "tag": "titanium-machining", "relevance": 95, "category": "material" },
    { "tag": "5-axis-cnc", "relevance": 90, "category": "technology" },
    { "tag": "aerospace", "relevance": 85, "category": "industry" },
    ...
  ],
  "primary_tags": ["titanium-machining", "cnc-precision"],
  "overall_relevance": 92
}
```

#### 3. AI анализирует
```
[DeepSeek/Perplexity процесс]
1. Сопоставляет услуги с основной темой
2. Извлекает ключевые слова
3. Определяет релевантность
4. Классифицирует по категориям
5. Ранжирует теги
```

#### 4. Возвращает теги
```json
{
  "tags": [
    { "tag": "titanium-machining", "relevance": 95, "category": "material" },
    { "tag": "5-axis-cnc", "relevance": 90, "category": "technology" },
    { "tag": "aerospace", "relevance": 85, "category": "industry" },
    { "tag": "medical-parts", "relevance": 80, "category": "industry" },
    { "tag": "precision-machining", "relevance": 90, "category": "technology" },
    { "tag": "surface-treatment", "relevance": 70, "category": "service" },
    { "tag": "prototyping", "relevance": 65, "category": "service" },
    { "tag": "small-batch", "relevance": 60, "category": "production" }
  ],
  "primary_tags": ["titanium-machining", "cnc-precision", "aerospace"],
  "overall_relevance": 92
}
```

#### 5. Сохранение
```sql
UPDATE pending_companies 
SET 
  tags = '{"tags": [...]}'::jsonb,
  validation_score = 92,
  stage = 'tags_generated'
WHERE company_id = 'uuid-1';
```

---

## ✅ Stage 6: Финализация

### Что происходит:
Перенос валидных компаний в `found_companies`, очистка дубликатов, финальная статистика.

### Процесс:

#### 1. Валидация и фильтрация
```sql
SELECT * FROM pending_companies 
WHERE session_id = 'abc-123'
  AND stage = 'tags_generated'
  AND validation_score >= 70;
```

#### 2. Удаление дубликатов
```javascript
// Группировка по website
uniqueCompanies = companies.reduce((acc, company) => {
  if (!acc.has(company.website)) {
    acc.set(company.website, company);
  } else {
    // Если дубликат - выбираем с лучшим validation_score
    if (company.validation_score > acc.get(company.website).validation_score) {
      acc.set(company.website, company);
    }
  }
  return acc;
}, new Map());
```

#### 3. Перенос в found_companies
```sql
INSERT INTO found_companies 
  (session_id, company_name, website, emails, phones, 
   main_activity, tags, validation_score, stage)
SELECT 
  session_id, 
  company_name, 
  website,
  ARRAY[email]::TEXT[],
  ARRAY[phone]::TEXT[],
  main_activity,
  tags,
  validation_score,
  'finalized'
FROM pending_companies
WHERE session_id = 'abc-123'
  AND stage = 'tags_generated'
  AND validation_score >= 70;
```

#### 4. Обновление статистики сессии
```sql
UPDATE search_sessions
SET 
  companies_found = (SELECT COUNT(*) FROM found_companies WHERE session_id = 'abc-123'),
  status = 'completed',
  end_time = NOW()
WHERE session_id = 'abc-123';
```

---

## 💾 Кеширование

### Как работает кеш:

#### 1. Перед каждым API запросом
```javascript
// Создаём хеш промпта
const promptHash = crypto
  .createHash('md5')
  .update(prompt + stage)
  .digest('hex');

// Проверяем кеш
const cached = await db.query(`
  SELECT response FROM perplexity_cache 
  WHERE prompt_hash = $1 
    AND expires_at > NOW()
`, [promptHash]);

if (cached.rows.length > 0) {
  // Используем кешированный ответ
  return cached.rows[0].response;
}
```

#### 2. После успешного запроса
```javascript
// Сохраняем в кеш
await db.query(`
  INSERT INTO perplexity_cache 
    (prompt_hash, stage, prompt_text, response, tokens_used, expires_at)
  VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours')
  ON CONFLICT (prompt_hash) 
  DO UPDATE SET 
    response = EXCLUDED.response,
    usage_count = perplexity_cache.usage_count + 1,
    last_used_at = NOW()
`, [promptHash, stage, prompt, response, tokensUsed]);
```

#### 3. TTL (Time To Live) для разных стадий
```
Stage 1: 24 часа  (компании меняются редко)
Stage 2: 7 дней   (сайты стабильны)
Stage 3: 7 дней   (контакты стабильны)
Stage 4: 7 дней   (услуги меняются редко)
Stage 5: 7 дней   (теги на основе услуг)
```

---

## 📊 Итоговая статистика

### Пример полного цикла:

```
Входные данные:
└─ Тема: "CNC обработка титановых деталей"

Stage 0: Генерация запросов
├─ Сгенерировано: 12 запросов
├─ Выбрано: 5 запросов
└─ Токены: 2,000

Stage 1: Поиск компаний
├─ Обработано запросов: 5
├─ Найдено компаний: 42
├─ С website: 35 (83%)
├─ С email: 22 (52%)
├─ С phone: 28 (67%)
└─ Токены: 35,000

Stage 2: Поиск сайтов
├─ Обработано: 7 компаний (без website)
├─ Найдено сайтов: 6
└─ Токены: 2,100

Stage 3: Поиск контактов
├─ Обработано: 13 компаний (без контактов)
├─ Найдено email: 9
├─ Найдено phone: 11
└─ Токены: 3,900

Stage 4: Анализ услуг
├─ Обработано: 41 компания (с сайтом)
└─ Токены: 20,500

Stage 5: Генерация тегов
├─ Обработано: 41 компания
└─ Токены: 12,300

Stage 6: Финализация
├─ Валидных: 38 компаний (score ≥ 70)
├─ Удалено дубликатов: 3
└─ ИТОГО: 35 уникальных компаний

═══════════════════════════════════════
ИТОГО:
├─ Всего токенов: 75,800
├─ Стоимость: ~$0.076
├─ Время: ~8 минут
└─ Результат: 35 релевантных компаний
═══════════════════════════════════════
```

---

## 🚀 Оптимизации в действии

### ДО оптимизации (старая система):
```
Stage 1: Только названия
└─ Токены: 30,000

Stage 2: Поиск ВСЕХ 42 сайтов
└─ Токены: 12,600

Итого: 42,600 токенов для Stage 1+2
```

### ПОСЛЕ оптимизации (новая система):
```
Stage 1: Названия + Website + Email + Phone
└─ Токены: 35,000

Stage 2: Поиск только 7 сайтов
└─ Токены: 2,100

Итого: 37,100 токенов для Stage 1+2
Экономия: 5,500 токенов (13%)
+ Больше данных уже после Stage 1!
```

---

*Этот документ объясняет каждый шаг процесса обработки.*

