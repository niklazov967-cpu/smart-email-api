const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

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
 * DELETE /api/sessions/clear-all
 * Очистить всю базу данных (удалить все сессии и связанные данные)
 * ВАЖНО: Должен быть ПЕРЕД /:id чтобы не воспринимался как UUID
 */
router.delete('/clear-all', async (req, res) => {
  try {
    req.logger.info('Clearing all database data');

    // Удаляем все записи из таблиц (CASCADE удалит связанные записи)
    // Supabase требует WHERE clause
    await req.db.query('DELETE FROM search_sessions WHERE true');
    
    // Для уверенности очищаем и другие таблицы
    await req.db.query('DELETE FROM session_queries WHERE true');
    await req.db.query('DELETE FROM pending_companies WHERE true');
    await req.db.query('DELETE FROM found_companies WHERE true');
    await req.db.query('DELETE FROM processing_progress WHERE true');
    
    // Опционально: очистить кеш (если таблица существует)
    try {
      await req.db.query('DELETE FROM perplexity_cache WHERE true');
      await req.db.query('DELETE FROM api_calls WHERE true');
    } catch (error) {
      req.logger.warn('Could not clear cache tables', { error: error.message });
    }

    req.logger.info('Database cleared successfully');

    res.json({
      success: true,
      message: 'База данных очищена',
      cleared_tables: [
        'search_sessions',
        'session_queries',
        'pending_companies',
        'found_companies',
        'processing_progress',
        'perplexity_cache',
        'api_calls'
      ]
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
    
    if (stage < 1 || stage > 5) {
      return res.status(400).json({
        success: false,
        error: 'Stage must be between 1 and 5'
      });
    }
    
    // Проверить, не был ли этап уже выполнен
    const progressCheck = await req.db.query(
      `SELECT * FROM processing_progress 
       WHERE session_id = $1 AND stage_name = $2 AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`,
      [id, `stage${stage}`]
    );
    
    if (progressCheck.rows.length > 0) {
      req.logger.info(`Stage ${stage} already completed, returning cached result`, { 
        sessionId: id,
        completedAt: progressCheck.rows[0].completed_at
      });
      
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
      
      req.logger.info(`Returning cached result for stage ${stage}`, { 
        sessionId: id,
        hasData: !!cachedResult,
        companiesCount: cachedResult.companies?.length || 0
      });
      
      return res.json({
        success: true,
        stage,
        cached: true,
        completedAt: progressCheck.rows[0].completed_at,
        duration: progressCheck.rows[0].duration_seconds,
        data: cachedResult
      });
    }
    
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
        // Stage 4: Analyze Services
        result = await req.orchestrator.runStage4Only(id);
      } else if (stage === 5) {
        // Stage 5: Generate Tags
        result = await req.orchestrator.runStage5Only(id);
      }
      
      const endTime = new Date();
      const duration = (endTime - startTime) / 1000; // секунды
      
      // Сохранить прогресс этапа
      await req.db.query(
        `INSERT INTO processing_progress 
         (session_id, stage_name, status, started_at, completed_at, result_data, duration_seconds)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id, 
          `stage${stage}`, 
          'completed', 
          startTime, 
          endTime, 
          JSON.stringify(result),
          duration
        ]
      );
      
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
      await req.db.query(
        `INSERT INTO processing_progress 
         (session_id, stage_name, status, started_at, error_message)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, `stage${stage}`, 'failed', startTime, stageError.message]
      );
      
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
    const progressResult = await req.db.query(
      `SELECT stage_name, status, started_at, completed_at, duration_seconds, error_message
       FROM processing_progress 
       WHERE session_id = $1
       ORDER BY started_at DESC`,
      [id]
    );
    
    // Сгруппировать по этапам (последняя попытка каждого)
    const stageStatus = {};
    const stages = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5'];
    
    stages.forEach((stageName, index) => {
      const stageNum = index + 1;
      const stageProgress = progressResult.rows.find(row => row.stage_name === stageName);
      
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
    for (let i = 1; i <= 5; i++) {
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
      nextStage: lastCompletedStage < 5 ? lastCompletedStage + 1 : null,
      stages: stageStatus,
      canContinue: lastCompletedStage > 0 && lastCompletedStage < 5
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
    
    // Проверить статус
    if (session.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Session already completed'
      });
    }
    
    req.logger.info('Starting session processing', { sessionId: id });
    
    // Запустить обработку в фоне
    req.orchestrator.processSession(id, session.search_query)
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

module.exports = router;

