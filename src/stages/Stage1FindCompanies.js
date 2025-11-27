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
      const minCompanies = settings.stage1_min_companies || 10;
      const maxCompanies = settings.stage1_max_companies || 15;

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

      // Фильтровать маркетплейсы
      const filteredCompanies = this._filterMarketplaces(uniqueCompanies);

      // Ограничить до максимума
      const finalCompanies = filteredCompanies.slice(0, maxCompanies);

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

ЗАДАЧА: Найти минимум ${minCompanies} производителей в Китае по этому критерию:
${searchQuery}

ТРЕБОВАНИЯ:
1. Только производители (не дилеры, не торговцы)
2. Компании, которые сами производят продукцию
3. Компании с официальными веб-сайтами
4. Действующие компании (не закрытые)

ЧТО ИСКАТЬ ДЛЯ КАЖДОЙ КОМПАНИИ:
1. **Название компании** (полное китайское название)
2. **Официальный сайт** (корпоративный, НЕ маркетплейс)
3. **Email для связи** - ВАЖНО! Поищи email в:
   - Профилях на B2B площадках (Alibaba, Made-in-China, 1688)
   - Каталогах и справочниках компаний
   - Любых упоминаниях компании в интернете
   - Контактной информации в поисковой выдаче
4. **Краткое описание** услуг/продукции

РЕЗУЛЬТАТ: JSON формат, минимум ${minCompanies} компаний:
{
  "companies": [
    {
      "name": "完整的公司名",
      "website": "https://example.com",
      "email": "info@example.com",
      "brief_description": "краткое описание услуг компании",
      "likely_domain_extension": ".cn"
    }
  ],
  "total": число,
  "note": "краткие замечания откуда взяты компании"
}

ВАЖНО: 
- Найди МИНИМУМ ${minCompanies} компаний
- **ОБЯЗАТЕЛЬНО постарайся найти email** для каждой компании через поиск в интернете
- Если website найден - обязательно укажи полный URL
- **НЕ УКАЗЫВАЙ маркетплейсы как website** (Alibaba, 1688, Made-in-China) - **ТОЛЬКО официальные корпоративные сайты**
- Если у компании нет своего сайта - оставь website = null
- **Email можно взять с Alibaba/Made-in-China/каталогов** - это нормально!
- Если email не найден после поиска - укажи null
- brief_description - 1-2 предложения о том, что производит компания
- Выведи ТОЛЬКО JSON, без дополнительного текста

ПРИОРИТЕТ: 
1. Найти название и официальный сайт компании
2. **Найти email через поиск в интернете** (Alibaba, Made-in-China, каталоги, справочники)
3. Описание услуг`;
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
        website: c.website || null,
        email: c.email || null,
        description: c.brief_description || null,
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

  /**
   * Проверяет является ли URL маркетплейсом
   * Маркетплейсы: Alibaba, 1688, Made-in-China, Global Sources, Tmart, DHgate
   */
  _isMarketplace(url) {
    if (!url) return false;
    
    const marketplaces = [
      'alibaba.com',
      '1688.com',
      'made-in-china.com',
      'globalsources.com',
      'tmart.com',
      'dhgate.com',
      'aliexpress.com',
      'taobao.com',
      'tmall.com',
      'jd.com',
      'amazon.cn'
    ];
    
    const urlLower = url.toLowerCase();
    return marketplaces.some(marketplace => urlLower.includes(marketplace));
  }

  /**
   * Фильтрует маркетплейсы из найденных компаний
   * Если website - это маркетплейс, очищаем его и меняем stage на 'names_found'
   */
  _filterMarketplaces(companies) {
    let marketplacesFound = 0;
    
    const filtered = companies.map(company => {
      if (this._isMarketplace(company.website)) {
        marketplacesFound++;
        this.logger.debug('Stage 1: Marketplace URL filtered', {
          company: company.name,
          marketplace: company.website
        });
        
        return {
          ...company,
          website: null,  // Убираем маркетплейс URL
          // Сохраняем email/phone если есть
        };
      }
      return company;
    });
    
    if (marketplacesFound > 0) {
      this.logger.info('Stage 1: Marketplaces filtered', {
        count: marketplacesFound
      });
    }
    
    return filtered;
  }

  async _saveCompanies(companies, sessionId) {
    for (const company of companies) {
      // Определяем stage в зависимости от наличия данных
      let stage = 'names_found';
      if (company.website) {
        stage = company.email ? 'contacts_found' : 'website_found';
      }
      
      await this.db.query(
        `INSERT INTO pending_companies 
         (session_id, company_name, website, email, description, stage, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          sessionId, 
          company.name, 
          company.website,
          company.email,
          company.description,
          stage
        ]
      );
    }
    
    this.logger.info('Stage 1: Companies saved', {
      total: companies.length,
      withWebsite: companies.filter(c => c.website).length,
      withEmail: companies.filter(c => c.email).length,
      withDescription: companies.filter(c => c.description).length
    });
  }
}

module.exports = Stage1FindCompanies;

