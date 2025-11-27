/**
 * QueryExpander - Генератор под-запросов из темы
 * Создает множество релевантных запросов на основе одной темы
 * Может использовать DeepSeek или Perplexity API
 */
class QueryExpander {
  constructor(apiClient, settingsManager, database, logger) {
    this.apiClient = apiClient;
    this.settings = settingsManager;
    this.db = database;
    this.logger = logger;
  }

  /**
   * Генерирует под-запросы из темы
   * @param {string} mainTopic - Основная тема на китайском
   * @param {number} targetCount - Желаемое количество под-запросов (по умолчанию 10)
   * @returns {Array} Массив сгенерированных запросов с переводами
   */
  async expandTopic(mainTopic, targetCount = 10) {
    this.logger.info('QueryExpander: Starting topic expansion', { 
      mainTopic, 
      targetCount 
    });

    try {
      // Создать промпт для генерации под-запросов
      const prompt = this._createExpansionPrompt(mainTopic, targetCount);

      // Запросить у API генерацию вариаций
      const response = await this.apiClient.query(prompt, {
        stage: 'query_expansion',
        maxTokens: 2000
      });

      // Парсить результат
      const queries = this._parseQueries(response);

      // Валидация
      if (queries.length < 3) {
        this.logger.warn('QueryExpander: Too few queries generated, retrying');
        
        // Вторая попытка с другим промптом
        const retryPrompt = this._createRetryPrompt(mainTopic, targetCount);
        const retryResponse = await this.apiClient.query(retryPrompt, {
          stage: 'query_expansion_retry',
          maxTokens: 2000
        });
        
        const moreQueries = this._parseQueries(retryResponse);
        queries.push(...moreQueries);
      }

      // Удалить дубликаты
      const uniqueQueries = this._removeDuplicates(queries);

      // Ограничить до целевого количества
      const finalQueries = uniqueQueries.slice(0, targetCount);

      this.logger.info('QueryExpander: Completed', {
        generated: finalQueries.length
      });

      return {
        success: true,
        main_topic: mainTopic,
        queries: finalQueries,
        total: finalQueries.length
      };

    } catch (error) {
      this.logger.error('QueryExpander: Failed', {
        error: error.message,
        mainTopic
      });
      throw error;
    }
  }

  _createExpansionPrompt(mainTopic, count) {
    return `Ты эксперт по поиску китайских производителей.

ОПИСАНИЕ ЗАДАЧИ (своими словами):
${mainTopic}

ТВОЯ ЗАДАЧА:
Проанализируй описание задачи и создай ${count} КОНКРЕТНЫХ поисковых запросов на китайском языке для поиска производителей.

КРИТИЧЕСКИ ВАЖНО - РАЗЛИЧАЙ:
1. 🏭 ПРОИЗВОДИТЕЛИ/ПОСТАВЩИКИ УСЛУГ (кто делает детали, предоставляет обработку)
   - Ключевые слова: "услуги", "обработка", "производство деталей", "изготовление"
   - Китайские термины: 加工服务 (услуги обработки), 零件加工 (обработка деталей), 制造 (производство)
   
2. 🏢 ПРОИЗВОДИТЕЛИ ОБОРУДОВАНИЯ (кто делает станки, машины)
   - Ключевые слова: "станки", "оборудование", "машины", "производитель станков"
   - Китайские термины: 机床制造商 (производитель станков), 设备制造 (производство оборудования)

ЕСЛИ В ЗАДАЧЕ:
- "занимаются обработкой", "делают детали", "изготавливают детали" → ищи ПОСТАВЩИКОВ УСЛУГ
- "производители станков", "поставщики оборудования" → ищи ПРОИЗВОДИТЕЛЕЙ ОБОРУДОВАНИЯ

ВАЖНО:
1. НЕ используй само описание задачи как запрос
2. Создай КОНКРЕТНЫЕ поисковые запросы для Perplexity/Google
3. Запросы должны находить НУЖНЫЙ ТИП компаний (услуги VS оборудование)
4. Каждый запрос - это то, что мы введём в поисковую систему
5. Оцени релевантность каждого запроса к задаче (0-100)

ПРИМЕРЫ:

Пример 1 - Услуги обработки:
Описание: "Ищу компании которые занимаются токарной обработкой металлов на станках ЧПУ"

Правильные запросы (УСЛУГИ):
✅ "数控车床加工服务" (услуги токарной обработки ЧПУ) - релевантность: 98
✅ "金属零件CNC加工厂" (завод CNC обработки металлических деталей) - релевантность: 95
✅ "小批量数控加工" (мелкосерийная ЧПУ обработка) - релевантность: 92
✅ "精密车削加工外协" (аутсорсинг прецизионной токарной обработки) - релевантность: 90

Неправильно (ОБОРУДОВАНИЕ):
❌ "数控车床制造商" (производители токарных станков ЧПУ) - НЕТ! Это станки, не услуги!
❌ "机床生产厂家" (производители станков) - НЕТ! Ищем услуги, не оборудование!

Пример 2 - Производители оборудования:
Описание: "Нужны производители токарных станков ЧПУ"

Правильные запросы (ОБОРУДОВАНИЕ):
✅ "数控车床制造商" (производители токарных станков ЧПУ) - релевантность: 98
✅ "CNC机床生产厂家" (производители CNC станков) - релевантность: 95

РЕЗУЛЬТАТ: JSON формат:
{
  "queries": [
    {
      "query_cn": "конкретный поисковый запрос на китайском",
      "query_ru": "перевод запроса на русский",
      "relevance": оценка релевантности 0-100 (насколько запрос соответствует задаче)
    }
  ]
}

Выведи ТОЛЬКО JSON, без дополнительного текста.`;
  }

  _createRetryPrompt(mainTopic, count) {
    return `Создай ещё ${count} альтернативных поисковых запросов для темы: ${mainTopic}

Используй:
- Альтернативные названия процессов
- Смежные технологии
- Разные формулировки
- Специализированные термины

Формат: JSON с массивом queries (query_cn, query_ru, relevance).`;
  }

  _parseQueries(response) {
    try {
      // Найти JSON в ответе
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const data = JSON.parse(jsonMatch[0]);
      
      if (!data.queries || !Array.isArray(data.queries)) {
        throw new Error('Invalid queries array');
      }

      return data.queries.map(q => ({
        query_cn: q.query_cn || '',
        query_ru: q.query_ru || '',
        relevance: parseInt(q.relevance) || 50,
        is_main: false
      })).filter(q => q.query_cn && q.query_ru);

    } catch (error) {
      this.logger.error('Failed to parse QueryExpander response', {
        error: error.message,
        response: response.substring(0, 200)
      });
      return [];
    }
  }

  async _translate(chineseText) {
    try {
      const prompt = `Переведи на русский язык кратко (2-4 слова): ${chineseText}`;
      const response = await this.apiClient.query(prompt, {
        stage: 'translation',
        maxTokens: 100
      });
      
      return response.trim().replace(/["""]/g, '');
    } catch (error) {
      this.logger.error('Translation failed', { error: error.message });
      return 'Перевод недоступен';
    }
  }

  _removeDuplicates(queries) {
    const seen = new Set();
    return queries.filter(query => {
      const key = query.query_cn.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Сохранить сгенерированные запросы в БД для сессии
   */
  async saveQueries(sessionId, mainTopic, queries) {
    try {
      for (const query of queries) {
        await this.db.query(
          `INSERT INTO session_queries 
           (session_id, main_topic, query_cn, query_ru, relevance, is_main, is_selected, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            sessionId,
            mainTopic,
            query.query_cn,
            query.query_ru,
            query.relevance || 50,
            false,  // Больше нет "основного" запроса
            false   // Все запросы не выбраны по умолчанию
          ]
        );
      }

      this.logger.info('QueryExpander: Queries saved to DB', {
        sessionId,
        count: queries.length
      });

      return { success: true };
    } catch (error) {
      this.logger.error('QueryExpander: Failed to save queries', {
        error: error.message,
        sessionId
      });
      throw error;
    }
  }

  /**
   * Получить запросы для сессии
   */
  async getQueriesForSession(sessionId) {
    const result = await this.db.query(
      `SELECT * FROM session_queries 
       WHERE session_id = $1 
       ORDER BY is_main DESC, relevance DESC`,
      [sessionId]
    );

    return result.rows;
  }

  /**
   * Обновить выбор запросов пользователем
   */
  async updateSelectedQueries(sessionId, selectedQueryIds) {
    try {
      // Сначала снять выбор со всех запросов
      await this.db.query(
        `UPDATE session_queries 
         SET is_selected = false 
         WHERE session_id = $1`,
        [sessionId]
      );

      // Затем установить выбор для указанных
      if (selectedQueryIds && selectedQueryIds.length > 0) {
        await this.db.query(
          `UPDATE session_queries 
           SET is_selected = true 
           WHERE session_id = $1 AND query_id = ANY($2)`,
          [sessionId, selectedQueryIds]
        );
      }

      this.logger.info('QueryExpander: Updated selected queries', {
        sessionId,
        count: selectedQueryIds.length
      });

      return { success: true };
    } catch (error) {
      this.logger.error('QueryExpander: Failed to update selected queries', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = QueryExpander;

