const axios = require('axios');
const crypto = require('crypto');
const globalQueue = require('./GlobalApiQueue');

/**
 * SonarApiClient - Клиент для Perplexity Sonar API
 * Поддерживает обе модели: sonar (базовая) и sonar-pro
 * Управляет вызовами, rate limiting, повторами и кешированием
 * ИСПОЛЬЗУЕТ ГЛОБАЛЬНУЮ ОЧЕРЕДЬ для всех запросов
 */
class SonarApiClient {
  constructor(database, settingsManager, logger, modelType = 'sonar-pro') {
    this.db = database;
    this.settingsManager = settingsManager;
    this.logger = logger;
    this.modelType = modelType; // 'sonar' или 'sonar-pro'
    this.creditsTracker = null;  // Будет установлен позже
    
    this.requestQueue = [];
    this.activeRequests = 0;
    this.lastRequestTime = 0;
    this.requestInProgress = false; // Глобальная блокировка для последовательных запросов
    this.requestPromise = null; // Promise текущего запроса
    this.queueLength = 0; // Счетчик очереди для мониторинга
    this.queueCallbacks = []; // Callbacks для уведомления об изменении очереди
  }

  /**
   * Установить CreditsTracker для автоматического логирования расходов
   */
  setCreditsTracker(creditsTracker) {
    this.creditsTracker = creditsTracker;
    this.logger.info('CreditsTracker attached to SonarApiClient');
  }

  /**
   * Подписаться на изменения очереди
   */
  onQueueChange(callback) {
    this.queueCallbacks.push(callback);
  }

  /**
   * Уведомить подписчиков об изменении очереди
   */
  _notifyQueueChange() {
    const queueStatus = {
      queueLength: this.queueLength,
      inProgress: this.requestInProgress,
      timestamp: Date.now()
    };
    
    this.queueCallbacks.forEach(callback => {
      try {
        callback(queueStatus);
      } catch (error) {
        this.logger.error('Queue callback error', { error: error.message });
      }
    });
  }

  /**
   * Получить текущий статус очереди
   */
  /**
   * Получить статус очереди
   * Теперь возвращает статус ГЛОБАЛЬНОЙ очереди
   */
  getQueueStatus() {
    const globalStatus = globalQueue.getStatus();
    return {
      queueLength: globalStatus.queueLength,
      inProgress: globalStatus.isProcessing,
      timestamp: Date.now(),
      model: this.model
    };
  }

  /**
   * Инициализация - загрузка настроек
   */
  async initialize() {
    const apiSettings = await this.settingsManager.getCategory('api');
    
    this.apiKey = apiSettings.api_key;
    this.baseUrl = apiSettings.api_base_url || 'https://api.perplexity.ai';
    // Использовать указанную модель или из настроек
    this.model = this.modelType || apiSettings.model_name;
    this.temperature = parseFloat(apiSettings.temperature) || 0.3;
    this.topP = parseFloat(apiSettings.top_p) || 0.9;
    this.maxTokens = parseInt(apiSettings.max_tokens) || 2000;
    this.maxRetries = parseInt(apiSettings.max_retries) || 3;
    this.timeout = (parseInt(apiSettings.api_timeout_seconds) || 60) * 1000;
    this.rateLimit = parseInt(apiSettings.rate_limit_requests_per_min) || 20;
    this.retryDelay = (parseInt(apiSettings.retry_delay_seconds) || 10) * 1000;
    
    this.logger.info('SonarApiClient initialized', {
      modelType: this.modelType,
      model: this.model,
      maxTokens: this.maxTokens,
      maxRetries: this.maxRetries,
      rateLimit: this.rateLimit,
      timeout: this.timeout,
      hasApiKey: !!this.apiKey,
      apiKeyLength: this.apiKey ? this.apiKey.length : 0,
      baseUrl: this.baseUrl
    });
  }

  /**
   * Выполнить запрос к Sonar API
   * ИСПОЛЬЗУЕТ ГЛОБАЛЬНУЮ ОЧЕРЕДЬ
   */
  async query(prompt, options = {}) {
    const {
      stage = 'unknown',
      sessionId = null,
      useCache = false,
      temperature = this.temperature,
      maxTokens = this.maxTokens
    } = options;

    console.log(`\n🔵 SonarApiClient.query() START`);
    console.log(`   Stage: ${stage}`);
    console.log(`   Model: ${this.model}`);
    console.log(`   API Key exists: ${!!this.apiKey} (length: ${this.apiKey?.length || 0})`);
    console.log(`   Use cache: ${useCache}`);
    console.log(`   Prompt length: ${prompt?.length || 0} chars`);

    // Обернуть запрос для глобальной очереди
    const requestFn = async () => {
      return await this._executeRequest(prompt, {
        stage,
        sessionId,
        useCache,
        temperature,
        maxTokens
      });
    };

    // Добавить в глобальную очередь
    return await globalQueue.enqueue(requestFn, {
      stage,
      model: this.model,
      sessionId
    });
  }

  /**
   * Внутренний метод выполнения запроса
   * Вызывается из глобальной очереди
   */
  async _executeRequest(prompt, options) {
    const {
      stage,
      sessionId,
      useCache,
      temperature,
      maxTokens
    } = options;

    const startTime = Date.now();
    
    // Проверить кеш
    if (useCache) {
      const cached = await this._checkCache(prompt, stage);
      if (cached) {
        this.logger.debug(`Cache HIT for stage: ${stage}`);
        console.log(`   💾 Using cached response`);
        await this._logApiCall(sessionId, stage, 'success', 0, Date.now() - startTime, 0, true);
        
        return cached;
      } else {
        console.log(`   ⚠️  Cache MISS`);
      }
    }

    // Ожидать rate limit
    console.log(`   ⏳ Checking rate limit...`);
    await this._enforceRateLimit();
    console.log(`   ✓ Rate limit OK, starting attempts...`);
    console.log(`   📊 maxRetries = ${this.maxRetries}`);

    let attempt = 0;
    let lastError = null;

    while (attempt < this.maxRetries) {
      attempt++;
      
      console.log(`   🔄 Attempt ${attempt}/${this.maxRetries}`);
      
      try {
        this.logger.debug(`Sonar API request (attempt ${attempt}/${this.maxRetries})`, { stage });
        
        console.log(`   📤 Sending POST to ${this.baseUrl}/chat/completions`);
        
        const response = await axios.post(
          `${this.baseUrl}/chat/completions`,
          {
            model: this.model,
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant that ALWAYS returns valid JSON. Never include explanatory text outside the JSON structure.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature,
            top_p: this.topP,
            max_tokens: maxTokens,
            stream: false
            // Note: Perplexity does not support response_format parameter
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: this.timeout
          }
        );

        const result = response.data.choices[0].message.content;
        const tokensUsed = response.data.usage?.total_tokens || 0;
        const responseTime = Date.now() - startTime;
        
        console.log(`   ✅ SUCCESS! Got response (${result?.length || 0} chars, ${tokensUsed} tokens)`);
        
        // Логировать полный ответ для отладки (первые 500 символов)
        this.logger.debug('Sonar API full response preview', {
          content_preview: result.substring(0, 500),
          has_citations: !!response.data.citations,
          has_usage: !!response.data.usage,
          metadata: {
            model: response.data.model,
            tokensUsed,
            responseTime
          }
        });

        // Сохранить в кеш
        if (useCache) {
          await this._saveToCache(prompt, stage, result, tokensUsed);
        }

        // Логировать вызов
        await this._logApiCall(sessionId, stage, 'success', tokensUsed, responseTime, attempt - 1, false, response.status);

        this.logger.info(`Sonar API success`, {
          stage,
          tokensUsed,
          responseTime,
          attempts: attempt
        });

        return result;

      } catch (error) {
        lastError = error;
        const responseTime = Date.now() - startTime;
        
        console.log(`   ❌ ERROR: ${error.message}`);
        console.log(`   HTTP Status: ${error.response?.status || 'N/A'}`);

        // Определить тип ошибки
        let status = 'error';
        let httpStatus = error.response?.status || 0;
        const isLastAttempt = attempt >= this.maxRetries;
        
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          status = 'timeout';
          this.logger.warn(`Sonar API timeout (attempt ${attempt}/${this.maxRetries})`);
        } else if (httpStatus === 429) {
          status = 'rate_limited';
          this.logger.warn(`Sonar API rate limited (attempt ${attempt}/${this.maxRetries})`);
        } else if (httpStatus >= 500) {
          status = 'server_error';
          this.logger.warn(`Sonar API server error ${httpStatus} (attempt ${attempt}/${this.maxRetries})`);
        } else {
          this.logger.error(`Sonar API error (attempt ${attempt}/${this.maxRetries})`, {
            error: error.message,
            status: httpStatus,
            willRetry: !isLastAttempt
          });
        }

        // Логировать неудачную попытку
        await this._logApiCall(
          sessionId,
          stage,
          status,
          0,
          responseTime,
          attempt - 1,
          false,
          httpStatus,
          error.message
        );

        // Если это последняя попытка, бросить ошибку
        if (isLastAttempt) {
          this.logger.error(`Sonar API: All ${this.maxRetries} retries exhausted`, {
            stage,
            finalError: error.message
          });
          
          throw new Error(`Sonar API failed after ${this.maxRetries} attempts: ${lastError.message}`);
        }

        // EXPONENTIAL BACKOFF с jitter для следующей попытки
        const baseDelay = this.retryDelay || 1000; // 1 секунда по умолчанию
        const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
        const maxDelay = 32000; // Максимум 32 секунды
        const delay = Math.min(exponentialDelay, maxDelay);
        
        // Добавляем jitter (случайность 0-50% от delay) чтобы избежать thundering herd
        const jitter = Math.random() * delay * 0.5;
        const totalDelay = delay + jitter;
        
        this.logger.info(`⏳ Exponential backoff: waiting ${Math.round(totalDelay)}ms before retry ${attempt + 1}/${this.maxRetries}`, {
          baseDelay,
          exponentialDelay,
          jitter: Math.round(jitter),
          totalDelay: Math.round(totalDelay),
          errorType: status
        });
        
        await this._sleep(totalDelay);
      }
    }
  }

  /**
   * Проверить кеш
   */
  async _checkCache(prompt, stage) {
    const promptHash = this._hashPrompt(prompt);
    
    const result = await this.db.query(
      `SELECT response, usage_count, tokens_saved 
       FROM perplexity_cache 
       WHERE prompt_hash = $1 AND expires_at > NOW()`,
      [promptHash]
    );

    if (result.rows.length > 0) {
      // Обновить счетчики использования
      await this.db.query(
        `UPDATE perplexity_cache 
         SET usage_count = usage_count + 1,
             tokens_saved = tokens_saved + $1,
             last_used_at = NOW()
         WHERE prompt_hash = $2`,
        [0, promptHash] // tokens_saved будет обновлен позже
      );

      return result.rows[0].response;
    }

    return null;
  }

  /**
   * Сохранить в кеш
   */
  async _saveToCache(prompt, stage, response, tokensUsed) {
    const promptHash = this._hashPrompt(prompt);
    
    // Получить TTL для этапа
    const settings = await this.settingsManager.getCategory('processing_stages');
    let ttlHours = 24;
    
    if (stage.startsWith('stage1')) ttlHours = settings.stage1_cache_ttl_hours;
    if (stage.startsWith('stage2')) ttlHours = settings.stage2_cache_ttl_days * 24;
    if (stage.startsWith('stage3')) ttlHours = settings.stage3_cache_ttl_days * 24;
    if (stage.startsWith('stage4')) ttlHours = settings.stage4_cache_ttl_days * 24;
    if (stage.startsWith('stage5')) ttlHours = settings.stage5_cache_ttl_days * 24;

    try {
      await this.db.query(
        `INSERT INTO perplexity_cache 
         (prompt_hash, stage, prompt_text, response, tokens_used, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '${ttlHours} hours')
         ON CONFLICT (prompt_hash) 
         DO UPDATE SET 
           response = EXCLUDED.response,
           tokens_used = EXCLUDED.tokens_used,
           usage_count = perplexity_cache.usage_count + 1,
           last_used_at = NOW()`,
        [promptHash, stage, prompt.substring(0, 500), response, tokensUsed]
      );
    } catch (error) {
      this.logger.warn('Failed to save to cache', { error: error.message });
    }
  }

  /**
   * Логировать вызов API
   */
  async _logApiCall(sessionId, stage, status, tokensUsed, responseTime, retryCount, fromCache, httpStatus = null, errorMessage = null) {
    try {
      await this.db.query(
        `INSERT INTO sonar_api_calls 
         (session_id, stage, status, tokens_used, response_time_ms, retry_count, from_cache, http_status, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [sessionId, stage, status, tokensUsed, responseTime, retryCount, fromCache, httpStatus, errorMessage]
      );

      // Если есть creditsTracker и запрос успешный (не из кеша), логировать расходы
      if (this.creditsTracker && sessionId && !fromCache && tokensUsed > 0) {
        // Предполагаем 50/50 распределение request/response токенов
        const requestTokens = Math.floor(tokensUsed / 2);
        const responseTokens = tokensUsed - requestTokens;
        
        await this.creditsTracker.logApiCall(
          sessionId,
          stage,
          requestTokens,
          responseTokens,
          this.model
        );
      }
    } catch (error) {
      this.logger.error('Failed to log API call', { error: error.message });
    }
  }

  /**
   * Соблюдать rate limit
   */
  async _enforceRateLimit() {
    const minInterval = (60 * 1000) / this.rateLimit; // миллисекунды между запросами
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    
    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      this.logger.debug(`Rate limiting: waiting ${waitTime}ms`);
      await this._sleep(waitTime);
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Хеш промпта для кеширования
   */
  _hashPrompt(prompt) {
    return crypto.createHash('sha256').update(prompt).digest('hex');
  }

  /**
   * Задержка
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Получить статистику использования API
   */
  async getStats(sessionId = null) {
    const query = sessionId
      ? 'SELECT * FROM sonar_api_calls WHERE session_id = $1 ORDER BY timestamp DESC'
      : 'SELECT * FROM sonar_api_calls ORDER BY timestamp DESC LIMIT 100';
    
    const params = sessionId ? [sessionId] : [];
    const result = await this.db.query(query, params);

    const stats = {
      total_calls: result.rows.length,
      successful: result.rows.filter(r => r.status === 'success').length,
      from_cache: result.rows.filter(r => r.from_cache).length,
      failed: result.rows.filter(r => r.status === 'error').length,
      rate_limited: result.rows.filter(r => r.status === 'rate_limited').length,
      total_tokens: result.rows.reduce((sum, r) => sum + (r.tokens_used || 0), 0),
      avg_response_time: result.rows.length > 0
        ? result.rows.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) / result.rows.length
        : 0
    };

    return stats;
  }
}

module.exports = SonarApiClient;

