# 📋 ПОЛНЫЙ SUMMARY ПРОЕКТА SMART-EMAIL-API
## Документация для портирования на другие направления бизнеса

**Версия:** 2.10.0  
**Дата:** 30 ноября 2025  
**Назначение:** Автоматизированный поиск и сбор контактов китайских компаний по заданным темам

---

## 🎯 КОНЦЕПЦИЯ ПРОЕКТА

### Что это?
**Smart Email API** - это полнофункциональная система для автоматического поиска и сбора контактных данных компаний (производителей, поставщиков услуг) с использованием AI.

### Основная идея:
Вместо ручного поиска компаний в Google/Baidu, система:
1. Принимает **основную тему** (например: "Производители деталей для ЧПУ обработки металла")
2. **Генерирует 10-100+ под-запросов** с вариациями через AI
3. По каждому под-запросу **находит 5-15 компаний**
4. Для каждой компании **ищет сайт, email, анализирует услуги**
5. На выходе - **готовая база контактов** с AI валидацией

### Преимущества:
- ✅ **Полная автоматизация** - от темы до готовой базы
- ✅ **Масштабируемость** - 100-1000+ компаний за сессию
- ✅ **Экономия времени** - 2-5 минут вместо часов ручной работы
- ✅ **Качество данных** - AI валидация релевантности
- ✅ **Дедупликация** - автоматическое удаление дубликатов
- ✅ **Real-time мониторинг** - видно прогресс в реальном времени

---

## 🏗️ АРХИТЕКТУРА СИСТЕМЫ

### Technology Stack:

**Backend:**
- Node.js 18+ (Express.js)
- PostgreSQL через Supabase
- Winston (логирование)

**Frontend:**
- Vanilla JavaScript
- HTML5 + CSS3
- Server-Sent Events (SSE) для real-time

**AI APIs:**
- **DeepSeek API** - генерация текста (экономия ~40%)
- **Perplexity Sonar Pro** - сложный анализ и поиск
- **Perplexity Sonar Basic** - простой поиск

**Infrastructure:**
- Railway (deployment)
- Supabase (managed PostgreSQL)
- GitHub (version control)

### Принцип работы:

```
┌─────────────────────────────────────────────────────────────┐
│                    FLOW ДИАГРАММА                           │
└─────────────────────────────────────────────────────────────┘

Пользователь вводит тему
         ↓
┌─────────────────────────────┐
│  STAGE 0: Query Expansion   │  ← DeepSeek API
│  Генерация под-запросов     │     (экономия 40%)
└─────────────────────────────┘
         ↓
   10-100 под-запросов
         ↓
┌─────────────────────────────┐
│  STAGE 1: Find Companies    │  ← Perplexity Sonar Pro
│  Поиск компаний (5-15/запрос)│    (критический этап)
└─────────────────────────────┘
         ↓
   50-1000 компаний
         ↓
┌─────────────────────────────┐
│  STAGE 2: Find Websites     │  ← Perplexity Sonar Basic
│  Поиск сайтов               │    (простой поиск)
└─────────────────────────────┘
         ↓
   Компании с сайтами
         ↓
┌─────────────────────────────┐
│  STAGE 3: Find Emails       │  ← Perplexity Sonar Basic
│  Поиск контактов            │    (извлечение email)
└─────────────────────────────┘
         ↓
   Компании с email
         ↓
┌─────────────────────────────┐
│  STAGE 4: AI Validation     │  ← DeepSeek API
│  Валидация + анализ услуг   │    (экономия 40%)
└─────────────────────────────┘
         ↓
   Готовая база контактов
```

**Экономия API токенов: ~45-48%** благодаря DeepSeek!

---

## 📊 ЭТАПЫ ОБРАБОТКИ (STAGES)

### **STAGE 0: Генерация под-запросов (Query Expansion)**

**API:** DeepSeek (экономия токенов)  
**Файл:** `src/services/QueryExpander.js`  
**Endpoints:** `POST /api/queries/generate`, `POST /api/queries/save`

**Что делает:**
1. Принимает основную тему (китайский или русский язык)
2. Генерирует N под-запросов с вариациями
3. Для каждого запроса:
   - `query_cn` - запрос на китайском
   - `query_ru` - перевод на русский
   - `relevance` - оценка релевантности (0-100)
4. Фильтрует дубликаты (по китайскому тексту)
5. Проверяет существующие запросы в БД
6. Сохраняет в `session_queries`

**Пример:**
```
Основная тема: 
"ЧПУ обработка металла для штучных заказов и малых партий"

Сгенерированные под-запросы:
1. 金属CNC加工服务 (Услуги по CNC обработке металла) - 95%
2. 小批量数控加工厂家 (Производители малых партий ЧПУ) - 92%
3. 精密零件加工服务 (Услуги точной обработки деталей) - 88%
4. 单件CNC加工服务 (Услуги штучной CNC обработки) - 85%
... до 100 запросов
```

**Промпт (упрощенный):**
```javascript
const prompt = `
你是一个专业的搜索查询生成专家。请根据以下主题生成${targetCount}个相关但不重复的搜索查询。

主题：${mainTopic}

要求：
1. 每个查询用中文（简体）
2. 提供俄语翻译
3. 评估相关性(0-100分)
4. 多样化角度：同义词、相关服务、细分类别

格式：
[
  {
    "query_cn": "中文查询",
    "query_ru": "Русский перевод",
    "relevance": 85
  }
]
`;
```

**Особенности:**
- **Мульти-pass генерация** - можно запустить 1-100 проходов
- **Температура увеличивается** с каждым проходом (0.3 → 0.45 → 0.6...)
- **Автоматическая дедупликация** внутри пула и с БД
- **Unified session** - все проходы одной темы в одной сессии
- **Релевантность фильтр** - сохраняются только запросы ≥70%

**Таблицы:**
- `search_sessions` - создается новая или обновляется существующая
- `session_queries` - сохраняются все под-запросы

---

### **STAGE 1: Поиск компаний**

**API:** Perplexity Sonar Pro (критический этап!)  
**Файл:** `src/stages/Stage1FindCompanies.js`  
**Endpoint:** `POST /api/sessions/{id}/stage1`

**Что делает:**
1. Берет все под-запросы из `session_queries` для данной темы
2. По каждому запросу ищет 5-15 компаний
3. Извлекает:
   - Название компании (`company_name`)
   - Website (если найден)
   - Краткое описание (`description`)
4. Нормализует домены: `www.example.com` → `example.com`
5. Проверяет дубликаты по:
   - `normalized_domain` (UNIQUE constraint в БД)
   - `company_name` (перед insert)
6. Фильтрует маркетплейсы (Alibaba, Made-in-China и т.д.)
7. Сохраняет в `pending_companies`

**Пример промпта:**
```javascript
const prompt = `
你是一个专门搜索中国企业的专家。请找到至少${minCompanies}家（最多${maxCompanies}家）提供以下服务/产品的公司：

查询：${searchQuery}

严格要求：
1. 只找中国大陆的企业（不要香港、台湾、澳门）
2. 必须有明确的公司名称（中文全称）
3. 尽量找到公司官方网站
4. 排除B2B平台和市场（如阿里巴巴、慧聪网、中国制造网等）
5. 优先选择有自己生产设施的制造商
6. 不要个人、工作室、小作坊

返回格式（纯JSON数组）：
[
  {
    "name": "公司全称",
    "website": "https://example.com",
    "description": "简要描述（1-2句话）"
  }
]
`;
```

**Обработка:**
- **Parallel processing** - 5 запросов одновременно в батче
- **Retry механизм** - если найдено <5 компаний, повторить с другим промптом
- **Progress tracking** - обновление `stage1_progress` таблицы
- **Detailed logging** - сохранение отчета в `/app/logs/stage1-report-*.txt`

**Фильтрация:**
```javascript
_isMarketplace(website, companyName) {
  const marketplaces = [
    'alibaba.com', 'made-in-china.com', 'globalsources.com',
    'hc360.com', 'china.cn', 'chinasuppliers.com',
    '1688.com', 'taobao.com', 'tmall.com'
  ];
  // ... проверка
}
```

**Статистика:**
- Initial companies: 56
- After existing check: 34 (52.4% дубликаты)
- After marketplace filter: 34 (0% маркетплейсы)
- After normalization: 20
- **Final: 20 компаний** (efficiency rate: 35.7%)

**Таблица:** `pending_companies`

**Ключевые поля:**
```sql
company_id UUID PRIMARY KEY
session_id UUID
company_name TEXT NOT NULL
website TEXT
normalized_domain TEXT UNIQUE
email TEXT
description TEXT
main_activity TEXT
services JSONB
validation_score INTEGER
is_relevant BOOLEAN
current_stage INTEGER (1-4)
stage2_status VARCHAR (NULL/completed/failed/skipped)
stage3_status VARCHAR
stage4_status VARCHAR
created_at TIMESTAMPTZ
```

---

### **STAGE 2: Поиск сайтов**

**API:** Perplexity Sonar Basic (простой поиск)  
**Файлы:** `src/stages/Stage2FindWebsites.js`, `src/stages/Stage2Retry.js`  
**Endpoint:** `POST /api/sessions/global/stage2`

**Что делает:**
1. Выбирает компании где `website IS NULL` и `stage2_status IS NULL`
2. Для каждой компании ищет официальный сайт по названию
3. Обновляет `website` и `normalized_domain`
4. Помечает `stage2_status = 'completed'` или `'failed'`
5. Если не нашел - автоматически запускает **Stage 2 Retry** через DeepSeek

**Пример промпта (Sonar Basic):**
```javascript
const prompt = `
找到中国公司"${companyName}"的官方网站。

要求：
1. 必须是公司官网（不是B2B平台）
2. 返回完整URL
3. 确认网站存在且可访问

只返回URL，不要其他文字。
如果找不到，返回"NOT_FOUND"。
`;
```

**Stage 2 Retry (DeepSeek):**
- Запускается автоматически для `failed` компаний
- Более дешевый API (~40% экономия)
- Логика аналогичная, но через DeepSeek

**Особенности:**
- **Global processing** - обрабатывает ВСЕ компании без сайтов, не только одной темы
- **Batch processing** - 2-3 компании параллельно
- **Real-time progress** через SSE (Server-Sent Events)
- **Progress offset** - Stage 2 Retry учитывает уже обработанные в Stage 2

**Progress tracking:**
```javascript
// Через GlobalProgressEmitter
globalProgressEmitter.startStage('stage2', totalCompanies);
globalProgressEmitter.updateStage('stage2', processed, currentCompany);
globalProgressEmitter.updateTotal('stage2', newTotal); // Для Retry
globalProgressEmitter.finishStage('stage2');
```

---

### **STAGE 3: Поиск email**

**API:** Perplexity Sonar Basic  
**Файлы:** `src/stages/Stage3AnalyzeContacts.js`, `src/stages/Stage3Retry.js`  
**Endpoint:** `POST /api/sessions/global/stage3`

**Что делает:**
1. Выбирает компании где:
   - `email IS NULL`
   - `website IS NOT NULL`
   - `stage3_status IS NULL`
2. Анализирует сайт компании
3. Ищет контактные emails (sales@, info@, contact@)
4. Извлекает и валидирует email адреса
5. Сохраняет лучший email в поле `email`
6. Все найденные контакты в `contacts_json`
7. Если не нашел - **Stage 3 Retry** через DeepSeek

**Пример промпта:**
```javascript
const prompt = `
访问网站 ${website} 并找到公司的联系邮箱。

要求：
1. 优先级：sales@ > info@ > contact@ > 其他
2. 必须是公司邮箱（不是个人邮箱）
3. 确认邮箱格式正确
4. 可以找到多个邮箱

返回JSON格式：
{
  "primary_email": "主要邮箱",
  "all_emails": ["email1", "email2"],
  "contact_page": "联系页面URL"
}

如果找不到，返回：
{
  "primary_email": null,
  "all_emails": [],
  "contact_page": null
}
`;
```

**Email validation:**
```javascript
_validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return false;
  
  // Exclude generic/invalid
  const invalidDomains = ['example.com', 'test.com', 'domain.com'];
  const domain = email.split('@')[1];
  return !invalidDomains.includes(domain);
}
```

**Особенности:**
- Аналогично Stage 2 - глобальная обработка
- Batch processing
- SSE progress
- Stage 3 Retry для failed

---

### **STAGE 4: AI Валидация и анализ услуг**

**API:** DeepSeek (экономия!)  
**Файл:** `src/stages/Stage4AnalyzeServices.js`  
**Endpoint:** `POST /api/sessions/global/stage4`

**Что делает:**
1. Выбирает компании где `stage4_status IS NULL` и `current_stage >= 3`
2. Анализирует:
   - Название компании
   - Website
   - Email
   - Description (если есть)
3. Определяет:
   - `main_activity` - основная деятельность
   - `services` - список услуг (JSONB массив)
   - `validation_score` - оценка релевантности теме (0-100)
   - `is_relevant` - булево (релевантна ли компания)
   - `validation_reason` - причина оценки
4. Обогащает данные компании

**Пример промпта:**
```javascript
const prompt = `
Проанализируй китайскую компанию и оцени её релевантность для темы поиска.

Данные компании:
- Название: ${companyName}
- Сайт: ${website || 'нет данных'}
- Email: ${email || 'нет данных'}
- Описание: ${description || 'нет данных'}

Основная тема поиска: ${topicDescription}

Задачи:
1. Определи основную деятельность компании (1-2 предложения)
2. Перечисли основные услуги/продукты (до 10 пунктов)
3. Оцени релевантность компании заданной теме (0-100)
4. Определи, является ли компания релевантной (true/false)
5. Объясни причину оценки

Верни ТОЛЬКО валидный JSON:
{
  "main_activity": "Основная деятельность компании",
  "services": ["Услуга 1", "Услуга 2", "..."],
  "validation_score": 85,
  "is_relevant": true,
  "validation_reason": "Причина оценки"
}
`;
```

**Критерии релевантности:**
- 90-100: Полностью соответствует теме
- 70-89: Хорошее соответствие
- 50-69: Частичное соответствие
- 0-49: Низкая релевантность

**Особенности:**
- DeepSeek дешевле Perplexity в ~5 раз
- Не требует интернет (текстовый анализ)
- Batch processing (2-3 компании)
- SSE progress

---

## 🔄 ПОЛЬЗОВАТЕЛЬСКИЙ FLOW

### 1. Генерация под-запросов

```
Пользователь → index.html
  ↓
Секция "Шаг 0: Генерация запросов"
  ↓
Ввод:
  - Основная тема (текст)
  - Количество запросов за проход (10-50)
  - Количество проходов (1-100)
  ↓
Кнопка: "✨ Сгенерировать запросы"
  ↓
Frontend → POST /api/queries/generate
  ↓
QueryExpander генерирует через DeepSeek
  ↓
Цикл по количеству проходов:
  - Генерация N запросов
  - Фильтрация релевантных (≥70%)
  - POST /api/queries/save (автоматически!)
  - Обновление прогресса
  ↓
Отображение результатов:
  - Всего сгенерировано: X
  - Релевантных (≥70%): Y
  - Добавлено в базу: Z
  - Дубликатов отфильтровано: D
  ↓
Список добавленных запросов с рейтингом
  ↓
Тема автоматически появляется в Stage 1 dropdown
```

### 2. Запуск поиска компаний (Stage 1)

**Вариант А: Одна тема**
```
Пользователь → Stage 1 секция
  ↓
Dropdown: Выбор темы
  ↓
Отображение:
  - Запросов в теме: 47
  - Статус: новая
  ↓
Кнопка: "🚀 Запустить выбранную тему"
  ↓
Frontend → POST /api/sessions/{id}/stage1
  ↓
Stage1FindCompanies:
  - Загрузка всех запросов темы
  - Parallel processing (5 запросов/батч)
  - Real-time progress (polling каждые 500ms)
  ↓
Progress bar обновляется:
  - Обработано: 25/47
  - Текущий запрос: "金属CNC加工服务"
  - 68% завершено
  ↓
Результат:
  - ✅ Stage 1 завершен!
  - Найдено компаний: 127
  ↓
Статистика обновляется
```

**Вариант Б: ВСЕ темы (НОВОЕ v2.10.0!)**
```
Пользователь → Stage 1 секция
  ↓
Кнопка: "🚀 Запустить ВСЕ темы" (розовая)
  ↓
Подтверждение: "Запустить Stage 1 для ВСЕХ тем?"
  ↓
Frontend → Цикл:
  - GET /api/sessions (загрузка всех тем)
  - Для каждой темы:
    - POST /api/sessions/{id}/stage1
    - Ожидание завершения
    - Задержка 800ms
  ↓
Progress bar пакетной обработки:
  - Тем обработано: 5/12
  - Текущая тема: "Токарная обработка..."
  - Найдено: 47 компаний
  - Всего найдено: 287 компаний
  ↓
Финальная статистика:
  - 🎉 ВСЕ ТЕМЫ ОБРАБОТАНЫ!
  - Успешно: 10 тем
  - Ошибок: 2 темы
  - Всего компаний: 534
```

### 3. Обработка Stage 2-4

```
Пользователь → Stage 2/3/4 секция
  ↓
Отображение статистики:
  - Stage 2: Компаний без сайта: 89
  - Stage 3: Компаний без email: 123
  - Stage 4: Непроверенных: 456
  ↓
Кнопка: "🚀 Запустить Stage X"
  ↓
Frontend → POST /api/sessions/global/stageX
  ↓
Backend:
  - Выбор подходящих компаний (WHERE условия)
  - Batch processing
  - GlobalProgressEmitter для SSE
  ↓
Frontend подключается к SSE:
  - EventSource('/api/sessions/global/progress-stream')
  - Слушает события: stage2:update, stage3:update, stage4:update
  ↓
Real-time progress обновляется:
  - Обработано: 45/89
  - Текущая компания: "深圳精密制造"
  - 51% завершено
  ↓
Результат:
  - ✅ Stage X завершен!
  - Обработано: 89
  - Найдено сайтов/email: 67
  ↓
Статистика обновляется
```

### 4. Просмотр результатов

```
Пользователь → results.html
  ↓
Фильтры:
  - Dropdown: Выбор темы (или "Все темы")
  - Checkbox: "Только с email"
  ↓
Frontend → GET /api/debug/companies?session_id=...&limit=1000
  ↓
Получение данных
  ↓
Frontend дедупликация по email:
  - Приоритет: validation_score > website presence > created_at
  - Отображение только уникальных
  ↓
Таблица компаний:
  - Название | Сайт | Email | Score | Деятельность
  ↓
Кнопка: "📥 Export CSV"
  ↓
Скачивание CSV файла с контактами
```

---

## 🗄️ СТРУКТУРА БАЗЫ ДАННЫХ

### Основные таблицы:

#### 1. `search_sessions` - Темы поиска
```sql
CREATE TABLE search_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_query TEXT NOT NULL,              -- Исходная тема
  topic_description TEXT,                  -- Описание с датой "Тема [30.11 14:30]"
  target_count INTEGER DEFAULT 50,         -- Целевое кол-во запросов
  status VARCHAR(20) DEFAULT 'pending',    -- pending/processing/completed
  companies_found INTEGER DEFAULT 0,       -- Счетчик компаний
  companies_analyzed INTEGER DEFAULT 0,
  companies_added INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  perplexity_api_calls INTEGER DEFAULT 0,
  perplexity_tokens_used INTEGER DEFAULT 0,
  total_cost_usd NUMERIC(10, 6) DEFAULT 0,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2. `session_queries` - Под-запросы
```sql
CREATE TABLE session_queries (
  query_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES search_sessions(session_id) ON DELETE CASCADE,
  main_topic TEXT NOT NULL,                -- Основная тема (для группировки)
  query_cn TEXT NOT NULL,                  -- Запрос на китайском
  query_ru TEXT NOT NULL,                  -- Перевод на русский
  relevance INTEGER DEFAULT 50,            -- Релевантность 0-100
  is_main BOOLEAN DEFAULT FALSE,           -- Это основная тема?
  is_selected BOOLEAN DEFAULT FALSE,       -- Выбран пользователем?
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_session_queries_session ON session_queries(session_id);
CREATE INDEX idx_session_queries_relevance ON session_queries(relevance DESC);
```

#### 3. `pending_companies` - Найденные компании (ГЛАВНАЯ ТАБЛИЦА)
```sql
CREATE TABLE pending_companies (
  company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES search_sessions(session_id) ON DELETE CASCADE,
  
  -- Основные данные
  company_name TEXT NOT NULL,
  website TEXT,
  normalized_domain TEXT,                  -- example.com (без www)
  email TEXT,
  phone TEXT,
  description TEXT,
  
  -- Трекинг этапов
  current_stage INTEGER DEFAULT 1,         -- 1, 2, 3, 4
  stage2_status VARCHAR(50),               -- NULL/completed/failed/skipped
  stage3_status VARCHAR(50),
  stage4_status VARCHAR(50),
  
  -- Stage 2/3/4 raw data (для отладки)
  stage2_raw_data TEXT,
  stage3_raw_data TEXT,
  stage4_raw_data TEXT,
  
  -- Контакты (JSON)
  contacts_json JSONB,                     -- Все найденные контакты
  
  -- AI анализ (Stage 4)
  main_activity TEXT,                      -- Основная деятельность
  services JSONB,                          -- ["Услуга 1", "Услуга 2"]
  validation_score INTEGER,                -- 0-100
  is_relevant BOOLEAN,                     -- true/false
  validation_reason TEXT,                  -- Причина оценки
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Критически важный индекс для дедупликации
CREATE UNIQUE INDEX idx_pending_companies_unique_domain 
ON pending_companies (normalized_domain) 
WHERE normalized_domain IS NOT NULL;

CREATE INDEX idx_pending_companies_session ON pending_companies(session_id);
CREATE INDEX idx_pending_companies_stage ON pending_companies(current_stage);
CREATE INDEX idx_pending_companies_email ON pending_companies(email);
```

#### 4. `stage1_progress` - Прогресс Stage 1
```sql
CREATE TABLE stage1_progress (
  session_id UUID PRIMARY KEY REFERENCES search_sessions(session_id) ON DELETE CASCADE,
  total_queries INTEGER NOT NULL DEFAULT 0,
  processed_queries INTEGER NOT NULL DEFAULT 0,
  remaining_queries INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'idle',  -- idle/processing/completed/error
  current_query TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 5. `stage2_progress` - Прогресс Stage 2
```sql
CREATE TABLE stage2_progress (
  session_id UUID PRIMARY KEY REFERENCES search_sessions(session_id) ON DELETE CASCADE,
  total_companies INTEGER NOT NULL DEFAULT 0,
  processed_companies INTEGER NOT NULL DEFAULT 0,
  remaining_companies INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'idle',
  current_company TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 6. `api_credits_log` - Логирование API вызовов
```sql
CREATE TABLE api_credits_log (
  log_id SERIAL PRIMARY KEY,
  session_id UUID REFERENCES search_sessions(session_id),
  stage VARCHAR(100) NOT NULL,             -- stage1_find_companies, query_expansion, etc.
  api_name VARCHAR(50) NOT NULL,           -- perplexity, deepseek
  model VARCHAR(50) NOT NULL,              -- sonar-pro, sonar, deepseek-chat
  tokens_used INTEGER NOT NULL,
  cost_usd NUMERIC(10, 6) NOT NULL,
  request_data TEXT,
  response_data TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_credits_log_session ON api_credits_log(session_id);
CREATE INDEX idx_api_credits_log_stage ON api_credits_log(stage);
CREATE INDEX idx_api_credits_log_created ON api_credits_log(created_at DESC);
```

#### 7. `system_settings` - Настройки системы
```sql
CREATE TABLE system_settings (
  setting_id SERIAL PRIMARY KEY,
  category VARCHAR(100) NOT NULL,          -- api, processing_stages, rate_limiting
  key VARCHAR(100) NOT NULL,
  value TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category, key)
);

-- Примеры настроек:
INSERT INTO system_settings (category, key, value, description) VALUES
  ('api', 'perplexity_api_key', '', 'Perplexity API key'),
  ('api', 'deepseek_api_key', '', 'DeepSeek API key'),
  ('processing_stages', 'stage1_companies_per_query', '12', 'Companies per query'),
  ('processing_stages', 'stage2_concurrent_requests', '3', 'Concurrent website lookups'),
  ('rate_limiting', 'rate_limit_requests_per_min', '60', 'Max requests per minute'),
  ('rate_limiting', 'min_delay_between_requests', '500', 'Min delay (ms)');
```

### Связи между таблицами:

```
search_sessions (1) ──────── (N) session_queries
       │
       └──────────────────── (N) pending_companies
                                    │
                                    └── (1) stage1_progress
                                    └── (1) stage2_progress
                                    └── (N) api_credits_log
```

---

## 🔌 API ENDPOINTS

### Query Generation

```http
POST /api/queries/generate
Content-Type: application/json

Body: {
  "topic": "ЧПУ обработка металла",
  "numQueries": 10
}

Response: {
  "success": true,
  "queries": [
    {
      "query_cn": "金属CNC加工服务",
      "query_ru": "Услуги по CNC обработке металла",
      "relevance": 95
    },
    ...
  ]
}
```

```http
POST /api/queries/save
Content-Type: application/json

Body: {
  "mainTopic": "ЧПУ обработка металла",
  "queries": [...],
  "sessionId": "uuid" // optional, для multi-pass
}

Response: {
  "success": true,
  "sessionId": "abc-123-...",
  "topic": "ЧПУ обработка металла [30.11 14:30]",
  "count": 10
}
```

### Sessions Management

```http
GET /api/sessions
Response: {
  "success": true,
  "data": [
    {
      "session_id": "uuid",
      "topic_description": "ЧПУ обработка металла [30.11 14:30]",
      "target_count": 47,
      "status": "pending",
      "companies_found": 0,
      "created_at": "2025-11-30T14:30:00Z"
    }
  ]
}
```

```http
GET /api/sessions/:id
Response: {
  "success": true,
  "data": {
    "session_id": "uuid",
    "topic_description": "...",
    "target_count": 47,
    "status": "processing",
    ...
  }
}
```

```http
POST /api/sessions/:id/stage1
Response: {
  "success": true,
  "total": 127,
  "message": "Stage 1 completed for session"
}
```

```http
GET /api/sessions/:id/stage1-progress
Response: {
  "success": true,
  "progress": {
    "total_queries": 47,
    "processed_queries": 25,
    "remaining_queries": 22,
    "status": "processing",
    "current_query": "金属CNC加工服务"
  }
}
```

### Global Processing (Stage 2-4)

```http
POST /api/sessions/global/stage2
Response: {
  "success": true,
  "found": 67,
  "failed": 22,
  "total": 89
}
```

```http
POST /api/sessions/global/stage3
Response: {
  "success": true,
  "found": 54,
  "failed": 35,
  "total": 89
}
```

```http
POST /api/sessions/global/stage4
Response: {
  "success": true,
  "validated": 456,
  "relevant": 389,
  "not_relevant": 67
}
```

```http
GET /api/sessions/global/progress-stream
Content-Type: text/event-stream

Events:
  event: stage2:update
  data: {"total":89,"processed":45,"current":"深圳精密制造"}
  
  event: stage3:update
  data: {"total":123,"processed":67,"current":"东莞五金"}
  
  event: stage4:update
  data: {"total":456,"processed":234,"current":"苏州机械"}
```

### Companies Data

```http
GET /api/debug/companies?session_id=...&limit=1000&include_translations=true
Response: {
  "success": true,
  "companies": [
    {
      "company_id": "uuid",
      "company_name": "深圳精密制造有限公司",
      "website": "https://example.com",
      "email": "sales@example.com",
      "main_activity": "精密零件加工",
      "services": ["CNC加工", "车削", "铣削"],
      "validation_score": 92,
      "is_relevant": true,
      "created_at": "..."
    }
  ],
  "count": 234
}
```

### Credits & Stats

```http
GET /api/credits/stats/total
Response: {
  "success": true,
  "stats": {
    "total_tokens": 1234567,
    "total_cost_usd": "123.45",
    "by_stage": {
      "query_expansion": { "tokens": 50000, "cost": "10.00" },
      "stage1_find_companies": { "tokens": 800000, "cost": "80.00" },
      ...
    },
    "by_api": {
      "deepseek": { "tokens": 400000, "cost": "8.00" },
      "perplexity": { "tokens": 834567, "cost": "115.45" }
    }
  }
}
```

```http
GET /api/credits/history?days=7
Response: {
  "success": true,
  "history": [
    {
      "date": "2025-11-30",
      "tokens": 123456,
      "cost_usd": "12.34",
      "api_calls": 234
    }
  ]
}
```

```http
GET /api/credits/logs?limit=100
Response: {
  "success": true,
  "logs": [
    {
      "log_id": 123,
      "session_id": "uuid",
      "stage": "stage1_find_companies",
      "api_name": "perplexity",
      "model": "sonar-pro",
      "tokens_used": 1234,
      "cost_usd": "0.001234",
      "created_at": "..."
    }
  ]
}
```

### Queue Status

```http
GET /api/debug/queue-status
Response: {
  "success": true,
  "globalQueue": {
    "queueLength": 3,
    "isProcessing": true,
    "lastRequestTime": 1701234567890
  }
}
```

---

## ⚙️ КЛЮЧЕВЫЕ СЕРВИСЫ И КОМПОНЕНТЫ

### 1. **GlobalApiQueue.js** - Глобальная очередь API

**Назначение:** Предотвращение `429 Rate Limit Exceeded`

**Принцип:**
- Singleton pattern - один экземпляр на приложение
- ВСЕ Perplexity запросы (Stage 1-3, sonar-pro и sonar-basic) идут через эту очередь
- Sequential processing с минимальной задержкой 500ms между запросами
- DeepSeek запросы НЕ идут через эту очередь

**API:**
```javascript
const globalQueue = new GlobalApiQueue();

// Добавить задачу
const result = await globalQueue.enqueue(async () => {
  return await fetch('https://api.perplexity.ai/...');
});

// Статус
const status = globalQueue.getStatus();
// { queueLength: 3, isProcessing: true, lastRequestTime: ... }
```

**Логирование:**
```
📭 [GlobalQueue] Task enqueued. Current queue length: 3
🚀 [GlobalQueue] Starting queue processing. Length: 3
🔥 [GlobalQueue] Processing task. Remaining: 2
⏳ [GlobalQueue] Waiting 500ms for rate limit.
✅ [GlobalQueue] Task completed successfully
📭 [GlobalQueue] Queue empty, waiting for new requests...
```

---

### 2. **GlobalProgressEmitter.js** - Real-time прогресс

**Назначение:** Единый источник прогресса для Stage 2/3/4 (global processing)

**Принцип:**
- Singleton EventEmitter
- Эмитит события для SSE
- Хранит текущий прогресс в памяти
- Не использует БД (избегает UUID ошибок для "global")

**API:**
```javascript
const globalProgressEmitter = require('./src/services/GlobalProgressEmitter');

// Начать этап
globalProgressEmitter.startStage('stage2', totalCompanies);

// Обновить прогресс
globalProgressEmitter.updateStage('stage2', processed, currentCompany);

// Обновить total (для Retry)
globalProgressEmitter.updateTotal('stage2', newTotal);

// Завершить
globalProgressEmitter.finishStage('stage2');

// Слушать события
globalProgressEmitter.on('stage2:update', (data) => {
  console.log(data); // { total, processed, current, active }
});
```

**Frontend (SSE):**
```javascript
const eventSource = new EventSource('/api/sessions/global/progress-stream');

eventSource.addEventListener('stage2:update', (event) => {
  const data = JSON.parse(event.data);
  // Update UI: data.total, data.processed, data.current
});
```

---

### 3. **SonarApiClient.js** - Perplexity Sonar обертка

**Назначение:** Обертка для Perplexity API с retry, rate limiting, cost tracking

**Особенности:**
- Retry logic: exponential backoff (1s → 2s → 4s)
- Автоматический выбор модели (sonar-pro или sonar)
- Интеграция с GlobalApiQueue
- Детальное логирование
- Cost estimation

**API:**
```javascript
const sonarClient = new SonarApiClient(apiKey, settingsManager, creditsTracker, logger);

const response = await sonarClient.query(prompt, {
  stage: 'stage1_find_companies',
  model: 'sonar-pro', // или 'sonar'
  maxTokens: 4000,
  useCache: false,
  sessionId: 'uuid'
});
```

**Логирование:**
```
🔵 SonarApiClient.query() START
   Stage: stage1_find_companies
   Model: sonar-pro
   📊 maxRetries = 3
   🔄 Attempt 1/3
   📤 Sending POST to https://api.perplexity.ai/chat/completions
   ⏳ Checking rate limit...
   ✓ Rate limit OK, starting attempts...
   ✅ SUCCESS! Got response (3078 chars, 798 tokens)
   ✅ Completed in 5103ms
```

---

### 4. **DeepSeekClient.js** - DeepSeek обертка

**Назначение:** Аналогично SonarApiClient, но для DeepSeek API

**Особенности:**
- НЕ использует GlobalApiQueue (свой rate limit)
- Дешевле Perplexity в ~5 раз
- Используется для:
  - Query Expansion (Stage 0)
  - Stage 2/3 Retry
  - Stage 4 Validation

**API:**
```javascript
const deepseekClient = new DeepSeekClient(apiKey, settingsManager, creditsTracker, logger);

const response = await deepseekClient.query(prompt, {
  stage: 'query_expansion',
  maxTokens: 8000,
  temperature: 0.3,
  sessionId: 'uuid'
});
```

---

### 5. **CreditsTracker.js** - Трекинг расходов

**Назначение:** Логирование и подсчет API расходов

**Принцип:**
- Каждый API вызов логируется в `api_credits_log`
- Хранит: tokens, cost, stage, api_name, model
- Агрегация для статистики

**API:**
```javascript
const creditsTracker = new CreditsTracker(database, logger);

await creditsTracker.logApiCall({
  sessionId: 'uuid',
  stage: 'stage1_find_companies',
  apiName: 'perplexity',
  model: 'sonar-pro',
  tokensUsed: 1234,
  costUSD: 0.001234,
  requestData: '...',
  responseData: '...'
});
```

---

### 6. **QueryOrchestrator.js** - Координатор этапов

**Назначение:** Управление запуском Stage 1-4

**Методы:**
```javascript
const orchestrator = new QueryOrchestrator(stage1, stage2, stage3, stage4, db, logger);

// Запуск Stage 1 для конкретной темы
await orchestrator.runStage1Only(sessionId);

// Запуск Stage 2 глобально
await orchestrator.runStage2Only('global', globalProgressCallback);

// Запуск Stage 3 глобально
await orchestrator.runStage3Only('global', globalProgressCallback);

// Запуск Stage 4
await orchestrator.runStage4Only();
```

**Обязанности:**
- Инициализация прогресса (stage1_progress, stage2_progress)
- Передача callbacks в Stage классы
- Обработка ошибок
- Финализация прогресса

---

## 🎨 FRONTEND СТРУКТУРА

### Основные страницы:

#### 1. **public/index.html** - Главная панель управления

**Секции:**

**A. Хедер:**
- Логотип + версия приложения
- Commit info (hash, branch, date)
- Queue monitor badge (количество запросов в очереди)

**B. Этап 0: Генерация запросов**
- Input: Основная тема (textarea)
- Input: Количество запросов за проход (10-50)
- Input: Количество проходов (1-100)
- Button: "✨ Сгенерировать запросы"
- Progress bar генерации с процентами
- Статистика: сгенерировано/релевантных/добавлено/дубликатов
- Список сгенерированных запросов с рейтингом

**C. Stage 1: Поиск компаний**
- Dropdown: Выбор темы из созданных
- Info: Запросов в теме, статус
- Progress bar: обработано/всего, текущий запрос, %
- Button 1: "🚀 Запустить выбранную тему"
- Button 2: "🚀 Запустить ВСЕ темы" (розовый gradient)
- Progress bar пакетной обработки: тем обработано, текущая тема, всего компаний
- Status messages
- Статистика: найдено компаний

**D. Stage 2: Поиск сайтов**
- Статистика: компаний без сайта
- Progress bar (real-time SSE)
- Button: "🚀 Запустить Stage 2"
- Status messages

**E. Stage 3: Поиск email**
- Статистика: компаний без email
- Progress bar (real-time SSE)
- Button: "🚀 Запустить Stage 3"
- Status messages

**F. Stage 4: AI Валидация**
- Статистика: непроверенных компаний
- Progress bar (real-time SSE)
- Button: "🚀 Запустить Stage 4"
- Status messages

**G. Итоговая статистика:**
- Компаний прошедших все этапы
- Всего в базе
- Link: → Страница результатов

**JavaScript функции:**
```javascript
// Генерация запросов
async function generateQueries() { ... }

// Stage 1
async function runStage1() { ... }
async function runAllStage1Topics() { ... } // NEW v2.10.0!
function startStage1ProgressMonitor(sessionId) { ... }

// Stage 2-4
async function runStage(stageNumber) { ... }

// Utilities
async function loadSessions() { ... }
async function loadStatistics() { ... }
async function loadVersion() { ... }
```

---

#### 2. **public/results.html** - Результаты

**Секции:**

**A. Хедер:**
- Заголовок "Найденные компании"
- Queue monitor badge

**B. Фильтры:**
- Dropdown: Выбор темы ("Все темы" или конкретная)
- Checkbox: "Только с email"
- Button: "🔄 Обновить"
- Button: "📥 Export CSV"

**C. Статистика:**
- Найденные компании: X
- С email: Y (Z%)

**D. Таблица компаний:**
Колонки:
- № (порядковый номер)
- Название компании
- Сайт (кликабельная ссылка)
- Email (кликабельная ссылка mailto:)
- Score (validation_score с цветовой индикацией)
- Основная деятельность

**Особенности:**
- Frontend дедупликация по email:
  ```javascript
  function deduplicateByEmail(companies) {
    const emailMap = new Map();
    companies.forEach(company => {
      const email = company.email.toLowerCase();
      if (!emailMap.has(email)) {
        emailMap.set(email, company);
      } else {
        // Приоритет: validation_score > website > created_at
        const existing = emailMap.get(email);
        if (company.validation_score > existing.validation_score) {
          emailMap.set(email, company);
        }
      }
    });
    return Array.from(emailMap.values());
  }
  ```
- Pagination (если >100 компаний)
- Export to CSV

---

#### 3. **public/credits.html** - API расходы и статистика

**Секции:**

**A. Общая статистика (карточки):**
- Всего токенов
- Общая стоимость ($)
- API вызовов
- Средняя стоимость/вызов

**B. Breakdown по этапам:**
Таблица:
- Этап | Токены | Стоимость | Вызовов
- Query Expansion | 50K | $10 | 50
- Stage 1 | 800K | $80 | 234
- Stage 2 | 150K | $15 | 89
- ...

**C. Breakdown по API:**
Круговая диаграмма:
- DeepSeek: 40% ($45)
- Perplexity Sonar Pro: 45% ($51)
- Perplexity Sonar Basic: 15% ($17)

**D. График по датам:**
Line chart: дата → стоимость

**E. Детальный лог (таблица):**
- Дата/время | Этап | API | Модель | Токены | Стоимость
- Сортировка, фильтрация
- Pagination

---

#### 4. **public/queue-monitor.css** - Стили виджета очереди

**Badge статусы:**
```css
.queue-badge.loading     /* Загрузка */
.queue-badge.idle        /* Очередь пуста (зеленый) */
.queue-badge.busy        /* 1-5 запросов (желтый) */
.queue-badge.overloaded  /* >5 запросов (красный) */
```

**Pulse animation:**
```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

---

#### 5. **public/queue-monitor.js** - Логика виджета

**Функционал:**
- Polling `/api/debug/queue-status` каждые 2 секунды
- Обновление badge с количеством запросов в очереди
- Цветовая индикация (idle/busy/overloaded)
- Tooltip с деталями

```javascript
async function updateQueueStatus() {
  const response = await fetch('/api/debug/queue-status');
  const data = await response.json();
  
  const { queueLength } = data.globalQueue;
  
  badge.textContent = queueLength === 0 ? '✓' : queueLength;
  
  if (queueLength === 0) {
    badge.className = 'queue-badge idle';
  } else if (queueLength <= 5) {
    badge.className = 'queue-badge busy';
  } else {
    badge.className = 'queue-badge overloaded';
  }
}

setInterval(updateQueueStatus, 2000);
```

---

## 📦 DEPLOYMENT

### Railway Configuration:

**Файл: `railway.json`**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**Environment Variables:**
```bash
NODE_ENV=production
PORT=3000

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...

# AI APIs
DEEPSEEK_API_KEY=sk-...
PERPLEXITY_API_KEY=pplx-...

# Optional
LOG_LEVEL=info
```

**Railway CLI:**
```bash
# Установка
npm install -g railway

# Login
railway login

# Link to project
railway link

# View logs
railway logs --tail 50

# Check status
railway status

# Deploy manually
railway up
```

**Auto-deploy:**
- Push to `main` branch → автоматический деплой
- Railway rebuilds и restarts приложение
- Логи доступны в UI и через CLI

---

## 📊 МЕТРИКИ И ПРОИЗВОДИТЕЛЬНОСТЬ

### Скорость обработки:

| Этап | Время на запрос/компанию | Время на 100 компаний |
|------|--------------------------|------------------------|
| Stage 0 (генерация) | ~5-10 сек на 10 запросов | 1-2 мин на 100 запросов |
| Stage 1 (поиск компаний) | ~5-10 сек на запрос | 2-5 мин на тему (20 запросов) |
| Stage 2 (поиск сайтов) | ~3-5 сек на компанию | ~10 мин (параллельно) |
| Stage 3 (поиск email) | ~3-5 сек на компанию | ~10 мин (параллельно) |
| Stage 4 (валидация) | ~2-3 сек на компанию | ~5 мин (DeepSeek быстрее!) |

**Итого:** ~30-40 минут от темы до 100 готовых компаний с контактами

### Расходы API (примерные):

**Perplexity Sonar Pro:**
- $0.001-0.002 за запрос
- ~1000-2000 токенов на запрос

**Perplexity Sonar Basic:**
- $0.0005-0.001 за запрос
- ~500-1000 токенов

**DeepSeek:**
- $0.0002-0.0005 за запрос
- ~200-500 токенов
- **В 5 раз дешевле Perplexity!**

**Средняя стоимость на 100 компаний:**

| Этап | API | Стоимость |
|------|-----|-----------|
| Stage 0 (50 запросов) | DeepSeek | $0.10-0.20 |
| Stage 1 (100 компаний) | Sonar Pro | $0.50-1.00 |
| Stage 2 (поиск сайтов) | Sonar Basic | $0.20-0.40 |
| Stage 3 (поиск email) | Sonar Basic | $0.15-0.30 |
| Stage 4 (валидация) | DeepSeek | $0.05-0.10 |
| **ИТОГО** | | **$1.00-2.00** |

**ROI:**
- Ручной поиск: ~5-10 минут на компанию = 8-16 часов на 100 компаний
- Система: 30-40 минут + $1-2
- **Экономия времени: 95%+**

---

## 🛠️ ПОЛЕЗНЫЕ СКРИПТЫ

### Database Scripts (Node.js):

```bash
# Проверка количества компаний
node scripts/check-companies-count.js

# Проверка уникальности company_name
node scripts/check-company-name-uniqueness.js

# Проверка дубликатов по email
node scripts/check-email-duplicates.js

# Дедупликация по name + domain
node scripts/deduplicate-by-name-and-domain.js --dry-run
node scripts/deduplicate-by-name-and-domain.js  # реальное выполнение

# Сброс очереди Stage 2
node scripts/reset-stage2-for-companies-without-website.js --dry-run
node scripts/reset-stage2-for-companies-without-website.js

# Сброс очереди Stage 3
node scripts/reset-stage3-for-companies-without-email.js --dry-run
node scripts/reset-stage3-for-companies-without-email.js

# Анализ скрытых компаний (processed но без результата)
node scripts/analyze-hidden-companies-without-website.js
node scripts/analyze-hidden-companies-without-email.js
```

### SQL Scripts (Supabase SQL Editor):

```bash
# Добавить UNIQUE constraint на normalized_domain
database/add-normalized-domain-constraint.sql

# Создать таблицу прогресса Stage 1
database/create-stage1-progress-table.sql

# Создать таблицу прогресса Stage 2
database/create-stage2-progress-table.sql

# Очистить все данные (осторожно!)
database/clear-all-data.sql

# Дедупликация (SQL)
database/deduplicate-pending-companies.sql
```

---

## 🚨 ТИПИЧНЫЕ ПРОБЛЕМЫ И РЕШЕНИЯ

### 1. **429 Rate Limit Exceeded**

**Симптомы:**
```
Error: 429 Too Many Requests
Перplexity API отклоняет запросы
```

**Причина:**
Слишком много параллельных запросов к Perplexity API

**Решение:**
✅ Все Perplexity запросы идут через `GlobalApiQueue`
✅ Sequential processing с задержкой 500ms
✅ Проверить `system_settings`: `min_delay_between_requests` >= 500

**Проверка:**
```bash
# Railway logs
railway logs | grep "429"

# Queue status
curl https://your-app.railway.app/api/debug/queue-status
```

---

### 2. **Дубликаты компаний в БД**

**Симптомы:**
```
Одна компания появляется 2-3 раза в results.html
```

**Причина:**
Параллельные Stage 1 запросы insert одновременно

**Решение:**
✅ UNIQUE constraint на `normalized_domain`
✅ Проверка `company_name` перед insert в Stage1
✅ Frontend дедупликация по email в results.html

**Проверка:**
```bash
node scripts/check-company-name-uniqueness.js
# Должно показать 99%+ уникальность
```

**Очистка:**
```bash
node scripts/deduplicate-by-name-and-domain.js
```

---

### 3. **Прогресс не обновляется**

**Симптомы:**
```
Stage 1: Прогресс бар застрял на 0%
Stage 2-4: Прогресс не показывается
```

**Причина A (Stage 1):**
API endpoint не routing через `QueryOrchestrator`

**Решение A:**
```javascript
// src/api/sessions.js
router.post('/:id/stage1', async (req, res) => {
  // ✅ Правильно:
  await req.orchestrator.runStage1Only(id);
  
  // ❌ Неправильно:
  // await req.stage1.execute(id);
});
```

**Причина B (Stage 2-4):**
`GlobalProgressEmitter` не используется

**Решение B:**
```javascript
// В QueryOrchestrator.runStage2Only()
if (sessionId === 'global' && globalProgressCallback) {
  this.stage2.setGlobalProgressCallback(globalProgressCallback);
}
```

**Проверка:**
```bash
# Railway logs
railway logs | grep "Progress"
railway logs | grep "GlobalProgressEmitter"
```

---

### 4. **`invalid input syntax for type uuid: "global"`**

**Симптомы:**
```
Error in logs: invalid input syntax for type uuid: "global"
Stage 2-4 progress errors
```

**Причина:**
Попытка записать "global" как UUID в `stage2_progress` таблицу

**Решение:**
✅ Для глобальных запусков использовать SSE, НЕ БД прогресс
✅ В `QueryOrchestrator`:
```javascript
if (sessionId && sessionId !== 'global') {
  await this._updateStage2Progress(sessionId, { ... });
}
```

---

### 5. **Низкое качество результатов**

**Симптомы:**
```
Много нерелевантных компаний
Validation score <50%
Не те услуги
```

**Причина:**
Плохие промпты или низкая температура в Stage 0

**Решение:**
✅ Улучшить промпт Query Expansion:
- Добавить примеры желаемых запросов
- Уточнить требования
- Добавить негативные примеры (что НЕ нужно)

✅ Увеличить температуру:
```javascript
// src/services/QueryExpander.js
const temperature = 0.3 + (attempts - 1) * 0.15;
// 0.3 → 0.45 → 0.6 для разнообразия
```

✅ Повторить Stage 4 validation с уточненным промптом:
```javascript
// src/stages/Stage4AnalyzeServices.js
// Добавить в промпт:
"Основная тема поиска: ${topicDescription}
Компания релевантна ТОЛЬКО если предоставляет услуги/продукты по этой теме."
```

---

### 6. **Ошибки деплоя на Railway**

**Симптомы:**
```
Build failed
Application crashed
502 Bad Gateway
```

**Причина A:** Отсутствуют environment variables

**Решение A:**
```bash
railway variables set SUPABASE_URL=...
railway variables set DEEPSEEK_API_KEY=...
railway variables set PERPLEXITY_API_KEY=...
```

**Причина B:** Неправильная команда start

**Решение B:**
```json
// package.json
{
  "scripts": {
    "start": "node src/app-simple.js"
  }
}
```

**Причина C:** Port не установлен

**Решение C:**
```javascript
// src/app-simple.js
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

**Проверка:**
```bash
railway logs --tail 100
railway status
```

---

## 🔄 КАК ПОРТИРОВАТЬ НА ДРУГУЮ НИШУ

См. отдельный документ: **ADAPTATION-GUIDE-CHINA-SERVICES.md**

Краткий чеклист:

- [ ] Определить целевую нишу/отрасль
- [ ] Изменить промпты в Stage 0, 1, 2, 3, 4
- [ ] Адаптировать фильтры (маркетплейсы → свои агрегаторы)
- [ ] Настроить поля БД (опционально)
- [ ] Изменить UI тексты (index.html, results.html)
- [ ] Протестировать на 1-2 темах
- [ ] Настроить промпты по результатам
- [ ] Масштабировать

**Время портирования:** 2-4 часа

---

## 📚 ДОПОЛНИТЕЛЬНЫЕ ДОКУМЕНТЫ

1. **BUILD-FROM-SCRATCH-GUIDE.md** - Пошаговая инструкция воссоздания проекта с нуля
2. **ADAPTATION-GUIDE-CHINA-SERVICES.md** - Рекомендации для адаптации под китайские услуги
3. **QUEUE-MONITOR-WIDGET.md** - Документация виджета мониторинга очереди
4. **STAGE1-PROGRESS-COUNTER.md** - Реалтайм прогресс Stage 1
5. **DUPLICATE-COMPANIES-ANALYSIS.md** - Анализ и решение проблемы дубликатов
6. **QUERY-GENERATION-V2.8.md** - Генерация запросов версии 2.8+

---

## ✅ ИТОГИ

**Smart Email API v2.10.0** - это полнофункциональная, production-ready система для автоматизированного B2B поиска контактов.

### Ключевые преимущества:

✅ **Полная автоматизация** - от темы до готовой базы  
✅ **Экономия API токенов** - ~45% через DeepSeek  
✅ **Real-time мониторинг** - видно прогресс в реальном времени  
✅ **Пакетная обработка** - "Запустить ВСЕ темы" одной кнопкой  
✅ **Дедупликация на всех уровнях** - БД, backend, frontend  
✅ **Детальная аналитика расходов** - API credits tracking  
✅ **Готово к портированию** - 2-4 часа на адаптацию

### Технические метрики:

- **Скорость:** 30-40 минут на 100 компаний
- **Стоимость:** $1-2 за 100 компаний с контактами
- **Качество:** 70-90% релевантные компании (с AI validation)
- **Масштабируемость:** 1000+ компаний за сессию

### Готово к использованию для:

- Поиск поставщиков услуг (юристы, бухгалтеры, IT)
- Поиск производителей в любой отрасли
- B2B контакты в любой стране (не только Китай)
- Агрегация контактов из публичных источников

---

**Дата документа:** 30 ноября 2025  
**Версия проекта:** 2.10.0  
**Статус:** Production-ready  

---

*Для вопросов и уточнений см. BUILD-FROM-SCRATCH-GUIDE.md и ADAPTATION-GUIDE-CHINA-SERVICES.md*

