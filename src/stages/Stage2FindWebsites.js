/**
 * Stage 2: Поиск официальных сайтов
 * Находит URL для каждой компании (параллельно с ограничениями)
 */
class Stage2FindWebsites {
  constructor(sonarClient, settingsManager, database, logger) {
    this.sonar = sonarClient;
    this.settings = settingsManager;
    this.db = database;
    this.logger = logger;
  }

  async execute(sessionId) {
    this.logger.info('Stage 2: Starting website search', { sessionId });

    try {
      // Получить компании для обработки
      const companies = await this._getCompanies(sessionId);
      
      if (companies.length === 0) {
        throw new Error('No companies found for Stage 2');
      }

      // Получить настройки
      const settings = await this.settings.getCategory('processing_stages');
      const concurrentRequests = settings.stage2_concurrent_requests || 3;
      const batchDelay = settings.stage2_batch_delay_ms || 2000;

      this.logger.info('Stage 2: Processing companies', {
        count: companies.length,
        concurrent: concurrentRequests,
        delay: batchDelay
      });

      // Обработать батчами
      const results = [];
      for (let i = 0; i < companies.length; i += concurrentRequests) {
        const batch = companies.slice(i, i + concurrentRequests);
        
        this.logger.debug(`Stage 2: Processing batch ${Math.floor(i / concurrentRequests) + 1}`, {
          batchSize: batch.length
        });

        // Параллельная обработка батча
        const batchResults = await Promise.all(
          batch.map(company => this._findWebsite(company, sessionId))
        );

        results.push(...batchResults);

        // Пауза между батчами
        if (i + concurrentRequests < companies.length) {
          await this._sleep(batchDelay);
        }
      }

      // Подсчет успешных
      const successful = results.filter(r => r.success).length;

      this.logger.info('Stage 2: Completed', {
        total: companies.length,
        successful,
        failed: companies.length - successful,
        sessionId
      });

      return {
        success: true,
        total: companies.length,
        found: successful,
        notFound: companies.length - successful
      };

    } catch (error) {
      this.logger.error('Stage 2: Failed', {
        error: error.message,
        sessionId
      });
      throw error;
    }
  }

  async _getCompanies(sessionId) {
    const result = await this.db.query(
      `SELECT pending_id, company_name 
       FROM pending_companies 
       WHERE session_id = $1 AND stage = 'names_found'`,
      [sessionId]
    );
    return result.rows;
  }

  async _findWebsite(company, sessionId) {
    try {
      const prompt = `Найди официальный веб-сайт компании из Китая.

КОМПАНИЯ: ${company.company_name}

ТРЕБОВАНИЯ:
1. Только официальные сайты (заканчиваются на .cn, .com.cn, .net.cn или .com)
2. НЕ маркетплейсы (Alibaba, 1688, Made-in-China)
3. Основной домен компании, не подразделений

РЕЗУЛЬТАТ: Только URL в формате https://www.example.cn

Если не найдено: выведи "NOT_FOUND"`;

      const response = await this.sonar.query(prompt, {
        stage: 'stage2_find_websites',
        sessionId,
        useCache: true
      });

      const website = this._parseWebsite(response);

      if (website) {
        // Сохранить URL
        await this.db.query(
          `UPDATE pending_companies 
           SET website = $1, stage = 'website_found', updated_at = NOW()
           WHERE pending_id = $2`,
          [website, company.pending_id]
        );

        this.logger.debug('Stage 2: Website found', {
          company: company.company_name,
          website
        });

        return { success: true, website };
      } else {
        // Отметить как не найдено
        await this.db.query(
          `UPDATE pending_companies 
           SET website_status = 'not_found', updated_at = NOW()
           WHERE pending_id = $1`,
          [company.pending_id]
        );

        this.logger.debug('Stage 2: Website not found', {
          company: company.company_name
        });

        return { success: false };
      }

    } catch (error) {
      this.logger.error('Stage 2: Error finding website', {
        company: company.company_name,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  _parseWebsite(response) {
    // Удалить пробелы
    const cleaned = response.trim();

    // Проверить на NOT_FOUND
    if (cleaned.includes('NOT_FOUND') || cleaned.includes('не найдено')) {
      return null;
    }

    // Найти URL
    const urlMatch = cleaned.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch) {
      let url = urlMatch[1];
      // Очистить от лишних символов
      url = url.replace(/[.,;)]+$/, '');
      return url;
    }

    // Попытка найти домен без протокола
    const domainMatch = cleaned.match(/([a-z0-9-]+\.(cn|com|net|com\.cn))/i);
    if (domainMatch) {
      return 'https://' + domainMatch[0];
    }

    return null;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Stage2FindWebsites;

