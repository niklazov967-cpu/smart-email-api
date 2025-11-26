/**
 * Stage 4: Описание услуг компании
 * Анализирует услуги и продукцию компании
 */
class Stage4AnalyzeServices {
  constructor(sonarClient, settingsManager, database, logger) {
    this.sonar = sonarClient;
    this.settings = settingsManager;
    this.db = database;
    this.logger = logger;
  }

  async execute(sessionId) {
    this.logger.info('Stage 4: Starting services analysis', { sessionId });

    try {
      // Получить компании после Stage 3
      const companies = await this._getCompanies(sessionId);
      
      if (companies.length === 0) {
        this.logger.warn('Stage 4: No companies to process');
        return { success: true, processed: 0 };
      }

      // Получить настройки
      const settings = await this.settings.getCategory('processing_stages');
      const concurrentRequests = settings.stage4_concurrent_requests || 2;
      const batchDelay = settings.stage4_batch_delay_ms || 3000;

      this.logger.info('Stage 4: Processing companies', {
        count: companies.length,
        concurrent: concurrentRequests
      });

      // Обработать батчами
      let processed = 0;
      for (let i = 0; i < companies.length; i += concurrentRequests) {
        const batch = companies.slice(i, i + concurrentRequests);
        
        this.logger.debug(`Stage 4: Processing batch ${Math.floor(i / concurrentRequests) + 1}`);

        await Promise.all(
          batch.map(company => this._analyzeServices(company, sessionId))
        );

        processed += batch.length;

        if (i + concurrentRequests < companies.length) {
          await this._sleep(batchDelay);
        }
      }

      this.logger.info('Stage 4: Completed', {
        processed,
        sessionId
      });

      return {
        success: true,
        processed
      };

    } catch (error) {
      this.logger.error('Stage 4: Failed', {
        error: error.message,
        sessionId
      });
      throw error;
    }
  }

  async _getCompanies(sessionId) {
    const result = await this.db.query(
      `SELECT pending_id, company_name, website, contacts_json 
       FROM pending_companies 
       WHERE session_id = $1 AND stage = 'site_analyzed'`,
      [sessionId]
    );
    return result.rows;
  }

  async _analyzeServices(company, sessionId) {
    try {
      const prompt = `Проанализируй сайт компании и опиши её услуги и продукцию.

КОМПАНИЯ: ${company.company_name}
САЙТ: ${company.website}

ЗАДАЧА:
1. Определи основное направление деятельности
2. Перечисли ключевые услуги и продукты
3. Укажи производственные возможности
4. Выдели конкурентные преимущества

РЕЗУЛЬТАТ: JSON с описанием (на русском языке):
{
  "main_activity": "основное направление",
  "services": ["услуга 1", "услуга 2", "услуга 3"],
  "products": ["продукт 1", "продукт 2"],
  "capabilities": ["возможность 1", "возможность 2"],
  "advantages": ["преимущество 1", "преимущество 2"],
  "summary": "краткое описание в 1-2 предложениях"
}`;

      const response = await this.sonar.query(prompt, {
        stage: 'stage4_analyze_services',
        sessionId,
        useCache: true
      });

      const result = this._parseResponse(response);

      // Сохранить описание услуг
      await this.db.query(
        `UPDATE pending_companies 
         SET services_json = $1, updated_at = NOW()
         WHERE pending_id = $2`,
        [JSON.stringify(result), company.pending_id]
      );

      this.logger.debug('Stage 4: Services analyzed', {
        company: company.company_name,
        serviceCount: result.services?.length || 0
      });

      return { success: true };

    } catch (error) {
      this.logger.error('Stage 4: Error analyzing services', {
        company: company.company_name,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  _parseResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this._getDefaultResult();
      }

      const data = JSON.parse(jsonMatch[0]);
      
      return {
        main_activity: data.main_activity || 'Не определено',
        services: Array.isArray(data.services) ? data.services : [],
        products: Array.isArray(data.products) ? data.products : [],
        capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
        advantages: Array.isArray(data.advantages) ? data.advantages : [],
        summary: data.summary || ''
      };

    } catch (error) {
      this.logger.error('Failed to parse Stage 4 response', {
        error: error.message,
        response: response.substring(0, 200)
      });
      return this._getDefaultResult();
    }
  }

  _getDefaultResult() {
    return {
      main_activity: 'Анализ не выполнен',
      services: [],
      products: [],
      capabilities: [],
      advantages: [],
      summary: ''
    };
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Stage4AnalyzeServices;

