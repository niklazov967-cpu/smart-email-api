# 🔨 ПОШАГОВАЯ ИНСТРУКЦИЯ: Построение Smart Email API с нуля

**Версия:** 2.10.0  
**Назначение:** Детальная инструкция для воссоздания проекта другим разработчиком/агентом  
**Время выполнения:** 4-8 часов

---

## 📋 ОГЛАВЛЕНИЕ

1. [Prerequisites (Требования)](#prerequisites)
2. [Инициализация проекта](#step-1-инициализация)
3. [Настройка базы данных](#step-2-база-данных)
4. [Базовые сервисы](#step-3-базовые-сервисы)
5. [Stage 0: Query Expansion](#step-4-stage-0)
6. [Stage 1: Find Companies](#step-5-stage-1)
7. [Stage 2-4: Processing](#step-6-stages-2-4)
8. [Frontend UI](#step-7-frontend)
9. [Deployment](#step-8-deployment)
10. [Testing & Validation](#step-9-testing)

---

## <a name="prerequisites"></a>📦 PREREQUISITES

### Требования:

**Software:**
- Node.js 18+ ([nodejs.org](https://nodejs.org))
- npm 9+
- Git
- VS Code (рекомендуется)

**Аккаунты:**
- Supabase ([supabase.com](https://supabase.com)) - FREE tier
- DeepSeek API ([platform.deepseek.com](https://platform.deepseek.com)) - Купить кредиты ($10+)
- Perplexity API ([perplexity.ai](https://www.perplexity.ai/settings/api)) - Купить кредиты ($10+)
- Railway ([railway.app](https://railway.app)) - FREE tier (опционально)

**Навыки:**
- JavaScript/Node.js - средний уровень
- SQL - базовый уровень
- REST API - понимание концепций
- Git - базовые команды

---

## <a name="step-1-инициализация"></a>🚀 STEP 1: Инициализация проекта

### 1.1 Создать структуру

```bash
mkdir smart-email-api && cd smart-email-api
npm init -y
```

### 1.2 Установить зависимости

```bash
npm install express @supabase/supabase-js dotenv cors helmet compression
npm install axios bcrypt body-parser express-session joi jsonwebtoken
npm install pg uuid winston rate-limiter-flexible

npm install --save-dev nodemon jest
```

### 1.3 Создать файловую структуру

```bash
mkdir -p src/{api,database,middleware,services,stages,utils,workers}
mkdir -p public database scripts

touch src/app-simple.js
touch .env.example .gitignore README.md
```

### 1.4 Настроить package.json

```json
{
  "name": "smart-email-api",
  "version": "1.0.0",
  "description": "AI-powered B2B contact finder",
  "main": "src/app-simple.js",
  "type": "commonjs",
  "scripts": {
    "start": "node src/app-simple.js",
    "dev": "nodemon src/app-simple.js"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}
```

### 1.5 Создать .env.example

```bash
# .env.example
NODE_ENV=development
PORT=3000

# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=

# AI APIs
DEEPSEEK_API_KEY=
PERPLEXITY_API_KEY=

# Optional
LOG_LEVEL=info
```

### 1.6 Создать .gitignore

```bash
node_modules/
.env
.env.local
*.log
logs/
.DS_Store
```

✅ **Checkpoint 1:** Структура проекта создана

---

## <a name="step-2-база-данных"></a>🗄️ STEP 2: Настройка базы данных

### 2.1 Создать Supabase проект

1. Перейти на [supabase.com](https://supabase.com)
2. Sign Up / Login
3. "New Project"
   - Name: `smart-email-api`
   - Database Password: (сгенерировать и сохранить!)
   - Region: выбрать ближайший
4. Дождаться создания (~2 минуты)

### 2.2 Получить credentials

1. Project Settings → API
2. Скопировать:
   - `Project URL` → SUPABASE_URL
   - `anon public` key → SUPABASE_ANON_KEY
3. Создать `.env` и вставить:

```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

### 2.3 Создать таблицы

Открыть **SQL Editor** в Supabase и выполнить:

```sql
-- 1. search_sessions
CREATE TABLE search_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_query TEXT NOT NULL,
  topic_description TEXT,
  target_count INTEGER DEFAULT 50,
  status VARCHAR(20) DEFAULT 'pending',
  companies_found INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. session_queries
CREATE TABLE session_queries (
  query_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES search_sessions(session_id) ON DELETE CASCADE,
  main_topic TEXT NOT NULL,
  query_cn TEXT NOT NULL,
  query_ru TEXT NOT NULL,
  relevance INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. pending_companies (ГЛАВНАЯ ТАБЛИЦА)
CREATE TABLE pending_companies (
  company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES search_sessions(session_id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  website TEXT,
  normalized_domain TEXT,
  email TEXT,
  description TEXT,
  current_stage INTEGER DEFAULT 1,
  stage2_status VARCHAR(50),
  stage3_status VARCHAR(50),
  stage4_status VARCHAR(50),
  main_activity TEXT,
  services JSONB,
  validation_score INTEGER,
  is_relevant BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- UNIQUE constraint для дедупликации
CREATE UNIQUE INDEX idx_pending_companies_unique_domain 
ON pending_companies (normalized_domain) 
WHERE normalized_domain IS NOT NULL;

-- 4. api_credits_log
CREATE TABLE api_credits_log (
  log_id SERIAL PRIMARY KEY,
  session_id UUID,
  stage VARCHAR(100) NOT NULL,
  api_name VARCHAR(50) NOT NULL,
  model VARCHAR(50) NOT NULL,
  tokens_used INTEGER NOT NULL,
  cost_usd NUMERIC(10, 6) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_session_queries_session ON session_queries(session_id);
CREATE INDEX idx_pending_companies_session ON pending_companies(session_id);
CREATE INDEX idx_pending_companies_stage ON pending_companies(current_stage);
```

✅ **Checkpoint 2:** База данных создана

---

## <a name="step-3-базовые-сервисы"></a>⚙️ STEP 3: Базовые сервисы

Создаем минимальные версии сервисов, достаточные для работы.

### 3.1 SupabaseClient (database wrapper)

**Файл:** `src/database/SupabaseClient.js`

```javascript
const { createClient } = require('@supabase/supabase-js');

class SupabaseClient {
  constructor(url, key) {
    this.supabase = createClient(url, key);
  }
  
  async query(sql, params) {
    // For raw SQL if needed
    const { data, error } = await this.supabase.rpc('execute_sql', { query: sql });
    if (error) throw error;
    return { rows: data };
  }
}

module.exports = SupabaseClient;
```

### 3.2 DeepSeekClient

**Файл:** `src/services/DeepSeekClient.js`

```javascript
class DeepSeekClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.deepseek.com/v1';
  }
  
  async query(prompt, options = {}) {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature || 0.3,
        max_tokens: options.maxTokens || 4000
      })
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${data.error?.message || 'Unknown error'}`);
    }
    
    return data.choices[0].message.content;
  }
}

module.exports = DeepSeekClient;
```

### 3.3 SonarApiClient

**Файл:** `src/services/SonarApiClient.js`

```javascript
class SonarApiClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.perplexity.ai';
  }
  
  async query(prompt, options = {}) {
    const model = options.model || 'sonar-pro';
    
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options.maxTokens || 4000
      })
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Perplexity API error: ${data.error?.message || 'Unknown error'}`);
    }
    
    return data.choices[0].message.content;
  }
}

module.exports = SonarApiClient;
```

### 3.4 Express App (минимальный)

**Файл:** `src/app-simple.js`

```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Test endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

✅ **Checkpoint 3:** Базовые сервисы готовы

**Тест:**
```bash
npm start
# Открыть http://localhost:3000/api/health
# Должно вернуть: {"status":"ok","version":"1.0.0"}
```

---

## <a name="step-4-stage-0"></a>🔍 STEP 4: Stage 0 - Query Expansion

### 4.1 QueryExpander Service

**Файл:** `src/services/QueryExpander.js`

```javascript
class QueryExpander {
  constructor(deepseekClient, database) {
    this.deepseek = deepseekClient;
    this.db = database;
  }
  
  async expandTopic(mainTopic, targetCount = 10) {
    const prompt = `
你是一个专业的搜索查询生成专家。请根据以下主题生成${targetCount}个相关的搜索查询：

主题：${mainTopic}

要求：
1. 每个查询都要相关但不重复
2. 使用中文（简体）
3. 提供俄语翻译
4. 评估相关性(0-100)

返回JSON格式：
[
  {
    "query_cn": "中文查询",
    "query_ru": "Русский перевод", 
    "relevance": 85
  }
]`;
    
    const response = await this.deepseek.query(prompt, { maxTokens: 8000 });
    return this._parseQueries(response);
  }
  
  _parseQueries(response) {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  }
  
  async saveQueries(sessionId, mainTopic, queries) {
    // Insert into session_queries
    const { error } = await this.db.supabase
      .from('session_queries')
      .insert(queries.map(q => ({
        session_id: sessionId,
        main_topic: mainTopic,
        query_cn: q.query_cn,
        query_ru: q.query_ru,
        relevance: q.relevance || 50
      })));
    
    if (error) throw error;
  }
}

module.exports = QueryExpander;
```

### 4.2 API Endpoints

**Файл:** `src/api/queries.js`

```javascript
const express = require('express');
const router = express.Router();

router.post('/generate', async (req, res) => {
  try {
    const { topic, numQueries } = req.body;
    
    const queries = await req.queryExpander.expandTopic(topic, numQueries);
    
    res.json({
      success: true,
      queries: queries
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/save', async (req, res) => {
  try {
    const { mainTopic, queries, sessionId } = req.body;
    
    let currentSessionId = sessionId;
    
    // Create session if not provided
    if (!currentSessionId) {
      const { v4: uuidv4 } = require('uuid');
      currentSessionId = uuidv4();
      
      const now = new Date();
      const timeStr = now.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).replace(',', '');
      
      const topic_description = `${mainTopic} [${timeStr}]`;
      
      await req.db.supabase
        .from('search_sessions')
        .insert({
          session_id: currentSessionId,
          search_query: mainTopic,
          topic_description: topic_description,
          target_count: queries.length
        });
    }
    
    await req.queryExpander.saveQueries(currentSessionId, mainTopic, queries);
    
    res.json({
      success: true,
      sessionId: currentSessionId,
      count: queries.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
```

### 4.3 Обновить app-simple.js

```javascript
// После middleware, добавить:
const SupabaseClient = require('./database/SupabaseClient');
const DeepSeekClient = require('./services/DeepSeekClient');
const QueryExpander = require('./services/QueryExpander');

// Initialize
const db = new SupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const deepseekClient = new DeepSeekClient(process.env.DEEPSEEK_API_KEY);
const queryExpander = new QueryExpander(deepseekClient, db);

// Inject into req
app.use((req, res, next) => {
  req.db = db;
  req.queryExpander = queryExpander;
  next();
});

// Mount routes
const queriesRouter = require('./api/queries');
app.use('/api/queries', queriesRouter);
```

### 4.4 Frontend UI (простейший)

**Файл:** `public/index.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>Smart Email API</title>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial; padding: 20px; }
    input, textarea { width: 100%; margin: 10px 0; padding: 8px; }
    button { padding: 10px 20px; background: #667eea; color: white; border: none; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Smart Email API</h1>
  
  <h2>Stage 0: Генерация запросов</h2>
  <textarea id="mainTopic" rows="3" placeholder="Введите тему"></textarea>
  <input id="numQueries" type="number" value="10" min="5" max="50">
  <button onclick="generateQueries()">Генерировать</button>
  
  <div id="queriesList"></div>
  
  <script>
    async function generateQueries() {
      const topic = document.getElementById('mainTopic').value;
      const num = document.getElementById('numQueries').value;
      
      const response = await fetch('/api/queries/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, numQueries: parseInt(num) })
      });
      
      const result = await response.json();
      
      if (result.success) {
        displayQueries(result.queries);
        await saveQueries(topic, result.queries);
      }
    }
    
    async function saveQueries(topic, queries) {
      const response = await fetch('/api/queries/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainTopic: topic, queries: queries })
      });
      
      const result = await response.json();
      alert(`Saved ${result.count} queries!`);
    }
    
    function displayQueries(queries) {
      const list = document.getElementById('queriesList');
      list.innerHTML = '<h3>Generated Queries:</h3>' + queries.map((q, i) => 
        `<div>${i+1}. ${q.query_cn} - ${q.query_ru} (${q.relevance}%)</div>`
      ).join('');
    }
  </script>
</body>
</html>
```

✅ **Checkpoint 4:** Stage 0 работает!

**Тест:**
```bash
npm start
# Открыть http://localhost:3000
# Ввести тему: "CNC metal machining"
# Нажать "Генерировать"
# Должно появиться 10 запросов
# Проверить БД: SELECT * FROM session_queries;
```

---

## <a name="step-5-stage-1"></a>🏢 STEP 5: Stage 1 - Find Companies

*(Из-за ограничения размера, привожу ключевые части)*

### 5.1 Stage1FindCompanies Service

**Файл:** `src/stages/Stage1FindCompanies.js`

Основная логика:
- Загрузить queries из `session_queries`
- Для каждого query: вызвать Sonar Pro API
- Парсить компании из JSON ответа
- Нормализовать домены
- Проверить дубликаты
- Сохранить в `pending_companies`

**Промпт:**
```javascript
const prompt = `
你是一个专门搜索中国企业的专家。请找到10家提供以下服务/产品的公司：

查询：${searchQuery}

要求：
1. 只找中国大陆的企业
2. 必须有明确的公司名称
3. 尽量找到公司网站
4. 排除B2B平台（阿里巴巴等）

返回JSON格式：
[
  {
    "name": "公司名称",
    "website": "https://example.com",
    "description": "简要描述"
  }
]
`;
```

### 5.2 API Endpoint

**Файл:** `src/api/sessions.js`

```javascript
router.post('/:id/stage1', async (req, res) => {
  const { id } = req.params;
  
  const result = await req.stage1.execute(id);
  
  res.json({
    success: true,
    total: result.companiesFound
  });
});
```

✅ **Checkpoint 5:** Stage 1 работает - компании найдены в БД

---

## <a name="step-6-stages-2-4"></a>🔄 STEP 6: Stages 2-4

**Stage 2: Find Websites** - аналогично Stage 1, но проще  
**Stage 3: Find Emails** - поиск контактов на сайте  
**Stage 4: AI Validation** - валидация через DeepSeek

Детали см. в PROJECT-SUMMARY-FOR-PORTING.md

---

## <a name="step-7-frontend"></a>🎨 STEP 7: Frontend UI

Добавить в `public/index.html`:
- Stage 1 секцию с dropdown тем
- Stage 2-4 кнопки
- Progress bars
- Результаты

См. полный код в репозитории.

---

## <a name="step-8-deployment"></a>🚀 STEP 8: Deployment на Railway

```bash
# 1. Push to GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/username/smart-email-api.git
git push -u origin main

# 2. Railway
# - Login на railway.app
# - New Project → Deploy from GitHub
# - Выбрать репозиторий
# - Добавить Environment Variables
# - Deploy автоматически
```

---

## <a name="step-9-testing"></a>✅ STEP 9: Testing & Validation

1. Сгенерировать тему (10 запросов)
2. Запустить Stage 1
3. Проверить компании в БД
4. Запустить Stage 2-4
5. Открыть results.html
6. Увидеть контакты

---

## 📚 ДОПОЛНИТЕЛЬНЫЕ РЕСУРСЫ

- **PROJECT-SUMMARY-FOR-PORTING.md** - полное описание
- **ADAPTATION-GUIDE-CHINA-SERVICES.md** - адаптация под нишу
- Репозиторий: [github.com/xxx/smart-email-api](https://github.com)

---

**Готово!** Базовая версия работает. Для production добавить:
- Error handling
- Logging (Winston)
- Rate limiting (GlobalApiQueue)
- Progress tracking
- Frontend improvements

**Время: 4-6 часов** для опытного разработчика
