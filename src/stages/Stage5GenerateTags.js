/**
 * Stage 5: Извлечение и генерация тегов
 * Создает теги на основе услуг, продуктов и возможностей компании
 * Использует DeepSeek API для экономии кредитов
 */
class Stage5GenerateTags {
  constructor(deepseekClient, settingsManager, database, logger) {
    this.deepseek = deepseekClient;
    this.settings = settingsManager;
    this.db = database;
    this.logger = logger;
  }

  async execute(sessionId) {
    this.logger.info('Stage 5: Starting tags generation', { sessionId });

    try {
      // Получить компании после Stage 4
      const companies = await this._getCompanies(sessionId);
      
      if (companies.length === 0) {
        this.logger.warn('Stage 5: No companies to process');
        return { success: true, processed: 0 };
      }

      // Получить настройки
      const settings = await this.settings.getCategory('processing_stages');
      const maxTags = settings.stage5_max_tags || 20;

      this.logger.info('Stage 5: Processing companies', {
        count: companies.length,
        maxTags
      });

      // Обработать все компании
      let processed = 0;
      for (const company of companies) {
        await this._generateTags(company, sessionId, maxTags);
        processed++;
      }

      this.logger.info('Stage 5: Completed', {
        processed,
        sessionId
      });

      return {
        success: true,
        processed
      };

    } catch (error) {
      this.logger.error('Stage 5: Failed', {
        error: error.message,
        sessionId
      });
      throw error;
    }
  }

  async _getCompanies(sessionId) {
    const result = await this.db.query(
      `SELECT pending_id, company_name, website, services_json 
       FROM pending_companies 
       WHERE session_id = $1 AND stage = 'site_analyzed'
       AND services_json IS NOT NULL`,
      [sessionId]
    );
    return result.rows;
  }

  async _generateTags(company, sessionId, maxTags) {
    try {
      // Получить данные об услугах
      const servicesData = typeof company.services_json === 'string' 
        ? JSON.parse(company.services_json)
        : company.services_json;

      const prompt = `Сгенерируй теги для классификации компании на основе её услуг и продукции.

КОМПАНИЯ: ${company.company_name}
НАПРАВЛЕНИЕ: ${servicesData.main_activity || 'не указано'}
УСЛУГИ: ${servicesData.services?.join(', ') || 'не указано'}
ПРОДУКТЫ: ${servicesData.products?.join(', ') || 'не указано'}

ТРЕБОВАНИЯ:
1. Создай ${maxTags} ключевых тегов на русском языке
2. Теги должны быть краткими (1-3 слова)
3. Теги должны отражать основные категории услуг
4. Используй индустриальные термины на русском

РЕЗУЛЬТАТ: JSON массив тегов:
{
  "tags": ["тег1", "тег2", "тег3", ...],
  "primary_category": "основная категория"
}

Примеры тегов: "ЧПУ обработка", "металлообработка", "литье пластика", "сварочные работы"`;

      const response = await this.deepseek.query(prompt, {
        stage: 'stage5_generate_tags',
        maxTokens: 1500,
        temperature: 0.7
      });

      const result = this._parseResponse(response, maxTags);

      // Сохранить теги
      await this.db.query(
        `UPDATE pending_companies 
         SET tags = $1, stage = 'tags_extracted', updated_at = NOW()
         WHERE pending_id = $2`,
        [result.tags, company.pending_id]
      );

      this.logger.debug('Stage 5: Tags generated', {
        company: company.company_name,
        tagCount: result.tags.length,
        primaryCategory: result.primary_category
      });

      return { success: true };

    } catch (error) {
      this.logger.error('Stage 5: Error generating tags', {
        company: company.company_name,
        error: error.message
      });
      
      // Установить теги по умолчанию
      await this.db.query(
        `UPDATE pending_companies 
         SET tags = $1, stage = 'tags_extracted', updated_at = NOW()
         WHERE pending_id = $2`,
        [['untagged'], company.pending_id]
      );

      return { success: false, error: error.message };
    }
  }

  _parseResponse(response, maxTags) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { tags: ['unclassified'], primary_category: 'unknown' };
      }

      const data = JSON.parse(jsonMatch[0]);
      
      let tags = Array.isArray(data.tags) ? data.tags : [];
      
      // Нормализация тегов (оставляем русский текст как есть)
      tags = tags
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)
        .slice(0, maxTags);

      if (tags.length === 0) {
        tags = ['unclassified'];
      }

      return {
        tags,
        primary_category: data.primary_category || 'unknown'
      };

    } catch (error) {
      this.logger.error('Failed to parse Stage 5 response', {
        error: error.message,
        response: response.substring(0, 200)
      });
      return { tags: ['parse-error'], primary_category: 'unknown' };
    }
  }
}

module.exports = Stage5GenerateTags;

