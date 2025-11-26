/**
 * Stage 1: Поиск компаний
 * Находит 8-12 названий компаний по поисковому запросу
 */
class Stage1FindCompanies {
  constructor(sonarClient, settingsManager, database, logger) {
    this.sonar = sonarClient;
    this.settings = settingsManager;
    this.db = database;
    this.logger = logger;
  }

  async execute(searchQuery, sessionId) {
    this.logger.info('Stage 1: Starting company search', { searchQuery, sessionId });

    try {
      // Получить настройки для Stage 1
      const settings = await this.settings.getCategory('processing_stages');
      const minCompanies = settings.stage1_min_companies || 8;
      const maxCompanies = settings.stage1_max_companies || 12;

      // Создать промпт для Sonar
      const prompt = this._createPrompt(searchQuery, minCompanies, maxCompanies);

      // Выполнить запрос к Sonar API
      const response = await this.sonar.query(prompt, {
        stage: 'stage1_find_companies',
        sessionId,
        useCache: true
      });

      // Парсить результат
      const companies = this._parseResponse(response);

      // Валидация
      if (companies.length < minCompanies) {
        this.logger.warn('Stage 1: Too few companies found, retrying', {
          found: companies.length,
          required: minCompanies
        });

        // Вторая попытка с другим углом
        const retryPrompt = this._createRetryPrompt(searchQuery);
        const retryResponse = await this.sonar.query(retryPrompt, {
          stage: 'stage1_find_companies_retry',
          sessionId,
          useCache: true
        });

        const moreCompanies = this._parseResponse(retryResponse);
        companies.push(...moreCompanies);
      }

      // Удалить дубликаты
      const uniqueCompanies = this._removeDuplicates(companies);

      // Ограничить до максимума
      const finalCompanies = uniqueCompanies.slice(0, maxCompanies);

      // Сохранить в БД
      await this._saveCompanies(finalCompanies, sessionId);

      // Обновить статистику сессии
      await this.db.query(
        `UPDATE search_sessions 
         SET companies_found = $1, updated_at = NOW() 
         WHERE session_id = $2`,
        [finalCompanies.length, sessionId]
      );

      this.logger.info('Stage 1: Completed', {
        found: finalCompanies.length,
        sessionId
      });

      return {
        success: true,
        companies: finalCompanies,
        count: finalCompanies.length
      };

    } catch (error) {
      this.logger.error('Stage 1: Failed', {
        error: error.message,
        sessionId
      });
      throw error;
    }
  }

  _createPrompt(searchQuery, minCompanies, maxCompanies) {
    return `Используй поиск в интернете для поиска реальных производителей.

ЗАДАЧА: Найти лучших производителей в Китае по этому критерию:
${searchQuery}

ТРЕБОВАНИЯ:
1. Только производители (не дилеры, не торговцы)
2. Компании, которые сами производят продукцию
3. Компании с официальными веб-сайтами
4. Действующие компании (не закрытые)

РЕЗУЛЬТАТ: JSON формат, от ${minCompanies} до ${maxCompanies} компаний:
{
  "companies": [
    {
      "name": "完整的公司名",
      "likely_domain_extension": ".cn"
    }
  ],
  "total": число,
  "note": "краткие замечания откуда взяты компании"
}

ВНИМАНИЕ: Выведи ТОЛЬКО JSON, без дополнительного текста.`;
  }

  _createRetryPrompt(searchQuery) {
    return `Найди дополнительных производителей в Китае по запросу: ${searchQuery}

Поищи на маркетплейсах (Alibaba, 1688, Made-in-China) и найди компании-производители.
Верни JSON с 5-8 компаниями в том же формате.`;
  }

  _parseResponse(response) {
    try {
      // Попытка распарсить JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const data = JSON.parse(jsonMatch[0]);
      
      if (!data.companies || !Array.isArray(data.companies)) {
        throw new Error('Invalid companies array');
      }

      return data.companies.map(c => ({
        name: c.name,
        domain_extension: c.likely_domain_extension || '.cn'
      }));

    } catch (error) {
      this.logger.error('Failed to parse Stage 1 response', {
        error: error.message,
        response: response.substring(0, 200)
      });
      return [];
    }
  }

  _removeDuplicates(companies) {
    const seen = new Set();
    return companies.filter(company => {
      const key = company.name.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  async _saveCompanies(companies, sessionId) {
    for (const company of companies) {
      await this.db.query(
        `INSERT INTO pending_companies 
         (session_id, company_name, stage, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [sessionId, company.name, 'names_found']
      );
    }
  }
}

module.exports = Stage1FindCompanies;

