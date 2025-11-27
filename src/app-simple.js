const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3030;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API Info endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'Smart Email API - Портал сбора и обработки контактов',
    status: 'running',
    version: '1.3.0',
    endpoints: {
      health: '/health',
      settings: '/api/settings',
      sessions: '/api/sessions',
      companies: '/api/companies',
      topics: '/api/topics',
      credits: '/api/credits',
      progress: '/api/progress'
    },
    documentation: {
      settings: 'GET /api/settings, GET /api/settings/:category, PUT /api/settings/:category/:key',
      sessions: 'POST /api/sessions, GET /api/sessions, GET /api/sessions/:id/progress',
      companies: 'GET /api/companies, GET /api/companies/:id, POST /api/companies/export',
      topics: 'POST /api/topics/expand, GET /api/topics/:sessionId',
      credits: 'GET /api/credits/:sessionId, GET /api/credits/:sessionId/realtime',
      progress: 'GET /api/progress/:sessionId, GET /api/progress/:sessionId/realtime'
    }
  });
});

// Главная страница - отдаем HTML (static middleware сделает это автоматически)
// Но добавим fallback на случай если файл не найден
app.get('/', (req, res, next) => {
  // Проверяем заголовок Accept
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, '../public/index.html'), (err) => {
      if (err) {
        // Если HTML не найден, отдаем JSON
        res.json({
          message: 'Smart Email API - Портал сбора и обработки контактов',
          status: 'running',
          version: '1.3.0',
          note: 'HTML interface is available at /',
          api_info: '/api'
        });
      }
    });
  } else {
    // Для API клиентов отдаем JSON
    res.json({
      message: 'Smart Email API - Портал сбора и обработки контактов',
      status: 'running',
      version: '1.3.0',
      api_info: '/api'
    });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Подключение API роутов (с обработкой ошибок)
(async () => {
try {
  // Инициализация Supabase Database (только Supabase, без MockDatabase)
  const SupabaseClient = require('./database/SupabaseClient');
  const SettingsManager = require('./services/SettingsManager');
  const winston = require('winston');
  
  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [new winston.transports.Console()]
  });
  
  const pool = new SupabaseClient();
  await pool.initialize(); // Подключиться к Supabase
  
  const settingsManager = new SettingsManager(pool, logger);
  
  // Инициализация API клиентов
  const DeepSeekClient = require('./services/DeepSeekClient');
  const SonarApiClient = require('./services/SonarApiClient');
  const QueryOrchestrator = require('./services/QueryOrchestrator');
  const QueryExpander = require('./services/QueryExpander');
  const CreditsTracker = require('./services/CreditsTracker');
  const CompanyValidator = require('./services/CompanyValidator');
  const ProgressTracker = require('./services/ProgressTracker');
  
  // DeepSeek клиент (для генерации без интернета)
  const deepseekClient = new DeepSeekClient(
    process.env.DEEPSEEK_API_KEY || 'sk-85323bc753cb4b25b02a2664e9367f8a',
    logger
  );
  
  // Sonar Basic клиент (для простого поиска - Stage 2, 3)
  const sonarBasicClient = new SonarApiClient(pool, settingsManager, logger, 'sonar');
  
  // Sonar Pro клиент (для сложного анализа - Stage 1, 4)
  const sonarProClient = new SonarApiClient(pool, settingsManager, logger, 'sonar-pro');
  
  // Флаги инициализации
  let sonarBasicReady = false;
  let sonarProReady = false;
  
  // Инициализировать API клиенты асинхронно
  (async () => {
    try {
      await sonarBasicClient.initialize();
      sonarBasicReady = true;
      logger.info('Sonar Basic client initialized');
      await sonarProClient.initialize();
      sonarProReady = true;
      logger.info('Sonar Pro client initialized');
    } catch (error) {
      logger.error('Failed to initialize API clients:', error);
    }
  })();
  
  // Helper функция для ожидания инициализации
  const waitForInit = async () => {
    let attempts = 0;
    while ((!sonarBasicReady || !sonarProReady) && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if (!sonarBasicReady || !sonarProReady) {
      throw new Error('API clients initialization timeout');
    }
  };
  
  // Сервисы с правильными клиентами
  // ВРЕМЕННО: QueryExpander использует Perplexity т.к. DeepSeek недоступен
  const queryExpander = new QueryExpander(sonarProClient, settingsManager, pool, logger);
  const creditsTracker = new CreditsTracker(pool, logger);
  // CompanyValidator тоже временно на Perplexity
  const companyValidator = new CompanyValidator(sonarProClient, settingsManager, pool, logger);
  const progressTracker = new ProgressTracker(pool, logger);
  
  // Подключить creditsTracker к обоим Sonar клиентам для автоматического логирования
  sonarBasicClient.setCreditsTracker(creditsTracker);
  sonarProClient.setCreditsTracker(creditsTracker);
  
  // Добавить waitForInit к req для использования в роутах
  app.use((req, res, next) => {
    req.waitForInit = waitForInit;
    next();
  });
  
  const orchestrator = new QueryOrchestrator({
    database: pool,
    settingsManager: settingsManager,
    sonarApiClient: sonarProClient, // Оркестратор использует Pro для Stage 1, 4
    sonarBasicClient: sonarBasicClient, // Передаем Basic для Stage 2, 3
    deepseekClient: deepseekClient, // Для Stage 5
    progressTracker: progressTracker,
    companyValidator: companyValidator,
    logger: logger
  });
  
  // Загрузить базовые настройки
  (async () => {
    const defaultSettings = [
      ['api', 'api_key', '', 'string', '', 'Perplexity API ключ', '{}'],
      ['api', 'model_name', 'llama-3.1-sonar-large-128k-online', 'string', 'llama-3.1-sonar-large-128k-online', 'Модель', '{}'],
    ];
    
    for (const setting of defaultSettings) {
      await pool.query(
        `INSERT INTO settings (category, setting_key, setting_value, setting_type, default_value, description, validation_rules, is_editable, require_restart)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [...setting, true, false]
      );
    }
  })();
  
  // Middleware для добавления сервисов в req
  app.use((req, res, next) => {
    req.db = pool;
    req.settingsManager = settingsManager;
    req.deepseekClient = deepseekClient;
    req.sonarBasicClient = sonarBasicClient;
    req.sonarProClient = sonarProClient;
    req.orchestrator = orchestrator;
    req.queryExpander = queryExpander;
    req.creditsTracker = creditsTracker;
    req.companyValidator = companyValidator;
    req.progressTracker = progressTracker;
    req.logger = logger;
    next();
  });
  
  // Подключить роуты
  app.use('/api/settings', require('./api/settings'));
  app.use('/api/sessions', require('./api/sessions'));
  app.use('/api/companies', require('./api/companies'));
  app.use('/api/topics', require('./api/topics'));
  app.use('/api/credits', require('./api/credits'));
  app.use('/api/progress', require('./api/progress'));
  app.use('/api/debug', require('./api/debug')); // НОВЫЙ: Показывает ВСЕ данные
  
  console.log('✅ API routes loaded successfully');
  
} catch (error) {
  console.error('⚠️  Failed to load API routes:', error.message);
  console.log('Running in basic mode only');
}
})();

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Smart Email API running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Database: Supabase (PostgreSQL)`);
  console.log(`✨ Server ready!`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

