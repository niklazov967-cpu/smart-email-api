/**
 * Stage 6: Финализация и перенос в company_records
 * Переносит обработанные компании из pending_companies в company_records
 */
class Stage6Finalize {
  constructor(sonarClient, settingsManager, database, logger) {
    this.sonar = sonarClient;
    this.settings = settingsManager;
    this.db = database;
    this.logger = logger;
  }

  async execute(sessionId) {
    this.logger.info('Stage 6: Starting finalization', { sessionId });

    try {
      // Получить компании с тегами
      const companies = await this._getCompanies(sessionId);
      
      if (companies.length === 0) {
        this.logger.warn('Stage 6: No companies to finalize');
        return { success: true, finalized: 0, skipped: 0 };
      }

      this.logger.info('Stage 6: Finalizing companies', {
        count: companies.length
      });

      let finalized = 0;
      let skipped = 0;

      for (const company of companies) {
        const result = await this._finalizeCompany(company, sessionId);
        if (result.success) {
          finalized++;
        } else {
          skipped++;
        }
      }

      // Обновить счетчик добавленных компаний в сессии
      await this.db.query(
        `UPDATE search_sessions 
         SET companies_added = $1, updated_at = NOW()
         WHERE session_id = $2`,
        [finalized, sessionId]
      );

      this.logger.info('Stage 6: Completed', {
        finalized,
        skipped,
        sessionId
      });

      return {
        success: true,
        finalized,
        skipped
      };

    } catch (error) {
      this.logger.error('Stage 6: Failed', {
        error: error.message,
        sessionId
      });
      throw error;
    }
  }

  async _getCompanies(sessionId) {
    const result = await this.db.query(
      `SELECT * FROM pending_companies 
       WHERE session_id = $1 
       AND stage = 'tags_extracted'
       AND tags IS NOT NULL`,
      [sessionId]
    );
    return result.rows;
  }

  async _finalizeCompany(company, sessionId) {
    try {
      // Проверить обязательные поля
      if (!company.company_name || !company.website) {
        this.logger.warn('Stage 6: Missing required fields', {
          company: company.company_name || 'unknown'
        });
        
        await this._markAsFailed(company.pending_id, 'missing_required_fields');
        return { success: false };
      }

      // Проверить наличие email
      const contactsData = this._parseJson(company.contacts_json);
      const emails = contactsData?.emails || [];
      
      if (emails.length === 0) {
        this.logger.debug('Stage 6: No emails found, skipping', {
          company: company.company_name
        });
        
        await this._markAsFailed(company.pending_id, 'no_emails');
        return { success: false };
      }

      // Парсить данные
      const servicesData = this._parseJson(company.services_json);
      
      // Проверить дубликаты по URL
      const existingCompany = await this.db.query(
        'SELECT company_id FROM company_records WHERE website = $1',
        [company.website]
      );

      if (existingCompany.rows.length > 0) {
        this.logger.debug('Stage 6: Duplicate website, updating', {
          company: company.company_name,
          website: company.website
        });

        // Обновить существующую запись
        await this._updateExistingCompany(existingCompany.rows[0].company_id, company, emails, servicesData);
      } else {
        // Создать новую запись
        await this._createNewCompany(company, sessionId, emails, servicesData);
      }

      // Отметить как завершенное
      await this.db.query(
        `UPDATE pending_companies 
         SET stage = 'completed', updated_at = NOW()
         WHERE pending_id = $1`,
        [company.pending_id]
      );

      this.logger.debug('Stage 6: Company finalized', {
        company: company.company_name
      });

      return { success: true };

    } catch (error) {
      this.logger.error('Stage 6: Error finalizing company', {
        company: company.company_name,
        error: error.message
      });

      await this._markAsFailed(company.pending_id, error.message);
      return { success: false, error: error.message };
    }
  }

  async _createNewCompany(company, sessionId, emails, servicesData) {
    await this.db.query(
      `INSERT INTO company_records (
        session_id, company_name, website, emails, 
        description, tags, services_json, 
        created_at, updated_at, last_contact_attempt
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NULL)`,
      [
        sessionId,
        company.company_name,
        company.website,
        emails,
        servicesData?.summary || '',
        company.tags || ['untagged'],
        JSON.stringify(servicesData || {})
      ]
    );
  }

  async _updateExistingCompany(companyId, company, emails, servicesData) {
    // Объединить email адреса
    const existingEmails = await this.db.query(
      'SELECT emails FROM company_records WHERE company_id = $1',
      [companyId]
    );

    const mergedEmails = Array.from(new Set([
      ...existingEmails.rows[0].emails,
      ...emails
    ]));

    await this.db.query(
      `UPDATE company_records 
       SET emails = $1, 
           tags = $2,
           services_json = $3,
           updated_at = NOW()
       WHERE company_id = $4`,
      [
        mergedEmails,
        company.tags || ['untagged'],
        JSON.stringify(servicesData || {}),
        companyId
      ]
    );
  }

  async _markAsFailed(pendingId, reason) {
    await this.db.query(
      `UPDATE pending_companies 
       SET stage = 'failed', 
           error_message = $2,
           updated_at = NOW()
       WHERE pending_id = $1`,
      [pendingId, reason]
    );
  }

  _parseJson(jsonStr) {
    if (!jsonStr) return null;
    try {
      return typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    } catch (error) {
      this.logger.error('Failed to parse JSON', { error: error.message });
      return null;
    }
  }
}

module.exports = Stage6Finalize;

