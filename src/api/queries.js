const express = require('express');
const router = express.Router();

/**
 * POST /api/queries/generate
 * Генерировать под-запросы для темы (без создания сессии)
 */
router.post('/generate', async (req, res) => {
  try {
    // Ждать инициализации API клиентов
    if (req.waitForInit) {
      await req.waitForInit();
    }
    
    const {
      topic,                // Основная тема
      numQueries = 10       // Количество под-запросов
    } = req.body;

    if (!topic) {
      return res.status(400).json({
        success: false,
        error: 'topic is required'
      });
    }

    req.logger.info('Queries API: Generating sub-queries', { 
      topic, 
      numQueries 
    });

    // Генерировать под-запросы
    const result = await req.queryExpander.expandTopic(topic, numQueries);

    req.logger.info('Queries API: Queries generated successfully', { 
      count: result.queries.length 
    });

    res.json({
      success: true,
      queries: result.queries,
      total: result.total
    });

  } catch (error) {
    req.logger.error('Queries API: Failed to generate queries', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/queries/save
 * Сохранить выбранные запросы и создать сессию
 */
router.post('/save', async (req, res) => {
  try {
    const {
      mainTopic,    // Основная тема
      queries       // Массив выбранных запросов
    } = req.body;

    if (!mainTopic || !queries || queries.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'mainTopic and queries are required'
      });
    }

    req.logger.info('Queries API: Saving queries', { 
      mainTopic, 
      count: queries.length 
    });

    // Создать новую сессию
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
    
    const topic_description = `${mainTopic} [${timeStr}]`;
    
    // Сохранить сессию в БД
    const { error: insertError } = await req.db.supabase
      .from('search_sessions')
      .insert({
        session_id: sessionId,
        search_query: mainTopic,
        topic_description: topic_description,
        target_count: queries.length,
        status: 'pending',
        created_at: now
      });
    
    if (insertError) {
      throw new Error(`Failed to create session: ${insertError.message}`);
    }

    // Сохранить запросы в БД
    await req.queryExpander.saveQueries(sessionId, mainTopic, queries);

    req.logger.info('Queries API: Session created and queries saved', { 
      sessionId,
      topic_description,
      count: queries.length 
    });

    res.json({
      success: true,
      sessionId: sessionId,
      topic: topic_description,
      count: queries.length
    });

  } catch (error) {
    req.logger.error('Queries API: Failed to save queries', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

