const axios = require('axios');
const domainPriorityManager = require('../utils/DomainPriorityManager');

/**
 * Stage3Retry - Повторный поиск email используя DeepSeek
 * 
 * Для компаний, которые прошли Stage 3, но не получили email.
 * Использует DeepSeek Chat с более агрессивным промптом.
 */
class Stage3Retry {
  constructor(db, logger, settings, deepseek) {
    this.db = db;
    this.logger = logger;
    this.settings = settings;
    this.deepseek = deepseek;
    this.domainPriority = domainPriorityManager;
    this.globalProgressCallback = null; // Callback для global прогресса (SSE)
    this.progressOffset = 0; // Начальный offset для прогресса
  }

  /**
   * Установить callback для global прогресса (SSE)
   */
  setGlobalProgressCallback(callback) {
    this.globalProgressCallback = callback;
  }

  /**
   * Установить начальный offset для прогресса (сколько уже обработано в Stage 3)
   */
  setProgressOffset(offset) {
    this.progressOffset = offset;
  }

  async execute() {
    this.logger.info('Stage 3 Retry: Starting retry for companies without email');
    console.log('\n════════════════════════════════════════════');
    console.log('🔄 STAGE 3 RETRY: DeepSeek Email Search');
    console.log('════════════════════════════════════════════\n');

    try {
      // Получить компании готовые для повторного поиска
      const companies = await this._getCompanies();
      
      if (companies.length === 0) {
        this.logger.info('Stage 3 Retry: No companies need retry');
        console.log('ℹ️  No companies found for retry');
        console.log('   All companies either have email or lack sufficient data\n');
        return {
          success: true,
          total: 0,
          found: 0
        };
      }

      this.logger.info('Stage 3 Retry: Processing companies', {
        count: companies.length
      });

      console.log(`\n✅ Found ${companies.length} companies to retry`);
      console.log('   Starting email search with DeepSeek...\n');

      // Обновить total в GlobalProgressEmitter (если callback установлен)
      // Новый total = offset (уже обработано в Stage 3) + companies.length (будет обработано в retry)
      if (this.globalProgressCallback && this.globalProgressCallback.updateTotal) {
        const newTotal = this.progressOffset + companies.length;
        console.log(`   Updating total: ${newTotal} (${this.progressOffset} + ${companies.length})`);
        this.globalProgressCallback.updateTotal(newTotal);
      }

      let found = 0;
      let processedCount = this.progressOffset; // Начать с offset

      // Обрабатывать последовательно (DeepSeek медленнее)
      for (let i = 0; i < companies.length; i++) {
        const company = companies[i];
        console.log(`   [${i + 1}/${companies.length}] ${company.company_name}...`);
        
        // Обновить global прогресс ПЕРЕД обработкой
        if (this.globalProgressCallback) {
          this.globalProgressCallback(processedCount, company.company_name);
        }
        
        const result = await this._retryEmailSearch(company);
        if (result.success && result.email) {
          found++;
          console.log(`      ✅ Email found: ${result.email}`);
        } else {
          console.log(`      ❌ No email found`);
        }
        
        processedCount++;
        
        // Обновить global прогресс ПОСЛЕ обработки
        if (this.globalProgressCallback) {
          this.globalProgressCallback(processedCount, null);
        }
        
        // Пауза между запросами
        await this._sleep(2000);
      }

      this.logger.info('Stage 3 Retry: Completed', {
        total: companies.length,
        found,
        notFound: companies.length - found
      });

      console.log('\n════════════════════════════════════════════');
      console.log('📊 STAGE 3 RETRY SUMMARY');
      console.log('════════════════════════════════════════════');
      console.log(`Total Retried: ${companies.length}`);
      console.log(`Emails Found: ${found} (${(found/companies.length*100).toFixed(1)}%)`);
      console.log(`Still Missing: ${companies.length - found}`);
      console.log('════════════════════════════════════════════\n');

      return {
        success: true,
        total: companies.length,
        found
      };

    } catch (error) {
      this.logger.error('Stage 3 Retry: Failed', {
        error: error.message,
        stack: error.stack
      });
      console.error('❌ Stage 3 Retry ERROR:', error.message);
      console.error('   Stack:', error.stack);
      throw error;
    }
  }

  async _getCompanies() {
    // Получить компании которые:
    // 1. Прошли Stage 3 (stage3_status = 'failed') ИЛИ не имеют сайта вообще
    // 2. НЕ имеют email
    // 3. Имеют хоть какую-то информацию (описание или тема)
    
    console.log('\n🔍 Stage 3 Retry: Searching for companies...');
    
    const { data, error } = await this.db.supabase
      .from('pending_companies')
      .select('company_id, company_name, website, description, topic_description, stage3_status, current_stage, email')
      .or('email.is.null,email.eq.""')
      .or(
        // Компании после Stage 3 без email
        'stage3_status.eq.failed,' +
        // ИЛИ компании без сайта (Stage 2 провалился)
        'and(website.is.null,stage2_status.eq.failed),' +
        // ИЛИ компании только с названием (Stage 1 completed, но нет сайта)
        'and(website.is.null,stage1_status.eq.completed)'
      );
    
    if (error) {
      this.logger.error('Stage 3 Retry: Failed to get companies', { 
        error: error.message 
      });
      console.error('❌ Stage 3 Retry: Database error:', error.message);
      throw error;
    }
    
    console.log(`   Found ${data?.length || 0} companies matching criteria`);
    
    // Фильтровать компании с минимальной информацией
    const filtered = (data || []).filter(company => {
      // Нужно хоть что-то: сайт, описание или тема
      return company.website || company.description || company.topic_description;
    });
    
    console.log(`   After filtering: ${filtered.length} companies`);
    console.log(`   - With website: ${filtered.filter(c => c.website).length}`);
    console.log(`   - Without website: ${filtered.filter(c => !c.website).length}`);
    
    this.logger.info(`Stage 3 Retry: Found ${filtered.length} companies for retry`, {
      totalMatched: data?.length || 0,
      withWebsite: filtered.filter(c => c.website).length,
      withoutWebsite: filtered.filter(c => !c.website).length
    });
    
    return filtered;
  }

  async _retryEmailSearch(company) {
    this.logger.info('Stage 3 Retry: Searching email with DeepSeek', {
      company: company.company_name,
      website: company.website || 'NO WEBSITE',
      hasDescription: !!company.description
    });

    // ПОПЫТКА 1
    let result = await this._attemptEmailSearch(company, 1);
    if (result.success) {
      return result;
    }

    // ПОПЫТКА 2: Если первая не удалась
    console.log(`      🔄 Attempt 2/2 with aggressive search...`);
    this.logger.info('Stage 3 Retry: Second attempt', {
      company: company.company_name
    });
    
    result = await this._attemptEmailSearch(company, 2);
    return result;
  }

  async _attemptEmailSearch(company, attemptNumber) {
    try {
      // Разный промпт для компаний с сайтом и без
      let prompt;
      
      if (company.website) {
        // Промпт для компаний С сайтом
        const searchStrategy = attemptNumber === 1
          ? `1. Найди в интернете ОФИЦИАЛЬНЫЙ EMAIL этой компании
2. Проверь страницы: Contact Us, 联系我们, About, Footer
3. Ищи в: отраслевых каталогах, новостях, упоминаниях компании
4. Приоритет: info@, sales@, contact@, service@`
          : `1. АГРЕССИВНЫЙ ПОИСК через ВСЕ доступные источники
2. Проверь ПОДСТРАНИЦЫ сайта: /about, /contact-us, /team, /en/contact
3. Поиск email в HTML коде, картинках, PDF файлах на сайте
4. Ищи через Wayback Machine (archive.org) старые версии сайта
5. Google: "site:${company.website} email OR contact"
6. Ищи email сотрудников через LinkedIn`;

        prompt = `Тебе нужно найти корпоративный EMAIL-АДРЕС для китайской компании.

КОМПАНИЯ: ${company.company_name}
ВЕБ-САЙТ: ${company.website}
ОПИСАНИЕ: ${company.description || 'Нет описания'}
ТЕМА: ${company.topic_description || 'Услуги обработки металла'}

ТВОЯ ЗАДАЧА (попытка ${attemptNumber}/2):
${searchStrategy}

КРИТИЧЕСКИ ВАЖНО:
❌ НЕ возвращай телефоны! Только EMAIL!
❌ НЕ ищи на маркетплейсах (Alibaba, 1688)!
✅ Только корпоративный email с доменом компании

ФОРМАТ ОТВЕТА (ТОЛЬКО JSON):
{
  "email": "найденный@email.com или null",
  "source": "где нашел (напр: 'официальный сайт, раздел Contact')",
  "confidence": "high/medium/low"
}

Верни ТОЛЬКО JSON, без комментариев!`;
      } else {
        // Промпт для компаний БЕЗ сайта - ищем через каталоги и базы
        const searchStrategy = attemptNumber === 1
          ? `1. Ищи компанию в отраслевых каталогах и справочниках:
   - 中国机械企业名录
   - 中国制造网
   - 企查查 (qichacha.com)
   - 天眼查 (tianyancha.com)
   - Baidu企业信用

2. Ищи упоминания компании в новостях и статьях

3. Проверь профили в LinkedIn, Facebook, WeChat Official Accounts

4. Ищи через Google/Baidu: "公司名称 + 联系方式" или "公司名称 + email"

5. Приоритет email: info@, sales@, contact@, service@`
          : `1. МАКСИМАЛЬНО АГРЕССИВНЫЙ ПОИСК:
   - Поиск через все возможные каталоги (Chinese Yellow Pages, 中华企业录)
   - Проверь trade show участников (Canton Fair, exhibitions)
   - Ищи через отраслевые ассоциации
   - Проверь patent databases (patents.google.com) - там могут быть контакты
   - LinkedIn поиск сотрудников компании
   - Поиск через Bing, DuckDuckGo (не только Google/Baidu)
   
2. Ищи вариации названия компании

3. Проверь связанные компании и дочерние предприятия`;

        prompt = `Тебе нужно найти корпоративный EMAIL-АДРЕС для китайской компании БЕЗ известного сайта.

КОМПАНИЯ: ${company.company_name}
ОПИСАНИЕ: ${company.description || 'Нет описания'}
ТЕМА: ${company.topic_description || 'Услуги обработки металла'}
СТАТУС: Официальный сайт не найден

ТВОЯ ЗАДАЧА (попытка ${attemptNumber}/2):
${searchStrategy}

КРИТИЧЕСКИ ВАЖНО:
❌ НЕ возвращай телефоны! Только EMAIL!
❌ НЕ ищи на маркетплейсах (Alibaba, 1688, Made-in-China) - там нет email!
✅ Ищи email в каталогах, справочниках, новостях
✅ Корпоративный email с любым доменом (не обязательно домен компании)

ФОРМАТ ОТВЕТА (ТОЛЬКО JSON):
{
  "email": "найденный@email.com или null",
  "website": "https://company.cn или null",
  "source": "где нашел (напр: '天眼查 каталог' или 'новость на Baidu')",
  "confidence": "high/medium/low"
}

ДОПОЛНИТЕЛЬНО:
- Если в каталоге/профиле есть website компании - верни его
- Website может быть указан рядом с email

Верни ТОЛЬКО JSON, без комментариев!`;
      }

      // Использовать DeepSeek Chat для поиска
      const response = await this.deepseek.query(prompt, {
        maxTokens: 500,
        temperature: attemptNumber === 1 ? 0.3 : 0.6, // Больше креативности во 2-й попытке
        systemPrompt: 'You are an expert at finding corporate contact information. You have access to web search and can find emails on company websites and business directories.',
        stage: 'stage3_retry'
      });

      // Парсить JSON ответ
      const result = this._parseResponse(response);
      
      if (result.email) {
        // Валидировать email
        if (this._isValidEmail(result.email)) {
          // Подготовить данные для обновления
          const updateData = {
            email: result.email,
            stage3_status: 'completed',
            current_stage: 3,
            stage3_raw_data: {
              source: 'deepseek_retry',
              response: response.substring(0, 1000),
              confidence: result.confidence,
              timestamp: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          };
          
          // 🎁 BONUS: Если DeepSeek случайно нашел website
          let websiteWasAdded = false;
          if (result.website && this._isValidWebsite(result.website)) {
            let finalWebsite = result.website;
            let normalizedDomain = this._extractMainDomain(result.website);
            let shouldUpdate = false;
            
            if (!company.website) {
              // У компании нет website → добавить
              shouldUpdate = true;
              this.logger.warn('🎁 BONUS: Website found opportunistically in Stage 3 Retry', {
                company: company.company_name,
                website: result.website,
                normalized_domain: normalizedDomain,
                source: result.source
              });
            } else {
              // У компании уже есть website → проверить TLD
              const isSameCompany = this.domainPriority.isSameCompany(
                company.website,
                result.website
              );
              
              if (isSameCompany) {
                // Та же компания → сравнить TLD
                const comparison = this.domainPriority.compare(
                  result.website,
                  company.website
                );
                
                if (comparison < 0) {
                  // Новый TLD лучше
                  shouldUpdate = true;
                  finalWebsite = result.website;
                  normalizedDomain = this._extractMainDomain(result.website);
                  this.logger.info('Stage 3 Retry: Better TLD found opportunistically', {
                    company: company.company_name,
                    oldDomain: company.website,
                    oldTLD: this.domainPriority.extractTld(company.website),
                    newDomain: result.website,
                    newTLD: this.domainPriority.extractTld(result.website),
                    decision: 'UPDATE to better TLD'
                  });
                } else {
                  // Старый TLD лучше или равен
                  this.logger.debug('Stage 3 Retry: Keeping existing TLD', {
                    company: company.company_name,
                    existingDomain: company.website,
                    foundDomain: result.website,
                    decision: 'KEEP existing TLD'
                  });
                }
              } else {
                // Разные компании → обновить
                shouldUpdate = true;
                this.logger.info('Stage 3 Retry: Different domain found opportunistically', {
                  company: company.company_name,
                  oldBaseDomain: this.domainPriority.extractBaseDomain(company.website),
                  newBaseDomain: this.domainPriority.extractBaseDomain(result.website),
                  decision: 'UPDATE to new domain'
                });
              }
            }
            
            if (shouldUpdate) {
              updateData.website = finalWebsite;
              updateData.normalized_domain = normalizedDomain;
              websiteWasAdded = true;
              
              // ВАЖНО: Если нашли website в каталоге, но изначально не было сайта
              // Нужно пометить для повторного Stage 3 на этом новом сайте
              updateData.stage3_status = null; // Сбросить статус Stage 3
              updateData.current_stage = 2;     // Вернуть на Stage 2 (готов для Stage 3)
              this.logger.info('🔄 Stage 3 Retry: Website added from catalog, will retry Stage 3 on new website', {
                company: company.company_name,
                newWebsite: finalWebsite
              });
            }
          }
          
          // Сохранить найденный email (и возможно website)
          await this.db.supabase
            .from('pending_companies')
            .update(updateData)
            .eq('company_id', company.company_id);

          this.logger.info('Stage 3 Retry: Email found!', {
            company: company.company_name,
            email: result.email,
            website: result.website || 'not found',
            websiteAdded: websiteWasAdded,
            willRetryStage3: websiteWasAdded,
            confidence: result.confidence
          });

          return { success: true, email: result.email, website: result.website };
        } else {
          this.logger.warn('Stage 3 Retry: Invalid email format', {
            company: company.company_name,
            email: result.email
          });
        }
      }

      this.logger.info('Stage 3 Retry: No email found', {
        company: company.company_name
      });

      return { success: true, email: null };

    } catch (error) {
      this.logger.error('Stage 3 Retry: Error searching email', {
        company: company.company_name,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  _parseResponse(response) {
    try {
      // Убрать markdown если есть
      let jsonText = response.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }

      const parsed = JSON.parse(jsonText);
      return {
        email: parsed.email || null,
        website: parsed.website || null,
        source: parsed.source || 'unknown',
        confidence: parsed.confidence || 'low'
      };
    } catch (error) {
      this.logger.warn('Stage 3 Retry: Failed to parse JSON', {
        response: response.substring(0, 200)
      });
      
      // Попытка извлечь email из текста
      const emailMatch = response.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      return {
        email: emailMatch ? emailMatch[0] : null,
        source: 'text_extraction',
        confidence: 'low'
      };
    }
  }

  _isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    
    // Базовая валидация email
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) return false;
    
    // Проверить что это не телефон
    if (/^\d+@/.test(email)) return false;
    if (email.includes('+86')) return false;
    
    return true;
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
      this.logger.warn('Stage 3 Retry: Failed to extract domain', { url, error: error.message });
      return null;
    }
  }
  
  _isValidWebsite(url) {
    if (!url || typeof url !== 'string') return false;
    
    // Базовая валидация URL
    const urlRegex = /^https?:\/\/.+\..+$/;
    if (!urlRegex.test(url)) return false;
    
    // Фильтр маркетплейсов
    const blockedDomains = [
      'alibaba.com', '1688.com', 'made-in-china.com',
      'amazon.', 'ebay.', 'aliexpress.',
      'taobao.com', 'tmall.com', 'jd.com'
    ];
    
    const urlLower = url.toLowerCase();
    for (const blocked of blockedDomains) {
      if (urlLower.includes(blocked)) {
        return false;
      }
    }
    
    return true;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Stage3Retry;

