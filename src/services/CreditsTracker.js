/**
 * CreditsTracker - Отслеживание использования кредитов Perplexity в реальном времени
 */
class CreditsTracker {
  constructor(database, logger) {
    this.db = database;
    this.logger = logger;
    
    // Цены Perplexity API (на 2025 год)
    // https://docs.perplexity.ai/docs/pricing
    this.pricing = {
      'llama-3.1-sonar-small-128k-online': {
        request: 0.2 / 1000000,   // $0.20 за 1M токенов
        response: 0.2 / 1000000
      },
      'llama-3.1-sonar-large-128k-online': {
        request: 1.0 / 1000000,   // $1.00 за 1M токенов
        response: 1.0 / 1000000
      },
      'llama-3.1-sonar-huge-128k-online': {
        request: 5.0 / 1000000,   // $5.00 за 1M токенов
        response: 5.0 / 1000000
      }
    };
  }

  /**
   * Логировать использование API и рассчитать стоимость
   */
  async logApiCall(sessionId, stage, requestTokens, responseTokens, modelName) {
    try {
      const totalTokens = requestTokens + responseTokens;
      const cost = this._calculateCost(modelName, requestTokens, responseTokens);

      // Сохранить в БД
      await this.db.query(
        `INSERT INTO api_credits_log 
         (session_id, stage, request_tokens, response_tokens, total_tokens, cost_usd, model_name, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [sessionId, stage, requestTokens, responseTokens, totalTokens, cost, modelName]
      );

      // Обновить суммарную стоимость в сессии
      await this.db.query(
        `UPDATE search_sessions 
         SET total_cost_usd = total_cost_usd + $1,
             total_requests = total_requests + 1,
             perplexity_api_calls = perplexity_api_calls + 1,
             perplexity_tokens_used = perplexity_tokens_used + $2
         WHERE session_id = $3`,
        [cost, totalTokens, sessionId]
      );

      this.logger.info('CreditsTracker: API call logged', {
        sessionId,
        stage,
        tokens: totalTokens,
        cost: `$${cost.toFixed(6)}`
      });

      return {
        success: true,
        tokens: totalTokens,
        cost: cost,
        formatted_cost: `$${cost.toFixed(6)}`
      };

    } catch (error) {
      this.logger.error('CreditsTracker: Failed to log API call', {
        error: error.message,
        sessionId
      });
      throw error;
    }
  }

  /**
   * Рассчитать стоимость на основе токенов и модели
   */
  _calculateCost(modelName, requestTokens, responseTokens) {
    const pricing = this.pricing[modelName] || this.pricing['llama-3.1-sonar-large-128k-online'];
    
    const requestCost = requestTokens * pricing.request;
    const responseCost = responseTokens * pricing.response;
    
    return requestCost + responseCost;
  }

  /**
   * Получить текущие расходы для сессии
   */
  async getSessionCosts(sessionId) {
    try {
      // Получить общую статистику
      const sessionResult = await this.db.query(
        `SELECT total_cost_usd, total_requests, perplexity_tokens_used 
         FROM search_sessions 
         WHERE session_id = $1`,
        [sessionId]
      );

      if (sessionResult.rows.length === 0) {
        return {
          total_cost: 0,
          total_requests: 0,
          total_tokens: 0,
          breakdown: []
        };
      }

      const session = sessionResult.rows[0];

      // Получить разбивку по этапам
      const breakdownResult = await this.db.query(
        `SELECT 
           stage,
           COUNT(*) as calls,
           SUM(total_tokens) as tokens,
           SUM(cost_usd) as cost
         FROM api_credits_log
         WHERE session_id = $1
         GROUP BY stage
         ORDER BY cost DESC`,
        [sessionId]
      );

      return {
        total_cost: parseFloat(session.total_cost_usd || 0),
        total_requests: parseInt(session.total_requests || 0),
        total_tokens: parseInt(session.perplexity_tokens_used || 0),
        formatted_cost: `$${parseFloat(session.total_cost_usd || 0).toFixed(4)}`,
        breakdown: breakdownResult.rows.map(row => ({
          stage: row.stage,
          calls: parseInt(row.calls),
          tokens: parseInt(row.tokens),
          cost: parseFloat(row.cost),
          formatted_cost: `$${parseFloat(row.cost).toFixed(6)}`
        }))
      };

    } catch (error) {
      this.logger.error('CreditsTracker: Failed to get session costs', {
        error: error.message,
        sessionId
      });
      throw error;
    }
  }

  /**
   * Получить общую статистику по всем сессиям
   */
  async getTotalStats() {
    try {
      const result = await this.db.query(
        `SELECT 
           COUNT(DISTINCT session_id) as total_sessions,
           SUM(total_cost_usd) as total_cost,
           SUM(total_requests) as total_requests,
           SUM(perplexity_tokens_used) as total_tokens
         FROM search_sessions`
      );

      const row = result.rows[0];

      return {
        total_sessions: parseInt(row.total_sessions || 0),
        total_cost: parseFloat(row.total_cost || 0),
        total_requests: parseInt(row.total_requests || 0),
        total_tokens: parseInt(row.total_tokens || 0),
        formatted_cost: `$${parseFloat(row.total_cost || 0).toFixed(2)}`
      };

    } catch (error) {
      this.logger.error('CreditsTracker: Failed to get total stats', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Получить историю расходов за период
   */
  async getCostsHistory(startDate, endDate, groupBy = 'day') {
    try {
      let dateFormat;
      switch (groupBy) {
        case 'hour':
          dateFormat = 'YYYY-MM-DD HH24:00:00';
          break;
        case 'day':
          dateFormat = 'YYYY-MM-DD';
          break;
        case 'month':
          dateFormat = 'YYYY-MM';
          break;
        default:
          dateFormat = 'YYYY-MM-DD';
      }

      const result = await this.db.query(
        `SELECT 
           TO_CHAR(timestamp, $1) as period,
           COUNT(*) as calls,
           SUM(total_tokens) as tokens,
           SUM(cost_usd) as cost
         FROM api_credits_log
         WHERE timestamp >= $2 AND timestamp <= $3
         GROUP BY period
         ORDER BY period ASC`,
        [dateFormat, startDate, endDate]
      );

      return result.rows.map(row => ({
        period: row.period,
        calls: parseInt(row.calls),
        tokens: parseInt(row.tokens),
        cost: parseFloat(row.cost),
        formatted_cost: `$${parseFloat(row.cost).toFixed(4)}`
      }));

    } catch (error) {
      this.logger.error('CreditsTracker: Failed to get costs history', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Оценить стоимость запланированного запроса
   */
  estimateCost(modelName, estimatedTokens) {
    const pricing = this.pricing[modelName] || this.pricing['llama-3.1-sonar-large-128k-online'];
    
    // Предполагаем 50/50 распределение request/response
    const requestTokens = Math.floor(estimatedTokens / 2);
    const responseTokens = estimatedTokens - requestTokens;
    
    const cost = this._calculateCost(modelName, requestTokens, responseTokens);
    
    return {
      estimated_tokens: estimatedTokens,
      estimated_cost: cost,
      formatted_cost: `$${cost.toFixed(6)}`,
      model: modelName
    };
  }
}

module.exports = CreditsTracker;

