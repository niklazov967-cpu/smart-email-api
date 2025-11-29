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

  async execute(sessionId) {
    this.logger.info('Stage 1: Starting company search', { sessionId });

    try {
      // Получить topic_description и запросы из сессии
      const { data: sessionData } = await this.db.supabase
        .from('search_sessions')
        .select('topic_description, search_query')
        .eq('session_id', sessionId)
        .single();
      
      const topicDescription = sessionData?.topic_description || sessionData?.search_query;
      
      // Получить все запросы для этой сессии
      const { data: queries, error: queriesError } = await this.db.supabase
        .from('session_queries')
        .select('query_cn, query_ru, query_id')
        .eq('session_id', sessionId)
        .order('relevance', { ascending: false });
      
      if (queriesError || !queries || queries.length === 0) {
        this.logger.error('Stage 1: No queries found for session', { sessionId, error: queriesError?.message });
        return {
          success: false,
          error: 'No queries found for this session',
          total: 0
        };
      }
      
      this.logger.info('Stage 1: Processing queries', { 
        sessionId, 
        queriesCount: queries.length 
      });
      
      // Обработать каждый запрос
      let allCompanies = [];
      
      for (const query of queries) {
        const searchQuery = query.query_cn || query.query_ru;
        this.logger.info('Stage 1: Processing query', { 
          query: searchQuery,
          queryId: query.query_id
        });
        
        const companies = await this._processQuery(searchQuery, sessionId, topicDescription);
        allCompanies.push(...companies);
        
        // Небольшая задержка между запросами
        await this._sleep(1000);
      }
      
      this.logger.info('Stage 1: All queries processed', { 
        totalCompanies: allCompanies.length,
        queries: queries.length
      });
      
      // Удалить дубликаты между всеми запросами
      const uniqueCompanies = this._removeDuplicates(allCompanies);

      // Проверить существующие компании в БД (между сессиями)
      const newCompanies = await this._checkExistingCompanies(uniqueCompanies, sessionId);

      // Фильтровать маркетплейсы
      const filteredCompanies = this._filterMarketplaces(newCompanies);

      // Нормализовать email и website (один домен = один адрес)
      const normalizedCompanies = this._normalizeCompanyData(filteredCompanies);

      // Сохранить ВСЕ компании без ограничения (уже заплатили за данные!)
      const finalCompanies = normalizedCompanies;

      // Сохранить в БД (с сырыми данными и темой)
      await this._saveCompanies(finalCompanies, sessionId);

      // Обновить статистику сессии
      await this.db.supabase
        .from('search_sessions')
        .update({ 
          companies_found: finalCompanies.length,
          updated_at: new Date().toISOString()
        })
        .eq('session_id', sessionId);

      this.logger.info('Stage 1: Completed', {
        found: finalCompanies.length,
        sessionId
      });

      // Вернуть компании из БД с актуальными данными (включая email)
      const { data: savedCompanies, error: selectError } = await this.db.supabase
        .from('pending_companies')
        .select('company_name, website, email, description, stage')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(finalCompanies.length);

      if (selectError) {
        this.logger.error('Stage 1: Failed to fetch saved companies', { 
          error: selectError.message 
        });
      }

      return {
        success: true,
        companies: savedCompanies || finalCompanies,
        count: finalCompanies.length,
        total: finalCompanies.length
      };

    } catch (error) {
      this.logger.error('Stage 1: Failed', {
        error: error.message,
        sessionId
      });
      throw error;
    }
  }

  /**
   * Обработать один запрос и вернуть найденные компании
   */
  async _processQuery(searchQuery, sessionId, topicDescription) {
    const minCompanies = 5;
    const maxCompanies = 15;  // Уменьшено с 50 до 15 для оптимизации

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
      company.topicDescription = topicDescription;
    });

    // Валидация
    if (companies.length < minCompanies) {
      this.logger.warn('Stage 1: Too few companies found, retrying', {
        found: companies.length,
        required: minCompanies,
        query: searchQuery
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
        company.topicDescription = topicDescription;
      });
      
      companies.push(...moreCompanies);
    }

    this.logger.info('Stage 1: Query processed', { 
      query: searchQuery,
      companiesFound: companies.length
    });

    return companies;
  }

  /**
   * Вспомогательная функция для задержки
   */
  async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _createPrompt(searchQuery, minCompanies, maxCompanies) {
    return `在中国找到 ${minCompanies}-${maxCompanies} 家制造公司，符合以下条件：
${searchQuery}

要求：
- 真正的制造商（不是贸易公司、经销商或市场）
- 有官方企业网站的公司
- 目前正在运营的活跃公司
- 中小型企业（不要大型上市公司！）
- 提供CNC加工服务的公司（不是设备制造商！）

⚠️ 排除以下类型的公司：
- 上市公司（股票代码）
- 大型企业集团（超过1000名员工）
- 设备制造商（生产CNC机床的公司）
- OEM制造商（只生产自己品牌产品）
- 国际大型企业（如博世、卡特彼勒等的供应商）

✅ 寻找这样的公司：
- 提供CNC加工服务（对外接单）
- 小批量定制加工
- 可以加工客户提供的图纸
- 员工50-500人的中小企业

对于每家公司，查找：
1. **公司名称** - 完整的中文公司名称（必须是中文！例如：深圳市精密制造有限公司）
2. **官方网站（仅主页）**：
   - 企业网站主页（https://company.com）
   - 不要市场网址（阿里巴巴、1688、中国制造网）
   - 不要博客/文章页面（无 /blog/、/article/、/news/、/products/）
   - 如果只找到博客文章 - 提取主域名
3. **电子邮件**（来自公司网站、目录或搜索结果）
4. **简要描述**（1-2句关于服务的话，强调是"加工服务"而非"制造商"）

重要说明：
- 至少找到 ${minCompanies} 家公司
- 公司名称必须是中文（例如：深圳市XX精密制造有限公司）
- 不要英文名称，只要中文名称
- 如果没有企业网站，设置 website = null
- 如果未找到电子邮件，设置 email = null

输出格式（仅严格JSON）：
{
  "companies": [
    {
      "name": "深圳市精密制造有限公司",
      "website": "https://company.com",
      "email": "info@company.com",
      "brief_description": "专业从事精密CNC加工服务，小批量定制",
      "likely_domain_extension": ".cn"
    }
  ],
  "total": ${minCompanies},
  "note": "数据来源信息"
}

返回纯JSON，不要其他文本。公司名称必须是中文！只找提供加工服务的中小企业！`;
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

      return data.companies.map(c => {
        let website = c.website || null;
        
        // Если website это блог/статья - извлечь главный домен
        if (website && this._isBlogOrArticle(website)) {
          const mainDomain = this._extractMainDomain(website);
          this.logger.debug('Stage 1: Website is blog/article, extracting main domain', {
            original: website,
            mainDomain: mainDomain
          });
          website = mainDomain;
        }
        
        return {
          name: c.name,
          website: website,
          email: (c.email && this._isValidEmail(c.email)) ? c.email : null,  // Валидация email
          description: c.brief_description || c.description || null,
          domain_extension: c.likely_domain_extension || '.cn'
        };
      });

    } catch (error) {
      this.logger.error('Failed to parse Stage 1 response', {
        error: error.message,
        response: response.substring(0, 500)
      });
      return [];
    }
  }

  _removeDuplicates(companies) {
    const seenNames = new Set();
    const seenDomains = new Set();
    
    return companies.filter(company => {
      // Проверка по названию
      const nameKey = company.name.toLowerCase().trim();
      if (seenNames.has(nameKey)) {
        this.logger.debug('Stage 1: Duplicate name filtered', { name: company.name });
        return false;
      }
      
      // Проверка по домену (если есть website)
      if (company.website) {
        const domain = this._extractMainDomain(company.website);
        if (domain && seenDomains.has(domain)) {
          this.logger.debug('Stage 1: Duplicate domain filtered', { 
            name: company.name, 
            website: company.website,
            domain: domain 
          });
          return false;
        }
        if (domain) {
          seenDomains.add(domain);
        }
      }
      
      seenNames.add(nameKey);
      return true;
    });
  }

  /**
   * Проверяет существующие компании в БД по домену (между всеми сессиями)
   * Фильтрует компании, которые уже есть в базе данных
   */
  async _checkExistingCompanies(companies, sessionId) {
    const domains = companies
      .filter(c => c.website)
      .map(c => this._extractMainDomain(c.website))
      .filter(d => d);
    
    if (domains.length === 0) {
      return companies; // Нет сайтов для проверки
    }
    
    // Проверить в БД по доменам (во всех сессиях)
    // Получаем все компании с website из БД
    const { data: existing, error } = await this.db.supabase
      .from('pending_companies')
      .select('website, company_name')
      .not('website', 'is', null);
    
    if (error) {
      this.logger.error('Stage 1: Failed to check existing companies', { error: error.message });
      return companies; // В случае ошибки пропускаем проверку
    }
    
    // Извлечь домены из существующих компаний
    const existingDomains = new Set(
      (existing || [])
        .filter(e => e.website)
        .map(e => this._extractMainDomain(e.website))
        .filter(d => d)
    );
    
    // Фильтровать компании с существующими доменами
    const filtered = companies.filter(company => {
      if (!company.website) return true; // Без сайта - пропускаем
      
      const domain = this._extractMainDomain(company.website);
      if (!domain) return true;
      
      if (existingDomains.has(domain)) {
        this.logger.info('Stage 1: Company already exists in DB', {
          name: company.name,
          website: company.website,
          domain: domain
        });
        return false; // Уже есть в БД
      }
      
      return true;
    });
    
    this.logger.info('Stage 1: Filtered existing companies', {
      total: companies.length,
      existing: companies.length - filtered.length,
      remaining: filtered.length
    });
    
    return filtered;
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
      
      // Валидация email
      if (!this._isValidEmail(email)) {
        this.logger.debug('Stage 1: Invalid email skipped in filtering', { value: email });
        continue;
      }
      
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

  _isValidEmail(email) {
    if (!email || typeof email !== 'string') {
      return false;
    }
    
    email = email.trim();
    
    // Проверка на телефон
    const phonePatterns = [
      /^\+?\d{10,15}$/,
      /^\+?\d[\d\s\-().]{8,}$/,
      /^\d{3,4}[-\s]?\d{4}[-\s]?\d{4}$/,
      /^\+?86[-\s]?\d{3,4}[-\s]?\d{4}[-\s]?\d{4}$/
    ];
    
    for (const pattern of phonePatterns) {
      if (pattern.test(email)) {
        this.logger.debug('Stage 1: Filtered out phone number', { value: email });
        return false;
      }
    }
    
    // Убрать mailto: если есть
    if (email.toLowerCase().startsWith('mailto:')) {
      email = email.substring(7);
    }
    
    // Валидация email
    const emailRegex = /^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    if (!emailRegex.test(email)) {
      return false;
    }
    
    const parts = email.split('@');
    if (parts.length !== 2) {
      return false;
    }
    
    const localPart = parts[0].toLowerCase();
    const domain = parts[1];
    
    // Фильтр generic emails
    const genericPrefixes = [
      'noreply', 'no-reply', 'donotreply',
      'securities', 'ir', 'investor', 'relations',
      'pr', 'press', 'media', 'news',
      'hr', 'recruitment', 'jobs', 'career',
      'legal', 'compliance', 'admin', 'webmaster',
      'postmaster', 'hostmaster', 'abuse',
      'marketing', 'advertising', 'promo'
    ];
    
    for (const prefix of genericPrefixes) {
      if (localPart === prefix || localPart.startsWith(prefix + '.') || localPart.startsWith(prefix + '_')) {
        this.logger.debug('Stage 1: Filtered out generic email', { value: email, reason: prefix });
        return false;
      }
    }
    
    if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
      return false;
    }
    
    if (localPart.length < 2 || domain.length < 4) {
      return false;
    }
    
    return true;
  }

  _isBlogOrArticle(url) {
    if (!url) return false;
    
    const blogPatterns = [
      '/blog/',
      '/article/',
      '/news/',
      '/post/',
      '/press/',
      '/story/',
      '/media/',
      'blog.',
      'news.',
      'article.'
    ];
    
    const lowerUrl = url.toLowerCase();
    return blogPatterns.some(pattern => lowerUrl.includes(pattern));
  }

  _extractMainDomain(url) {
    try {
      if (!url) return null;
      
      // Убрать протокол
      let domain = url.replace(/^https?:\/\//, '');
      
      // Убрать все после первого слэша (пути, параметры)
      domain = domain.split('/')[0].split('?')[0].split('#')[0];
      
      // Убрать порт если есть
      domain = domain.split(':')[0];
      
      // Убрать www. для нормализации
      domain = domain.replace(/^www\./, '');
      
      // Извлечь основной домен (второй уровень)
      // us.jingdiao.com → jingdiao.com
      // blog.example.co.uk → example.co.uk
      const parts = domain.split('.');
      
      if (parts.length > 2) {
        // Проверить на двойные TLD (.co.uk, .com.cn и т.д.)
        const doubleTLDs = ['co.uk', 'com.cn', 'net.cn', 'org.cn', 'co.jp', 'com.au'];
        const lastTwoParts = parts.slice(-2).join('.');
        
        if (doubleTLDs.includes(lastTwoParts)) {
          // Для двойных TLD берем последние 3 части: example.co.uk
          domain = parts.slice(-3).join('.');
        } else {
          // Для обычных доменов берем последние 2 части: example.com
          domain = parts.slice(-2).join('.');
        }
      }
      
      return domain.toLowerCase(); // Возвращаем только домен
    } catch (error) {
      this.logger.error('Stage 1: Failed to extract domain', { url, error: error.message });
      return null;
    }
  }

  async _saveCompanies(companies, sessionId) {
    for (const company of companies) {
      // Нормализовать website: убрать лишние пути
      let normalizedWebsite = company.website;
      if (normalizedWebsite && this._isBlogOrArticle(normalizedWebsite)) {
        const mainDomain = this._extractMainDomain(normalizedWebsite);
        if (mainDomain) {
          normalizedWebsite = `https://${mainDomain}`; // Сохранить только основной домен
          this.logger.debug('Stage 1: Normalized blog URL to main domain', {
            original: company.website,
            normalized: normalizedWebsite
          });
        }
      }
      
      // НОВАЯ ЛОГИКА: Определяем статусы для каждого этапа
      let currentStage = 1;
      let stage2Status = null;
      let stage3Status = null;
      let legacyStage = 'names_found'; // Для обратной совместимости
      
      // Если сайт найден сразу - Stage 2 пропущен
      if (normalizedWebsite) {
        stage2Status = 'skipped';
        currentStage = 2; // Готов для Stage 3
        legacyStage = 'website_found';
        
        this.logger.info('Stage 1: Website found, Stage 2 will be skipped', {
          company: company.name,
          website: normalizedWebsite
        });
        
        // Если email тоже найден - Stage 3 тоже пропущен
        if (company.email) {
          stage3Status = 'skipped';
          currentStage = 3; // Готов для Stage 4
          legacyStage = 'contacts_found';
          
          this.logger.info('Stage 1: Email found, Stage 3 will be skipped', {
            company: company.name,
            email: company.email
          });
        }
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
        website: normalizedWebsite, // Используем нормализованный URL
        email: company.email,
        description: company.description,
        services: services,
        search_query_text: company.rawQuery || null, // Поисковый запрос
        topic_description: company.topicDescription || null, // НОВОЕ: Главная тема
        stage1_raw_data: rawData, // Сырые данные
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
        stage: legacyStage,
        // НОВЫЕ ПОЛЯ для отслеживания прогресса
        stage1_status: 'completed',
        stage2_status: stage2Status,
        stage3_status: stage3Status,
        stage4_status: null,
        current_stage: currentStage
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

