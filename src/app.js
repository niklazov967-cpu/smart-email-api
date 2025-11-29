const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { Pool } = require('pg');
const winston = require('winston');
const path = require('path');
require('dotenv').config();

// Импорт сервисов
const SettingsManager = require('./services/SettingsManager');
const SonarApiClient = require('./services/SonarApiClient');
const MockDatabase = require('./database/MockDatabase');

// Создание приложения
const app = express();
const PORT = process.env.PORT || 3030;

// Настройка логгера
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Добавить файловое логирование если включено
if (process.env.LOG_TO_FILE === 'true') {
  logger.add(new winston.transports.File({
    filename: path.join(process.env.LOG_PATH || './logs', 'error.log'),
    level: 'error'
  }));
  logger.add(new winston.transports.File({
    filename: path.join(process.env.LOG_PATH || './logs', 'combined.log')
  }));
}

// Подключение к базе данных
// Используем Mock БД для быстрого старта (замените на PostgreSQL для production)
const USE_MOCK_DB = !process.env.DATABASE_URL || process.env.USE_MOCK_DB === 'true';

let pool;

if (USE_MOCK_DB) {
  logger.info('Using Mock Database (in-memory)');
  pool = new MockDatabase();
  
  // Эмулируем события
  setTimeout(() => {
    logger.info('Mock database initialized');
  }, 100);
} else {
  logger.info('Using PostgreSQL database');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    min: parseInt(process.env.DATABASE_POOL_MIN || '5'),
    max: parseInt(process.env.DATABASE_POOL_MAX || '20'),
    ssl: process.env.DATABASE_SSL_ENABLED === 'true' ? { rejectUnauthorized: false } : false
  });

  // Проверка подключения к БД
  pool.on('connect', () => {
    logger.info('Connected to PostgreSQL database');
  });

  pool.on('error', (err) => {
    logger.error('Unexpected database error', { error: err.message });
  });
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Логирование запросов
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`
    });
  });
  next();
});

// Инициализация сервисов
let settingsManager;
let sonarApiClient;

async function initializeServices() {
  try {
    logger.info('Initializing services...');
    
    // Инициализация SettingsManager
    settingsManager = new SettingsManager(pool, logger);
    logger.info('✅ SettingsManager initialized');
    
    // Для Mock DB: загрузить базовые настройки
    if (USE_MOCK_DB) {
      logger.info('Loading default settings for Mock DB...');
      await loadDefaultSettings(pool);
    }
    
    // Загрузка настроек
    const settings = await settingsManager.getAllSettings();
    logger.info(`✅ Loaded ${Object.keys(settings).length} setting categories`);
    
    // Инициализация SonarApiClient (только если есть API ключ)
    if (process.env.PERPLEXITY_API_KEY) {
      sonarApiClient = new SonarApiClient(pool, settingsManager, logger);
      await sonarApiClient.initialize();
      logger.info('✅ SonarApiClient initialized');
    } else {
      logger.warn('⚠️  Perplexity API key not found - SonarApiClient disabled');
      sonarApiClient = null;
    }
    
    // Сделать сервисы доступными через req
    app.use((req, res, next) => {
      req.db = pool;
      req.settingsManager = settingsManager;
      req.sonarApiClient = sonarApiClient;
      req.logger = logger;
      next();
    });
    
    logger.info('🎉 All services initialized successfully');
    
  } catch (error) {
    logger.error('Failed to initialize services', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Загрузить базовые настройки для Mock DB
async function loadDefaultSettings(db) {
  const defaultSettings = [
    ['api', 'api_key', '', 'Perplexity API ключ'],
    ['api', 'model_name', 'llama-3.1-sonar-large-128k-online', 'Модель'],
    ['api', 'temperature', '0.3', 'Температура'],
    ['api', 'top_p', '0.9', 'Top P'],
    ['api', 'max_tokens', '2000', 'Max tokens'],
    ['api', 'max_retries', '3', 'Max retries'],
    ['api', 'api_timeout_seconds', '60', 'Timeout'],
    ['api', 'rate_limit_requests_per_min', '20', 'Rate limit'],
    ['api', 'retry_delay_seconds', '10', 'Retry delay'],
    ['api', 'fallback_model', 'llama-3.1-sonar-small-128k-online', 'Fallback model'],
    ['api', 'api_base_url', 'https://api.perplexity.ai', 'API URL'],
  ];
  
  for (const setting of defaultSettings) {
    await db.query(
      `INSERT INTO system_settings (category, key, value, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (category, key) DO NOTHING`,
      setting
    );
  }
}

// Маршруты

// Главная страница
app.get('/', (req, res) => {
  res.json({
    message: 'Smart Email API - Портал сбора и обработки контактов',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      settings: '/api/settings',
      sessions: '/api/sessions',
      companies: '/api/companies',
      sonar: '/api/sonar/test (POST)'
    },
    documentation: {
      settings: 'GET /api/settings, GET /api/settings/:category, PUT /api/settings/:category/:key',
      sessions: 'POST /api/sessions, GET /api/sessions, GET /api/sessions/:id/progress',
      companies: 'GET /api/companies, GET /api/companies/:id, POST /api/companies/export'
    }
  });
});

// Health check
app.get('/health', async (req, res) => {
  try {
    // Проверка БД
    await pool.query('SELECT 1');
    
    // Проверка настроек
    const settings = await settingsManager.getAllSettings();
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: 'connected',
      settings_loaded: Object.keys(settings).length > 0,
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error.message
    });
  }
});

// API Routes
app.use('/api/settings', require('./api/settings'));
app.use('/api/sessions', require('./api/sessions'));
app.use('/api/companies', require('./api/companies'));

// Тест Sonar API
app.post('/api/sonar/test', async (req, res) => {
  try {
    if (!req.sonarApiClient) {
      return res.status(503).json({
        success: false,
        error: 'Sonar API Client is not initialized. Please set PERPLEXITY_API_KEY in .env'
      });
    }
    
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }
    
    const result = await req.sonarApiClient.query(prompt, {
      stage: 'test',
      useCache: false
    });
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    req.logger.error('Sonar API test failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Статистика Sonar API
app.get('/api/sonar/stats', async (req, res) => {
  try {
    if (!req.sonarApiClient) {
      return res.status(503).json({
        success: false,
        error: 'Sonar API Client is not initialized'
      });
    }
    
    const stats = await req.sonarApiClient.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    req.logger.error('Failed to get stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API роуты для статистики расходов
const creditsRouter = require('./routes/credits');
app.use('/api/credits', creditsRouter);

// API endpoint для получения версии
app.get('/api/version', (req, res) => {
  const packageJson = require('../package.json');
  res.json({
    success: true,
    version: packageJson.version,
    name: packageJson.name
  });
});

// Обработка 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Обработка ошибок
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path
  });
  
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  await pool.end();
  process.exit(0);
});

// Запуск сервера
async function startServer() {
  try {
    await initializeServices();
    
    app.listen(PORT, () => {
      logger.info(`🚀 Smart Email API running on http://localhost:${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`📧 API endpoints ready`);
      logger.info(`⚙️  Settings Manager: active`);
      logger.info(`🤖 Sonar API Client: active`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

// Запуск
if (require.main === module) {
  startServer();
}

module.exports = { app, pool, logger };

