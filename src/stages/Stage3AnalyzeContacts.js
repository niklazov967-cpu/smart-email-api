/**
 * Stage 3: Анализ контактов на сайте
 * Извлекает email адреса со страниц контактов
 */
const TagExtractor = require('../utils/TagExtractor');

class Stage3AnalyzeContacts {
  constructor(sonarClient, settingsManager, database, logger) {
    this.sonar = sonarClient;
    this.settings = settingsManager;
    this.db = database;
    this.logger = logger;
    this.tagExtractor = new TagExtractor();
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
    // Получить компании с сайтом, но без email И НЕ пропущенные
    // stage3_status должен быть NULL (не 'skipped', не 'completed', не 'failed')
    // current_stage должен быть >= 2 (Stage 2 завершен)
    const { data, error } = await this.db.supabase
      .from('pending_companies')
      .select('company_id, company_name, website, current_stage, stage3_status')
      .eq('session_id', sessionId)
      .not('website', 'is', null)
      .or('email.is.null,email.eq.""')
      .is('stage3_status', null) // Только те у кого Stage 3 еще не обработан
      .gte('current_stage', 2); // Минимум Stage 2 завершен
    
    if (error) {
      this.logger.error('Stage 3: Failed to get companies', { error: error.message });
      throw error;
    }
    
    this.logger.info(`Stage 3: Found ${data?.length || 0} companies ready for processing`, {
      total: data?.length || 0,
      sessionId
    });
    return data || [];
  }

  async _analyzeContacts(company, sessionId) {
    try {
      // Извлекаем главный домен из URL
      const mainDomain = this._extractMainDomain(company.website);
      
      const prompt = `Найди EMAIL-АДРЕС (НЕ ТЕЛЕФОН!) для этой компании через поиск в интернете:

КОМПАНИЯ: ${company.company_name}
ГЛАВНАЯ СТРАНИЦА САЙТА: ${mainDomain}
ИСХОДНЫЙ URL: ${company.website}

ЗАДАЧА:
Найди EMAIL на ГЛАВНОЙ СТРАНИЦЕ сайта (НЕ на конкретных статьях/блогах):
1. Открой ГЛАВНУЮ страницу: ${mainDomain}
2. Найди раздел "Contact Us" / "联系我们" / "关于我们" 
3. Проверь footer (подвал страницы) на главной странице
4. Если на главной странице нет - поищи через Google/Baidu: "site:${mainDomain} email" или "site:${mainDomain} 联系方式"
5. Дополнительно проверь отраслевые каталоги с названием компании "${company.company_name}"
6. Проверь профили в LinkedIn, Facebook по названию компании
7. Найди ТОЛЬКО EMAIL-АДРЕСА (формат: xxx@yyy.zzz)

КРИТИЧЕСКИ ВАЖНО - ГДЕ ИСКАТЬ:
✅ ГЛАВНАЯ страница сайта ${mainDomain} (НЕ статьи, НЕ блоги!)
✅ Страница "Contact Us" / "联系我们" на официальном сайте
✅ Footer (подвал) главной страницы
✅ Отраслевые каталоги и справочники (например: 中国机械企业名录)
✅ Профили в соцсетях (LinkedIn, Facebook)
✅ Контактная информация в поисковой выдаче Google/Baidu

❌ НЕ ИСКАТЬ:
   - На маркетплейсах (Alibaba, 1688, Made-in-China) - там НЕТ email!
   - На страницах блогов/статей - там только общая информация
   - На страницах товаров - там нет контактов

ФОРМАТ EMAIL:
- Нужен ТОЛЬКО EMAIL в формате: something@domain.com
- НЕ ТЕЛЕФОН! НЕ номера с +86, не номера вида 123-456-7890

РЕЗУЛЬТАТ: JSON формат:
{
  "emails": ["email@example.com", "sales@company.cn"],
  "source": "где нашел (главная страница/contact us/footer/каталог/LinkedIn)",
  "found_in": "internet search",
  "note": "источник информации (укажи конкретный URL если найден)"
}

ВНИМАНИЕ: 
- В массиве "emails" должны быть ТОЛЬКО email-адреса с символом @, БЕЗ телефонов!
- Ищи на ГЛАВНОЙ странице ${mainDomain}, а не на ${company.website}!

Если не найдено: {"emails": [], "note": "детальное объяснение где искал и почему не нашел"}

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
        
        // Подготовить raw data для Stage 3
        const rawData = {
          company: company.company_name,
          full_response: response ? response.substring(0, 10000) : null,
          timestamp: new Date().toISOString(),
          source: 'perplexity_sonar_pro',
          search_type: 'direct'
        };
        
        const { error: updateError } = await this.db.supabase
          .from('pending_companies')
          .update({
            email: primaryEmail,
            contacts_json: result,
            stage: 'contacts_found',
            stage3_status: 'completed',
            current_stage: 3, // Готов для Stage 4
            stage3_raw_data: rawData,
            updated_at: new Date().toISOString()
          })
          .eq('company_id', company.company_id);

        if (updateError) {
          this.logger.error('Stage 3: Failed to update email', {
            company: company.company_name,
            error: updateError.message
          });
        }

        this.logger.info('Stage 3: Email found', {
          company: company.company_name,
          email: primaryEmail,
          emailCount: result.emails.length,
          source: result.source
        });

        return { success: true, emails: result.emails };
      } else {
        // Отметить как обработано без контактов
        const rawDataNoEmail = {
          company: company.company_name,
          full_response: response ? response.substring(0, 10000) : null,
          timestamp: new Date().toISOString(),
          source: 'perplexity_sonar_pro',
          search_type: 'direct',
          result: 'not_found'
        };
        
        const { error: updateError } = await this.db.supabase
          .from('pending_companies')
          .update({
            contacts_json: { emails: [], note: result.note || 'No contacts found' },
            stage: 'site_analyzed',
            stage3_status: 'failed',
            current_stage: 2, // Остается на Stage 2 (нет email)
            stage3_raw_data: rawDataNoEmail,
            updated_at: new Date().toISOString()
          })
          .eq('company_id', company.company_id);

        if (updateError) {
          this.logger.error('Stage 3: Failed to update (no email)', {
            company: company.company_name,
            error: updateError.message
          });
        }

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
        
        // Подготовить raw data для Stage 3 (fallback search)
        const rawData = {
          company: company.company_name,
          full_response: response ? response.substring(0, 10000) : null,
          timestamp: new Date().toISOString(),
          source: 'perplexity_sonar_pro',
          search_type: 'fallback'
        };
        
        const { error: updateError } = await this.db.supabase
          .from('pending_companies')
          .update({
            email: primaryEmail,
            contacts_json: { ...result, fallback: true },
            stage: 'contacts_found',
            stage3_raw_data: rawData,
            updated_at: new Date().toISOString()
          })
          .eq('company_id', company.company_id);

        if (updateError) {
          this.logger.error('Stage 3: Failed to update (fallback)', {
            company: company.company_name,
            error: updateError.message
          });
        }

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
      
      // Фильтровать emails, удаляя телефоны и невалидные адреса
      let emails = Array.isArray(data.emails) ? data.emails : [];
      emails = emails.filter(email => this._isValidEmail(email));
      
      // Фильтровать по домену: оставить только один email с одного домена
      emails = this._filterEmailsByDomain(emails);
      
      return {
        emails: emails,
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

  _filterEmailsByDomain(emails) {
    if (emails.length === 0) {
      return emails;
    }

    // Группировать email по доменам
    const domainMap = new Map();
    
    for (const email of emails) {
      const domain = this._extractDomain(email);
      if (!domain) continue;
      
      if (!domainMap.has(domain)) {
        domainMap.set(domain, []);
      }
      domainMap.get(domain).push(email);
    }

    // Для каждого домена выбрать один email (приоритетный)
    const filteredEmails = [];
    for (const [domain, emailList] of domainMap.entries()) {
      const bestEmail = this._selectBestEmail(emailList);
      filteredEmails.push(bestEmail);
      
      if (emailList.length > 1) {
        this.logger.debug('Stage 3: Multiple emails from same domain', {
          domain,
          allEmails: emailList,
          selected: bestEmail
        });
      }
    }

    return filteredEmails;
  }

  _extractDomain(email) {
    const match = email.match(/@(.+)$/);
    return match ? match[1].toLowerCase() : null;
  }

  _selectBestEmail(emails) {
    if (emails.length === 1) {
      return emails[0];
    }

    // Приоритет: info > sales > contact > service > другие
    const priorities = ['info', 'sales', 'contact', 'service', 'enquiry', 'inquiry'];
    
    for (const priority of priorities) {
      const found = emails.find(email => 
        email.toLowerCase().startsWith(priority + '@')
      );
      if (found) {
        return found;
      }
    }

    // Если нет приоритетных, вернуть первый
    return emails[0];
  }

  _isValidEmail(email) {
    if (!email || typeof email !== 'string') {
      return false;
    }
    
    // Trim whitespace
    email = email.trim();
    
    // Проверка на телефон (различные форматы)
    // +86 139 1234 5678, 86-139-1234-5678, 13912345678, +8613912345678
    const phonePatterns = [
      /^\+?\d{10,15}$/,              // Только цифры (с + или без)
      /^\+?\d[\d\s\-().]{8,}$/,      // Цифры с разделителями
      /^\d{3,4}[-\s]?\d{4}[-\s]?\d{4}$/,  // Китайские мобильные
      /^\+?86[-\s]?\d{3,4}[-\s]?\d{4}[-\s]?\d{4}$/  // +86 формат
    ];
    
    for (const pattern of phonePatterns) {
      if (pattern.test(email)) {
        this.logger.debug('Stage 3: Filtered out phone number', { value: email });
        return false;
      }
    }
    
    // Проверка на "mailto:" префикс
    if (email.toLowerCase().startsWith('mailto:')) {
      email = email.substring(7);
    }
    
    // Базовая проверка формата email
    const emailRegex = /^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    if (!emailRegex.test(email)) {
      this.logger.debug('Stage 3: Invalid email format', { value: email });
      return false;
    }
    
    // Дополнительные проверки
    // Проверка что после @ есть точка с доменом
    const parts = email.split('@');
    if (parts.length !== 2) {
      return false;
    }
    
    const localPart = parts[0].toLowerCase();
    const domain = parts[1];
    
    // Фильтр generic/non-useful emails (securities@, pr@, service@, noreply@, etc.)
    const genericPrefixes = [
      'noreply', 'no-reply', 'donotreply', 
      'securities', 'ir', 'investor', 'relations',
      'pr', 'press', 'media', 'news',
      'hr', 'recruitment', 'jobs', 'career',
      'legal', 'compliance', 'admin', 'webmaster',
      'postmaster', 'hostmaster', 'abuse',
      'marketing', 'advertising', 'promo',
      'support-cn', 'support-zh'  // Общий саппорт
    ];
    
    for (const prefix of genericPrefixes) {
      if (localPart === prefix || localPart.startsWith(prefix + '.') || localPart.startsWith(prefix + '_')) {
        this.logger.debug('Stage 3: Filtered out generic email', { value: email, reason: `generic prefix: ${prefix}` });
        return false;
      }
    }
    
    // Домен должен содержать точку и быть валидным
    if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
      this.logger.debug('Stage 3: Invalid domain', { value: email, domain });
      return false;
    }
    
    // Проверка что это не слишком короткий email (возможно, ошибка)
    if (localPart.length < 2 || domain.length < 4) {
      this.logger.debug('Stage 3: Email too short', { value: email });
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
      this.logger.error('Stage 3: Failed to extract domain', { url, error: error.message });
      return url;
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Stage3AnalyzeContacts;

