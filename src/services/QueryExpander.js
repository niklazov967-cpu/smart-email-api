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
      let allQueries = [];
      let attempts = 0;
      const maxAttempts = 10; // Увеличено до 10 попыток для гарантии получения нужного количества
      
      // Продолжать генерацию пока не достигнем целевого количества
      while (allQueries.length < targetCount && attempts < maxAttempts) {
        attempts++;
        
        this.logger.info('QueryExpander: Generation attempt', {
          attempt: attempts,
          currentCount: allQueries.length,
          targetCount
        });
        
        // Сколько еще нужно запросов
        const needed = targetCount - allQueries.length;
        // Генерируем больше с запасом, учитывая что будут дубликаты
        const generateCount = Math.max(needed * 2, 15); // Минимум 15, или в 2 раза больше чем нужно
        
        // Создать промпт для генерации под-запросов
        const prompt = attempts === 1 
          ? this._createExpansionPrompt(mainTopic, generateCount)
          : this._createRetryPrompt(mainTopic, generateCount);

        // Запросить у API генерацию вариаций
        const response = await this.apiClient.query(prompt, {
          stage: attempts === 1 ? 'query_expansion' : 'query_expansion_retry',
          maxTokens: 2000
        });

        // Парсить результат
        const newQueries = this._parseQueries(response);
        
        if (newQueries.length === 0) {
          this.logger.warn('QueryExpander: No queries generated in attempt', {
            attempt: attempts
          });
          continue;
        }
        
        // Добавить к общему пулу
        allQueries.push(...newQueries);
        
        // Удалить дубликаты внутри текущего пула
        allQueries = this._removeDuplicates(allQueries);
        
        // ✨ ПРОВЕРИТЬ СУЩЕСТВУЮЩИЕ ЗАПРОСЫ В БД
        allQueries = await this._filterExistingQueries(allQueries);
        
        this.logger.info('QueryExpander: After deduplication', {
          attempt: attempts,
          uniqueCount: allQueries.length,
          targetCount,
          needed: targetCount - allQueries.length
        });
        
        // Если достигли целевого количества - выходим
        if (allQueries.length >= targetCount) {
          this.logger.info('QueryExpander: Target count reached!', {
            generated: allQueries.length,
            target: targetCount,
            attempts
          });
          break;
        }
        
        // Продолжаем генерировать пока не достигнем цели
        this.logger.info('QueryExpander: Need more queries, continuing...', {
          needed: targetCount - allQueries.length
        });
      }

      // Если после всех попыток все равно мало запросов - это ошибка
      if (allQueries.length < targetCount) {
        const errorMsg = `Could not generate enough unique queries after ${attempts} attempts. Generated ${allQueries.length}, needed ${targetCount}`;
        this.logger.error('QueryExpander: FAILED to reach target count', {
          generated: allQueries.length,
          target: targetCount,
          attempts
        });
        throw new Error(errorMsg);
      }

      // Ограничить до целевого количества (взять лучшие по релевантности)
      const finalQueries = allQueries
        .sort((a, b) => (b.relevance || 50) - (a.relevance || 50))
        .slice(0, targetCount);

      this.logger.info('QueryExpander: Completed successfully', {
        totalAttempts: attempts,
        uniqueGenerated: allQueries.length,
        finalCount: finalQueries.length,
        target: targetCount
      });

      return {
        success: true,
        main_topic: mainTopic,
        queries: finalQueries,
        total: finalQueries.length,
        attempts: attempts,
        wasFiltered: allQueries.length > finalQueries.length
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
   * Проверить и отфильтровать запросы, которые уже существуют в БД
   * @param {Array} queries - Массив новых запросов
   * @returns {Array} Отфильтрованный массив запросов без дубликатов из БД
   */
  async _filterExistingQueries(queries) {
    try {
      // Получить все существующие подзапросы из БД через Supabase
      const { data, error } = await this.db.supabase
        .from('session_queries')
        .select('query_cn');
      
      if (error) {
        this.logger.error('QueryExpander: Failed to fetch existing queries', {
          error: error.message
        });
        // В случае ошибки возвращаем все запросы
        return queries;
      }
      
      const existingQueries = new Set(
        (data || []).map(row => row.query_cn.toLowerCase().trim())
      );
      
      this.logger.debug('QueryExpander: Checking against existing queries', {
        existingCount: existingQueries.size,
        newQueriesCount: queries.length
      });
      
      // Фильтровать новые запросы
      const filtered = queries.filter(query => {
        const key = query.query_cn.toLowerCase().trim();
        const isDuplicate = existingQueries.has(key);
        if (isDuplicate) {
          this.logger.debug('QueryExpander: Duplicate found', {
            query: query.query_cn
          });
        }
        return !isDuplicate;
      });
      
      const duplicatesCount = queries.length - filtered.length;
      
      if (duplicatesCount > 0) {
        this.logger.info('QueryExpander: Filtered existing queries from DB', {
          total: queries.length,
          duplicates: duplicatesCount,
          unique: filtered.length,
          exampleDuplicates: queries
            .filter(q => !filtered.includes(q))
            .slice(0, 3)
            .map(q => q.query_cn)
        });
      }
      
      return filtered;
      
    } catch (error) {
      this.logger.error('QueryExpander: Failed to check existing queries', {
        error: error.message,
        stack: error.stack
      });
      // В случае ошибки возвращаем все запросы
      return queries;
    }
  }

  /**
   * Сохранить сгенерированные запросы в БД для сессии
   */
  async saveQueries(sessionId, mainTopic, queries) {
    try {
      // Сохранить запросы через Supabase
      const queriesToInsert = queries.map(query => ({
        session_id: sessionId,
        main_topic: mainTopic,
        query_cn: query.query_cn,
        query_ru: query.query_ru,
        relevance: query.relevance || 50,
        is_main: false,
        is_selected: false,
        created_at: new Date().toISOString()
      }));

      const { error } = await this.db.supabase
        .from('session_queries')
        .insert(queriesToInsert);

      if (error) {
        throw new Error(`Supabase insert error: ${error.message}`);
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

