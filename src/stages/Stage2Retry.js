const axios = require('axios');

/**
 * Stage2Retry - Повторный поиск веб-сайтов используя DeepSeek
 * 
 * Для компаний, которые прошли Stage 2, но не получили website.
 * Использует DeepSeek Chat с более агрессивным промптом для поиска через китайские каталоги.
 */
class Stage2Retry {
  constructor(db, logger, settings, deepseek) {
    this.db = db;
    this.logger = logger;
    this.settings = settings;
    this.deepseek = deepseek;
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
   * Установить начальный offset для прогресса (сколько уже обработано в Stage 2)
   */
  setProgressOffset(offset) {
    this.progressOffset = offset;
  }

  async execute() {
    this.logger.info('Stage 2 Retry: Starting retry for companies without website');
    console.log('\n════════════════════════════════════════════');
    console.log('🔄 STAGE 2 RETRY: DeepSeek Website Search');
    console.log('════════════════════════════════════════════\n');

    try {
      // Получить компании готовые для повторного поиска
      const companies = await this._getCompanies();
      
      if (companies.length === 0) {
        this.logger.info('Stage 2 Retry: No companies need retry');
        console.log('ℹ️  No companies found for retry');
        console.log('   All companies either have website or lack sufficient data\n');
        return {
          success: true,
          total: 0,
          found: 0
        };
      }

      this.logger.info('Stage 2 Retry: Processing companies', {
        count: companies.length
      });

      console.log(`\n✅ Found ${companies.length} companies to retry`);
      console.log('   Starting website search with DeepSeek...\n');

      // Обновить total в GlobalProgressEmitter (если callback установлен)
      // Новый total = offset (уже обработано в Stage 2) + companies.length (будет обработано в retry)
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
        
        const result = await this._retryWebsiteSearch(company);
        if (result.success && result.website) {
          found++;
          console.log(`      ✅ Website found: ${result.website}`);
        } else {
          console.log(`      ❌ No website found`);
        }
        
        processedCount++;
        
        // Обновить global прогресс ПОСЛЕ обработки
        if (this.globalProgressCallback) {
          this.globalProgressCallback(processedCount, null);
        }
        
        // Пауза между запросами
        await this._sleep(2000);
      }

      this.logger.info('Stage 2 Retry: Completed', {
        total: companies.length,
        found,
        notFound: companies.length - found
      });

      console.log('\n════════════════════════════════════════════');
      console.log('📊 STAGE 2 RETRY SUMMARY');
      console.log('════════════════════════════════════════════');
      console.log(`Total Retried: ${companies.length}`);
      console.log(`Websites Found: ${found} (${(found/companies.length*100).toFixed(1)}%)`);
      console.log(`Still Missing: ${companies.length - found}`);
      console.log('════════════════════════════════════════════\n');

      return {
        success: true,
        total: companies.length,
        found
      };

    } catch (error) {
      this.logger.error('Stage 2 Retry: Failed', {
        error: error.message,
        stack: error.stack
      });
      console.error('❌ Stage 2 Retry ERROR:', error.message);
      console.error('   Stack:', error.stack);
      throw error;
    }
  }

  async _getCompanies() {
    // Получить компании которые:
    // 1. Прошли Stage 2 (stage2_status = 'completed' или 'failed')
    // 2. НЕ имеют website
    // 3. Имеют хоть какую-то информацию (описание или тема)
    
    console.log('\n🔍 Stage 2 Retry: Searching for companies...');
    
    const { data, error } = await this.db.supabase
      .from('pending_companies')
      .select('company_id, company_name, description, topic_description, stage2_status, current_stage, website')
      .is('website', null)
      .in('stage2_status', ['completed', 'failed']);
    
    if (error) {
      this.logger.error('Stage 2 Retry: Failed to get companies', { 
        error: error.message 
      });
      console.error('❌ Stage 2 Retry: Database error:', error.message);
      throw error;
    }
    
    console.log(`   Found ${data?.length || 0} companies matching criteria`);
    
    // Фильтровать компании с минимальной информацией
    const filtered = (data || []).filter(company => {
      // Нужно хоть что-то: описание или тема
      return company.description || company.topic_description || company.company_name;
    });
    
    console.log(`   After filtering: ${filtered.length} companies`);
    
    this.logger.info(`Stage 2 Retry: Found ${filtered.length} companies for retry`, {
      totalMatched: data?.length || 0,
      afterFiltering: filtered.length
    });
    
    return filtered;
  }

  async _retryWebsiteSearch(company) {
    this.logger.info('Stage 2 Retry: Searching website with DeepSeek', {
      company: company.company_name,
      hasDescription: !!company.description
    });

    // ПОПЫТКА 1
    let result = await this._attemptWebsiteSearch(company, 1);
    if (result.success) {
      return result;
    }

    // ПОПЫТКА 2: Если первая не удалась
    console.log(`      🔄 Attempt 2/2 with alternative prompt...`);
    this.logger.info('Stage 2 Retry: Second attempt', {
      company: company.company_name
    });
    
    result = await this._attemptWebsiteSearch(company, 2);
    return result;
  }

  async _attemptWebsiteSearch(company, attemptNumber) {
    try {
      // Разные промпты для разных попыток
      const searchHint = attemptNumber === 1
        ? `Проверь через китайские источники:
   - Baidu поиск: "${company.company_name} 官网"
   - 企查查 (Qichacha.com) - найди профиль компании
   - 天眼查 (Tianyancha.com) - проверь там website
   - Китайские бизнес-каталоги и справочники
   - Google: "${company.company_name} official website"`
        : `Используй АЛЬТЕРНАТИВНЫЕ методы поиска:
   - Поиск по названию + "company website" + "China"
   - Поиск через английское название компании (если есть)
   - Проверь вариации названия (с/без "有限公司", "Ltd", "Co")
   - Ищи через отраслевые каталоги и выставки
   - Google Images поиск по логотипу компании`;

      // Промпт для поиска сайта через DeepSeek
      const prompt = `Найди ОФИЦИАЛЬНЫЙ веб-сайт китайской компании.

КОМПАНИЯ: ${company.company_name}
ОПИСАНИЕ: ${company.description || 'Нет описания'}
ОТРАСЛЬ: ${company.topic_description || 'Производство'}

ТВОЯ ЗАДАЧА (попытка ${attemptNumber}/2):
1. Найди официальный корпоративный сайт этой компании
2. ${searchHint}
3. Ищи именно ГЛАВНУЮ страницу компании, не подразделения
4. НЕ ищи на маркетплейсах (Alibaba, 1688, Made-in-China)

КРИТИЧЕСКИ ВАЖНО:
❌ НЕ возвращай маркетплейсы (Alibaba, 1688, Made-in-China, Taobao, Tmall, JD, Amazon, eBay)!
❌ НЕ возвращай страницы блогов/новостей/статей!
❌ НЕ возвращай социальные сети (WeChat, LinkedIn, Facebook)!
✅ Только корпоративные сайты (.com, .cn, .net.cn, .com.cn, .net)
✅ Главная страница компании (не подкатегории)

ФОРМАТ ОТВЕТА (ТОЛЬКО JSON):
{
  "website": "https://example.com или null",
  "email": "email@company.cn или null",
  "source": "откуда нашел (Baidu/Qichacha/Tianyancha/Google...)",
  "confidence": "high/medium/low"
}

ДОПОЛНИТЕЛЬНО:
- Если в профиле компании (企查查/天眼查) есть email - верни его
- Email может быть рядом с website в каталоге

Верни ТОЛЬКО JSON, без комментариев!`;

      // Использовать DeepSeek Chat для поиска
      const response = await this.deepseek.query(prompt, {
        maxTokens: 500,
        temperature: attemptNumber === 1 ? 0.3 : 0.5, // Больше креативности во 2-й попытке
        systemPrompt: 'You are an expert at finding Chinese company websites using Chinese search engines and business directories. You have access to web search.',
        stage: 'stage2_retry'
      });

      // Парсить JSON ответ
      const result = this._parseResponse(response);
      
      if (result.website) {
        // Валидировать URL
        if (this._isValidWebsite(result.website)) {
          // Подготовить данные для обновления
          const updateData = {
            website: result.website,
            stage2_status: 'completed',
            current_stage: 2, // Готов для Stage 3
            stage2_raw_data: {
              source: 'deepseek_retry',
              response: response.substring(0, 1000),
              confidence: result.confidence,
              timestamp: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          };
          
          // 🎁 BONUS: Если DeepSeek случайно нашел email И у компании его еще нет
          if (result.email && !company.email && this._isValidEmail(result.email)) {
            updateData.email = result.email;
            this.logger.info('🎁 BONUS: Email found opportunistically in Stage 2 Retry', {
              company: company.company_name,
              email: result.email,
              source: result.source
            });
          }
          
          // Сохранить найденный сайт (и возможно email)
          await this.db.supabase
            .from('pending_companies')
            .update(updateData)
            .eq('company_id', company.company_id);

          this.logger.info('Stage 2 Retry: Website found!', {
            company: company.company_name,
            website: result.website,
            email: result.email || 'not found',
            confidence: result.confidence
          });

          return { success: true, website: result.website, email: result.email };
        } else {
          this.logger.warn('Stage 2 Retry: Invalid or marketplace website', {
            company: company.company_name,
            website: result.website
          });
        }
      }

      this.logger.info('Stage 2 Retry: No website found', {
        company: company.company_name
      });

      return { success: true, website: null };

    } catch (error) {
      this.logger.error('Stage 2 Retry: Error searching website', {
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
        website: parsed.website || null,
        email: parsed.email || null,
        source: parsed.source || 'unknown',
        confidence: parsed.confidence || 'low'
      };
    } catch (error) {
      this.logger.warn('Stage 2 Retry: Failed to parse JSON', {
        response: response.substring(0, 200)
      });
      
      // Попытка извлечь URL из текста
      const urlMatch = response.match(/https?:\/\/[^\s"<>]+/);
      return {
        website: urlMatch ? urlMatch[0] : null,
        source: 'text_extraction',
        confidence: 'low'
      };
    }
  }

  _isValidWebsite(url) {
    if (!url || typeof url !== 'string') return false;
    
    // Базовая валидация URL
    const urlRegex = /^https?:\/\/.+\..+$/;
    if (!urlRegex.test(url)) {
      this.logger.debug('Stage 2 Retry: Invalid URL format', { url });
      return false;
    }
    
    // Фильтр маркетплейсов и социальных сетей
    const blockedDomains = [
      'alibaba.com', '1688.com', 'made-in-china.com',
      'amazon.', 'ebay.', 'aliexpress.',
      'taobao.com', 'tmall.com', 'jd.com',
      'linkedin.com', 'facebook.com', 'twitter.com',
      'weibo.com', 'wechat.com', 'qq.com'
    ];
    
    const urlLower = url.toLowerCase();
    for (const blocked of blockedDomains) {
      if (urlLower.includes(blocked)) {
        this.logger.debug('Stage 2 Retry: Blocked domain detected', { url, blocked });
        return false;
      }
    }
    
    // Фильтр блогов и новостных сайтов
    const blogPatterns = [
      '/blog/', '/news/', '/article/', '/post/',
      'blog.', 'news.', 'press.'
    ];
    
    for (const pattern of blogPatterns) {
      if (urlLower.includes(pattern)) {
        this.logger.debug('Stage 2 Retry: Blog/news URL detected', { url, pattern });
        return false;
      }
    }
    
    return true;
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

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Stage2Retry;

