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
      queries,      // Массив выбранных запросов
      sessionId     // Опционально: существующий sessionId для объединения запросов
    } = req.body;

    if (!mainTopic || !queries || queries.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'mainTopic and queries are required'
      });
    }

    req.logger.info('Queries API: Saving queries', { 
      mainTopic, 
      count: queries.length,
      existingSession: !!sessionId
    });

    let finalSessionId = sessionId;
    
    // Если sessionId не передан - создать новую сессию
    if (!finalSessionId) {
      const { v4: uuidv4 } = require('uuid');
      finalSessionId = uuidv4();
      
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
          session_id: finalSessionId,
          search_query: mainTopic,
          topic_description: topic_description,
          target_count: queries.length,
          status: 'pending',
          created_at: now
        });
      
      if (insertError) {
        throw new Error(`Failed to create session: ${insertError.message}`);
      }
      
      req.logger.info('Queries API: New session created', { 
        sessionId: finalSessionId,
        topic_description
      });
    } else {
      // Обновить target_count для существующей сессии
      const { error: updateError } = await req.db.supabase
        .from('search_sessions')
        .update({
          target_count: req.db.supabase.raw('target_count + ?', [queries.length])
        })
        .eq('session_id', finalSessionId);
      
      if (updateError) {
        req.logger.warn('Failed to update session target_count', { 
          sessionId: finalSessionId, 
          error: updateError.message 
        });
      }
      
      req.logger.info('Queries API: Adding to existing session', { 
        sessionId: finalSessionId
      });
    }

    // Сохранить запросы в БД
    await req.queryExpander.saveQueries(finalSessionId, mainTopic, queries);

    req.logger.info('Queries API: Queries saved', { 
      sessionId: finalSessionId,
      count: queries.length 
    });

    res.json({
      success: true,
      sessionId: finalSessionId,
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

