const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Создать директорию для логов если её нет
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  console.log('✅ Created logs directory:', logsDir);
}

// Инициализация авторизации
const AuthMiddleware = require('./middleware/auth');
const auth = new AuthMiddleware();

const app = express();
const PORT = process.env.PORT || 3030;

// Middleware
app.use(cors());
app.use(express.json());

// Инициализация сессий (должно быть ДО static middleware)
app.use(auth.initSession());

// API endpoints для авторизации (БЕЗ защиты)
app.post('/api/auth/login', (req, res) => auth.handleLogin(req, res));
app.post('/api/auth/logout', (req, res) => auth.handleLogout(req, res));
app.get('/api/auth/status', (req, res) => auth.checkAuth(req, res));

// Разрешить доступ к login.html без авторизации
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Защита главной страницы
app.get('/', (req, res, next) => {
  return auth.requireAuth(req, res, next);
});

// ВРЕМЕННО ОТКЛЮЧЕНО ДЛЯ ОТЛАДКИ (TODO: включить перед продакшеном!)
// // Защита всех остальных статических файлов
// app.use((req, res, next) => {
//   // Проверять авторизацию только для HTML страниц и API
//   if (req.path.endsWith('.html') || req.path.startsWith('/api')) {
//     // Пропустить login.html, auth API и version API (публичные endpoints)
//     if (req.path === '/login.html' || req.path.startsWith('/api/auth') || req.path === '/api/version') {
//       return next();
//     }
//     // Требовать авторизацию
//     return auth.requireAuth(req, res, next);
//   }
//   // Для CSS, JS, изображений - разрешить без авторизации
//   next();
// });

// Временно: разрешить всё без авторизации для отладки
app.use((req, res, next) => {
  next();
});

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

// Version endpoint (public, no auth required)
app.get('/api/version', (req, res) => {
  const { execSync } = require('child_process');
  const packageJson = require('../package.json');
  
  try {
    const commit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    const commitShort = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    const tag = execSync('git describe --tags --exact-match 2>/dev/null || echo ""', { encoding: 'utf-8' }).trim();
    const commitDate = execSync('git log -1 --format=%cd --date=iso', { encoding: 'utf-8' }).trim();
    const commitMessage = execSync('git log -1 --format=%s', { encoding: 'utf-8' }).trim();
    const author = execSync('git log -1 --format=%an', { encoding: 'utf-8' }).trim();
    
    res.json({
      commit,
      commitShort,
      branch,
      tag: tag || packageJson.version,
      packageVersion: packageJson.version,
      commitDate,
      commitMessage,
      author,
      buildDate: new Date().toISOString()
    });
  } catch (error) {
    // Fallback if git is not available
    res.json({
      tag: packageJson.version,
      packageVersion: packageJson.version,
      buildDate: new Date().toISOString(),
      error: 'Git info not available'
    });
  }
});

// Подключение API роутов (с обработкой ошибок)
// Объявить переменные на уровне модуля для использования в роутах
let pool, settingsManager, logger, deepseekClient, sonarBasicClient, sonarProClient;
let orchestrator, queryExpander, creditsTracker, companyValidator, progressTracker, translationService;

(async () => {
try {
  console.log('🚀 [INIT] Starting application initialization...');
  
  // Инициализация Supabase Database (только Supabase, без MockDatabase)
  const SupabaseClient = require('./database/SupabaseClient');
  const SettingsManager = require('./services/SettingsManager');
  const winston = require('winston');
  
  console.log('✓ [INIT] Required modules loaded');
  
  logger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [new winston.transports.Console()]
  });
  
  console.log('✓ [INIT] Logger created');
  
  pool = new SupabaseClient();
  console.log('✓ [INIT] SupabaseClient instantiated, initializing...');
  await pool.initialize(); // Подключиться к Supabase
  console.log('✅ [INIT] Database connected');
  
  settingsManager = new SettingsManager(pool, logger);
  console.log('✓ [INIT] SettingsManager created');
  
  // Инициализация API клиентов
  const DeepSeekClient = require('./services/DeepSeekClient');
  const SonarApiClient = require('./services/SonarApiClient');
  const QueryOrchestrator = require('./services/QueryOrchestrator');
  const QueryExpander = require('./services/QueryExpander');
  const CreditsTracker = require('./services/CreditsTracker');
  const CompanyValidator = require('./services/CompanyValidator');
  const ProgressTracker = require('./services/ProgressTracker');
  const TranslationService = require('./services/TranslationService');
  
  console.log('✓ [INIT] Service classes loaded');
  
  // DeepSeek клиент (для генерации без интернета)
  deepseekClient = new DeepSeekClient(
    process.env.DEEPSEEK_API_KEY || 'sk-85323bc753cb4b25b02a2664e9367f8a',
    logger
  );
  console.log('✓ [INIT] DeepSeekClient created');
  
  // Sonar Basic клиент (для простого поиска - Stage 2, 3)
  sonarBasicClient = new SonarApiClient(pool, settingsManager, logger, 'sonar');
  console.log('✓ [INIT] SonarBasicClient created');
  
  // Sonar Pro клиент (для сложного анализа - Stage 1, 4)
  sonarProClient = new SonarApiClient(pool, settingsManager, logger, 'sonar-pro');
  console.log('✓ [INIT] SonarProClient created');
  
  // Установить API ключ напрямую (из переменной окружения или дефолтный)
  const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || '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';
  console.log(`🔑 [INIT] Using Perplexity API Key: ${PERPLEXITY_API_KEY.substring(0, 10)}... (length: ${PERPLEXITY_API_KEY.length})`);
  
  // Флаги инициализации
  let sonarBasicReady = false;
  let sonarProReady = false;
  
  console.log('⏳ [INIT] Starting async API clients initialization...');
  
  // Инициализировать API клиенты асинхронно
  (async () => {
    try {
      console.log('  → [INIT] Initializing SonarBasicClient...');
      await sonarBasicClient.initialize();
      // Установить API ключ после инициализации (перезаписать пустой ключ из БД)
      sonarBasicClient.apiKey = PERPLEXITY_API_KEY;
      sonarBasicReady = true;
      logger.info('Sonar Basic client initialized');
      console.log('  ✓ [INIT] SonarBasicClient initialized');
      
      console.log('  → [INIT] Initializing SonarProClient...');
      await sonarProClient.initialize();
      // Установить API ключ после инициализации (перезаписать пустой ключ из БД)
      sonarProClient.apiKey = PERPLEXITY_API_KEY;
      sonarProReady = true;
      logger.info('Sonar Pro client initialized');
      console.log('  ✓ [INIT] SonarProClient initialized');
      
      console.log(`✅ [INIT] Sonar clients ready with API key (${PERPLEXITY_API_KEY.substring(0, 10)}...)`);
    } catch (error) {
      logger.error('Failed to initialize API clients:', error);
      console.error('❌ [INIT] Sonar clients initialization failed:', error.message);
    }
  })();
  
  console.log('✓ [INIT] Async initialization started (running in background)');
  
  // Helper функция для ожидания инициализации
  const waitForInit = async () => {
    let attempts = 0;
    console.log('⏳ [INIT] Waiting for API clients to be ready...');
    while ((!sonarBasicReady || !sonarProReady) && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if (!sonarBasicReady || !sonarProReady) {
      console.error(`❌ [INIT] API clients initialization timeout after ${attempts * 100}ms`);
      throw new Error('API clients initialization timeout');
    }
    console.log(`✅ [INIT] API clients ready after ${attempts * 100}ms`);
  };
  
  // Сервисы с правильными клиентами
  // QueryExpander использует DeepSeek (дешево и быстро, теперь с логированием для диагностики)
  console.log('🔧 [INIT] Creating service instances...');
  queryExpander = new QueryExpander(deepseekClient, settingsManager, pool, logger);
  console.log('  ✓ QueryExpander');
  creditsTracker = new CreditsTracker(pool, logger);
  console.log('  ✓ CreditsTracker');
  // CompanyValidator использует Perplexity Pro (нужен интернет для проверки)
  companyValidator = new CompanyValidator(sonarProClient, settingsManager, pool, logger);
  console.log('  ✓ CompanyValidator');
  progressTracker = new ProgressTracker(pool, logger);
  console.log('  ✓ ProgressTracker');
  console.log('✅ [INIT] Core services created');
  
  // Инициализация TranslationService
  translationService = null;
  console.log('⏳ [INIT] Starting TranslationService initialization (async)...');
  (async () => {
    try {
      const settings = await settingsManager.getAllSettings();
      translationService = new TranslationService(pool, logger, settings);
      logger.info('Translation Service initialized');
      console.log('✅ [INIT] TranslationService initialized');
    } catch (error) {
      logger.error('Failed to initialize Translation Service:', error);
      console.error('❌ [INIT] TranslationService initialization failed:', error.message);
    }
  })();
  
  // Подключить creditsTracker к обоим Sonar клиентам для автоматического логирования
  sonarBasicClient.setCreditsTracker(creditsTracker);
  sonarProClient.setCreditsTracker(creditsTracker);
  console.log('✓ [INIT] CreditsTracker attached to Sonar clients');
  
  // Добавить waitForInit к req для использования в роутах
  app.use((req, res, next) => {
    req.waitForInit = waitForInit;
    next();
  });
  console.log('✓ [INIT] WaitForInit middleware added');
  
  console.log('🔧 [INIT] Creating QueryOrchestrator...');
  orchestrator = new QueryOrchestrator({
    database: pool,
    settingsManager: settingsManager,
    sonarApiClient: sonarProClient, // Оркестратор использует Pro для Stage 1, 4
    sonarBasicClient: sonarBasicClient, // Передаем Basic для Stage 2, 3
    deepseekClient: deepseekClient, // Для Stage 5
    progressTracker: progressTracker,
    companyValidator: companyValidator,
    logger: logger
  });
  console.log('✅ [INIT] QueryOrchestrator created');
  
  // Загрузить базовые настройки (UPSERT)
  console.log('⏳ [INIT] Loading default settings (async)...');
  (async () => {
    // Использовать API ключ из переменной окружения или дефолтный
    const perplexityApiKey = process.env.PERPLEXITY_API_KEY || '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';
    
    console.log(`📝 Setting Perplexity API Key: ${perplexityApiKey.substring(0, 10)}...`);
    
    const defaultSettings = [
      ['api', 'api_key', perplexityApiKey, 'Perplexity API ключ'],
      ['api', 'model_name', 'llama-3.1-sonar-large-128k-online', 'Модель'],
    ];
    
    for (const setting of defaultSettings) {
      // Используем UPSERT с system_settings
      try {
        const { data, error } = await pool.supabase
          .from('system_settings')
          .upsert({
            category: setting[0],
            key: setting[1],
            value: setting[2],
            description: setting[3]
          }, {
            onConflict: 'category,key'
          });
        
        if (error) {
          console.warn(`Failed to upsert setting ${setting[0]}.${setting[1]}:`, error.message);
        } else {
          console.log(`✅ Setting ${setting[0]}.${setting[1]} updated`);
        }
      } catch (err) {
        console.warn(`Error upserting setting:`, err.message);
      }
    }
    console.log('✅ [INIT] Default settings loaded');
  })();
  
  // Middleware для добавления сервисов в req
  console.log('🔧 [INIT] Setting up request middleware...');
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
    req.translationService = translationService; // Добавляем TranslationService
    req.logger = logger;
    next();
  });
  console.log('✅ [INIT] Request middleware configured');
  
  // Подключить роуты
  console.log('📦 [INIT] Loading API routes...');
  app.use('/api/settings', require('./api/settings'));
  console.log('  ✓ /api/settings');
  app.use('/api/sessions', require('./api/sessions'));
  console.log('  ✓ /api/sessions');
  app.use('/api/companies', require('./api/companies'));
  console.log('  ✓ /api/companies');
  app.use('/api/topics', require('./api/topics'));
  console.log('  ✓ /api/topics');
  app.use('/api/queries', require('./api/queries')); // НОВЫЙ: Для step-by-step страницы
  console.log('  ✓ /api/queries');
  app.use('/api/credits', require('./api/credits'));
  console.log('  ✓ /api/credits');
  app.use('/api/progress', require('./api/progress'));
  console.log('  ✓ /api/progress');
  app.use('/api/debug', require('./api/debug')); // НОВЫЙ: Показывает ВСЕ данные
  console.log('  ✓ /api/debug');
  
  console.log('✅ API routes loaded successfully');
  
  // Start server ПОСЛЕ инициализации роутов
  app.listen(PORT, () => {
    console.log(`🚀 Smart Email API running on http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`💾 Database: Supabase (PostgreSQL)`);
    console.log(`✨ Server ready with all routes!`);
  });
  
} catch (error) {
  console.error('⚠️  Failed to load API routes:', error.message);
  console.error(error.stack);
  console.log('Running in basic mode only');
  
  // Запустить сервер даже при ошибке (для диагностики)
  app.listen(PORT, () => {
    console.log(`🚀 Server running in BASIC MODE on http://localhost:${PORT}`);
    console.log(`⚠️  Some features may not work`);
  });
}
})();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

