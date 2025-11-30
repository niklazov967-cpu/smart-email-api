const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

/**
 * GET /api/sessions/debug-stage3
 * Диагностика: проверить компании готовые для Stage 3
 */
router.get('/debug-stage3', async (req, res) => {
  try {
    const db = req.db;
    
    // 1. Компании готовые для Stage 3
    const { data: ready, error: readyError } = await db.supabase
      .from('pending_companies')
      .select('company_id, company_name, website, stage2_status, stage3_status, email')
      .not('website', 'is', null)
      .or('email.is.null,email.eq.""')
      .is('stage3_status', null)
      .in('stage2_status', ['completed', 'skipped']);
    
    // 2. Компании с установленным stage3_status
    const { data: processed, error: processedError } = await db.supabase
      .from('pending_companies')
      .select('company_id, company_name, website, stage3_status, email')
      .not('stage3_status', 'is', null);
    
    // 3. Общая статистика
    const { data: all, error: allError } = await db.supabase
      .from('pending_companies')
      .select('stage3_status, email');
    
    res.json({
      success: true,
      ready_for_stage3: {
        count: ready?.length || 0,
        first_3: ready?.slice(0, 3) || []
      },
      processed_by_stage3: {
        count: processed?.length || 0,
        completed: processed?.filter(c => c.stage3_status === 'completed').length || 0,
        failed: processed?.filter(c => c.stage3_status === 'failed').length || 0,
        first_5: processed?.slice(0, 5) || []
      },
      total_stats: {
        total: all?.length || 0,
        with_email: all?.filter(c => c.email).length || 0,
        stage3_null: all?.filter(c => c.stage3_status === null).length || 0,
        stage3_completed: all?.filter(c => c.stage3_status === 'completed').length || 0,
        stage3_failed: all?.filter(c => c.stage3_status === 'failed').length || 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sessions/reset-stage3
 * Сбросить stage3_status для всех компаний (для тестирования)
 */
router.post('/reset-stage3', async (req, res) => {
  try {
    const db = req.db;
    
    const { error } = await db.supabase
      .from('pending_companies')
      .update({
        stage3_status: null,
        email: null,
        contacts_json: null,
        stage3_raw_data: null
      })
      .not('stage3_status', 'is', null);
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: 'All companies reset for Stage 3'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sessions
 * Создать новую сессию поиска и запустить обработку
 */
router.post('/', async (req, res) => {
  try {
    const {
      search_query,
      target_count = 50,
      priority = 'balanced',
      use_cache = true,
      auto_start = false  // Автоматически запустить обработку
    } = req.body;

    if (!search_query) {
      return res.status(400).json({
        success: false,
        error: 'search_query is required'
      });
    }

    const sessionId = uuidv4();
    const now = new Date();
    
    // Создать описательное название с временем
    const timeStr = now.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).replace(',', '');
    
    const topic_description = `${search_query} [${timeStr}]`;
    
    const session = {
      session_id: sessionId,
      search_query,
      topic_description,
      target_count,
      priority,
      status: 'active',
      start_time: now,
      created_at: now
    };

    // Сохранить в БД
    await req.db.query(
      `INSERT INTO search_sessions 
       (session_id, search_query, topic_description, target_count, priority, status, start_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sessionId, search_query, topic_description, target_count, priority, 'active', now]
    );

    req.logger.info('Session created', { sessionId, topic_description });

    // Если auto_start = true, запустить обработку в фоне
    if (auto_start && req.orchestrator) {
      req.logger.info('Starting automatic processing', { sessionId });
      
      // Запустить в фоне (не ждать завершения)
      req.orchestrator.processSession(sessionId, search_query)
        .then(() => {
          req.logger.info('Session processing completed', { sessionId });
        })
        .catch(error => {
          req.logger.error('Session processing failed', { 
            sessionId, 
            error: error.message 
          });
        });
      
      session.processing_started = true;
    }

    res.status(201).json({
      success: true,
      data: session
    });
  } catch (error) {
    req.logger.error('Failed to create session', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/sessions
 * Получить список всех сессий
 */
router.get('/', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    
    let query = 'SELECT * FROM search_sessions';
    const params = [];
    
    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await req.db.query(query, params);
    
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    req.logger.error('Failed to get sessions', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/sessions/clear-cache
 * Очистить только кэш (processing_progress) не удаляя сессии и компании
 */
router.delete('/clear-cache', async (req, res) => {
  try {
    req.logger.info('Clearing processing_progress cache only');
    
    await req.db.query('DELETE FROM processing_progress WHERE true');
    
    req.logger.info('Cache cleared successfully');
    
    res.json({
      success: true,
      message: 'Processing progress cache cleared'
    });
  } catch (error) {
    req.logger.error('Failed to clear cache', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/sessions/clear-all
 * Очистить всю базу данных (удалить все сессии и связанные данные)
 * ВАЖНО: Должен быть ПЕРЕД /:id чтобы не воспринимался как UUID
 */
router.delete('/clear-all', async (req, res) => {
  try {
    req.logger.info('Clearing all database data');

    // Удаляем все записи из таблиц используя Supabase API
    const tables = [
      'processing_progress',      // Сначала зависимые таблицы
      'session_queries',
      'pending_companies',
      'found_companies',
      'pending_companies_ru',     // Переводы
      'search_sessions'            // Главная таблица последней
    ];

    const cleared = [];
    
    for (const table of tables) {
      try {
        // Supabase delete требует фильтр, используем neq с несуществующим значением
        const { error } = await req.db.supabase
          .from(table)
          .delete()
          .neq('created_at', '1900-01-01'); // Удалит все записи
        
        if (error) {
          req.logger.warn(`Failed to clear ${table}`, { error: error.message });
        } else {
          cleared.push(table);
          req.logger.debug(`Cleared table: ${table}`);
        }
      } catch (err) {
        req.logger.warn(`Could not clear ${table}`, { error: err.message });
      }
    }
    
    // Опционально: очистить кеш (если таблица существует)
    const cacheTables = ['perplexity_cache', 'api_calls'];
    for (const table of cacheTables) {
      try {
        const { error } = await req.db.supabase
          .from(table)
          .delete()
          .neq('created_at', '1900-01-01');
        
        if (!error) {
          cleared.push(table);
        }
      } catch (error) {
        // Игнорируем ошибки для необязательных таблиц
      }
    }

    req.logger.info('Database cleared successfully', { tables: cleared });

    res.json({
      success: true,
      message: 'База данных очищена',
      cleared_tables: cleared
    });

  } catch (error) {
    req.logger.error('Failed to clear database', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/sessions/:id/clear-progress
 * Очистить прогресс обработки для конкретной сессии
 * НОВОЕ: Также сбрасывает статусы компаний (current_stage, stage_statuses)
 */
router.delete('/:id/clear-progress', async (req, res) => {
  try {
    const { id } = req.params;
    
    req.logger.info('Clearing progress for session', { sessionId: id });
    
    // 1. Удалить записи прогресса для этой сессии
    const { error: progressError } = await req.db.supabase
      .from('processing_progress')
      .delete()
      .eq('session_id', id);
    
    if (progressError) {
      throw new Error(`Failed to clear progress: ${progressError.message}`);
    }
    
    // 2. НОВОЕ: Сбросить статусы компаний этой сессии
    const { error: companiesError } = await req.db.supabase
      .from('pending_companies')
      .update({
        current_stage: 1,
        stage1_status: 'completed', // Stage 1 всегда completed (компании уже найдены)
        stage2_status: null,
        stage3_status: null,
        stage4_status: null,
        validation_score: null,
        validation_reason: null,
        ai_generated_description: null,
        ai_confidence_score: null
        // НЕ очищаем: website, email, description, tags (найденные данные)
      })
      .eq('session_id', id);
    
    if (companiesError) {
      req.logger.warn('Failed to reset company statuses', { 
        error: companiesError.message,
        sessionId: id
      });
    }
    
    req.logger.info('Session progress and statuses cleared successfully', { sessionId: id });
    
    res.json({
      success: true,
      message: 'Прогресс и статусы компаний сброшены',
      sessionId: id
    });
    
  } catch (error) {
    req.logger.error('Failed to clear session progress', { 
      error: error.message,
      sessionId: req.params.id
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/sessions/:id
 * Получить детали сессии
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await req.db.query(
      'SELECT * FROM search_sessions WHERE session_id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    req.logger.error('Failed to get session', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/sessions/:id/progress
 * Получить прогресс выполнения сессии
 */
router.get('/:id/progress', async (req, res) => {
  try {
    const { id } = req.params;
    
    const sessionResult = await req.db.query(
      'SELECT * FROM search_sessions WHERE session_id = $1',
      [id]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    const session = sessionResult.rows[0];
    
    // Получить статистику компаний
    const companiesResult = await req.db.query(
      'SELECT COUNT(*) as total, stage FROM pending_companies WHERE session_id = $1 GROUP BY stage',
      [id]
    );
    
    const stats = {
      session_id: id,
      status: session.status,
      search_query: session.search_query,
      target_count: session.target_count,
      companies_found: session.companies_found || 0,
      companies_analyzed: session.companies_analyzed || 0,
      companies_added: session.companies_added || 0,
      duplicates_skipped: session.duplicates_skipped || 0,
      errors_count: session.errors_count || 0,
      perplexity_api_calls: session.perplexity_api_calls || 0,
      perplexity_tokens_used: session.perplexity_tokens_used || 0,
      cache_hits: session.cache_hits || 0,
      progress_percent: session.target_count > 0 
        ? Math.round((session.companies_added / session.target_count) * 100)
        : 0,
      stages: companiesResult.rows.reduce((acc, row) => {
        acc[row.stage] = parseInt(row.total);
        return acc;
      }, {}),
      start_time: session.start_time,
      end_time: session.end_time
    };
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    req.logger.error('Failed to get progress', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/sessions/:id/stage1-progress
 * Получить прогресс выполнения Stage 1 в реальном времени
 */
router.get('/:id/stage1-progress', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Получить прогресс из БД
    const { data: progress, error } = await req.db.supabase
      .from('stage1_progress')
      .select('*')
      .eq('session_id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      throw new Error(`Failed to fetch Stage 1 progress: ${error.message}`);
    }
    
    // Если нет записи, значит Stage 1 еще не запускался
    if (!progress) {
      return res.json({
        success: true,
        progress: {
          sessionId: id,
          totalQueries: 0,
          processedQueries: 0,
          remainingQueries: 0,
          status: 'idle',
          currentQuery: null,
          lastError: null,
          percentComplete: 0
        }
      });
    }
    
    // Вычислить процент завершения
    const percentComplete = progress.total_queries > 0
      ? Math.round((progress.processed_queries / progress.total_queries) * 100)
      : 0;
    
    res.json({
      success: true,
      progress: {
        sessionId: id,
        totalQueries: progress.total_queries,
        processedQueries: progress.processed_queries,
        remainingQueries: progress.remaining_queries,
        status: progress.status,
        currentQuery: progress.current_query,
        lastError: progress.last_error,
        percentComplete,
        updatedAt: progress.updated_at
      }
    });
    
  } catch (error) {
    req.logger.error('Failed to get Stage 1 progress', { 
      error: error.message,
      sessionId: req.params.id
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/sessions/:id/status
 * Обновить статус сессии
 */
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['active', 'completed', 'paused', 'failed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    const updateData = { status, updated_at: new Date() };
    
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      updateData.end_time = new Date();
    }
    
    await req.db.query(
      `UPDATE search_sessions 
       SET status = $1, end_time = $2, updated_at = $3
       WHERE session_id = $4`,
      [status, updateData.end_time, updateData.updated_at, id]
    );
    
    req.logger.info('Session status updated', { sessionId: id, status });
    
    res.json({
      success: true,
      message: 'Session status updated',
      status
    });
  } catch (error) {
    req.logger.error('Failed to update session status', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/sessions/:id
 * Удалить сессию
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await req.db.query(
      'DELETE FROM search_sessions WHERE session_id = $1',
      [id]
    );
    
    req.logger.info('Session deleted', { sessionId: id });
    
    res.json({
      success: true,
      message: 'Session deleted'
    });
  } catch (error) {
    req.logger.error('Failed to delete session', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sessions/:id/process-stage/:stageNum
 * Запустить обработку конкретного этапа (для пошагового режима)
 */
router.post('/:id/process-stage/:stageNum', async (req, res) => {
  try {
    const { id, stageNum } = req.params;
    const stage = parseInt(stageNum);
    
    if (!req.orchestrator) {
      return res.status(503).json({
        success: false,
        error: 'Query orchestrator not available'
      });
    }
    
    if (stage < 1 || stage > 4) {
      return res.status(400).json({
        success: false,
        error: 'Stage must be between 1 and 4'
      });
    }
    
    // ====== КЭШИРОВАНИЕ ОТКЛЮЧЕНО ======
    // Всегда выполняем stage заново, не проверяем processing_progress
    /*
    // Проверить, не был ли этап уже выполнен
    const progressCheck = await req.db.query(
      `SELECT * FROM processing_progress 
       WHERE session_id = $1 AND stage = $2 AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`,
      [id, `stage${stage}`]
    );
    
    if (progressCheck.rows.length > 0) {
      req.logger.info(`Stage ${stage} already completed, returning cached result`, { 
        sessionId: id,
        cachedSessionId: progressCheck.rows[0].session_id,
        stage: progressCheck.rows[0].stage,
        completedAt: progressCheck.rows[0].completed_at
      });
      
      // ВАЖНО: Проверить что это кэш ИМЕННО для ЭТОЙ сессии
      if (progressCheck.rows[0].session_id !== id) {
        req.logger.error('Cache mismatch! Cached session_id does not match requested session_id', {
          requested: id,
          cached: progressCheck.rows[0].session_id
        });
        // НЕ использовать неправильный кэш - пропустить и выполнить stage заново
      } else {
      
      // Вернуть сохраненный результат
      let cachedResult = {};
      
      if (progressCheck.rows[0].result_data) {
        try {
          // Попробовать распарсить если это строка
          cachedResult = typeof progressCheck.rows[0].result_data === 'string' 
            ? JSON.parse(progressCheck.rows[0].result_data)
            : progressCheck.rows[0].result_data;
        } catch (parseError) {
          req.logger.error('Failed to parse cached result', { 
            error: parseError.message,
            data: progressCheck.rows[0].result_data 
          });
          cachedResult = {};
        }
      }
      
      // СПЕЦИАЛЬНАЯ ЛОГИКА ДЛЯ STAGE 2: если был пропущен, загрузить актуальные данные
      if (stage === 2 && cachedResult.skipped) {
        req.logger.info('Stage 2 was skipped, reloading actual company data from DB');
        
        // Загрузить все компании с сайтами из Stage 1
        const companiesResult = await req.db.query(
          `SELECT company_name, website, email, stage, confidence_score, 
                  (website IS NOT NULL AND stage = 'names_found') as "foundInStage1"
           FROM pending_companies 
           WHERE session_id = $1`,
          [id]
        );
        
        cachedResult.websites = companiesResult.rows.map(row => ({
          company_name: row.company_name,
          website: row.website,
          email: row.email,
          stage: row.stage,
          confidence: row.confidence_score,
          foundInStage1: row.foundInStage1
        }));
        
        cachedResult.companiesProcessed = companiesResult.rows.length;
        cachedResult.websitesFound = companiesResult.rows.filter(r => r.website).length;
      }
      
      req.logger.info(`Returning cached result for stage ${stage}`, { 
        sessionId: id,
        hasData: !!cachedResult,
        companiesCount: cachedResult.companies?.length || cachedResult.websites?.length || 0
      });
      
      return res.json({
        success: true,
        stage,
        cached: true,
        completedAt: progressCheck.rows[0].completed_at,
        duration: progressCheck.rows[0].duration_seconds,
        data: cachedResult
      });
      } // Закрываем else блок для проверки session_id
    }
    */
    
    req.logger.info(`Starting stage ${stage} processing`, { sessionId: id });
    
    let result = {};
    const startTime = new Date();
    
    try {
      // Выполнить конкретный этап
      if (stage === 1) {
        // Stage 1: Find Companies
        result = await req.orchestrator.runStage1Only(id);
      } else if (stage === 2) {
        // Stage 2: Find Websites
        result = await req.orchestrator.runStage2Only(id);
      } else if (stage === 3) {
        // Stage 3: Find Contacts
        result = await req.orchestrator.runStage3Only(id);
      } else if (stage === 4) {
        // Stage 4: Validate Data
        result = await req.orchestrator.runStage4Only(id);
      }
      
      const endTime = new Date();
      const duration = (endTime - startTime) / 1000; // секунды
      
      // Сохранить прогресс этапа
      const { error: progressError } = await req.db.supabase
        .from('processing_progress')
        .insert({
          session_id: id,
          stage: `stage${stage}`,
          stage_name: `stage${stage}`,
          status: 'completed',
          started_at: startTime.toISOString(),
          completed_at: endTime.toISOString(),
          result_data: result,
          duration_seconds: duration
        });
      
      if (progressError) {
        req.logger.error(`Failed to save stage ${stage} progress`, {
          error: progressError.message
        });
      }
      
      req.logger.info(`Stage ${stage} completed and saved`, { 
        sessionId: id, 
        duration: duration.toFixed(2) + 's',
        result 
      });
      
      res.json({
        success: true,
        stage,
        cached: false,
        duration,
        data: result
      });
      
    } catch (stageError) {
      // Сохранить ошибку
      const { error: errorSaveError } = await req.db.supabase
        .from('processing_progress')
        .insert({
          session_id: id,
          stage: `stage${stage}`,
          stage_name: `stage${stage}`,
          status: 'failed',
          started_at: startTime.toISOString(),
          error_message: stageError.message
        });
      
      if (errorSaveError) {
        req.logger.error('Failed to save stage error', {
          error: errorSaveError.message
        });
      }
      
      req.logger.error(`Stage ${stage} failed`, { 
        sessionId: id, 
        error: stageError.message 
      });
      
      res.status(500).json({
        success: false,
        error: stageError.message,
        stage
      });
    }
    
  } catch (error) {
    req.logger.error('Failed to process stage', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/sessions/:id/stage-progress
 * Получить статус выполнения всех этапов для сессии
 */
router.get('/:id/stage-progress', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Получить все выполненные этапы
    const { data: progressData, error } = await req.db.supabase
      .from('processing_progress')
      .select('stage_name, status, started_at, completed_at, duration_seconds, error_message')
      .eq('session_id', id)
      .order('started_at', { ascending: false });
    
    if (error) {
      throw new Error(`Failed to fetch progress: ${error.message}`);
    }
    
    // Сгруппировать по этапам (последняя попытка каждого)
    const stageStatus = {};
    const stages = ['stage1', 'stage2', 'stage3', 'stage4'];
    
    stages.forEach((stageName, index) => {
      const stageNum = index + 1;
      const stageProgress = progressData?.find(row => row.stage_name === stageName);
      
      if (stageProgress) {
        stageStatus[`stage${stageNum}`] = {
          number: stageNum,
          status: stageProgress.status,
          completedAt: stageProgress.completed_at,
          duration: stageProgress.duration_seconds,
          error: stageProgress.error_message
        };
      } else {
        stageStatus[`stage${stageNum}`] = {
          number: stageNum,
          status: 'pending',
          completedAt: null,
          duration: null,
          error: null
        };
      }
    });
    
    // Определить последний завершенный этап
    let lastCompletedStage = 0;
    for (let i = 1; i <= 4; i++) {
      if (stageStatus[`stage${i}`].status === 'completed') {
        lastCompletedStage = i;
      } else {
        break;
      }
    }
    
    res.json({
      success: true,
      sessionId: id,
      lastCompletedStage,
      nextStage: lastCompletedStage < 4 ? lastCompletedStage + 1 : null,
      stages: stageStatus,
      canContinue: lastCompletedStage > 0 && lastCompletedStage < 4
    });
    
  } catch (error) {
    req.logger.error('Failed to get stage progress', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sessions/:id/process
 * Запустить обработку для существующей сессии
 */
router.post('/:id/process', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.orchestrator) {
      return res.status(503).json({
        success: false,
        error: 'Query orchestrator not available'
      });
    }
    
    // Проверить существование сессии
    const { data: sessionData, error } = await req.db.supabase
      .from('search_sessions')
      .select('*')
      .eq('session_id', id)
      .single();
    
    if (error || !sessionData) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    // Проверить статус
    if (sessionData.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Session already completed'
      });
    }
    
    req.logger.info('Starting session processing', { sessionId: id });
    
    // Запустить обработку в фоне
    req.orchestrator.processSession(id, sessionData.search_query)
      .then(() => {
        req.logger.info('Session processing completed', { sessionId: id });
      })
      .catch(error => {
        req.logger.error('Session processing failed', { 
          sessionId: id, 
          error: error.message 
        });
      });
    
    res.json({
      success: true,
      message: 'Processing started',
      session_id: id
    });
  } catch (error) {
    req.logger.error('Failed to start processing', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sessions/retry-email-search
 * Повторный поиск email для компаний без email (используя DeepSeek)
 */
router.post('/retry-email-search', async (req, res) => {
  try {
    req.logger.info('Starting retry email search with DeepSeek');
    
    const Stage3Retry = require('../stages/Stage3Retry');
    const DeepSeekClient = require('../services/DeepSeekClient');
    
    // Создать клиент DeepSeek
    const deepseek = new DeepSeekClient(
      process.env.DEEPSEEK_API_KEY,
      req.logger,
      'chat' // Используем chat модель
    );
    
    const stage3Retry = new Stage3Retry(
      req.db,
      req.logger,
      req.settingsManager,
      deepseek
    );
    
    const result = await stage3Retry.execute();
    
    res.json({
      success: true,
      ...result
    });
    
  } catch (error) {
    req.logger.error('Retry email search failed', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sessions/:id/stage1
 * Запуск Stage 1 для конкретной сессии
 */
router.post('/:id/stage1', async (req, res) => {
  try {
    const { id } = req.params;
    req.logger.info('Starting Stage 1 for session', { sessionId: id });
    
    // Используем QueryOrchestrator для отслеживания прогресса
    if (!req.orchestrator) {
      // Fallback: если orchestrator недоступен, используем прямой вызов
      req.logger.warn('Orchestrator not available, using direct Stage1 call');
    
      const Stage1FindCompanies = require('../stages/Stage1FindCompanies');
    const stage1 = new Stage1FindCompanies(
        req.sonarProClient,
      req.settingsManager,
      req.db,
      req.logger
    );
    
    const result = await stage1.execute(id);
    
      return res.json({
      success: true,
      ...result
      });
    }
    
    // Используем orchestrator для прогресс-трекинга
    const result = await req.orchestrator.runStage1Only(id);
    
    res.json({
      success: true,
      queriesProcessed: result.queriesProcessed,
      companiesFound: result.companiesFound,
      total: result.companiesFound,
      companies: result.companies
    });
    
  } catch (error) {
    req.logger.error('Stage 1 failed', { 
      error: error.message,
      stack: error.stack,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      sessionId: req.params.id 
    });
    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error occurred',
      details: error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : undefined
    });
  }
});

/**
 * POST /api/sessions/global/stage2
 * Глобальный запуск Stage 2 для всех готовых компаний
 */
router.post('/global/stage2', async (req, res) => {
  try {
    req.logger.info('Starting global Stage 2');
    
    const Stage2FindWebsites = require('../stages/Stage2FindWebsites');
    
    // Использовать уже инициализированный Sonar Basic client (с API ключом)
    const stage2 = new Stage2FindWebsites(
      req.sonarBasicClient,
      req.settingsManager,
      req.db,
      req.logger
    );
    
    // Запустить без sessionId = обработать ВСЕ компании
    const result = await stage2.execute();
    
    res.json({
      success: true,
      ...result
    });
    
  } catch (error) {
    req.logger.error('Global Stage 2 failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sessions/global/stage3
 * Глобальный запуск Stage 3 для всех готовых компаний
 */
router.post('/global/stage3', async (req, res) => {
  try {
    req.logger.info('Starting global Stage 3');
    
    const Stage3AnalyzeContacts = require('../stages/Stage3AnalyzeContacts');
    
    // Использовать уже инициализированный Sonar Basic client (с API ключом)
    const stage3 = new Stage3AnalyzeContacts(
      req.sonarBasicClient,
      req.settingsManager,
      req.db,
      req.logger
    );
    
    // Запустить без sessionId = обработать ВСЕ компании
    const result = await stage3.execute();
    
    res.json({
      success: true,
      ...result
    });
    
  } catch (error) {
    req.logger.error('Global Stage 3 failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sessions/global/stage4
 * Глобальный запуск Stage 4 для всех готовых компаний
 */
router.post('/global/stage4', async (req, res) => {
  try {
    req.logger.info('Starting global Stage 4');
    
    const Stage4AnalyzeServices = require('../stages/Stage4AnalyzeServices');
    
    // Использовать уже инициализированный DeepSeek client
    const stage4 = new Stage4AnalyzeServices(
      req.deepseekClient,
      req.settingsManager,
      req.db,
      req.logger
    );
    
    // Запустить без sessionId = обработать ВСЕ компании
    const result = await stage4.execute();
    
    res.json({
      success: true,
      ...result
    });
    
  } catch (error) {
    req.logger.error('Global Stage 4 failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

