const express = require('express');
const router = express.Router();

/**
 * POST /api/topics
 * Создать тему и сгенерировать под-запросы
 */
router.post('/', async (req, res) => {
  try {
    const {
      main_topic,           // Основная тема на китайском
      target_count = 10     // Количество под-запросов
    } = req.body;

    if (!main_topic) {
      return res.status(400).json({
        success: false,
        error: 'main_topic is required'
      });
    }

    req.logger.info('Topics API: Generating sub-queries', { 
      main_topic, 
      target_count 
    });

    // Генерировать под-запросы
    const result = await req.queryExpander.expandTopic(main_topic, target_count);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    req.logger.error('Topics API: Failed to generate queries', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/topics/:sessionId/generate
 * Сгенерировать и сохранить запросы для существующей сессии
 */
router.post('/:sessionId/generate', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { target_count = 10 } = req.body;

    // Получить тему из сессии
    const sessionResult = await req.db.query(
      'SELECT search_query FROM search_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const mainTopic = sessionResult.rows[0].search_query;

    // Генерировать запросы
    const result = await req.queryExpander.expandTopic(mainTopic, target_count);

    // Сохранить в БД
    await req.queryExpander.saveQueries(sessionId, mainTopic, result.queries);

    req.logger.info('Topics API: Queries generated and saved', { 
      sessionId, 
      count: result.queries.length 
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    req.logger.error('Topics API: Failed to generate queries', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/topics/:sessionId/queries
 * Получить все запросы для сессии
 */
router.get('/:sessionId/queries', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const queries = await req.queryExpander.getQueriesForSession(sessionId);

    res.json({
      success: true,
      count: queries.length,
      data: queries
    });

  } catch (error) {
    req.logger.error('Topics API: Failed to get queries', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/topics/:sessionId/select
 * Обновить выбранные запросы
 */
router.put('/:sessionId/select', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { query_ids } = req.body;

    if (!Array.isArray(query_ids)) {
      return res.status(400).json({
        success: false,
        error: 'query_ids must be an array'
      });
    }

    await req.queryExpander.updateSelectedQueries(sessionId, query_ids);

    req.logger.info('Topics API: Selected queries updated', { 
      sessionId, 
      count: query_ids.length 
    });

    res.json({
      success: true,
      message: 'Selected queries updated',
      selected_count: query_ids.length
    });

  } catch (error) {
    req.logger.error('Topics API: Failed to update selected queries', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/topics/:sessionId/selected
 * Получить только выбранные запросы
 */
router.get('/:sessionId/selected', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await req.db.query(
      `SELECT * FROM session_queries 
       WHERE session_id = $1 AND is_selected = true
       ORDER BY is_main DESC, relevance DESC`,
      [sessionId]
    );

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });

  } catch (error) {
    req.logger.error('Topics API: Failed to get selected queries', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

