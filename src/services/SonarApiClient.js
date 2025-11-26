const axios = require('axios');
const crypto = require('crypto');

/**
 * SonarApiClient - Клиент для Perplexity Sonar Pro API
 * Управляет вызовами, rate limiting, повторами и кешированием
 */
class SonarApiClient {
  constructor(database, settingsManager, logger) {
    this.db = database;
    this.settingsManager = settingsManager;
    this.logger = logger;
    this.creditsTracker = null;  // Будет установлен позже
    
    this.requestQueue = [];
    this.activeRequests = 0;
    this.lastRequestTime = 0;
  }

  /**
   * Установить CreditsTracker для автоматического логирования расходов
   */
  setCreditsTracker(creditsTracker) {
    this.creditsTracker = creditsTracker;
    this.logger.info('CreditsTracker attached to SonarApiClient');
  }

  /**
   * Инициализация - загрузка настроек
   */
  async initialize() {
    const apiSettings = await this.settingsManager.getCategory('api');
    
    this.apiKey = apiSettings.api_key;
    this.baseUrl = apiSettings.api_base_url;
    this.model = apiSettings.model_name;
    this.temperature = apiSettings.temperature;
    this.topP = apiSettings.top_p;
    this.maxTokens = apiSettings.max_tokens;
    this.maxRetries = apiSettings.max_retries;
    this.timeout = apiSettings.api_timeout_seconds * 1000;
    this.rateLimit = apiSettings.rate_limit_requests_per_min;
    this.retryDelay = apiSettings.retry_delay_seconds * 1000;
    
    this.logger.info('SonarApiClient initialized', {
      model: this.model,
      maxTokens: this.maxTokens,
      rateLimit: this.rateLimit
    });
  }

  /**
   * Выполнить запрос к Sonar API
   */
  async query(prompt, options = {}) {
    const {
      stage = 'unknown',
      sessionId = null,
      useCache = true,
      temperature = this.temperature,
      maxTokens = this.maxTokens
    } = options;

    const startTime = Date.now();
    
    // Проверить кеш
    if (useCache) {
      const cached = await this._checkCache(prompt, stage);
      if (cached) {
        this.logger.debug(`Cache HIT for stage: ${stage}`);
        await this._logApiCall(sessionId, stage, 'success', 0, Date.now() - startTime, 0, true);
        return cached;
      }
    }

    // Ожидать rate limit
    await this._enforceRateLimit();

    let attempt = 0;
    let lastError = null;

    while (attempt < this.maxRetries) {
      attempt++;
      
      try {
        this.logger.debug(`Sonar API request (attempt ${attempt}/${this.maxRetries})`, { stage });
        
        const response = await axios.post(
          `${this.baseUrl}/chat/completions`,
          {
            model: this.model,
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant that provides accurate, structured data.'
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

        // Определить тип ошибки
        let status = 'error';
        let httpStatus = error.response?.status || 0;
        
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          status = 'timeout';
          this.logger.warn(`Sonar API timeout (attempt ${attempt})`);
        } else if (httpStatus === 429) {
          status = 'rate_limited';
          this.logger.warn(`Sonar API rate limited (attempt ${attempt})`);
          
          // Увеличить задержку для rate limit
          const waitTime = this.retryDelay * Math.pow(2, attempt - 1);
          this.logger.info(`Waiting ${waitTime}ms before retry`);
          await this._sleep(waitTime);
        } else {
          this.logger.error(`Sonar API error (attempt ${attempt})`, {
            error: error.message,
            status: httpStatus
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
        if (attempt >= this.maxRetries) {
          throw new Error(`Sonar API failed after ${this.maxRetries} attempts: ${lastError.message}`);
        }

        // Задержка перед повтором
        if (status !== 'rate_limited') {
          await this._sleep(this.retryDelay);
        }
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

