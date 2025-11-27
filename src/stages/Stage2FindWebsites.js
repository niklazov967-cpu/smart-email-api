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
    // Получить только компании БЕЗ сайта
    // (Stage 1 уже мог найти сайты для некоторых)
    const result = await this.db.query(
      `SELECT pending_id, company_name 
       FROM pending_companies 
       WHERE session_id = $1 
         AND stage = 'names_found'
         AND (website IS NULL OR website = '')`,
      [sessionId]
    );
    
    this.logger.info('Stage 2: Companies without website', {
      count: result.rows.length,
      sessionId
    });
    
    return result.rows;
  }

  async _findWebsite(company, sessionId) {
    try {
      const prompt = `Найди официальный веб-сайт и email компании из Китая через поиск в интернете.

КОМПАНИЯ: ${company.company_name}

ЧТО ИСКАТЬ:
1. **Официальный веб-сайт**:
   - Только корпоративные сайты (.cn, .com.cn, .net.cn, .com)
   - НЕ маркетплейсы (Alibaba, 1688, Made-in-China)
   - Основной домен компании, не подразделений

2. **Email для связи**:
   - Поищи email в профилях на B2B площадках (Alibaba, Made-in-China, 1688)
   - Проверь каталоги и справочники компаний
   - Любые упоминания компании с контактами в интернете

РЕЗУЛЬТАТ: JSON формат:
{
  "website": "https://www.example.cn",
  "email": "info@example.com",
  "source": "откуда взят email (Alibaba/каталог/сайт)"
}

Если сайт не найден: {"website": null, "email": "...если найден", "source": "..."}
Если ничего не найдено: {"website": null, "email": null, "source": null}

ВАЖНО: Email можно взять с Alibaba/Made-in-China даже если сайт не найден!

ВЕРНИ ТОЛЬКО JSON, без дополнительного текста.`;

      const response = await this.sonar.query(prompt, {
        stage: 'stage2_find_websites',
        sessionId,
        useCache: true
      });

      const result = this._parseResponse(response);

      if (result.website || result.email) {
        // Определяем новый stage
        let newStage = 'names_found';
        if (result.website && result.email) {
          newStage = 'contacts_found';
        } else if (result.website) {
          newStage = 'website_found';
        } else if (result.email) {
          newStage = 'email_found'; // новый stage для случая когда есть email но нет сайта
        }

        // Сохранить найденные данные
        await this.db.query(
          `UPDATE pending_companies 
           SET website = $1, email = $2, stage = $3, updated_at = NOW()
           WHERE pending_id = $4`,
          [result.website, result.email, newStage, company.pending_id]
        );

        this.logger.info('Stage 2: Data found', {
          company: company.company_name,
          website: result.website || 'not found',
          email: result.email || 'not found',
          source: result.source
        });

        return { success: true, website: result.website, email: result.email };
      } else {
        // Отметить как не найдено
        await this.db.query(
          `UPDATE pending_companies 
           SET website_status = 'not_found', updated_at = NOW()
           WHERE pending_id = $1`,
          [company.pending_id]
        );

        this.logger.warn('Stage 2: Nothing found', {
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

  _parseResponse(response) {
    try {
      // Попытка распарсить JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // Fallback: попытка найти URL напрямую в тексте
        const urlMatch = response.match(/(https?:\/\/[^\s]+)/);
        return {
          website: urlMatch ? urlMatch[1] : null,
          email: null,
          source: null
        };
      }

      const data = JSON.parse(jsonMatch[0]);
      
      return {
        website: data.website || null,
        email: data.email || null,
        source: data.source || null
      };

    } catch (error) {
      this.logger.error('Failed to parse Stage 2 response', {
        error: error.message,
        response: response.substring(0, 200)
      });
      return { website: null, email: null, source: null };
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

