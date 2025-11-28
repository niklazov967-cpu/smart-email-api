/**
 * Stage 2: Поиск официальных сайтов
 * Находит URL для каждой компании (параллельно с ограничениями)
 */
const TagExtractor = require('../utils/TagExtractor');

class Stage2FindWebsites {
  constructor(sonarClient, settingsManager, database, logger) {
    this.sonar = sonarClient;
    this.settings = settingsManager;
    this.db = database;
    this.logger = logger;
    this.tagExtractor = new TagExtractor();
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
      `SELECT company_id, company_name 
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
      const prompt = `Найди официальный веб-сайт, email и описание услуг компании из Китая через поиск в интернете.

КОМПАНИЯ: ${company.company_name}

ЧТО ИСКАТЬ:
1. **Официальный веб-сайт (ГЛАВНАЯ СТРАНИЦА)**:
   - Только корпоративные сайты (.cn, .com.cn, .net.cn, .com)
   - НЕ маркетплейсы (Alibaba, 1688, Made-in-China)
   - Основной домен компании, не подразделений
   - ГЛАВНАЯ страница (https://company.com), НЕ страницы блогов или статей
   - НЕ указывай URL вида: /blog/, /article/, /news/, /products/item-123

2. **Email для связи**:
   - Поищи email на ГЛАВНОЙ СТРАНИЦЕ официального сайта компании (если найден)
   - Проверь раздел "Contact Us" / "联系我们" на главной странице
   - Проверь footer (подвал) главной страницы
   - Проверь отраслевые каталоги и справочники компаний
   - Проверь новости и статьи о компании
   - Любые упоминания компании с контактами в интернете
   - ❌ НЕ ищи email на маркетплейсах (Alibaba, 1688, Made-in-China) - там его нет!

3. **Описание услуг** (1-2 предложения):
   - Что производит/обрабатывает компания
   - Какие услуги предоставляет (токарная, фрезерная, штамповка и т.д.)
   - Какие материалы использует (нержавейка, алюминий и т.д.)

РЕЗУЛЬТАТ: JSON формат:
{
  "website": "https://www.example.cn",
  "email": "info@example.com",
  "description": "краткое описание услуг компании",
  "source": "откуда взят email (сайт/каталог)"
}

Если сайт не найден: {"website": null, "email": "...если найден", "description": "...", "source": "..."}
Если ничего не найдено: {"website": null, "email": null, "description": null, "source": null}

ВАЖНО: 
- Указывай ГЛАВНУЮ страницу сайта, а не страницы блогов/статей!
- Email и описание можно взять с Alibaba/Made-in-China даже если сайт не найден!

ВЕРНИ ТОЛЬКО JSON, без дополнительного текста.`;

      const response = await this.sonar.query(prompt, {
        stage: 'stage2_find_websites',
        sessionId,
        useCache: true
      });

      const result = this._parseResponse(response);

      // Нормализовать данные (один домен = один email)
      if (result.email && (typeof result.email !== 'string' || result.email.includes(','))) {
        const emails = typeof result.email === 'string' 
          ? result.email.split(',').map(e => e.trim()) 
          : Array.isArray(result.email) ? result.email : [result.email];
        
        const filtered = this._filterEmailsByDomain(emails);
        result.email = filtered.length > 0 ? filtered[0] : null;
        
        if (emails.length > 1) {
          this.logger.debug('Stage 2: Multiple emails normalized', {
            company: company.company_name,
            original: emails,
            selected: result.email
          });
        }
      }

      if (result.website || result.email || result.description) {
        // Определяем новый stage
        let newStage = 'names_found';
        if (result.website && result.email) {
          newStage = 'contacts_found';
        } else if (result.website) {
          newStage = 'website_found';
        } else if (result.email) {
          newStage = 'email_found';
        }

        // Извлечь теги и сервисы из описания
        let tagData = { tag1: null, tag2: null, tag3: null, tag4: null, tag5: null,
                       tag6: null, tag7: null, tag8: null, tag9: null, tag10: null,
                       tag11: null, tag12: null, tag13: null, tag14: null, tag15: null,
                       tag16: null, tag17: null, tag18: null, tag19: null, tag20: null };
        let services = null;
        
        if (result.description) {
          tagData = this.tagExtractor.extractTagsForDB(result.description);
          services = this.tagExtractor.extractServices(result.description);
        }

        // Подготовить raw data для Stage 2
        const rawData = {
          company: company.company_name,
          full_response: response ? response.substring(0, 10000) : null,
          timestamp: new Date().toISOString(),
          source: 'perplexity_sonar_pro'
        };

        // Сохранить найденные данные (включая описание, теги и сервисы)
        await this.db.query(
            `UPDATE pending_companies 
             SET website = $1, email = $2, description = COALESCE($3, description), 
                 services = COALESCE($4, services), stage = $5,
                 tag1 = COALESCE($6, tag1), tag2 = COALESCE($7, tag2), tag3 = COALESCE($8, tag3), 
                 tag4 = COALESCE($9, tag4), tag5 = COALESCE($10, tag5), tag6 = COALESCE($11, tag6),
                 tag7 = COALESCE($12, tag7), tag8 = COALESCE($13, tag8), tag9 = COALESCE($14, tag9),
                 tag10 = COALESCE($15, tag10), tag11 = COALESCE($16, tag11), tag12 = COALESCE($17, tag12),
                 tag13 = COALESCE($18, tag13), tag14 = COALESCE($19, tag14), tag15 = COALESCE($20, tag15),
                 tag16 = COALESCE($21, tag16), tag17 = COALESCE($22, tag17), tag18 = COALESCE($23, tag18),
                 tag19 = COALESCE($24, tag19), tag20 = COALESCE($25, tag20),
                 stage2_raw_data = $27,
                 updated_at = NOW()
             WHERE company_id = $26`,
            [result.website, result.email, result.description, services, newStage,
             tagData.tag1, tagData.tag2, tagData.tag3, tagData.tag4, tagData.tag5,
             tagData.tag6, tagData.tag7, tagData.tag8, tagData.tag9, tagData.tag10,
             tagData.tag11, tagData.tag12, tagData.tag13, tagData.tag14, tagData.tag15,
             tagData.tag16, tagData.tag17, tagData.tag18, tagData.tag19, tagData.tag20,
             company.company_id, JSON.stringify(rawData)]
        );

        this.logger.info('Stage 2: Data found', {
          company: company.company_name,
          website: result.website || 'not found',
          email: result.email || 'not found',
          description: result.description ? 'found' : 'not found',
          tags: Object.values(tagData).filter(t => t).length,
          source: result.source
        });

        return { success: true, website: result.website, email: result.email };
      } else {
        // Отметить как не найдено
        await this.db.query(
          `UPDATE pending_companies 
           SET website_status = 'not_found', updated_at = NOW()
           WHERE company_id = $1`,
          [company.company_id]
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
          description: null,
          source: null
        };
      }

      const data = JSON.parse(jsonMatch[0]);
      
      // Валидация email
      let validEmail = null;
      if (data.email) {
        validEmail = this._isValidEmail(data.email) ? data.email : null;
        if (!validEmail) {
          this.logger.debug('Stage 2: Invalid email filtered', { value: data.email });
        }
      }
      
      return {
        website: data.website || null,
        email: validEmail,
        description: data.description || null,
        source: data.source || null
      };

    } catch (error) {
      this.logger.error('Failed to parse Stage 2 response', {
        error: error.message,
        response: response.substring(0, 200)
      });
      return { website: null, email: null, description: null, source: null };
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

  _filterEmailsByDomain(emails) {
    if (emails.length === 0) return emails;

    const domainMap = new Map();
    
    for (const email of emails) {
      if (!email || typeof email !== 'string') continue;
      
      // Валидация email
      if (!this._isValidEmail(email)) {
        this.logger.debug('Stage 2: Invalid email skipped in filtering', { value: email });
        continue;
      }
      
      const domain = this._extractDomain(email);
      if (!domain) continue;
      
      if (!domainMap.has(domain)) {
        domainMap.set(domain, []);
      }
      domainMap.get(domain).push(email);
    }

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

    const priorities = ['info', 'sales', 'contact', 'service', 'enquiry', 'inquiry'];
    
    for (const priority of priorities) {
      const found = emails.find(email => 
        email.toLowerCase().startsWith(priority + '@')
      );
      if (found) return found;
    }

    return emails[0];
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
        this.logger.debug('Stage 2: Filtered out phone number', { value: email });
        return false;
      }
    }
    
    if (email.toLowerCase().startsWith('mailto:')) {
      email = email.substring(7);
    }
    
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
        this.logger.debug('Stage 2: Filtered out generic email', { value: email, reason: prefix });
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

  _extractMainDomain(url) {
    try {
      if (!url) return null;
      
      // Убрать протокол и параметры
      let domain = url.replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
      
      // Оставляем www. если есть (для корректности)
      // domain = domain.replace(/^www\./, '');
      
      return `https://${domain}`;
    } catch (error) {
      this.logger.error('Stage 2: Failed to extract domain', { url, error: error.message });
      return url;
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Stage2FindWebsites;

