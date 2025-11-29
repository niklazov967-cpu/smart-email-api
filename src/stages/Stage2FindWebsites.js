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

  async execute(sessionId = null) {
    // sessionId теперь опциональный - если не указан, обрабатываем ВСЕ компании
    this.logger.info('Stage 2: Starting website search', { 
      sessionId: sessionId || 'ALL',
      mode: sessionId ? 'session' : 'global'
    });

    try {
      // Получить компании для обработки
      const companies = await this._getCompanies(sessionId);
      
      if (companies.length === 0) {
        this.logger.info('Stage 2: No companies need processing');
        return {
          success: true,
          total: 0,
          found: 0,
          notFound: 0
        };
      }

      // Получить настройки
      const settings = await this.settings.getCategory('processing_stages');
      const concurrentRequests = settings.stage2_concurrent_requests || 3;
      const batchDelay = settings.stage2_batch_delay_ms || 2000;

      this.logger.info('Stage 2: Processing companies', {
        count: companies.length,
        concurrent: concurrentRequests,
        delay: batchDelay,
        mode: sessionId ? 'session-based' : 'all-companies'
      });

      // Обработать батчами
      const results = [];
      for (let i = 0; i < companies.length; i += concurrentRequests) {
        const batch = companies.slice(i, i + concurrentRequests);
        
        this.logger.debug(`Stage 2: Processing batch ${Math.floor(i / concurrentRequests) + 1}`, {
          batchSize: batch.length
        });

        // Параллельная обработка батча (sessionId НЕ нужен)
        const batchResults = await Promise.all(
          batch.map(company => this._findWebsite(company))
        );

        results.push(...batchResults);

        // Пауза между батчами
        if (i + concurrentRequests < companies.length) {
          await this._sleep(batchDelay);
        }
      }

      // Подсчет успешных
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      const skipped = results.filter(r => r.skipped).length;

      this.logger.info('Stage 2: Completed', {
        total: companies.length,
        successful,
        failed,
        skipped,
        sessionId: sessionId || 'ALL'
      });

      // Сохранить детальный отчет в файл
      await this._saveDetailedReport({
        sessionId: sessionId || 'ALL',
        total: companies.length,
        successful,
        failed,
        skipped,
        results
      });

      return {
        success: true,
        total: companies.length,
        found: successful,
        notFound: failed,
        skipped
      };

    } catch (error) {
      this.logger.error('Stage 2: Failed', {
        error: error.message,
        sessionId: sessionId || 'ALL'
      });
      throw error;
    }
  }

  async _getCompanies(sessionId = null) {
    // НОВОЕ: Получить ВСЕ компании готовые для Stage 2 (независимо от сессии)
    // stage2_status должен быть NULL (не 'skipped', не 'completed', не 'failed')
    // current_stage должен быть >= 1
    
    let query = this.db.supabase
      .from('pending_companies')
      .select('company_id, company_name, current_stage, stage2_status, website')
      .or('website.is.null,website.eq.')
      .is('stage2_status', null) // Только те у кого Stage 2 еще не обработан
      .gte('current_stage', 1); // Минимум Stage 1 завершен
    
    // Если указан sessionId, фильтруем только эту сессию (для обратной совместимости)
    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      this.logger.error('Stage 2: Failed to fetch companies', { 
        error: error.message,
        sessionId: sessionId || 'ALL'
      });
      throw new Error(`Failed to fetch companies: ${error.message}`);
    }
    
    this.logger.info('Stage 2: Companies ready for processing', {
      total: data?.length || 0,
      sessionId: sessionId || 'ALL'
    });
    
    return data || [];
  }

  async _findWebsite(company) {
    // sessionId больше не нужен - компания уже имеет session_id
    this.logger.info('Stage 2: Starting website search for company', {
      company: company.company_name,
      companyId: company.company_id
    });
    
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
        useCache: false  // Отключаем кэш для свежих результатов
      });

      this.logger.info('Stage 2: Sonar response received', {
        company: company.company_name,
        responseLength: response ? response.length : 0,
        hasResponse: !!response
      });

      const result = this._parseResponse(response);

      this.logger.info('Stage 2: Response parsed', {
        company: company.company_name,
        foundWebsite: !!result.website,
        foundEmail: !!result.website,
        foundDescription: !!result.description,
        website: result.website,
        email: result.email,
        source: result.source
      });

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
        // НОВАЯ ЛОГИКА: Определяем статусы для каждого этапа
        let currentStage = 2; // Минимум Stage 2 завершен
        let stage3Status = null;
        let legacyStage = 'website_found';
        
        if (result.website && result.email) {
          // Оба найдены - Stage 3 пропущен
          stage3Status = 'skipped';
          currentStage = 3; // Готов для Stage 4
          legacyStage = 'contacts_found';
          
          this.logger.info('Stage 2: Both website and email found, Stage 3 will be skipped', {
            company: company.company_name,
            website: result.website,
            email: result.email
          });
        } else if (result.website) {
          legacyStage = 'website_found';
        } else if (result.email) {
          // Email без сайта
          legacyStage = 'email_found';
          currentStage = 2; // Остается на Stage 2 (нет сайта)
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
        const updateData = {
          website: result.website,
          email: result.email,
          description: result.description || undefined,
          services: services || undefined,
          stage: legacyStage,
          stage2_status: 'completed',
          stage3_status: stage3Status,
          current_stage: currentStage,
          stage2_raw_data: rawData,
          updated_at: new Date().toISOString(),
          ...tagData // tag1, tag2, ... tag20
        };
        
        // Удалить undefined значения (чтобы не перезаписывать существующие)
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) delete updateData[key];
        });
        
        const { error: updateError } = await this.db.supabase
          .from('pending_companies')
          .update(updateData)
          .eq('company_id', company.company_id);
        
        if (updateError) {
          this.logger.error('Stage 2: Failed to update company', {
            company: company.company_name,
            error: updateError.message
          });
        }

        this.logger.info('Stage 2: Data found', {
          company: company.company_name,
          website: result.website || 'not found',
          email: result.email || 'not found',
          description: result.description ? 'found' : 'not found',
          tags: Object.values(tagData).filter(t => t).length,
          source: result.source
        });

        return { 
          success: true, 
          company: company.company_name,
          website: result.website, 
          email: result.email,
          description: result.description,
          source: result.source
        };
      } else {
        // Подготовить raw data для случая "не найдено"
        const rawDataNotFound = {
          company: company.company_name,
          full_response: response ? response.substring(0, 10000) : null,
          timestamp: new Date().toISOString(),
          source: 'perplexity_sonar_pro',
          result: 'not_found'
        };
        
        // Отметить как не найдено И сохранить raw_data
        const { error: updateError } = await this.db.supabase
          .from('pending_companies')
          .update({
            website_status: 'not_found',
            stage2_status: 'failed',
            current_stage: 1, // Остается на Stage 1
            stage2_raw_data: rawDataNotFound,
            updated_at: new Date().toISOString()
          })
          .eq('company_id', company.company_id);
        
        if (updateError) {
          this.logger.error('Stage 2: Failed to mark as not found', {
            company: company.company_name,
            error: updateError.message
          });
        }

        this.logger.warn('Stage 2: Nothing found', {
          company: company.company_name
        });

        return { 
          success: false,
          company: company.company_name,
          website: null,
          email: null,
          description: null
        };
      }

    } catch (error) {
      this.logger.error('Stage 2: Error finding website', {
        company: company.company_name,
        error: error.message
      });
      return { 
        success: false, 
        company: company.company_name,
        error: error.message 
      };
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

  /**
   * Сохранить детальный отчет о прохождении Stage 2 в файл
   */
  async _saveDetailedReport(stats) {
    const fs = require('fs').promises;
    const path = require('path');
    
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const reportPath = path.join(__dirname, '../../logs', `stage2-report-${timestamp}.txt`);
    
    // Группировка результатов
    const websiteFound = stats.results.filter(r => r.success && r.website).length;
    const emailFound = stats.results.filter(r => r.success && r.email).length;
    const bothFound = stats.results.filter(r => r.success && r.website && r.email).length;
    const descriptionFound = stats.results.filter(r => r.success && r.description).length;
    
    const report = `
╔═══════════════════════════════════════════════════════════════╗
║           STAGE 2 DETAILED REPORT - ${new Date().toLocaleString('ru-RU')}          ║
╚═══════════════════════════════════════════════════════════════╝

SESSION ID: ${stats.sessionId}
COMPANIES PROCESSED: ${stats.total}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 OVERALL STATISTICS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Successful:              ${stats.successful} (${(stats.successful / stats.total * 100).toFixed(1)}%)
❌ Failed:                  ${stats.failed} (${(stats.failed / stats.total * 100).toFixed(1)}%)
⏭️  Skipped (already had):  ${stats.skipped} (${(stats.skipped / stats.total * 100).toFixed(1)}%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 WHAT WAS FOUND:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌐 Website Found:           ${websiteFound} companies
📧 Email Found:             ${emailFound} companies
🎯 Both Found:              ${bothFound} companies
📝 Description Found:       ${descriptionFound} companies

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 DETAILED RESULTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${stats.results.map((r, idx) => {
  if (r.skipped) {
    return `${idx + 1}. ⏭️  SKIPPED: ${r.company}
   Reason: Already had website from Stage 1`;
  } else if (r.success) {
    return `${idx + 1}. ✅ SUCCESS: ${r.company}
   Website: ${r.website || 'NOT FOUND'}
   Email: ${r.email || 'NOT FOUND'}
   Description: ${r.description ? r.description.substring(0, 60) + '...' : 'NOT FOUND'}
   Source: ${r.source || 'N/A'}`;
  } else {
    return `${idx + 1}. ❌ FAILED: ${r.company}
   Error: ${r.error || 'Unknown error'}`;
  }
}).join('\n\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 ANALYSIS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Success Rate: ${(stats.successful / stats.total * 100).toFixed(1)}% - ${this._analyzeSuccessRate((stats.successful / stats.total * 100).toFixed(1))}

Website Discovery: ${(websiteFound / stats.total * 100).toFixed(1)}% - ${websiteFound >= stats.total * 0.7 ? '✅ Good' : websiteFound >= stats.total * 0.5 ? '⚠️  Moderate' : '❌ Poor'}

Email Discovery: ${(emailFound / stats.total * 100).toFixed(1)}% - ${emailFound >= stats.total * 0.3 ? '🎉 Excellent!' : emailFound >= stats.total * 0.15 ? '✅ Good' : '⚠️  Low - consider retry'}

Stage 3 Workload: ${websiteFound - bothFound} companies need email search

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    try {
      await fs.writeFile(reportPath, report, 'utf8');
      this.logger.info(`Stage 2: Detailed report saved to ${reportPath}`);
    } catch (error) {
      this.logger.error(`Stage 2: Failed to save report: ${error.message}`);
    }
  }

  _analyzeSuccessRate(rate) {
    const r = parseFloat(rate);
    if (r > 90) return '🎉 Excellent!';
    if (r > 75) return '✅ Good';
    if (r > 60) return '⚠️  Acceptable';
    return '❌ Poor - review AI responses';
  }
}

module.exports = Stage2FindWebsites;

