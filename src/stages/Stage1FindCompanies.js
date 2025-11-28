/**
 * Stage 1: Поиск компаний
 * Находит 8-12 названий компаний по поисковому запросу
 */
const TagExtractor = require('../utils/TagExtractor');

class Stage1FindCompanies {
  constructor(sonarClient, settingsManager, database, logger) {
    this.sonar = sonarClient;
    this.settings = settingsManager;
    this.db = database;
    this.logger = logger;
    this.tagExtractor = new TagExtractor();
  }

  async execute(searchQuery, sessionId) {
    this.logger.info('Stage 1: Starting company search', { searchQuery, sessionId });

    try {
      // ОГРАНИЧЕНИЕ ДЛЯ ТЕСТИРОВАНИЯ: максимум 5 компаний
      const minCompanies = 3;
      const maxCompanies = 5;

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
      
      // Сохранить сырой ответ для каждой компании
      companies.forEach(company => {
        company.rawResponse = response;
        company.rawQuery = searchQuery;
      });

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
        
        // Сохранить сырой ответ для новых компаний
        moreCompanies.forEach(company => {
          company.rawResponse = retryResponse;
          company.rawQuery = searchQuery;
        });
        
        companies.push(...moreCompanies);
      }

      // Удалить дубликаты
      const uniqueCompanies = this._removeDuplicates(companies);

      // Фильтровать маркетплейсы
      const filteredCompanies = this._filterMarketplaces(uniqueCompanies);

      // Нормализовать email и website (один домен = один адрес)
      const normalizedCompanies = this._normalizeCompanyData(filteredCompanies);

      // Ограничить до максимума
      const finalCompanies = normalizedCompanies.slice(0, maxCompanies);

      // Сохранить в БД (с сырыми данными)
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

      // Вернуть компании из БД с актуальными данными (включая email)
      const savedCompanies = await this.db.query(
        `SELECT company_name, website, email, description, stage
         FROM pending_companies
         WHERE session_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [sessionId, finalCompanies.length]
      );

      return {
        success: true,
        companies: savedCompanies.rows || finalCompanies,
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
    return `Find ${minCompanies}-${maxCompanies} Chinese manufacturing companies that match this criteria:
${searchQuery}

REQUIREMENTS:
- Real manufacturers (NOT trading companies, dealers, or marketplaces)
- Companies with official corporate websites
- Active companies currently operating

FOR EACH COMPANY FIND:
1. **Company name** (full Chinese name)
2. **Official website** (corporate site, NOT marketplace like Alibaba/1688)
3. **Email** (from company website, directories, or search results)
4. **Brief description** (1-2 sentences about services)

IMPORTANT:
- Find at least ${minCompanies} companies
- DO NOT include marketplace URLs (Alibaba, 1688, Made-in-China) as website
- If no corporate website exists, set website = null
- If email not found, set email = null

OUTPUT FORMAT (STRICT JSON ONLY):
{
  "companies": [
    {
      "name": "公司全名",
      "website": "https://company.com",
      "email": "info@company.com",
      "brief_description": "brief service description",
      "likely_domain_extension": ".cn"
    }
  ],
  "total": ${minCompanies},
  "note": "source info"
}

RETURN ONLY VALID JSON. NO ADDITIONAL TEXT.`;
  }

  _createRetryPrompt(searchQuery) {
    return `Find additional Chinese manufacturing companies for: ${searchQuery}

Look on B2B platforms (Alibaba, 1688, Made-in-China) and industry directories.
Return JSON with 5-8 more companies in same format.

STRICT JSON OUTPUT ONLY.`;
  }

  _parseResponse(response) {
    try {
      // Убрать markdown code blocks (```json ... ```)
      let cleanResponse = response.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      
      // Попытка распарсить JSON
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.error('No JSON found in response', { preview: response.substring(0, 500) });
        throw new Error('No JSON found in response');
      }

      let jsonString = jsonMatch[0];
      let data;

      // Попытка парсинга с автоматической починкой усечённого JSON
      try {
        data = JSON.parse(jsonString);
      } catch (parseError) {
        this.logger.warn('JSON truncated, attempting to fix', {
          error: parseError.message,
          preview: jsonString.substring(0, 300)
        });

        // Автоматическая починка усечённого JSON
        // 1. Найти массив companies
        const companiesMatch = jsonString.match(/"companies"\s*:\s*\[([\s\S]*?)(\]|$)/);
        if (companiesMatch) {
          let companiesText = companiesMatch[1];
          
          // 2. Удалить неполную последнюю компанию
          // Найти последнюю полную компанию (заканчивается на },)
          const lastValidComma = companiesText.lastIndexOf('},');
          if (lastValidComma > 0) {
            companiesText = companiesText.substring(0, lastValidComma + 1);
          } else {
            // Попробовать найти хотя бы одну полную компанию
            const matches = companiesText.match(/\{[^}]*\}/g);
            if (matches && matches.length > 0) {
              companiesText = matches.join(',');
            } else {
              companiesText = '';
            }
          }

          // 3. Собрать валидный JSON
          jsonString = `{"companies": [${companiesText}], "total": 0}`;
          
          this.logger.info('JSON fixed successfully', { preview: jsonString.substring(0, 200) });
          data = JSON.parse(jsonString);
        } else {
          this.logger.error('Cannot fix truncated JSON - no companies array found');
          throw new Error('Cannot fix truncated JSON');
        }
      }
      
      if (!data.companies || !Array.isArray(data.companies)) {
        this.logger.error('Invalid companies array in response', { data });
        throw new Error('Invalid companies array');
      }

      if (data.companies.length === 0) {
        this.logger.warn('Empty companies array in response');
      }

      return data.companies.map(c => ({
        name: c.name,
        website: c.website || null,
        email: c.email || null,
        description: c.brief_description || c.description || null,
        domain_extension: c.likely_domain_extension || '.cn'
      }));

    } catch (error) {
      this.logger.error('Failed to parse Stage 1 response', {
        error: error.message,
        response: response.substring(0, 500)
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
          // Сохраняем email если есть
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

  /**
   * Нормализует данные компаний:
   * - Для email: если несколько email с одного домена, выбирает приоритетный
   * - Для website: если несколько URL с одного домена, выбирает основной
   */
  _normalizeCompanyData(companies) {
    return companies.map(company => {
      let normalizedCompany = { ...company };

      // Нормализовать email: оставить только один с каждого домена
      if (company.email) {
        // Если email - это строка, преобразовать в массив
        let emails = typeof company.email === 'string' 
          ? [company.email] 
          : Array.isArray(company.email) 
            ? company.email 
            : [];
        
        if (emails.length > 1) {
          emails = this._filterEmailsByDomain(emails);
          normalizedCompany.email = emails[0]; // Взять первый (приоритетный)
          
          this.logger.debug('Stage 1: Multiple emails normalized', {
            company: company.name,
            original: company.email,
            selected: normalizedCompany.email
          });
        }
      }

      // Нормализовать website: проверить что это один домен
      if (company.website && Array.isArray(company.website)) {
        normalizedCompany.website = this._selectBestWebsite(company.website);
        
        this.logger.debug('Stage 1: Multiple websites normalized', {
          company: company.name,
          original: company.website,
          selected: normalizedCompany.website
        });
      }

      return normalizedCompany;
    });
  }

  _filterEmailsByDomain(emails) {
    if (emails.length === 0) return emails;

    // Группировать email по доменам
    const domainMap = new Map();
    
    for (const email of emails) {
      if (!email || typeof email !== 'string') continue;
      
      const domain = this._extractDomain(email);
      if (!domain) continue;
      
      if (!domainMap.has(domain)) {
        domainMap.set(domain, []);
      }
      domainMap.get(domain).push(email);
    }

    // Для каждого домена выбрать один email
    const filtered = [];
    for (const emailList of domainMap.values()) {
      filtered.push(this._selectBestEmail(emailList));
    }

    return filtered;
  }

  _extractDomain(email) {
    const match = email.match(/@(.+)$/);
    return match ? match[1].toLowerCase() : null;
  }

  _selectBestEmail(emails) {
    if (emails.length === 1) return emails[0];

    // Приоритет: info > sales > contact > service > другие
    const priorities = ['info', 'sales', 'contact', 'service', 'enquiry', 'inquiry'];
    
    for (const priority of priorities) {
      const found = emails.find(email => 
        email.toLowerCase().startsWith(priority + '@')
      );
      if (found) return found;
    }

    return emails[0];
  }

  _selectBestWebsite(websites) {
    if (websites.length === 1) return websites[0];

    // Приоритет: www.company.com > company.com > cn.company.com
    const withWww = websites.find(url => url.includes('://www.'));
    if (withWww) return withWww;

    const withoutSubdomain = websites.find(url => {
      const match = url.match(/https?:\/\/([^\/]+)/);
      if (!match) return false;
      const host = match[1];
      return !host.includes('.') || host.split('.').length === 2;
    });
    if (withoutSubdomain) return withoutSubdomain;

    return websites[0];
  }

  async _saveCompanies(companies, sessionId) {
    for (const company of companies) {
      // Определяем stage в зависимости от наличия данных
      let stage = 'names_found';
      if (company.website) {
        stage = company.email ? 'contacts_found' : 'website_found';
      }
      
      // Извлечь теги и сервисы из описания
      const tagData = this.tagExtractor.extractTagsForDB(company.description);
      const services = this.tagExtractor.extractServices(company.description);
      
      // Подготовить сырые данные для сохранения
      // ВАЖНО: Сохраняем ПОЛНЫЙ оригинальный ответ от Perplexity, а не только парсированный JSON
      const rawData = {
        query: company.rawQuery || 'unknown',
        full_response: company.rawResponse ? company.rawResponse.substring(0, 10000) : null, // ПОЛНЫЙ ответ с контекстом (до 10000 символов)
        timestamp: new Date().toISOString(),
        source: 'perplexity_sonar_pro'
      };
      
      // Использовать прямой INSERT через Supabase API
      await this.db.directInsert('pending_companies', {
        session_id: sessionId,
        company_name: company.name,
        website: company.website,
        email: company.email,
        description: company.description,
        services: services,
        stage1_raw_data: rawData, // НОВОЕ: сохраняем сырые данные
        tag1: tagData.tag1,
        tag2: tagData.tag2,
        tag3: tagData.tag3,
        tag4: tagData.tag4,
        tag5: tagData.tag5,
        tag6: tagData.tag6,
        tag7: tagData.tag7,
        tag8: tagData.tag8,
        tag9: tagData.tag9,
        tag10: tagData.tag10,
        tag11: tagData.tag11,
        tag12: tagData.tag12,
        tag13: tagData.tag13,
        tag14: tagData.tag14,
        tag15: tagData.tag15,
        tag16: tagData.tag16,
        tag17: tagData.tag17,
        tag18: tagData.tag18,
        tag19: tagData.tag19,
        tag20: tagData.tag20,
        stage: stage
      });
    }
    
    const tagsCount = companies.filter(c => {
      const tags = this.tagExtractor.extractTags(c.description);
      return tags.length > 0;
    }).length;
    
    this.logger.info('Stage 1: Companies saved', {
      total: companies.length,
      withWebsite: companies.filter(c => c.website).length,
      withEmail: companies.filter(c => c.email).length,
      withDescription: companies.filter(c => c.description).length,
      withTags: tagsCount,
      withRawData: companies.filter(c => c.rawResponse).length
    });
  }
}

module.exports = Stage1FindCompanies;

