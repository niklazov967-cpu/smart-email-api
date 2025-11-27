/**
 * Stage 3: Анализ контактов на сайте
 * Извлекает email адреса со страниц контактов
 */
class Stage3AnalyzeContacts {
  constructor(sonarClient, settingsManager, database, logger) {
    this.sonar = sonarClient;
    this.settings = settingsManager;
    this.db = database;
    this.logger = logger;
  }

  async execute(sessionId) {
    this.logger.info('Stage 3: Starting contact analysis', { sessionId });

    try {
      // Получить компании с найденными сайтами
      const companies = await this._getCompanies(sessionId);
      
      if (companies.length === 0) {
        this.logger.warn('Stage 3: No companies with websites found');
        return { success: true, processed: 0, found: 0 };
      }

      // Получить настройки
      const settings = await this.settings.getCategory('processing_stages');
      const concurrentRequests = settings.stage3_concurrent_requests || 2;
      const batchDelay = settings.stage3_batch_delay_ms || 3000;

      this.logger.info('Stage 3: Processing companies', {
        count: companies.length,
        concurrent: concurrentRequests
      });

      // Обработать батчами
      const results = [];
      for (let i = 0; i < companies.length; i += concurrentRequests) {
        const batch = companies.slice(i, i + concurrentRequests);
        
        this.logger.debug(`Stage 3: Processing batch ${Math.floor(i / concurrentRequests) + 1}`);

        const batchResults = await Promise.all(
          batch.map(company => this._analyzeContacts(company, sessionId))
        );

        results.push(...batchResults);

        if (i + concurrentRequests < companies.length) {
          await this._sleep(batchDelay);
        }
      }

      const successful = results.filter(r => r.success && r.emails.length > 0).length;

      this.logger.info('Stage 3: Completed', {
        total: companies.length,
        foundContacts: successful,
        sessionId
      });

      return {
        success: true,
        processed: companies.length,
        found: successful
      };

    } catch (error) {
      this.logger.error('Stage 3: Failed', {
        error: error.message,
        sessionId
      });
      throw error;
    }
  }

  async _getCompanies(sessionId) {
    const result = await this.db.query(
      `SELECT pending_id, company_name, website 
       FROM pending_companies 
       WHERE session_id = $1 
       AND stage = 'website_found'
       AND website IS NOT NULL
       AND (email IS NULL OR email = '')`,
      [sessionId]
    );
    return result.rows;
  }

  async _analyzeContacts(company, sessionId) {
    try {
      const prompt = `Найди email-адрес для этой компании через поиск в интернете:

КОМПАНИЯ: ${company.company_name}
САЙТ: ${company.website}

ЗАДАЧА:
Используй поиск в интернете (НЕ пытайся открыть сайт напрямую):
1. Поищи упоминания компании "${company.company_name}" в интернете
2. Поищи информацию по домену "${company.website}"
3. Проверь каталоги, справочники, B2B площадки (Alibaba, Made-in-China, 1688)
4. Найди ЛЮБЫЕ email-адреса связанные с этой компанией

ВАЖНО:
- Email может быть на Alibaba, 1688, Made-in-China, других B2B площадках
- Email может быть в отзывах, новостях, справочниках компаний
- Ищи любые упоминания контактов этой компании
- **НЕ пытайся открыть сайт напрямую** - используй ПОИСК В ИНТЕРНЕТЕ
- Даже если сайт недоступен - email можно найти в других источниках!

РЕЗУЛЬТАТ: JSON формат:
{
  "emails": ["email@example.com"],
  "source": "где нашел (Alibaba/Made-in-China/каталог/новости/сайт)",
  "found_in": "internet search",
  "note": "источник информации"
}

Если не найдено: {"emails": [], "note": "детальное объяснение где искал и что нашел"}

ВЕРНИ ТОЛЬКО JSON, без дополнительного текста.`;

      const response = await this.sonar.query(prompt, {
        stage: 'stage3_analyze_contacts',
        sessionId,
        useCache: true
      });

      const result = this._parseResponse(response);

      if (result.emails.length > 0) {
        // Сохранить первый найденный email в колонку email
        const primaryEmail = result.emails[0];
        
        await this.db.query(
          `UPDATE pending_companies 
           SET email = $1, contacts_json = $2, stage = 'contacts_found', updated_at = NOW()
           WHERE pending_id = $3`,
          [primaryEmail, JSON.stringify(result), company.pending_id]
        );

        this.logger.info('Stage 3: Email found', {
          company: company.company_name,
          email: primaryEmail,
          emailCount: result.emails.length,
          source: result.source
        });

        return { success: true, emails: result.emails };
      } else {
        // Отметить как обработано без контактов
        await this.db.query(
          `UPDATE pending_companies 
           SET contacts_json = $1, stage = 'site_analyzed', updated_at = NOW()
           WHERE pending_id = $2`,
          [JSON.stringify({ emails: [], note: result.note || 'No contacts found' }), company.pending_id]
        );

        this.logger.warn('Stage 3: No email found', {
          company: company.company_name,
          website: company.website,
          reason: result.note
        });

        return { success: true, emails: [] };
      }

    } catch (error) {
      this.logger.error('Stage 3: Error analyzing contacts', {
        company: company.company_name,
        error: error.message
      });
      return { success: false, emails: [], error: error.message };
    }
  }

  async _fallbackEmailSearch(company, sessionId) {
    try {
      const prompt = `Найди email-адрес для этой компании через поиск в интернете:

КОМПАНИЯ: ${company.company_name}
САЙТ: ${company.website}

ЗАДАЧА:
Поскольку сайт недоступен напрямую, используй поиск в интернете:
1. Поищи упоминания компании "${company.company_name}" в интернете
2. Поищи по домену "${company.website}"
3. Проверь каталоги, справочники, B2B площадки (Alibaba, Made-in-China, и др.)
4. Найди ЛЮБЫЕ email-адреса связанные с этой компанией

ВАЖНО:
- Email может быть на Alibaba, 1688, Made-in-China, других B2B площадках
- Email может быть в отзывах, новостях, справочниках компаний
- Ищи любые упоминания контактов этой компании

РЕЗУЛЬТАТ: JSON формат:
{
  "emails": ["email@example.com"],
  "source": "где нашел (Alibaba/Made-in-China/каталог/новости)",
  "found_in": "fallback search",
  "note": "источник информации"
}

Если не найдено: {"emails": [], "note": "причина"}

ВЕРНИ ТОЛЬКО JSON, без дополнительного текста.`;

      const response = await this.sonar.query(prompt, {
        stage: 'stage3_fallback_search',
        sessionId,
        useCache: true
      });

      const result = this._parseResponse(response);

      if (result.emails.length > 0) {
        const primaryEmail = result.emails[0];
        
        await this.db.query(
          `UPDATE pending_companies 
           SET email = $1, contacts_json = $2, stage = 'contacts_found', updated_at = NOW()
           WHERE pending_id = $3`,
          [primaryEmail, JSON.stringify({ ...result, fallback: true }), company.pending_id]
        );

        this.logger.info('Stage 3: Email found via fallback search', {
          company: company.company_name,
          email: primaryEmail,
          source: result.source || 'internet search'
        });

        return { success: true, emails: result.emails };
      } else {
        this.logger.warn('Stage 3: Fallback search also failed', {
          company: company.company_name
        });
        return { success: true, emails: [] };
      }

    } catch (error) {
      this.logger.error('Stage 3: Fallback search error', {
        company: company.company_name,
        error: error.message
      });
      return { success: true, emails: [] };
    }
  }

  _parseResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { emails: [], note: 'Invalid response format' };
      }

      const data = JSON.parse(jsonMatch[0]);
      
      return {
        emails: Array.isArray(data.emails) ? data.emails : [],
        contact_page: data.contact_page || null,
        found_in: data.found_in || null,
        source: data.source || null,
        note: data.note || ''
      };

    } catch (error) {
      this.logger.error('Failed to parse Stage 3 response', {
        error: error.message,
        response: response.substring(0, 200)
      });
      return { emails: [], note: 'Parse error' };
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Stage3AnalyzeContacts;

