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
       WHERE session_id = $1 AND stage = 'website_found'
       AND website IS NOT NULL`,
      [sessionId]
    );
    return result.rows;
  }

  async _analyzeContacts(company, sessionId) {
    try {
      const prompt = `Проанализируй сайт компании и найди email-адреса для связи.

САЙТ: ${company.website}

ЗАДАЧА:
1. Найди страницу контактов (Contact, About Us, Contact Us)
2. Извлеки все email адреса
3. Исключи общие адреса (info@, admin@, webmaster@)
4. Приоритет: sales@, export@, international@

РЕЗУЛЬТАТ: JSON массив email адресов:
{
  "emails": ["email1@example.com", "email2@example.com"],
  "contact_page": "URL страницы контактов",
  "note": "примечания"
}

Если не найдено: {"emails": [], "note": "причина"}`;

      const response = await this.sonar.query(prompt, {
        stage: 'stage3_analyze_contacts',
        sessionId,
        useCache: true
      });

      const result = this._parseResponse(response);

      if (result.emails.length > 0) {
        // Сохранить email адреса
        await this.db.query(
          `UPDATE pending_companies 
           SET contacts_json = $1, stage = 'site_analyzed', updated_at = NOW()
           WHERE pending_id = $2`,
          [JSON.stringify(result), company.pending_id]
        );

        this.logger.debug('Stage 3: Contacts found', {
          company: company.company_name,
          emailCount: result.emails.length
        });

        return { success: true, emails: result.emails };
      } else {
        // Отметить как обработано без контактов
        await this.db.query(
          `UPDATE pending_companies 
           SET contacts_json = $1, stage = 'site_analyzed', updated_at = NOW()
           WHERE pending_id = $2`,
          [JSON.stringify({ emails: [], note: 'No contacts found' }), company.pending_id]
        );

        this.logger.debug('Stage 3: No contacts found', {
          company: company.company_name
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

