#!/usr/bin/env node

/**
 * Translation Worker - Фоновый процесс русификации данных
 * 
 * Работает независимо от основного API сервера
 * Переводит китайские данные компаний на русский через DeepSeek
 * Сохраняет переводы в отдельную таблицу translations
 * 
 * Запуск: node src/workers/translationWorker.js
 * Остановка: Ctrl+C или SIGTERM
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const SupabaseClient = require('../database/SupabaseClient');
const TranslationService = require('../services/TranslationService');
const SettingsManager = require('../services/SettingsManager');

// Простой logger для worker
class WorkerLogger {
  constructor() {
    this.startTime = Date.now();
  }

  _timestamp() {
    const now = new Date();
    return now.toISOString();
  }

  _uptime() {
    const ms = Date.now() - this.startTime;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  info(message, data = {}) {
    console.log(`[${this._timestamp()}] [INFO] [${this._uptime()}] ${message}`, data);
  }

  warn(message, data = {}) {
    console.log(`[${this._timestamp()}] [WARN] [${this._uptime()}] ${message}`, data);
  }

  error(message, data = {}) {
    console.error(`[${this._timestamp()}] [ERROR] [${this._uptime()}] ${message}`, data);
  }

  debug(message, data = {}) {
    if (process.env.DEBUG === 'true') {
      console.log(`[${this._timestamp()}] [DEBUG] [${this._uptime()}] ${message}`, data);
    }
  }
}

class TranslationWorker {
  constructor() {
    this.logger = new WorkerLogger();
    this.isRunning = false;
    this.isStopping = false;
    
    // Статистика
    this.stats = {
      totalProcessed: 0,
      totalTranslated: 0,
      totalFailed: 0,
      totalSkipped: 0,
      cycles: 0
    };
    
    // Конфигурация (будет загружена из settings)
    this.config = {
      batchSize: 5,
      intervalMs: 30000, // 30 секунд
      enabled: true
    };
  }

  async initialize() {
    try {
      this.logger.info('🚀 Translation Worker starting...');
      
      // Инициализация БД
      this.db = new SupabaseClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        this.logger
      );
      
      await this.db.initialize();
      this.logger.info('✅ Database connected');
      
      // Загрузка настроек
      this.settingsManager = new SettingsManager(this.db, this.logger);
      const settings = await this.settingsManager.getAllSettings();
      
      // Обновляем конфигурацию из settings
      // Настройки теперь в settings.translation объекте
      const translationSettings = settings.translation || {};
      this.config.batchSize = parseInt(translationSettings.batch_size) || 5;
      this.config.intervalMs = parseInt(translationSettings.interval_ms) || 30000;
      this.config.enabled = translationSettings.enabled === 'true';
      
      this.logger.info('📝 Settings loaded', {
        batchSize: this.config.batchSize,
        intervalMs: this.config.intervalMs,
        enabled: this.config.enabled
      });
      
      // Инициализация TranslationService
      this.translationService = new TranslationService(this.db, this.logger, settings);
      this.logger.info('✅ Translation Service initialized');
      
      // Настройка graceful shutdown
      this._setupShutdownHandlers();
      
      this.logger.info('✅ Translation Worker ready');
      
    } catch (error) {
      this.logger.error('❌ Failed to initialize Translation Worker', {
        error: error.message
      });
      throw error;
    }
  }

  async start() {
    if (this.isRunning) {
      this.logger.warn('⚠️ Worker already running');
      return;
    }
    
    if (!this.config.enabled) {
      this.logger.warn('⚠️ Translation is disabled in settings');
      this.logger.info('💤 Worker will check every 60 seconds if translation is enabled');
      this.isRunning = true;
      await this._runDisabledLoop();
      return;
    }
    
    this.isRunning = true;
    this.logger.info('▶️ Translation Worker started', {
      batchSize: this.config.batchSize,
      interval: `${this.config.intervalMs / 1000}s`
    });
    
    await this._runLoop();
  }

  async _runLoop() {
    while (this.isRunning && !this.isStopping) {
      try {
        this.stats.cycles++;
        
        this.logger.info(`🔄 Cycle #${this.stats.cycles} - Looking for companies to translate...`);
        
        // Найти компании без переводов
        const companyIds = await this.translationService.findUntranslatedCompanies(this.config.batchSize);
        
        if (companyIds.length === 0) {
          this.logger.info('✨ No companies need translation, sleeping...');
        } else {
          this.logger.info(`📋 Found ${companyIds.length} companies to translate`);
          
          // Переводим каждую компанию
          for (let i = 0; i < companyIds.length; i++) {
            if (this.isStopping) break;
            
            const companyId = companyIds[i];
            this.logger.info(`🌐 Translating company ${i + 1}/${companyIds.length}...`, { companyId });
            
            try {
              const result = await this.translationService.translateCompany(companyId);
              
              this.stats.totalProcessed++;
              this.stats.totalTranslated += result.translated;
              this.stats.totalFailed += result.failed;
              this.stats.totalSkipped += result.skipped;
              
              this.logger.info(`✅ Company translated`, {
                companyId,
                translated: result.translated,
                skipped: result.skipped,
                failed: result.failed
              });
              
            } catch (error) {
              this.logger.error('❌ Failed to translate company', {
                companyId,
                error: error.message
              });
              this.stats.totalFailed++;
            }
          }
          
          // Показать общую статистику
          this._logStats();
        }
        
        // Ждём перед следующим циклом
        if (!this.isStopping) {
          this.logger.info(`💤 Sleeping for ${this.config.intervalMs / 1000}s...`);
          await this._sleep(this.config.intervalMs);
        }
        
      } catch (error) {
        this.logger.error('❌ Error in translation loop', {
          error: error.message,
          stack: error.stack
        });
        
        // При ошибке ждём немного дольше перед повтором
        await this._sleep(60000); // 1 минута
      }
    }
    
    this.logger.info('⏹️ Translation Worker stopped');
  }

  async _runDisabledLoop() {
    while (this.isRunning && !this.isStopping) {
      // Проверяем настройки каждую минуту
      await this._sleep(60000);
      
      try {
        const settings = await this.settingsManager.getAllSettings();
        const translationSettings = settings.translation || {};
        
        if (translationSettings.enabled === 'true') {
          this.logger.info('✅ Translation enabled, starting...');
          this.config.enabled = true;
          this.config.batchSize = parseInt(translationSettings.batch_size) || 5;
          this.config.intervalMs = parseInt(translationSettings.interval_ms) || 30000;
          await this._runLoop();
          return;
        }
      } catch (error) {
        this.logger.error('❌ Error checking settings', { error: error.message });
      }
    }
  }

  stop() {
    if (!this.isRunning) {
      this.logger.warn('⚠️ Worker not running');
      return;
    }
    
    this.logger.info('🛑 Stopping Translation Worker...');
    this.isStopping = true;
    this.isRunning = false;
    
    this._logStats();
  }

  _logStats() {
    const avgTranslationsPerCompany = this.stats.totalProcessed > 0
      ? (this.stats.totalTranslated / this.stats.totalProcessed).toFixed(1)
      : 0;
    
    this.logger.info('📊 Statistics', {
      cycles: this.stats.cycles,
      companiesProcessed: this.stats.totalProcessed,
      totalTranslated: this.stats.totalTranslated,
      totalFailed: this.stats.totalFailed,
      totalSkipped: this.stats.totalSkipped,
      avgPerCompany: avgTranslationsPerCompany
    });
  }

  _setupShutdownHandlers() {
    const gracefulShutdown = (signal) => {
      this.logger.info(`⚠️ Received ${signal}, shutting down gracefully...`);
      this.stop();
      
      // Даём 5 секунд на завершение текущей операции
      setTimeout(() => {
        this.logger.info('👋 Goodbye!');
        process.exit(0);
      }, 5000);
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    process.on('uncaughtException', (error) => {
      this.logger.error('💥 Uncaught Exception', {
        error: error.message,
        stack: error.stack
      });
      this.stop();
      process.exit(1);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('💥 Unhandled Rejection', {
        reason: reason,
        promise: promise
      });
    });
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Запуск worker
async function main() {
  const worker = new TranslationWorker();
  
  try {
    await worker.initialize();
    await worker.start();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Запуск только если это главный модуль
if (require.main === module) {
  main();
}

module.exports = TranslationWorker;

