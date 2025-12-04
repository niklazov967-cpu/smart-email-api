const express = require('express');
const router = express.Router();

/**
 * GET /api/credits/summary
 * Получить сводку расходов по всем API (DeepSeek, Perplexity)
 * Поддерживает фильтрацию по датам для получения статистики из БД
 */
router.get('/summary', async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    
    let stats;
    if (dateFrom || dateTo) {
      // Получить статистику из БД за период
      stats = await req.creditsTracker.getStatsFromDb({ dateFrom, dateTo });
    } else {
      // Получить глобальную статистику (in-memory + loaded from DB)
      stats = req.creditsTracker.getGlobalStats();
    }
    
    const summary = req.creditsTracker.getSummary();

    res.json({
      success: true,
      stats,
      summary_text: summary,
      source: (dateFrom || dateTo) ? 'database' : 'memory'
    });

  } catch (error) {
    req.logger.error('Credits API: Failed to get summary', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/credits/logs
 * Получить детальную историю вызовов API из БД
 */
router.get('/logs', async (req, res) => {
  try {
    const { limit, offset, stage, model, service, dateFrom, dateTo } = req.query;
    
    const result = await req.creditsTracker.getCallHistory({
      limit: parseInt(limit) || 1000,
      offset: parseInt(offset) || 0,
      stage,
      model,
      service,
      dateFrom,
      dateTo
    });

    res.json({
      success: true,
      logs: result.logs,
      total: result.total,
      offset: result.offset,
      limit: result.limit,
      source: 'database'
    });

  } catch (error) {
    req.logger.error('Credits API: Failed to get logs', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message,
      logs: []
    });
  }
});

/**
 * GET /api/credits/stats/total
 * Получить общую статистику по всем сервисам
 */
router.get('/stats/total', async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    
    let stats;
    if (dateFrom || dateTo) {
      stats = await req.creditsTracker.getStatsFromDb({ dateFrom, dateTo });
    } else {
      stats = req.creditsTracker.getGlobalStats();
    }

    res.json({
      success: true,
      data: stats,
      source: (dateFrom || dateTo) ? 'database' : 'memory'
    });

  } catch (error) {
    req.logger.error('Credits API: Failed to get total stats', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/credits/pricing
 * Получить таблицу цен всех API
 */
router.get('/pricing', async (req, res) => {
  try {
    res.json({
      success: true,
      pricing: {
        deepseek: {
          'deepseek-chat': {
            input: '$0.14 / 1M tokens',
            output: '$0.28 / 1M tokens',
            note: 'Очень дешёвый!'
          },
          'deepseek-reasoner': {
            input: '$0.55 / 1M tokens',
            output: '$2.19 / 1M tokens',
            note: 'Для сложных задач'
          }
        },
        perplexity: {
          'sonar': {
            input: '$1.00 / 1M tokens',
            output: '$1.00 / 1M tokens'
          },
          'sonar-pro': {
            input: '$3.00 / 1M tokens',
            output: '$15.00 / 1M tokens'
          },
          'llama-3.1-sonar-large-128k-online': {
            input: '$1.00 / 1M tokens',
            output: '$1.00 / 1M tokens',
            note: 'Legacy model'
          }
        }
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
 * POST /api/credits/reset
 * Сбросить статистику (только in-memory, БД не трогаем)
 */
router.post('/reset', async (req, res) => {
  try {
    req.creditsTracker.reset();

    res.json({
      success: true,
      message: 'In-memory statistics reset successfully. Database records preserved.'
    });

  } catch (error) {
    req.logger.error('Credits API: Failed to reset stats', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/credits/session/:sessionId
 * Получить расходы для конкретной сессии
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const stats = req.creditsTracker.getSessionStats(sessionId);

    res.json({
      success: true,
      session_id: sessionId,
      data: stats
    });

  } catch (error) {
    req.logger.error('Credits API: Failed to get session stats', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/credits/estimate
 * Оценить стоимость запроса
 */
router.post('/estimate', async (req, res) => {
  try {
    const { service, model, estimated_tokens } = req.body;

    if (!service || !model) {
      return res.status(400).json({
        success: false,
        error: 'service and model are required'
      });
    }

    const estimate = req.creditsTracker.estimateCost(
      service, 
      model, 
      estimated_tokens || 1000
    );

    res.json({
      success: true,
      data: estimate
    });

  } catch (error) {
    req.logger.error('Credits API: Failed to estimate cost', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/credits/:sessionId (legacy)
 * Получить текущие расходы для сессии
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const stats = req.creditsTracker.getSessionStats(sessionId);

    res.json({
      success: true,
      session_id: sessionId,
      data: stats
    });

  } catch (error) {
    req.logger.error('Credits API: Failed to get session costs', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/credits/:sessionId/realtime
 * WebSocket-like endpoint для получения расходов в реальном времени (SSE)
 */
router.get('/:sessionId/realtime', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Настройка SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Отправить начальные данные
    const initialStats = req.creditsTracker.getSessionStats(sessionId);
    res.write(`data: ${JSON.stringify(initialStats)}\n\n`);

    // Обновлять каждые 2 секунды
    const intervalId = setInterval(() => {
      try {
        const stats = req.creditsTracker.getSessionStats(sessionId);
        res.write(`data: ${JSON.stringify(stats)}\n\n`);
      } catch (error) {
        req.logger.error('Credits API: SSE update failed', { 
          error: error.message 
        });
      }
    }, 2000);

    // Очистить интервал при закрытии соединения
    req.on('close', () => {
      clearInterval(intervalId);
      req.logger.info('Credits API: SSE connection closed', { sessionId });
    });

  } catch (error) {
    req.logger.error('Credits API: Failed to establish SSE', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
