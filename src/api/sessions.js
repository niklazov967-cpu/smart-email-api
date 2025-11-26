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
    const session = {
      session_id: sessionId,
      search_query,
      target_count,
      priority,
      status: 'active',
      start_time: new Date(),
      created_at: new Date()
    };

    // Сохранить в БД
    await req.db.query(
      `INSERT INTO search_sessions 
       (session_id, search_query, target_count, priority, status, start_time)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sessionId, search_query, target_count, priority, 'active', new Date()]
    );

    req.logger.info('Session created', { sessionId, search_query });

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

