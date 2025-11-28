const express = require('express');
const router = express.Router();

/**
 * POST /api/topics
 * Создать тему и сгенерировать под-запросы
 */
router.post('/', async (req, res) => {
  try {
    // Ждать инициализации API клиентов
    if (req.waitForInit) {
      await req.waitForInit();
    }
    
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

    // Создать новую сессию с автоматическим именем
    const { v4: uuidv4 } = require('uuid');
    const sessionId = uuidv4();
    
    // Форматировать время
    const now = new Date();
    const timeStr = now.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).replace(',', '');
    
    const topic_description = `${main_topic} [${timeStr}]`;
    
    // Сохранить сессию в БД через Supabase API
    const { error: insertError } = await req.db.supabase
      .from('search_sessions')
      .insert({
        session_id: sessionId,
        search_query: main_topic,
        topic_description: topic_description,
        target_count: target_count,
        status: 'pending',
        created_at: now
      });
    
    if (insertError) {
      throw new Error(`Failed to create session: ${insertError.message}`);
    }

    // Генерировать под-запросы
    const result = await req.queryExpander.expandTopic(main_topic, target_count);

    // Сохранить запросы в БД
    await req.queryExpander.saveQueries(sessionId, main_topic, result.queries);

    req.logger.info('Topics API: Session created and queries saved', { 
      sessionId,
      topic_description,
      count: result.queries.length 
    });

    res.json({
      success: true,
      data: {
        session_id: sessionId,
        main_topic: result.main_topic,
        queries: result.queries,
        total: result.total
      }
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

    // Получить тему из сессии через Supabase API
    const { data: sessionData, error: sessionError } = await req.db.supabase
      .from('search_sessions')
      .select('search_query, topic_description')
      .eq('session_id', sessionId)
      .single();

    if (sessionError || !sessionData) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const mainTopic = sessionData.search_query;
    const oldDescription = sessionData.topic_description;

    // Генерировать запросы
    const result = await req.queryExpander.expandTopic(mainTopic, target_count);

    // Сохранить в БД
    await req.queryExpander.saveQueries(sessionId, mainTopic, result.queries);

    // Обновить topic_description с количеством запросов
    const queriesCount = result.queries.length;
    let newDescription = oldDescription;
    
    // Извлечь время из старого описания если есть
    const timeMatch = oldDescription ? oldDescription.match(/\[([^\]]+)\]/) : null;
    if (timeMatch) {
      const timeStr = timeMatch[1];
      newDescription = `${mainTopic} [${timeStr}, ${queriesCount} запросов]`;
    } else {
      const now = new Date();
      const timeStr = now.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).replace(',', '');
      newDescription = `${mainTopic} [${timeStr}, ${queriesCount} запросов]`;
    }
    
    // Обновить topic_description в БД через Supabase API
    const { error: updateError } = await req.db.supabase
      .from('search_sessions')
      .update({ topic_description: newDescription })
      .eq('session_id', sessionId);
    
    if (updateError) {
      req.logger.warn('Failed to update topic_description', { error: updateError.message });
    }

    req.logger.info('Topics API: Queries generated and saved', { 
      sessionId, 
      count: queriesCount,
      description: newDescription
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
 * POST /api/topics/:sessionId/select
 * Обновить выбранные запросы
 */
router.post('/:sessionId/select', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { selected_query_ids, query_ids } = req.body;
    
    // Поддержка обоих параметров
    const ids = selected_query_ids || query_ids;

    if (!Array.isArray(ids)) {
      return res.status(400).json({
        success: false,
        error: 'selected_query_ids or query_ids must be an array'
      });
    }

    await req.queryExpander.updateSelectedQueries(sessionId, ids);

    req.logger.info('Topics API: Selected queries updated', { 
      sessionId, 
      count: ids.length 
    });

    res.json({
      success: true,
      message: 'Selected queries updated',
      selected_count: ids.length
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
 * PUT /api/topics/:sessionId/select
 * Обновить выбранные запросы (альтернативный метод)
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

    // Получить выбранные запросы через Supabase API
    const { data: queries, error } = await req.db.supabase
      .from('session_queries')
      .select('*')
      .eq('session_id', sessionId)
      .eq('is_selected', true)
      .order('is_main', { ascending: false })
      .order('relevance', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch selected queries: ${error.message}`);
    }

    res.json({
      success: true,
      count: queries?.length || 0,
      data: queries || []
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

