/**
 * CompanyValidator - Валидация компаний на соответствие теме поиска
 * Проверяет соответствие деятельности компании основной теме
 * Использует DeepSeek API для экономии кредитов (не требует доступ к интернету)
 */
class CompanyValidator {
  constructor(deepseekClient, settingsManager, database, logger) {
    this.deepseek = deepseekClient;
    this.settings = settingsManager;
    this.db = database;
    this.logger = logger;
  }

  /**
   * Валидировать компанию на соответствие теме
   * @param {string} companyName - Название компании
   * @param {string} companyWebsite - Сайт компании
   * @param {object} companyServices - Данные об услугах компании
   * @param {string} mainTopic - Основная тема поиска
   * @returns {object} Результат валидации
   */
  async validateCompany(companyName, companyWebsite, companyServices, mainTopic) {
    this.logger.info('CompanyValidator: Starting validation', {
      company: companyName,
      topic: mainTopic
    });

    try {
      // Создать промпт для валидации
      const prompt = this._createValidationPrompt(
        companyName,
        companyWebsite,
        companyServices,
        mainTopic
      );

      // Запросить анализ у DeepSeek
      const response = await this.deepseek.query(prompt, {
        stage: 'company_validation',
        maxTokens: 1500
      });

      // Парсить результат
      const validation = this._parseValidation(response);

      this.logger.info('CompanyValidator: Validation completed', {
        company: companyName,
        isRelevant: validation.is_relevant,
        score: validation.relevance_score
      });

      return validation;

    } catch (error) {
      this.logger.error('CompanyValidator: Validation failed', {
        error: error.message,
        company: companyName
      });
      
      // В случае ошибки возвращаем нейтральный результат
      return {
        is_relevant: true,
        relevance_score: 50,
        reason: 'Validation error: ' + error.message,
        recommendation: 'manual_review'
      };
    }
  }

  _createValidationPrompt(companyName, companyWebsite, companyServices, mainTopic) {
    const servicesText = this._formatServices(companyServices);

    return `Проверь соответствие компании теме поиска.

ТЕМА ПОИСКА: ${mainTopic}

КОМПАНИЯ:
Название: ${companyName}
Сайт: ${companyWebsite}
Описание деятельности:
${servicesText}

ЗАДАЧА:
Определи, насколько деятельность этой компании соответствует теме поиска.

КРИТЕРИИ:
1. Основное направление компании совпадает с темой (100%)
2. Компания предлагает смежные услуги (70-90%)
3. Компания работает в той же отрасли, но другое направление (40-60%)
4. Компания из другой отрасли (0-30%)

РЕЗУЛЬТАТ: JSON формат:
{
  "is_relevant": true/false,
  "relevance_score": 0-100,
  "matching_aspects": ["аспект 1", "аспект 2"],
  "non_matching_aspects": ["аспект 1"],
  "reason": "краткое объяснение на русском",
  "recommendation": "accept" | "review" | "reject"
}

ВАЖНО:
- is_relevant = true если relevance_score >= 60
- recommendation = "accept" если >= 80, "review" если 60-79, "reject" если < 60

Выведи ТОЛЬКО JSON, без дополнительного текста.`;
  }

  _formatServices(servicesData) {
    if (!servicesData) return 'Нет данных об услугах';

    const parts = [];
    
    if (servicesData.main_activity) {
      parts.push(`Основное направление: ${servicesData.main_activity}`);
    }
    
    if (servicesData.services && servicesData.services.length > 0) {
      parts.push(`Услуги: ${servicesData.services.join(', ')}`);
    }
    
    if (servicesData.products && servicesData.products.length > 0) {
      parts.push(`Продукты: ${servicesData.products.join(', ')}`);
    }
    
    if (servicesData.summary) {
      parts.push(`Описание: ${servicesData.summary}`);
    }

    return parts.join('\n');
  }

  _parseValidation(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const data = JSON.parse(jsonMatch[0]);
      
      return {
        is_relevant: data.is_relevant === true,
        relevance_score: parseInt(data.relevance_score) || 50,
        matching_aspects: Array.isArray(data.matching_aspects) ? data.matching_aspects : [],
        non_matching_aspects: Array.isArray(data.non_matching_aspects) ? data.non_matching_aspects : [],
        reason: data.reason || '',
        recommendation: data.recommendation || 'review'
      };

    } catch (error) {
      this.logger.error('Failed to parse validation response', {
        error: error.message,
        response: response.substring(0, 200)
      });
      
      return {
        is_relevant: true,
        relevance_score: 50,
        matching_aspects: [],
        non_matching_aspects: [],
        reason: 'Parse error',
        recommendation: 'review'
      };
    }
  }

  /**
   * Валидировать несколько компаний батчем
   */
  async validateBatch(companies, mainTopic, sessionId) {
    this.logger.info('CompanyValidator: Starting batch validation', {
      count: companies.length,
      sessionId
    });

    const results = [];
    
    for (const company of companies) {
      const servicesData = this._parseJson(company.services_json);
      
      const validation = await this.validateCompany(
        company.company_name,
        company.website,
        servicesData,
        mainTopic
      );

      // Сохранить результат валидации
      await this._saveValidation(company.pending_id, validation, sessionId);

      results.push({
        company_id: company.pending_id,
        company_name: company.company_name,
        validation
      });

      // Небольшая пауза между запросами
      await this._sleep(1000);
    }

    this.logger.info('CompanyValidator: Batch validation completed', {
      total: companies.length,
      accepted: results.filter(r => r.validation.recommendation === 'accept').length,
      review: results.filter(r => r.validation.recommendation === 'review').length,
      rejected: results.filter(r => r.validation.recommendation === 'reject').length
    });

    return results;
  }

  async _saveValidation(pendingId, validation, sessionId) {
    try {
      await this.db.query(
        `UPDATE pending_companies 
         SET validation_result = $1,
             relevance_score = $2,
             validation_status = $3,
             updated_at = NOW()
         WHERE pending_id = $4`,
        [
          JSON.stringify(validation),
          validation.relevance_score,
          validation.recommendation,
          pendingId
        ]
      );

      // Логировать в отдельную таблицу
      await this.db.query(
        `INSERT INTO validation_log 
         (pending_id, session_id, relevance_score, is_relevant, recommendation, reason, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          pendingId,
          sessionId,
          validation.relevance_score,
          validation.is_relevant,
          validation.recommendation,
          validation.reason
        ]
      );

    } catch (error) {
      this.logger.error('Failed to save validation', {
        error: error.message,
        pendingId
      });
    }
  }

  _parseJson(jsonStr) {
    if (!jsonStr) return null;
    try {
      return typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    } catch (error) {
      return null;
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Получить статистику валидации для сессии
   */
  async getValidationStats(sessionId) {
    try {
      const result = await this.db.query(
        `SELECT 
           validation_status,
           COUNT(*) as count,
           AVG(relevance_score) as avg_score
         FROM pending_companies
         WHERE session_id = $1 
         AND validation_result IS NOT NULL
         GROUP BY validation_status`,
        [sessionId]
      );

      const stats = {
        total: 0,
        accepted: 0,
        review: 0,
        rejected: 0,
        avg_score: 0
      };

      result.rows.forEach(row => {
        const count = parseInt(row.count);
        stats.total += count;
        
        if (row.validation_status === 'accept') stats.accepted = count;
        if (row.validation_status === 'review') stats.review = count;
        if (row.validation_status === 'reject') stats.rejected = count;
      });

      // Рассчитать средний score
      const avgResult = await this.db.query(
        `SELECT AVG(relevance_score) as avg_score
         FROM pending_companies
         WHERE session_id = $1 AND validation_result IS NOT NULL`,
        [sessionId]
      );

      if (avgResult.rows.length > 0) {
        stats.avg_score = parseFloat(avgResult.rows[0].avg_score || 0).toFixed(1);
      }

      return stats;

    } catch (error) {
      this.logger.error('Failed to get validation stats', {
        error: error.message,
        sessionId
      });
      return {
        total: 0,
        accepted: 0,
        review: 0,
        rejected: 0,
        avg_score: 0
      };
    }
  }
}

module.exports = CompanyValidator;

