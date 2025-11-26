const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Все 117 параметров настроек системы
const defaultSettings = [
  // КАТЕГОРИЯ: api (Параметры Perplexity API)
  {
    category: 'api',
    key: 'api_key',
    value: process.env.PERPLEXITY_API_KEY || '',
    type: 'string',
    default_value: '',
    description: 'Perplexity API ключ',
    validation: { type: 'string', minLength: 20 },
    editable: true,
    require_restart: true
  },
  {
    category: 'api',
    key: 'model_name',
    value: 'llama-3.1-sonar-large-128k-online',
    type: 'string',
    default_value: 'llama-3.1-sonar-large-128k-online',
    description: 'Модель Perplexity для использования',
    validation: { type: 'enum', enum: ['llama-3.1-sonar-large-128k-online', 'llama-3.1-sonar-small-128k-online', 'llama-3.1-sonar-huge-128k-online'] },
    editable: true,
    require_restart: false
  },
  {
    category: 'api',
    key: 'temperature',
    value: '0.3',
    type: 'float',
    default_value: '0.3',
    description: 'Творчество ответов (0-1), 0.3 = стабильно',
    validation: { type: 'float', min: 0, max: 1, step: 0.1 },
    editable: true,
    require_restart: false
  },
  {
    category: 'api',
    key: 'top_p',
    value: '0.9',
    type: 'float',
    default_value: '0.9',
    description: 'Разнообразие ответов (0-1)',
    validation: { type: 'float', min: 0, max: 1, step: 0.1 },
    editable: true,
    require_restart: false
  },
  {
    category: 'api',
    key: 'max_tokens',
    value: '2000',
    type: 'integer',
    default_value: '2000',
    description: 'Максимум токенов на ответ',
    validation: { type: 'integer', min: 500, max: 4000 },
    editable: true,
    require_restart: false
  },
  {
    category: 'api',
    key: 'max_retries',
    value: '3',
    type: 'integer',
    default_value: '3',
    description: 'Максимум попыток при ошибке',
    validation: { type: 'integer', min: 1, max: 10 },
    editable: true,
    require_restart: false
  },
  {
    category: 'api',
    key: 'api_timeout_seconds',
    value: '60',
    type: 'integer',
    default_value: '60',
    description: 'Таймаут на один запрос (секунды)',
    validation: { type: 'integer', min: 10, max: 120 },
    editable: true,
    require_restart: false
  },
  {
    category: 'api',
    key: 'rate_limit_requests_per_min',
    value: '20',
    type: 'integer',
    default_value: '20',
    description: 'Максимум запросов в минуту',
    validation: { type: 'integer', min: 1, max: 100 },
    editable: true,
    require_restart: false
  },
  {
    category: 'api',
    key: 'retry_delay_seconds',
    value: '10',
    type: 'integer',
    default_value: '10',
    description: 'Начальная задержка при повторе (секунды)',
    validation: { type: 'integer', min: 1, max: 60 },
    editable: true,
    require_restart: false
  },
  {
    category: 'api',
    key: 'fallback_model',
    value: 'llama-3.1-sonar-small-128k-online',
    type: 'string',
    default_value: 'llama-3.1-sonar-small-128k-online',
    description: 'Резервная модель если основная недоступна',
    validation: { type: 'enum', enum: ['llama-3.1-sonar-small-128k-online'] },
    editable: true,
    require_restart: false
  },
  {
    category: 'api',
    key: 'api_base_url',
    value: 'https://api.perplexity.ai',
    type: 'string',
    default_value: 'https://api.perplexity.ai',
    description: 'Base URL для Perplexity API',
    validation: { type: 'url' },
    editable: true,
    require_restart: true
  },

  // КАТЕГОРИЯ: processing_stages (Этапы обработки)
  // Этап 1: Поиск компаний
  {
    category: 'processing_stages',
    key: 'stage1_concurrent_requests',
    value: '1',
    type: 'integer',
    default_value: '1',
    description: 'Этап 1: Максимум одновременных запросов',
    validation: { type: 'integer', min: 1, max: 3 },
    editable: true,
    require_restart: false
  },
  {
    category: 'processing_stages',
    key: 'stage1_cache_ttl_hours',
    value: '24',
    type: 'integer',
    default_value: '24',
    description: 'Этап 1: Кеш на сколько часов',
    validation: { type: 'integer', min: 1, max: 720 },
    editable: true,
    require_restart: false
  },
  {
    category: 'processing_stages',
    key: 'stage1_min_companies',
    value: '8',
    type: 'integer',
    default_value: '8',
    description: 'Этап 1: Минимум компаний в результате',
    validation: { type: 'integer', min: 5, max: 20 },
    editable: true,
    require_restart: false
  },
  {
    category: 'processing_stages',
    key: 'stage1_max_companies',
    value: '12',
    type: 'integer',
    default_value: '12',
    description: 'Этап 1: Максимум компаний в результате',
    validation: { type: 'integer', min: 5, max: 30 },
    editable: true,
    require_restart: false
  },
  {
    category: 'processing_stages',
    key: 'stage1_retry_if_less_than',
    value: '5',
    type: 'integer',
    default_value: '5',
    description: 'Этап 1: Повторить если найдено меньше',
    validation: { type: 'integer', min: 1, max: 10 },
    editable: true,
    require_restart: false
  },

  // Этап 2: Поиск сайтов
  {
    category: 'processing_stages',
    key: 'stage2_concurrent_requests',
    value: '3',
    type: 'integer',
    default_value: '3',
    description: 'Этап 2: Максимум одновременных запросов',
    validation: { type: 'integer', min: 1, max: 10 },
    editable: true,
    require_restart: false
  },
  {
    category: 'processing_stages',
    key: 'stage2_batch_delay_ms',
    value: '2000',
    type: 'integer',
    default_value: '2000',
    description: 'Этап 2: Пауза между батчами (миллисекунды)',
    validation: { type: 'integer', min: 500, max: 10000 },
    editable: true,
    require_restart: false
  },
  {
    category: 'processing_stages',
    key: 'stage2_cache_ttl_days',
    value: '7',
    type: 'integer',
    default_value: '7',
    description: 'Этап 2: Кеш на сколько дней',
    validation: { type: 'integer', min: 1, max: 30 },
    editable: true,
    require_restart: false
  },

  // Этап 3: Анализ контактов
  {
    category: 'processing_stages',
    key: 'stage3_concurrent_requests',
    value: '2',
    type: 'integer',
    default_value: '2',
    description: 'Этап 3: Максимум одновременных запросов',
    validation: { type: 'integer', min: 1, max: 5 },
    editable: true,
    require_restart: false
  },
  {
    category: 'processing_stages',
    key: 'stage3_request_delay_ms',
    value: '2500',
    type: 'integer',
    default_value: '2500',
    description: 'Этап 3: Пауза между запросами (миллисекунды)',
    validation: { type: 'integer', min: 500, max: 10000 },
    editable: true,
    require_restart: false
  },
  {
    category: 'processing_stages',
    key: 'stage3_cache_ttl_days',
    value: '7',
    type: 'integer',
    default_value: '7',
    description: 'Этап 3: Кеш на сколько дней',
    validation: { type: 'integer', min: 1, max: 30 },
    editable: true,
    require_restart: false
  },
  {
    category: 'processing_stages',
    key: 'stage3_retry_on_no_email',
    value: 'true',
    type: 'boolean',
    default_value: 'true',
    description: 'Этап 3: Повторить если email не найден',
    validation: { type: 'boolean' },
    editable: true,
    require_restart: false
  },

  // Этап 4: Описание услуг
  {
    category: 'processing_stages',
    key: 'stage4_concurrent_per_company',
    value: '2',
    type: 'integer',
    default_value: '2',
    description: 'Этап 4: Запросов одновременно на компанию',
    validation: { type: 'integer', min: 1, max: 3 },
    editable: true,
    require_restart: false
  },
  {
    category: 'processing_stages',
    key: 'stage4_company_delay_ms',
    value: '1000',
    type: 'integer',
    default_value: '1000',
    description: 'Этап 4: Пауза между компаниями (миллисекунды)',
    validation: { type: 'integer', min: 500, max: 10000 },
    editable: true,
    require_restart: false
  },
  {
    category: 'processing_stages',
    key: 'stage4_cache_ttl_days',
    value: '14',
    type: 'integer',
    default_value: '14',
    description: 'Этап 4: Кеш на сколько дней',
    validation: { type: 'integer', min: 1, max: 60 },
    editable: true,
    require_restart: false
  },

  // Этап 5: Генерация тегов
  {
    category: 'processing_stages',
    key: 'stage5_concurrent_requests',
    value: '2',
    type: 'integer',
    default_value: '2',
    description: 'Этап 5: Максимум одновременных запросов',
    validation: { type: 'integer', min: 1, max: 5 },
    editable: true,
    require_restart: false
  },
  {
    category: 'processing_stages',
    key: 'stage5_request_delay_ms',
    value: '2000',
    type: 'integer',
    default_value: '2000',
    description: 'Этап 5: Пауза между запросами (миллисекунды)',
    validation: { type: 'integer', min: 500, max: 10000 },
    editable: true,
    require_restart: false
  },
  {
    category: 'processing_stages',
    key: 'stage5_cache_ttl_days',
    value: '30',
    type: 'integer',
    default_value: '30',
    description: 'Этап 5: Кеш на сколько дней',
    validation: { type: 'integer', min: 1, max: 90 },
    editable: true,
    require_restart: false
  },

  // КАТЕГОРИЯ: database
  {
    category: 'database',
    key: 'database_pool_min',
    value: '5',
    type: 'integer',
    default_value: '5',
    description: 'Минимум соединений в пуле',
    validation: { type: 'integer', min: 1, max: 20 },
    editable: true,
    require_restart: true
  },
  {
    category: 'database',
    key: 'database_pool_max',
    value: '20',
    type: 'integer',
    default_value: '20',
    description: 'Максимум соединений в пуле',
    validation: { type: 'integer', min: 5, max: 100 },
    editable: true,
    require_restart: true
  },
  {
    category: 'database',
    key: 'database_query_timeout_seconds',
    value: '30',
    type: 'integer',
    default_value: '30',
    description: 'Таймаут на SQL запрос',
    validation: { type: 'integer', min: 5, max: 120 },
    editable: true,
    require_restart: false
  },
  {
    category: 'database',
    key: 'database_connect_timeout_seconds',
    value: '10',
    type: 'integer',
    default_value: '10',
    description: 'Таймаут на подключение',
    validation: { type: 'integer', min: 2, max: 60 },
    editable: true,
    require_restart: true
  },
  {
    category: 'database',
    key: 'database_auto_cleanup_logs_days',
    value: '30',
    type: 'integer',
    default_value: '30',
    description: 'Удалять логи старше N дней',
    validation: { type: 'integer', min: 7, max: 365 },
    editable: true,
    require_restart: false
  },
  {
    category: 'database',
    key: 'database_ssl_enabled',
    value: 'true',
    type: 'boolean',
    default_value: 'true',
    description: 'Использовать SSL для подключения',
    validation: { type: 'boolean' },
    editable: true,
    require_restart: true
  },

  // КАТЕГОРИЯ: cache
  {
    category: 'cache',
    key: 'cache_use_redis',
    value: 'true',
    type: 'boolean',
    default_value: 'true',
    description: 'Использовать Redis вместо памяти',
    validation: { type: 'boolean' },
    editable: true,
    require_restart: true
  },
  {
    category: 'cache',
    key: 'redis_url',
    value: process.env.REDIS_URL || 'redis://localhost:6379',
    type: 'string',
    default_value: 'redis://localhost:6379',
    description: 'Адрес Redis сервера',
    validation: { type: 'url' },
    editable: true,
    require_restart: true
  },
  {
    category: 'cache',
    key: 'cache_default_ttl_seconds',
    value: '3600',
    type: 'integer',
    default_value: '3600',
    description: 'TTL для кеша по умолчанию (секунды)',
    validation: { type: 'integer', min: 60, max: 604800 },
    editable: true,
    require_restart: false
  },
  {
    category: 'cache',
    key: 'cache_max_size_mb',
    value: '1000',
    type: 'integer',
    default_value: '1000',
    description: 'Максимальный размер кеша (МБ)',
    validation: { type: 'integer', min: 100, max: 10000 },
    editable: true,
    require_restart: false
  },
  {
    category: 'cache',
    key: 'cache_key_prefix',
    value: 'sonar_portal',
    type: 'string',
    default_value: 'sonar_portal',
    description: 'Префикс для всех ключей в Redis',
    validation: { type: 'string', pattern: '^[a-z_]+$' },
    editable: true,
    require_restart: true
  },
  {
    category: 'cache',
    key: 'cache_compress_threshold_bytes',
    value: '1024',
    type: 'integer',
    default_value: '1024',
    description: 'Сжимать значения > N байт',
    validation: { type: 'integer', min: 512, max: 10000 },
    editable: true,
    require_restart: false
  },

  // КАТЕГОРИЯ: validation
  {
    category: 'validation',
    key: 'validation_min_confidence',
    value: '0.7',
    type: 'float',
    default_value: '0.7',
    description: 'Минимальная уверенность в результатах (0-1)',
    validation: { type: 'float', min: 0, max: 1, step: 0.1 },
    editable: true,
    require_restart: false
  },
  {
    category: 'validation',
    key: 'validation_require_email',
    value: 'true',
    type: 'boolean',
    default_value: 'true',
    description: 'Обязательно должен быть email',
    validation: { type: 'boolean' },
    editable: true,
    require_restart: false
  },
  {
    category: 'validation',
    key: 'validation_require_website',
    value: 'true',
    type: 'boolean',
    default_value: 'true',
    description: 'Обязательно должен быть сайт',
    validation: { type: 'boolean' },
    editable: true,
    require_restart: false
  },
  {
    category: 'validation',
    key: 'validation_check_email_uniqueness',
    value: 'true',
    type: 'boolean',
    default_value: 'true',
    description: 'Проверять уникальность email',
    validation: { type: 'boolean' },
    editable: true,
    require_restart: false
  },
  {
    category: 'validation',
    key: 'validation_min_tags',
    value: '5',
    type: 'integer',
    default_value: '5',
    description: 'Минимальное количество тегов',
    validation: { type: 'integer', min: 1, max: 20 },
    editable: true,
    require_restart: false
  },
  {
    category: 'validation',
    key: 'validation_max_tags',
    value: '20',
    type: 'integer',
    default_value: '20',
    description: 'Максимальное количество тегов',
    validation: { type: 'integer', min: 5, max: 50 },
    editable: true,
    require_restart: false
  },
  {
    category: 'validation',
    key: 'validation_min_company_name_length',
    value: '2',
    type: 'integer',
    default_value: '2',
    description: 'Минимальная длина названия компании',
    validation: { type: 'integer', min: 1, max: 10 },
    editable: true,
    require_restart: false
  },
  {
    category: 'validation',
    key: 'validation_max_company_name_length',
    value: '500',
    type: 'integer',
    default_value: '500',
    description: 'Максимальная длина названия компании',
    validation: { type: 'integer', min: 50, max: 1000 },
    editable: true,
    require_restart: false
  },
  {
    category: 'validation',
    key: 'validation_strict_email_format',
    value: 'true',
    type: 'boolean',
    default_value: 'true',
    description: 'Строгая проверка формата email',
    validation: { type: 'boolean' },
    editable: true,
    require_restart: false
  },

  // КАТЕГОРИЯ: logging
  {
    category: 'logging',
    key: 'logging_level',
    value: 'INFO',
    type: 'string',
    default_value: 'INFO',
    description: 'Уровень логирования',
    validation: { type: 'enum', enum: ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] },
    editable: true,
    require_restart: false
  },
  {
    category: 'logging',
    key: 'logging_log_api_calls',
    value: 'true',
    type: 'boolean',
    default_value: 'true',
    description: 'Записывать все вызовы Sonar API',
    validation: { type: 'boolean' },
    editable: true,
    require_restart: false
  },
  {
    category: 'logging',
    key: 'logging_log_parsing',
    value: 'true',
    type: 'boolean',
    default_value: 'true',
    description: 'Записывать этапы парсинга ответов',
    validation: { type: 'boolean' },
    editable: true,
    require_restart: false
  },
  {
    category: 'logging',
    key: 'logging_log_database_queries',
    value: 'false',
    type: 'boolean',
    default_value: 'false',
    description: 'Записывать все SQL запросы',
    validation: { type: 'boolean' },
    editable: true,
    require_restart: false
  },
  {
    category: 'logging',
    key: 'logging_save_to_file',
    value: 'true',
    type: 'boolean',
    default_value: 'true',
    description: 'Сохранять логи в файлы',
    validation: { type: 'boolean' },
    editable: true,
    require_restart: true
  },
  {
    category: 'logging',
    key: 'logging_file_path',
    value: './logs',
    type: 'string',
    default_value: './logs',
    description: 'Путь к директории логов',
    validation: { type: 'string' },
    editable: true,
    require_restart: true
  },
  {
    category: 'logging',
    key: 'logging_rotation_days',
    value: '7',
    type: 'integer',
    default_value: '7',
    description: 'Создавать новый файл логов каждые N дней',
    validation: { type: 'integer', min: 1, max: 365 },
    editable: true,
    require_restart: false
  },
  {
    category: 'logging',
    key: 'logging_max_file_size_mb',
    value: '100',
    type: 'integer',
    default_value: '100',
    description: 'Ротировать файл при размере > N МБ',
    validation: { type: 'integer', min: 10, max: 1000 },
    editable: true,
    require_restart: false
  },
];

async function seedSettings() {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Starting settings seed...\n');
    
    await client.query('BEGIN');
    
    for (const setting of defaultSettings) {
      const query = `
        INSERT INTO settings (
          category, setting_key, setting_value, setting_type,
          default_value, description, validation_rules,
          is_editable, require_restart, changed_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (category, setting_key) 
        DO UPDATE SET 
          default_value = EXCLUDED.default_value,
          description = EXCLUDED.description,
          validation_rules = EXCLUDED.validation_rules
      `;
      
      await client.query(query, [
        setting.category,
        setting.key,
        setting.value,
        setting.type,
        setting.default_value,
        setting.description,
        JSON.stringify(setting.validation),
        setting.editable,
        setting.require_restart,
        'system'
      ]);
    }
    
    await client.query('COMMIT');
    
    const count = await client.query('SELECT COUNT(*) FROM settings');
    console.log(`✅ Successfully seeded ${count.rows[0].count} settings`);
    console.log('✨ Settings initialization complete!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seedSettings()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { seedSettings };

