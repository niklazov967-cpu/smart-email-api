const DeepSeekClient = require('./DeepSeekClient');

/**
 * TranslationService - Упрощенный сервис фоновой русификации китайских данных
 * 
 * Основные функции:
 * - Поиск компаний без переводов
 * - Перевод полей через DeepSeek API
 * - Сохранение переводов в таблицу pending_companies_ru (зеркало)
 * - Управление статусами перевода
 */
class TranslationService {
  constructor(db, logger, settings) {
    this.db = db;
    this.logger = logger;
    this.settings = settings;
    
    // Инициализируем DeepSeek client для переводов
    const deepseekSettings = settings.deepseek || settings;
    const deepseekKey = deepseekSettings.api_key || process.env.DEEPSEEK_API_KEY;
    
    if (!deepseekKey) {
      throw new Error('DeepSeek API key not found in settings or environment');
    }
    
    this.deepseek = new DeepSeekClient(deepseekKey, logger, 'chat');
    
    // Список полей для перевода с приоритетами
    this.translationFields = [
      { field: 'company_name', priority: 1 },
      { field: 'description', priority: 2 },
      { field: 'ai_generated_description', priority: 2 },
      { field: 'services', priority: 3 },
      { field: 'validation_reason', priority: 3 }
    ];
    
    // Добавляем теги (tag1-tag20)
    for (let i = 1; i <= 20; i++) {
      this.translationFields.push({ field: `tag${i}`, priority: 4 });
    }
    
    // Конфигурация
    this.maxRetries = 3;
    this.delayBetweenRequests = 1500; // 1.5 секунды между запросами
  }

  /**
   * Найти компании, которым нужен перевод
   * @param {number} limit - Максимальное количество компаний
   * @returns {Array} Массив company_id
   */
  async findUntranslatedCompanies(limit = 10) {
    try {
      // Найти компании из pending_companies, у которых нет записей в pending_companies_ru
      // или у которых translation_status = 'pending' или 'partial'
      const { data: companies, error } = await this.db.supabase
        .from('pending_companies')
        .select(`
          company_id,
          company_name,
          pending_companies_ru (
            company_id,
            translation_status
          )
        `)
        .not('company_name', 'is', null)
        .limit(limit * 2); // Берем больше чтобы отфильтровать
      
      if (error) throw error;
      
      if (!companies || companies.length === 0) {
        return [];
      }
      
      // Фильтруем компании: без перевода или со статусом pending/partial
      const untranslated = companies
        .filter(c => {
          const ruRecord = c.pending_companies_ru;
          if (!ruRecord) return true; // Нет записи в _ru таблице
          if (ruRecord.translation_status === 'pending') return true;
          if (ruRecord.translation_status === 'partial') return true;
          return false; // completed или failed - пропускаем
        })
        .slice(0, limit) // Ограничиваем до нужного лимита
        .map(c => c.company_id);
      
      this.logger.info('TranslationService: Found untranslated companies', {
        total: companies.length,
        untranslated: untranslated.length
      });
      
      return untranslated;
      
    } catch (error) {
      this.logger.error('TranslationService: Error finding untranslated companies', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Получить или создать запись в pending_companies_ru
   * @param {string} companyId - ID компании
   * @returns {Object} Запись из pending_companies_ru
   */
  async getOrCreateRuRecord(companyId) {
    try {
      // Попытка получить существующую запись
      const { data: existing, error: selectError } = await this.db.supabase
        .from('pending_companies_ru')
        .select('*')
        .eq('company_id', companyId)
        .single();
      
      if (selectError && selectError.code !== 'PGRST116') { // PGRST116 = not found
        throw selectError;
      }
      
      if (existing) {
        return existing;
      }
      
      // Создать новую запись
      const { data: created, error: insertError } = await this.db.supabase
        .from('pending_companies_ru')
        .insert({
          company_id: companyId,
          translation_status: 'pending',
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (insertError) throw insertError;
      
      this.logger.info('TranslationService: Created new RU record', { companyId });
      return created;
      
    } catch (error) {
      this.logger.error('TranslationService: Error getting/creating RU record', {
        companyId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Перевести все поля одной компании
   * @param {string} companyId - ID компании
   * @returns {Object} Результат перевода
   */
  async translateCompany(companyId) {
    try {
      this.logger.info('TranslationService: Starting translation', { companyId });
      
      // 1. Получить данные компании
      const { data: company, error } = await this.db.supabase
        .from('pending_companies')
        .select('*')
        .eq('company_id', companyId)
        .single();
      
      if (error) throw error;
      if (!company) {
        throw new Error(`Company not found: ${companyId}`);
      }
      
      // 2. Получить или создать запись в pending_companies_ru
      let ruRecord = await this.getOrCreateRuRecord(companyId);
      
      let translatedCount = 0;
      let failedCount = 0;
      
      // 3. Перевести поля по приоритету
      for (const { field, priority } of this.translationFields) {
        const originalText = company[field];
        
        // Пропустить если нет оригинального текста
        if (!originalText || originalText.trim() === '') continue;
        
        // Пропустить если уже переведено
        const ruFieldName = `${field}_ru`;
        if (ruRecord[ruFieldName] && ruRecord[ruFieldName].trim() !== '') {
          this.logger.debug(`TranslationService: Field already translated`, {
            companyId,
            field
          });
          continue;
        }
        
        // Перевести поле
        try {
          const translatedText = await this.translateField(originalText, field);
          
          if (translatedText && translatedText.trim() !== '') {
            // Сохранить перевод
            await this.updateRuField(companyId, ruFieldName, translatedText);
            translatedCount++;
            
            this.logger.debug(`TranslationService: Field translated`, {
              companyId,
              field,
              originalLength: originalText.length,
              translatedLength: translatedText.length
            });
          }
        } catch (error) {
          failedCount++;
          this.logger.error(`TranslationService: Translation error for field`, {
            companyId,
            field,
            error: error.message
          });
        }
        
        // Задержка между запросами
        await this.delay(this.delayBetweenRequests);
      }
      
      // 4. Обновить статус
      await this.updateRuStatus(companyId);
      
      this.logger.info('TranslationService: Translation completed', {
        companyId,
        translatedCount,
        failedCount
      });
      
      return {
        success: true,
        companyId,
        translatedCount,
        failedCount
      };
      
    } catch (error) {
      this.logger.error('TranslationService: Error translating company', {
        companyId,
        error: error.message
      });
      
      // Пометить как failed
      try {
        await this.db.supabase
          .from('pending_companies_ru')
          .update({
            translation_status: 'failed',
            translation_error: error.message,
            updated_at: new Date().toISOString()
          })
          .eq('company_id', companyId);
      } catch (updateError) {
        this.logger.error('TranslationService: Error updating failed status', {
          companyId,
          error: updateError.message
        });
      }
      
      throw error;
    }
  }

  /**
   * Обновить одно поле в pending_companies_ru
   * @param {string} companyId - ID компании
   * @param {string} fieldName - Название поля (например, company_name_ru)
   * @param {string} translatedText - Переведенный текст
   */
  async updateRuField(companyId, fieldName, translatedText) {
    try {
      const updateData = {
        [fieldName]: translatedText,
        updated_at: new Date().toISOString()
      };
      
      const { error } = await this.db.supabase
        .from('pending_companies_ru')
        .update(updateData)
        .eq('company_id', companyId);
      
      if (error) throw error;
      
    } catch (error) {
      this.logger.error('TranslationService: Error updating RU field', {
        companyId,
        fieldName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Пересчитать и обновить статус перевода
   * @param {string} companyId - ID компании
   */
  async updateRuStatus(companyId) {
    try {
      // Получить запись из pending_companies_ru
      const { data: ruRecord, error } = await this.db.supabase
        .from('pending_companies_ru')
        .select('*')
        .eq('company_id', companyId)
        .single();
      
      if (error) throw error;
      if (!ruRecord) return;
      
      // Подсчитать переведенные поля
      let translatedFields = 0;
      let totalImportantFields = 0;
      
      // Важные поля (без тегов)
      const importantFields = ['company_name', 'description', 'ai_generated_description', 'services', 'validation_reason'];
      
      for (const field of importantFields) {
        const ruFieldName = `${field}_ru`;
        if (ruRecord[ruFieldName] && ruRecord[ruFieldName].trim() !== '') {
          translatedFields++;
        }
        totalImportantFields++;
      }
      
      // Определить статус
      let newStatus = 'pending';
      
      if (translatedFields === 0) {
        newStatus = 'pending';
      } else if (translatedFields >= 3 && ruRecord.company_name_ru) {
        // Если переведено название + минимум 2 других важных поля
        newStatus = 'completed';
      } else {
        newStatus = 'partial';
      }
      
      // Обновить статус
      const { error: updateError } = await this.db.supabase
        .from('pending_companies_ru')
        .update({
          translation_status: newStatus,
          translated_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('company_id', companyId);
      
      if (updateError) throw updateError;
      
      this.logger.info('TranslationService: Status updated', {
        companyId,
        status: newStatus,
        translatedFields,
        totalImportantFields
      });
      
    } catch (error) {
      this.logger.error('TranslationService: Error updating RU status', {
        companyId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Перевести одно поле через DeepSeek
   * @param {string} text - Текст для перевода
   * @param {string} fieldName - Название поля (для контекста)
   * @returns {string} Переведенный текст
   */
  async translateField(text, fieldName) {
    try {
      // Пропустить если текст на латинице (короткий английский термин)
      if (this._isLatin(text)) {
        this.logger.debug('TranslationService: Skipping Latin text', {
          fieldName,
          text: text.substring(0, 50)
        });
        return text; // Возвращаем оригинал
      }
      
      const prompt = `Переведи на русский язык следующий текст с китайского.
Сохрани все технические термины, аббревиатуры (CNC, CAD и т.д.).
Верни ТОЛЬКО перевод без объяснений.

Текст: ${text}`;
      
      const response = await this.deepseek.query(prompt, {
        max_tokens: 500,
        temperature: 0.3
      });
      
      const translated = response.trim();
      
      // Проверка что получили валидный перевод
      if (!translated || translated.length === 0) {
        throw new Error('Empty translation received');
      }
      
      return translated;
      
    } catch (error) {
      this.logger.error('TranslationService: Error translating field', {
        fieldName,
        text: text.substring(0, 100),
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Проверить является ли текст на латинице
   * @param {string} text - Текст для проверки
   * @returns {boolean} true если текст на латинице
   */
  _isLatin(text) {
    const latinChars = text.match(/[a-zA-Z]/g);
    const totalChars = text.replace(/\s/g, '').length;
    
    if (totalChars === 0) return false;
    
    // Если текст длинный (>50 символов) и на латинице,
    // это скорее всего полное предложение/описание на английском - переводим
    if (totalChars > 50 && latinChars && (latinChars.length / totalChars) > 0.8) {
      return false; // НЕ пропускаем - переводим длинные английские тексты
    }
    
    // Короткие тексты (<50 символов) на латинице - это термины, пропускаем
    return latinChars && (latinChars.length / totalChars) > 0.8;
  }

  /**
   * Задержка между запросами
   * @param {number} ms - Миллисекунды
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Получить статистику переводов
   * @returns {Object} Статистика
   */
  async getTranslationStats() {
    try {
      // Общее количество компаний
      const { count: totalCompanies, error: countError } = await this.db.supabase
        .from('pending_companies')
        .select('*', { count: 'exact', head: true });
      
      if (countError) throw countError;
      
      // Статистика по статусам переводов
      const { data: statusStats, error: statsError } = await this.db.supabase
        .from('pending_companies_ru')
        .select('translation_status');
      
      if (statsError) throw statsError;
      
      const stats = {
        total: totalCompanies || 0,
        completed: 0,
        partial: 0,
        pending: 0,
        failed: 0,
        untranslated: 0
      };
      
      if (statusStats) {
        statusStats.forEach(record => {
          if (record.translation_status === 'completed') stats.completed++;
          else if (record.translation_status === 'partial') stats.partial++;
          else if (record.translation_status === 'pending') stats.pending++;
          else if (record.translation_status === 'failed') stats.failed++;
        });
      }
      
      stats.untranslated = stats.total - (stats.completed + stats.partial + stats.pending + stats.failed);
      
      return stats;
      
    } catch (error) {
      this.logger.error('TranslationService: Error getting stats', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = TranslationService;
