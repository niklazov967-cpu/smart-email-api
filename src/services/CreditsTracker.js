/**
 * CreditsTracker - Отслеживание расходов на ВСЕ API сервисы
 * 
 * v3.0.0: Поддержка DeepSeek + Perplexity с сохранением в БД
 * 
 * Поддерживаемые сервисы:
 * - DeepSeek (deepseek-chat, deepseek-reasoner)
 * - Perplexity (sonar, sonar-pro, llama-3.1-sonar-*)
 */
class CreditsTracker {
  constructor(database, logger) {
    this.db = database;
    this.logger = logger;
    
    // Цены всех API сервисов (на декабрь 2024)
    this.pricing = {
      // DeepSeek - очень дешёвый!
      'deepseek-chat': {
        input: 0.14 / 1000000,   // $0.14 за 1M input токенов
        output: 0.28 / 1000000   // $0.28 за 1M output токенов
      },
      'deepseek-reasoner': {
        input: 0.55 / 1000000,   // $0.55 за 1M input токенов
        output: 2.19 / 1000000   // $2.19 за 1M output токенов
      },
      
      // Perplexity Sonar (новые модели)
      'sonar': {
        input: 1.0 / 1000000,
        output: 1.0 / 1000000
      },
      'sonar-pro': {
        input: 3.0 / 1000000,
        output: 15.0 / 1000000
      },
      
      // Legacy Perplexity models
      'llama-3.1-sonar-small-128k-online': {
        input: 0.2 / 1000000,
        output: 0.2 / 1000000
      },
      'llama-3.1-sonar-large-128k-online': {
        input: 1.0 / 1000000,
        output: 1.0 / 1000000
      },
      'llama-3.1-sonar-huge-128k-online': {
        input: 5.0 / 1000000,
        output: 5.0 / 1000000
      }
    };
    
    // In-memory статистика (для быстрого доступа)
    this.sessionStats = new Map();
    this.globalStats = {
      deepseek: { calls: 0, tokens: 0, cost: 0 },
      perplexity: { calls: 0, tokens: 0, cost: 0 },
      total: { calls: 0, cost: 0 }
    };
    
    // Флаг инициализации из БД
    this.initialized = false;
    
    // Загрузить статистику из БД при старте
    this._loadFromDb();
  }

  /**
   * Загрузить статистику из БД при старте
   */
  async _loadFromDb() {
    if (!this.db) return;
    
    try {
      // Получить агрегированную статистику из БД
      const { data, error } = await this.db.supabase
        .from('api_credits_log')
        .select('service, model_name, total_tokens, cost_usd')
        .order('created_at', { ascending: false });
      
      if (error) {
        // Таблица может не существовать - это OK
        if (!error.message.includes('does not exist')) {
          this.logger.warn('CreditsTracker: Failed to load from DB', { error: error.message });
        }
        return;
      }
      
      if (data && data.length > 0) {
        // Агрегируем данные
        for (const row of data) {
          const cost = parseFloat(row.cost_usd) || 0;
          const tokens = row.total_tokens || 0;
          
          if (row.service === 'deepseek') {
            this.globalStats.deepseek.calls++;
            this.globalStats.deepseek.tokens += tokens;
            this.globalStats.deepseek.cost += cost;
          } else if (row.service === 'perplexity') {
            this.globalStats.perplexity.calls++;
            this.globalStats.perplexity.tokens += tokens;
            this.globalStats.perplexity.cost += cost;
          }
          
          this.globalStats.total.calls++;
          this.globalStats.total.cost += cost;
        }
        
        this.logger.info('CreditsTracker: Loaded from DB', {
          totalRecords: data.length,
          totalCost: `$${this.globalStats.total.cost.toFixed(4)}`
        });
      }
      
      this.initialized = true;
    } catch (error) {
      this.logger.warn('CreditsTracker: Error loading from DB', { error: error.message });
    }
  }

  /**
   * Логировать вызов DeepSeek API
   */
  async logDeepSeekCall(sessionId, stage, inputTokens, outputTokens, model = 'deepseek-chat') {
    const pricing = this.pricing[model] || this.pricing['deepseek-chat'];
    const cost = (inputTokens * pricing.input) + (outputTokens * pricing.output);
    const totalTokens = inputTokens + outputTokens;

    // Обновить in-memory статистику
    this.globalStats.deepseek.calls++;
    this.globalStats.deepseek.tokens += totalTokens;
    this.globalStats.deepseek.cost += cost;
    this.globalStats.total.calls++;
    this.globalStats.total.cost += cost;

    // Обновить статистику сессии
    this._updateSessionStats(sessionId, 'deepseek', cost, totalTokens);

    this.logger.info('CreditsTracker: DeepSeek call', {
      sessionId,
      stage,
      model,
      inputTokens,
      outputTokens,
      cost: `$${cost.toFixed(6)}`
    });

    // Сохранить в БД
    await this._saveToDb({
      service: 'deepseek',
      model_name: model,
      stage,
      session_id: sessionId,
      request_tokens: inputTokens,
      response_tokens: outputTokens,
      total_tokens: totalTokens,
      cost_usd: cost
    });

    return { cost, tokens: totalTokens, formatted: `$${cost.toFixed(6)}` };
  }

  /**
   * Логировать вызов Perplexity API
   */
  async logPerplexityCall(sessionId, stage, inputTokens, outputTokens, model = 'sonar') {
    const pricing = this.pricing[model] || this.pricing['sonar'];
    const cost = (inputTokens * pricing.input) + (outputTokens * pricing.output);
    const totalTokens = inputTokens + outputTokens;

    // Обновить in-memory статистику
    this.globalStats.perplexity.calls++;
    this.globalStats.perplexity.tokens += totalTokens;
    this.globalStats.perplexity.cost += cost;
    this.globalStats.total.calls++;
    this.globalStats.total.cost += cost;

    // Обновить статистику сессии
    this._updateSessionStats(sessionId, 'perplexity', cost, totalTokens);

    this.logger.info('CreditsTracker: Perplexity call', {
      sessionId,
      stage,
      model,
      inputTokens,
      outputTokens,
      cost: `$${cost.toFixed(6)}`
    });

    // Сохранить в БД
    await this._saveToDb({
      service: 'perplexity',
      model_name: model,
      stage,
      session_id: sessionId,
      request_tokens: inputTokens,
      response_tokens: outputTokens,
      total_tokens: totalTokens,
      cost_usd: cost
    });

    return { cost, tokens: totalTokens, formatted: `$${cost.toFixed(6)}` };
  }

  /**
   * Legacy метод для совместимости с SonarApiClient
   */
  async logApiCall(sessionId, stage, requestTokens, responseTokens, modelName) {
    if (modelName && modelName.includes('deepseek')) {
      return this.logDeepSeekCall(sessionId, stage, requestTokens, responseTokens, modelName);
    }
    return this.logPerplexityCall(sessionId, stage, requestTokens, responseTokens, modelName);
  }

  /**
   * Обновить статистику сессии в памяти
   */
  _updateSessionStats(sessionId, service, cost, tokens) {
    if (!sessionId) return;

    if (!this.sessionStats.has(sessionId)) {
      this.sessionStats.set(sessionId, {
        deepseek: { calls: 0, tokens: 0, cost: 0 },
        perplexity: { calls: 0, tokens: 0, cost: 0 },
        total: { calls: 0, cost: 0 }
      });
    }

    const stats = this.sessionStats.get(sessionId);
    stats[service].calls++;
    stats[service].cost += cost;
    if (tokens) stats[service].tokens = (stats[service].tokens || 0) + tokens;
    stats.total.calls++;
    stats.total.cost += cost;
  }

  /**
   * Сохранить в БД
   */
  async _saveToDb(data) {
    if (!this.db) return;

    try {
      const { error } = await this.db.supabase
        .from('api_credits_log')
        .insert({
          service: data.service,
          model_name: data.model_name,
          stage: data.stage || 'unknown',
          session_id: data.session_id || null,
          request_tokens: data.request_tokens || 0,
          response_tokens: data.response_tokens || 0,
          total_tokens: data.total_tokens || 0,
          cost_usd: data.cost_usd,
          metadata: data.metadata || {}
        });

      if (error) {
        // Если таблица не существует - создадим предупреждение один раз
        if (error.message.includes('api_credits_log')) {
          if (!this._dbWarningShown) {
            this.logger.warn('CreditsTracker: Table api_credits_log not found. Run migration 005.');
            this._dbWarningShown = true;
          }
        } else {
          this.logger.debug('CreditsTracker: DB insert error', { error: error.message });
        }
      }
    } catch (error) {
      this.logger.debug('CreditsTracker: DB save error', { error: error.message });
    }
  }

  /**
   * Получить статистику сессии
   */
  getSessionStats(sessionId) {
    const stats = this.sessionStats.get(sessionId);
    if (!stats) {
      return {
        deepseek: { calls: 0, tokens: 0, cost: 0, formatted: '$0.000000' },
        perplexity: { calls: 0, tokens: 0, cost: 0, formatted: '$0.000000' },
        total: { calls: 0, cost: 0, formatted: '$0.000000' }
      };
    }

    return {
      deepseek: {
        ...stats.deepseek,
        formatted: `$${stats.deepseek.cost.toFixed(6)}`
      },
      perplexity: {
        ...stats.perplexity,
        formatted: `$${stats.perplexity.cost.toFixed(6)}`
      },
      total: {
        ...stats.total,
        formatted: `$${stats.total.cost.toFixed(4)}`
      }
    };
  }

  /**
   * Получить глобальную статистику
   */
  getGlobalStats() {
    return {
      deepseek: {
        ...this.globalStats.deepseek,
        formatted: `$${this.globalStats.deepseek.cost.toFixed(4)}`
      },
      perplexity: {
        ...this.globalStats.perplexity,
        formatted: `$${this.globalStats.perplexity.cost.toFixed(4)}`
      },
      total: {
        ...this.globalStats.total,
        formatted: `$${this.globalStats.total.cost.toFixed(2)}`
      }
    };
  }

  /**
   * Получить сводку расходов (для отображения)
   */
  getSummary() {
    const g = this.globalStats;
    return `
📊 API Расходы:
━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 DeepSeek:   ${g.deepseek.calls} calls, ${g.deepseek.tokens} tokens, $${g.deepseek.cost.toFixed(4)}
🌐 Perplexity: ${g.perplexity.calls} calls, ${g.perplexity.tokens} tokens, $${g.perplexity.cost.toFixed(4)}
━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 ИТОГО:      ${g.total.calls} calls, $${g.total.cost.toFixed(2)}
`;
  }

  /**
   * Сбросить статистику (только in-memory, БД не трогаем)
   */
  reset() {
    this.sessionStats.clear();
    this.globalStats = {
      deepseek: { calls: 0, tokens: 0, cost: 0 },
      perplexity: { calls: 0, tokens: 0, cost: 0 },
      total: { calls: 0, cost: 0 }
    };
    this.logger.info('CreditsTracker: In-memory statistics reset');
  }

  /**
   * Получить историю вызовов из БД
   */
  async getCallHistory(options = {}) {
    const { 
      limit = 1000, 
      offset = 0, 
      stage, 
      model, 
      service,
      dateFrom,
      dateTo 
    } = options;
    
    if (!this.db) {
      return { logs: [], total: 0, offset, limit };
    }

    try {
      let query = this.db.supabase
        .from('api_credits_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });
      
      // Фильтры
      if (stage) {
        query = query.ilike('stage', `%${stage}%`);
      }
      if (model) {
        query = query.ilike('model_name', `%${model}%`);
      }
      if (service) {
        query = query.eq('service', service);
      }
      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo + 'T23:59:59.999Z');
      }
      
      // Пагинация
      query = query.range(offset, offset + limit - 1);
      
      const { data, error, count } = await query;
      
      if (error) {
        this.logger.warn('CreditsTracker: Failed to get history from DB', { error: error.message });
        return { logs: [], total: 0, offset, limit };
      }
      
      // Преобразуем данные для совместимости с UI
      const logs = (data || []).map(row => ({
        timestamp: row.created_at,
        service: row.service,
        model_name: row.model_name,
        stage: row.stage,
        session_id: row.session_id,
        request_tokens: row.request_tokens,
        response_tokens: row.response_tokens,
        total_tokens: row.total_tokens,
        cost_usd: parseFloat(row.cost_usd) || 0
      }));
      
      return {
        logs,
        total: count || logs.length,
        offset,
        limit
      };
    } catch (error) {
      this.logger.warn('CreditsTracker: Error getting history', { error: error.message });
      return { logs: [], total: 0, offset, limit };
    }
  }

  /**
   * Получить статистику из БД за период
   */
  async getStatsFromDb(options = {}) {
    const { dateFrom, dateTo } = options;
    
    if (!this.db) {
      return this.getGlobalStats();
    }

    try {
      let query = this.db.supabase
        .from('api_credits_log')
        .select('service, model_name, total_tokens, cost_usd');
      
      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo + 'T23:59:59.999Z');
      }
      
      const { data, error } = await query;
      
      if (error || !data) {
        return this.getGlobalStats();
      }
      
      // Агрегируем
      const stats = {
        deepseek: { calls: 0, tokens: 0, cost: 0 },
        perplexity: { calls: 0, tokens: 0, cost: 0 },
        total: { calls: 0, cost: 0 }
      };
      
      for (const row of data) {
        const cost = parseFloat(row.cost_usd) || 0;
        const tokens = row.total_tokens || 0;
        
        if (row.service === 'deepseek') {
          stats.deepseek.calls++;
          stats.deepseek.tokens += tokens;
          stats.deepseek.cost += cost;
        } else if (row.service === 'perplexity') {
          stats.perplexity.calls++;
          stats.perplexity.tokens += tokens;
          stats.perplexity.cost += cost;
        }
        
        stats.total.calls++;
        stats.total.cost += cost;
      }
      
      return {
        deepseek: { ...stats.deepseek, formatted: `$${stats.deepseek.cost.toFixed(4)}` },
        perplexity: { ...stats.perplexity, formatted: `$${stats.perplexity.cost.toFixed(4)}` },
        total: { ...stats.total, formatted: `$${stats.total.cost.toFixed(2)}` }
      };
    } catch (error) {
      this.logger.warn('CreditsTracker: Error getting stats from DB', { error: error.message });
      return this.getGlobalStats();
    }
  }

  /**
   * Оценить стоимость запроса (для планирования)
   */
  estimateCost(service, model, estimatedTokens = 1000) {
    const pricing = this.pricing[model];
    if (!pricing) {
      return { service, model, cost: 0, formatted: '$0.000000', error: 'Unknown model' };
    }

    // Предполагаем 70/30 распределение input/output для LLM
    const inputTokens = Math.floor(estimatedTokens * 0.7);
    const outputTokens = estimatedTokens - inputTokens;
    const cost = (inputTokens * pricing.input) + (outputTokens * pricing.output);

    return {
      service,
      model,
      estimatedTokens,
      cost,
      formatted: `$${cost.toFixed(6)}`
    };
  }

  // ============ LEGACY METHODS (для совместимости) ============

  async getSessionCosts(sessionId) {
    return this.getSessionStats(sessionId);
  }

  async getTotalStats() {
    return this.getGlobalStats();
  }

  async getCostsHistory(startDate, endDate, groupBy = 'day') {
    return this.getCallHistory({ dateFrom: startDate, dateTo: endDate });
  }
}

module.exports = CreditsTracker;
