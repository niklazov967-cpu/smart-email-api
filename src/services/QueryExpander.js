/**
 * QueryExpander - Генератор под-запросов из темы
 * Создает множество релевантных запросов на основе одной темы
 */
class QueryExpander {
  constructor(sonarClient, settingsManager, database, logger) {
    this.sonar = sonarClient;
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

      // Запросить у Sonar генерацию вариаций
      const response = await this.sonar.query(prompt, {
        stage: 'query_expansion',
        useCache: true
      });

      // Парсить результат
      const queries = this._parseQueries(response);

      // Валидация
      if (queries.length < 3) {
        this.logger.warn('QueryExpander: Too few queries generated, retrying');
        
        // Вторая попытка с другим промптом
        const retryPrompt = this._createRetryPrompt(mainTopic, targetCount);
        const retryResponse = await this.sonar.query(retryPrompt, {
          stage: 'query_expansion_retry',
          useCache: true
        });
        
        const moreQueries = this._parseQueries(retryResponse);
        queries.push(...moreQueries);
      }

      // Удалить дубликаты
      const uniqueQueries = this._removeDuplicates(queries);

      // Ограничить до целевого количества
      const finalQueries = uniqueQueries.slice(0, targetCount);

      // Добавить основную тему как первый запрос
      finalQueries.unshift({
        query_cn: mainTopic,
        query_ru: await this._translate(mainTopic),
        relevance: 100,
        is_main: true
      });

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
    return `Ты эксперт по поиску китайских производителей. Тебе дана ТЕМА поиска.

ТЕМА: ${mainTopic}

ЗАДАЧА: Создай ${count} вариаций поисковых запросов на китайском языке, которые:
1. Близки к основной теме, но не дублируют её
2. Расширяют тему, используя синонимы, смежные услуги, альтернативные технологии
3. Остаются в рамках производства (不отходят в торговлю или услуги)
4. Помогут найти больше производителей в этой области

ПРИМЕРЫ ВАРИАЦИЙ:
Если тема: "不锈钢数控车铣加工"
Вариации:
- 不锈钢精密加工
- CNC不锈钢零件加工
- 不锈钢自动化加工
- 不锈钢机械加工服务
- 精密不锈钢制造

ВАЖНО:
- Все запросы должны быть на китайском
- Каждый запрос должен быть уникальным
- Запросы должны быть практичными для поиска производителей

РЕЗУЛЬТАТ: JSON формат:
{
  "queries": [
    {
      "query_cn": "китайский запрос",
      "query_ru": "русский перевод",
      "relevance": оценка релевантности 0-100
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
      const response = await this.sonar.query(prompt, {
        stage: 'translation',
        useCache: true
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
            query.relevance,
            query.is_main || false,
            query.is_main || false  // Основная тема выбрана по умолчанию
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

