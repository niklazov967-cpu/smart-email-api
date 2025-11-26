const express = require('express');
const router = express.Router();

/**
 * GET /api/credits/:sessionId
 * Получить текущие расходы для сессии
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const costs = await req.creditsTracker.getSessionCosts(sessionId);

    res.json({
      success: true,
      session_id: sessionId,
      data: costs
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
 * GET /api/credits/stats/total
 * Получить общую статистику по всем сессиям
 */
router.get('/stats/total', async (req, res) => {
  try {
    const stats = await req.creditsTracker.getTotalStats();

    res.json({
      success: true,
      data: stats
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
 * GET /api/credits/history
 * Получить историю расходов за период
 */
router.get('/history', async (req, res) => {
  try {
    const {
      start_date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      end_date = new Date().toISOString(),
      group_by = 'day'
    } = req.query;

    const history = await req.creditsTracker.getCostsHistory(
      start_date,
      end_date,
      group_by
    );

    res.json({
      success: true,
      period: {
        start: start_date,
        end: end_date,
        group_by
      },
      data: history
    });

  } catch (error) {
    req.logger.error('Credits API: Failed to get costs history', { 
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
    const {
      model_name,
      estimated_tokens
    } = req.body;

    if (!model_name || !estimated_tokens) {
      return res.status(400).json({
        success: false,
        error: 'model_name and estimated_tokens are required'
      });
    }

    const estimate = req.creditsTracker.estimateCost(model_name, estimated_tokens);

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
 * GET /api/credits/:sessionId/realtime
 * WebSocket-like endpoint для получения расходов в реальном времени
 * (Server-Sent Events)
 */
router.get('/:sessionId/realtime', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Настройка SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Отправить начальные данные
    const initialCosts = await req.creditsTracker.getSessionCosts(sessionId);
    res.write(`data: ${JSON.stringify(initialCosts)}\n\n`);

    // Обновлять каждые 2 секунды
    const intervalId = setInterval(async () => {
      try {
        const costs = await req.creditsTracker.getSessionCosts(sessionId);
        res.write(`data: ${JSON.stringify(costs)}\n\n`);
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

