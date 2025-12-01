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
    this.globalProgressCallback = null; // Callback для global прогресса (SSE)
  }

  /**
   * Установить callback для global прогресса (SSE)
   */
  setGlobalProgressCallback(callback) {
    this.globalProgressCallback = callback;
  }

  async execute(sessionId = null) {
    // sessionId теперь опциональный - если не указан, обрабатываем ВСЕ компании
    this.logger.info('Stage 3: Starting contact analysis', { 
      sessionId: sessionId || 'ALL',
      mode: sessionId ? 'session' : 'global'
    });
    
    console.log('\n========== STAGE 3 STARTING ==========');
    console.log(`Mode: ${sessionId ? 'Session-based' : 'Global'}`);
    console.log(`Session ID: ${sessionId || 'ALL'}`);
    console.log('======================================\n');

    try {
      // Получить компании с найденными сайтами
      const companies = await this._getCompanies(sessionId);
      
      console.log(`\n✅ Found ${companies.length} companies ready for Stage 3`);
      if (companies.length > 0) {
        console.log('First 3 companies:', companies.slice(0, 3).map(c => ({
          name: c.company_name,
          website: c.website,
          stage2_status: c.stage2_status
        })));
      }
      console.log('');
      
      if (companies.length === 0) {
        this.logger.info('Stage 3: No companies need email search');
        console.log('⚠️  No companies need email search\n');
        return { success: true, processed: 0, found: 0 };
      }

      // Получить настройки
      const settings = await this.settings.getCategory('processing_stages');
      const concurrentRequests = settings.stage3_concurrent_requests || 2;
      const batchDelay = settings.stage3_batch_delay_ms || 5000; // Увеличено с 3000 до 5000 для избежания rate limit 429

      this.logger.info('Stage 3: Processing companies', {
        count: companies.length,
        concurrent: concurrentRequests,
        mode: sessionId ? 'session-based' : 'all-companies'
      });

      // Обработать батчами
      const results = [];
      let processedCount = 0;
      const totalCompanies = companies.length;
      
      for (let i = 0; i < companies.length; i += concurrentRequests) {
        const batch = companies.slice(i, i + concurrentRequests);
        
        // Обновить global прогресс перед обработкой
        if (this.globalProgressCallback) {
          this.globalProgressCallback(processedCount, batch[0]?.company_name);
        }
        
        this.logger.debug(`Stage 3: Processing batch ${Math.floor(i / concurrentRequests) + 1}`, {
          progress: `${processedCount}/${totalCompanies}`
        });

        // sessionId больше не нужен в _analyzeContacts
        const batchResults = await Promise.all(
          batch.map(company => this._analyzeContacts(company))
        );

        results.push(...batchResults);
        processedCount += batch.length;
        
        // Обновить global прогресс после обработки
        if (this.globalProgressCallback) {
          this.globalProgressCallback(processedCount, null);
        }

        if (i + concurrentRequests < companies.length) {
          await this._sleep(batchDelay);
        }
      }

      const successful = results.filter(r => r.success && r.emails && r.emails.length > 0).length;
      const failed = results.filter(r => !r.success || !r.emails || r.emails.length === 0).length;
      const hadFallback = results.filter(r => r.hadFallback).length;

      this.logger.info('Stage 3: Completed', {
        total: companies.length,
        foundContacts: successful,
        failed,
        hadFallback,
        sessionId: sessionId || 'ALL'
      });

      // Вывести результаты в консоль для немедленной диагностики
      console.log('\n========== STAGE 3 RESULTS ==========');
      console.log(`Total Companies: ${companies.length}`);
      console.log(`Email Found: ${successful} (${(successful/companies.length*100).toFixed(1)}%)`);
      console.log(`Email NOT Found: ${failed} (${(failed/companies.length*100).toFixed(1)}%)`);
      console.log(`Used Fallback: ${hadFallback}`);
      console.log('====================================\n');

      // Сохранить детальный отчет в файл
      try {
        await this._saveDetailedReport({
          sessionId: sessionId || 'ALL',
          total: companies.length,
          successful,
          failed,
          hadFallback,
          results
        });
      } catch (reportError) {
        this.logger.error('Stage 3: Failed to save report', {
          error: reportError.message,
          stack: reportError.stack
        });
        console.error('❌ Failed to save Stage 3 report:', reportError.message);
      }

      // 🔄 АВТОМАТИЧЕСКИЙ ЗАПУСК STAGE 3 RETRY
      // Если есть компании без email - запустить Stage 3 Retry автоматически
      console.log(`\n🔍 DEBUG: Checking if Stage 3 Retry should run...`);
      console.log(`   Failed count: ${failed}`);
      console.log(`   Condition (failed > 0): ${failed > 0}`);
      
      if (failed > 0) {
        console.log('\n🔄 Starting Stage 3 Retry automatically...');
        console.log(`   Companies without email: ${failed}`);
        
        try {
          console.log('   Loading Stage3Retry class...');
          const Stage3Retry = require('./Stage3Retry');
          const DeepSeekClient = require('../services/DeepSeekClient');
          
          console.log('   Creating DeepSeek client...');
          // Создать DeepSeek клиент
          const deepseekApiKey = process.env.DEEPSEEK_API_KEY || 'sk-85323bc753cb4b25b02a2664e9367f8a';
          console.log(`   DeepSeek API key exists: ${!!deepseekApiKey} (length: ${deepseekApiKey?.length || 0})`);
          const deepseekClient = new DeepSeekClient(deepseekApiKey, this.logger, 'chat');
          
          console.log('   Creating Stage3Retry instance...');
          // Создать Stage3Retry
          const stage3Retry = new Stage3Retry(
            this.db,
            this.logger,
            this.settings,
            deepseekClient
          );
          
          // Передать globalProgressCallback в Stage3Retry
          if (this.globalProgressCallback) {
            console.log('   Setting global progress callback for Stage3Retry...');
            stage3Retry.setGlobalProgressCallback(this.globalProgressCallback);
            // Передать текущий прогресс (processedCount) как offset
            console.log(`   Setting progress offset to ${processedCount} (already processed in Stage 3)`);
            stage3Retry.setProgressOffset(processedCount);
          }
          
          console.log('   Executing Stage 3 Retry...');
          // Запустить retry
          const retryResult = await stage3Retry.execute();
          
          console.log('\n========== STAGE 3 RETRY RESULTS ==========');
          console.log(`Total Companies Retried: ${retryResult.total}`);
          console.log(`Additional Emails Found: ${retryResult.found}`);
          console.log(`Still No Email: ${retryResult.total - retryResult.found}`);
          console.log('===========================================\n');
          
          this.logger.info('Stage 3 Retry: Completed automatically', {
            retriedCompanies: retryResult.total,
            additionalEmailsFound: retryResult.found
          });
          
          // Обновить статистику
          return {
            success: true,
            processed: companies.length,
            found: successful + retryResult.found,
            stage3Found: successful,
            retryFound: retryResult.found,
            totalFailed: failed - retryResult.found
          };
          
        } catch (retryError) {
          this.logger.error('Stage 3 Retry: Failed to execute automatically', {
            error: retryError.message,
            stack: retryError.stack
          });
          console.error('❌ Stage 3 Retry failed:', retryError.message);
          console.error('   Stack trace:', retryError.stack);
          // Продолжаем даже если retry упал
        }
      } else {
        console.log('   ℹ️ Skipping Stage 3 Retry - all companies have email');
      }

      return {
        success: true,
        processed: companies.length,
        found: successful
      };

    } catch (error) {
      this.logger.error('Stage 3: Failed', {
        error: error.message,
        sessionId: sessionId || 'ALL'
      });
      throw error;
    }
  }

  async _getCompanies(sessionId = null) {
    // ИСПРАВЛЕНО: Получить компании готовые для Stage 3
    // Условия:
    // 1. Есть сайт (website IS NOT NULL)
    // 2. Нет email (email IS NULL или пустой)
    // 3. Stage 3 еще не обработан (stage3_status IS NULL)
    // 4. Stage 2 завершен ИЛИ пропущен (stage2_status = 'completed' OR 'skipped')
    
    let query = this.db.supabase
      .from('pending_companies')
      .select('company_id, company_name, website, current_stage, stage2_status, stage3_status')
      .not('website', 'is', null)  // Есть сайт
      .or('email.is.null,email.eq.""')  // Нет email
      .is('stage3_status', null)  // Stage 3 не обработан
      .in('stage2_status', ['completed', 'skipped']);  // Stage 2 завершен или пропущен
    
    // Если указан sessionId, фильтруем только эту сессию
    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      this.logger.error('Stage 3: Failed to get companies', { error: error.message });
      throw error;
    }
    
    this.logger.info(`Stage 3: Found ${data?.length || 0} companies ready for processing`, {
      total: data?.length || 0,
      withSkippedStage2: data?.filter(c => c.stage2_status === 'skipped').length || 0,
      sessionId: sessionId || 'ALL'
    });
    return data || [];
  }

  async _analyzeContacts(company) {
    // sessionId больше не нужен - компания уже имеет session_id
    try {
      console.log(`\n🔍 Processing company: ${company.company_name}`);
      console.log(`   Website: ${company.website}`);
      
      // Извлекаем главный домен из URL
      const mainDomain = this._extractMainDomain(company.website);
      console.log(`   Main domain: ${mainDomain}`);
      
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

      console.log(`   🤖 Sending query to Perplexity AI...`);
      
      const response = await this.sonar.query(prompt, {
        stage: 'stage3_analyze_contacts',
        useCache: false  // Отключаем кэш для свежих результатов
      });
      
      if (!response) {
        console.log(`   ⚠️  WARNING: Got empty response from Perplexity!`);
        this.logger.warn('Stage 3: Empty response from Perplexity', {
          company: company.company_name,
          website: company.website
        });
      }
      
      console.log(`   ✅ Got AI response (${response ? response.length : 0} chars)`);

      this.logger.info('Stage 3: Sonar response received', {
        company: company.company_name,
        responseLength: response ? response.length : 0,
        hasResponse: !!response
      });

      const result = this._parseResponse(response);
      
      console.log(`   📧 Emails found: ${result.emails.length}`);
      if (result.emails.length > 0) {
        console.log(`   ✉️  ${result.emails.join(', ')}`);
      } else {
        console.log(`   ❌ No emails: ${result.note || 'Unknown reason'}`);
      }
      
      // 🎁 BONUS: Проверка на случайно найденный website
      if (result.website) {
        console.log(`   🌐 BONUS: Website found: ${result.website}`);
      }

      this.logger.info('Stage 3: Response parsed', {
        company: company.company_name,
        emailsFound: result.emails.length,
        emails: result.emails,
        source: result.source,
        note: result.note
      });

      if (result.emails.length > 0) {
        // Сохранить первый найденный email в колонку email
        const primaryEmail = result.emails[0];
        
        // Подготовить raw data для Stage 3
        const rawData = {
          company: company.company_name,
          full_response: response ? response.substring(0, 10000) : 'No response from AI',
          timestamp: new Date().toISOString(),
          source: 'perplexity_sonar_pro',
          search_type: 'direct'
        };
        
        // Подготовить данные для обновления
        const updateData = {
          email: primaryEmail,
          contacts_json: result,
          stage: 'contacts_found',
          stage3_status: 'completed',
          current_stage: 3, // Готов для Stage 4
          stage3_raw_data: rawData,
          updated_at: new Date().toISOString()
        };
        
        // 🎁 BONUS: Если Perplexity случайно нашел правильный website И у компании его еще нет
        let websiteWasAdded = false;
        if (result.website && !company.website) {
          updateData.website = result.website;
          // НОВОЕ: Извлечь normalized_domain для дедупликации
          updateData.normalized_domain = this._extractMainDomain(result.website);
          websiteWasAdded = true;
          this.logger.warn('🎁 BONUS: Website found opportunistically in Stage 3', {
            company: company.company_name,
            website: result.website,
            normalized_domain: updateData.normalized_domain,
            source: result.source || 'perplexity search'
          });
          
          // ВАЖНО: Если нашли website, но изначально не было email
          // Нужно пометить для повторного Stage 3 на этом новом сайте
          if (!company.email) {
            updateData.stage3_status = null; // Сбросить статус Stage 3
            updateData.current_stage = 2;     // Вернуть на Stage 2 (готов для Stage 3)
            this.logger.info('🔄 Stage 3: Website added without original website, will retry Stage 3', {
              company: company.company_name,
              newWebsite: result.website
            });
          }
        }
        
        const { error: updateError } = await this.db.supabase
          .from('pending_companies')
          .update(updateData)
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
          website: result.website || 'not found',
          websiteAdded: websiteWasAdded,
          willRetryStage3: websiteWasAdded && !company.email,
          source: result.source
        });

        return { 
          success: true, 
          emails: result.emails,
          website: result.website,
          company_name: company.company_name,
          note: result.note
        };
      } else {
        // Отметить как обработано без контактов
        const rawDataNoEmail = {
          company: company.company_name,
          full_response: response ? response.substring(0, 10000) : 'No response from AI',
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

        return { 
          success: true, 
          emails: [],
          company_name: company.company_name,
          website: company.website,
          note: result.note || 'No contacts found'
        };
      }

    } catch (error) {
      this.logger.error('Stage 3: Error analyzing contacts', {
        company: company.company_name,
        error: error.message
      });
      return { 
        success: false, 
        emails: [], 
        error: error.message,
        company_name: company.company_name,
        website: company.website,
        note: `Error: ${error.message}`
      };
    }
  }

  async _fallbackEmailSearch(company) {
    // sessionId больше не нужен
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
        useCache: false  // КЭШ ОТКЛЮЧЕН
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

  /**
   * Извлечь главный домен из URL для дедупликации
   * https://www.example.com/path → example.com
   */
  _extractMainDomain(url) {
    if (!url) return null;
    
    try {
      // Добавить протокол если его нет
      let fullUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        fullUrl = 'https://' + url;
      }
      
      const urlObj = new URL(fullUrl);
      let hostname = urlObj.hostname.toLowerCase();
      
      // Убрать www
      hostname = hostname.replace(/^www\./, '');
      
      return hostname;
    } catch (error) {
      this.logger.warn('Stage 3: Failed to extract domain', { url, error: error.message });
      return null;
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
        website: data.website || null,
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

  /**
   * Сохранить детальный отчет о прохождении Stage 3 в файл
   */
  async _saveDetailedReport(stats) {
    const fs = require('fs').promises;
    const path = require('path');
    
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const reportPath = path.join(__dirname, '../../logs', `stage3-report-${timestamp}.txt`);
    
    const report = `
╔═══════════════════════════════════════════════════════════════╗
║           STAGE 3 DETAILED REPORT - ${new Date().toLocaleString('ru-RU')}          ║
╚═══════════════════════════════════════════════════════════════╝

SESSION ID: ${stats.sessionId}
COMPANIES PROCESSED: ${stats.total}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 OVERALL STATISTICS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Email Found:             ${stats.successful} (${(stats.successful / stats.total * 100).toFixed(1)}%)
❌ Email NOT Found:         ${stats.failed} (${(stats.failed / stats.total * 100).toFixed(1)}%)
🔄 Used Fallback Search:    ${stats.hadFallback} (${(stats.hadFallback / stats.total * 100).toFixed(1)}%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 DETAILED RESULTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${stats.results.map((r, idx) => {
  if (r.success && r.emails && r.emails.length > 0) {
    return `${idx + 1}. ✅ SUCCESS: ${r.company || 'Unknown'}
   Website: ${r.website || 'N/A'}
   Emails Found: ${r.emails.join(', ')}
   Source: ${r.source || 'N/A'}
   ${r.hadFallback ? '🔄 Used Fallback' : ''}`;
  } else {
    return `${idx + 1}. ❌ FAILED: ${r.company || 'Unknown'}
   Website: ${r.website || 'N/A'}
   Reason: ${r.reason || r.note || 'No email found'}
   ${r.hadFallback ? '🔄 Tried Fallback - still failed' : ''}`;
  }
}).join('\n\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 ANALYSIS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Success Rate: ${(stats.successful / stats.total * 100).toFixed(1)}% - ${this._analyzeEmailSuccessRate((stats.successful / stats.total * 100).toFixed(1))}

Fallback Usage: ${(stats.hadFallback / stats.total * 100).toFixed(1)}% - ${stats.hadFallback > 0 ? '⚠️  Primary search struggling' : '✅ Primary search working well'}

Recommendations:
${stats.successful < stats.total * 0.3 ? '❌ CRITICAL: Only ' + (stats.successful / stats.total * 100).toFixed(1) + '% emails found!\n   - Consider using DeepSeek Retry for failed companies\n   - Review prompt effectiveness\n   - Check if websites have contact pages' : ''}
${stats.successful >= stats.total * 0.3 && stats.successful < stats.total * 0.6 ? '⚠️  Moderate success rate\n   - Some companies need retry\n   - Consider improving prompts' : ''}
${stats.successful >= stats.total * 0.6 ? '✅ Good performance!\n   - Stage 3 working as expected' : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    try {
      await fs.writeFile(reportPath, report, 'utf8');
      this.logger.info(`Stage 3: Detailed report saved to ${reportPath}`);
    } catch (error) {
      this.logger.error(`Stage 3: Failed to save report: ${error.message}`);
    }
  }

  _analyzeEmailSuccessRate(rate) {
    const r = parseFloat(rate);
    if (r > 60) return '🎉 Excellent!';
    if (r > 40) return '✅ Good';
    if (r > 20) return '⚠️  Poor - needs improvement';
    return '🚨 Critical - review approach';
  }
}

module.exports = Stage3AnalyzeContacts;

