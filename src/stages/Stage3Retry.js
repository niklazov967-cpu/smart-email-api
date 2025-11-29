const axios = require('axios');

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
  }

  async execute() {
    this.logger.info('Stage 3 Retry: Starting retry for companies without email');

    try {
      // Получить компании готовые для повторного поиска
      const companies = await this._getCompanies();
      
      if (companies.length === 0) {
        this.logger.info('Stage 3 Retry: No companies need retry');
        return {
          success: true,
          total: 0,
          found: 0
        };
      }

      this.logger.info('Stage 3 Retry: Processing companies', {
        count: companies.length
      });

      let found = 0;

      // Обрабатывать последовательно (DeepSeek медленнее)
      for (const company of companies) {
        const result = await this._retryEmailSearch(company);
        if (result.success && result.email) {
          found++;
        }
        
        // Пауза между запросами
        await this._sleep(2000);
      }

      this.logger.info('Stage 3 Retry: Completed', {
        total: companies.length,
        found,
        notFound: companies.length - found
      });

      return {
        success: true,
        total: companies.length,
        found
      };

    } catch (error) {
      this.logger.error('Stage 3 Retry: Failed', {
        error: error.message
      });
      throw error;
    }
  }

  async _getCompanies() {
    // Получить компании которые:
    // 1. Прошли Stage 3 (stage3_status = 'failed') ИЛИ не имеют сайта вообще
    // 2. НЕ имеют email
    // 3. Имеют хоть какую-то информацию (описание или тема)
    
    const { data, error } = await this.db.supabase
      .from('pending_companies')
      .select('company_id, company_name, website, description, topic_description, stage3_status, current_stage')
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
      throw error;
    }
    
    // Фильтровать компании с минимальной информацией
    const filtered = (data || []).filter(company => {
      // Нужно хоть что-то: сайт, описание или тема
      return company.website || company.description || company.topic_description;
    });
    
    this.logger.info(`Stage 3 Retry: Found ${filtered.length} companies for retry`, {
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

    try {
      // Разный промпт для компаний с сайтом и без
      let prompt;
      
      if (company.website) {
        // Промпт для компаний С сайтом
        prompt = `Тебе нужно найти корпоративный EMAIL-АДРЕС для китайской компании.

КОМПАНИЯ: ${company.company_name}
ВЕБ-САЙТ: ${company.website}
ОПИСАНИЕ: ${company.description || 'Нет описания'}
ТЕМА: ${company.topic_description || 'Услуги обработки металла'}

ТВОЯ ЗАДАЧА:
1. Найди в интернете ОФИЦИАЛЬНЫЙ EMAIL этой компании
2. Проверь страницы: Contact Us, 联系我们, About, Footer
3. Ищи в: отраслевых каталогах, новостях, упоминаниях компании
4. Приоритет: info@, sales@, contact@, service@

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
        prompt = `Тебе нужно найти корпоративный EMAIL-АДРЕС для китайской компании БЕЗ известного сайта.

КОМПАНИЯ: ${company.company_name}
ОПИСАНИЕ: ${company.description || 'Нет описания'}
ТЕМА: ${company.topic_description || 'Услуги обработки металла'}
СТАТУС: Официальный сайт не найден

ТВОЯ ЗАДАЧА:
1. Ищи компанию в отраслевых каталогах и справочниках:
   - 中国机械企业名录
   - 中国制造网
   - 企查查 (qichacha.com)
   - 天眼查 (tianyancha.com)
   - Baidu企业信用

2. Ищи упоминания компании в новостях и статьях

3. Проверь профили в LinkedIn, Facebook, WeChat Official Accounts

4. Ищи через Google/Baidu: "公司名称 + 联系方式" или "公司名称 + email"

5. Приоритет email: info@, sales@, contact@, service@

КРИТИЧЕСКИ ВАЖНО:
❌ НЕ возвращай телефоны! Только EMAIL!
❌ НЕ ищи на маркетплейсах (Alibaba, 1688, Made-in-China) - там нет email!
✅ Ищи email в каталогах, справочниках, новостях
✅ Корпоративный email с любым доменом (не обязательно домен компании)

ФОРМАТ ОТВЕТА (ТОЛЬКО JSON):
{
  "email": "найденный@email.com или null",
  "source": "где нашел (напр: '天眼查 каталог' или 'новость на Baidu')",
  "confidence": "high/medium/low"
}

Верни ТОЛЬКО JSON, без комментариев!`;
      }

      // Использовать DeepSeek Chat для поиска
      const response = await this.deepseek.query(prompt, {
        maxTokens: 500,
        temperature: 0.3,
        systemPrompt: 'You are an expert at finding corporate contact information. You have access to web search and can find emails on company websites and business directories.',
        stage: 'stage3_retry'
      });

      // Парсить JSON ответ
      const result = this._parseResponse(response);
      
      if (result.email) {
        // Валидировать email
        if (this._isValidEmail(result.email)) {
          // Сохранить найденный email
          await this.db.supabase
            .from('pending_companies')
            .update({
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
            })
            .eq('company_id', company.company_id);

          this.logger.info('Stage 3 Retry: Email found!', {
            company: company.company_name,
            email: result.email,
            confidence: result.confidence
          });

          return { success: true, email: result.email };
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

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Stage3Retry;

