const express = require('express');
const router = express.Router();

/**
 * GET /api/progress/:sessionId
 * Получить текущий прогресс сессии
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const progress = await req.progressTracker.getCurrentProgress(sessionId);

    res.json({
      success: true,
      data: progress
    });

  } catch (error) {
    req.logger.error('Progress API: Failed to get progress', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/progress/:sessionId/logs
 * Получить последние логи обработки
 */
router.get('/:sessionId/logs', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50 } = req.query;

    const logs = await req.progressTracker.getRecentLogs(sessionId, parseInt(limit));

    res.json({
      success: true,
      count: logs.length,
      data: logs
    });

  } catch (error) {
    req.logger.error('Progress API: Failed to get logs', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/progress/:sessionId/realtime
 * Server-Sent Events для реального времени
 */
router.get('/:sessionId/realtime', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Настройка SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Отправить начальные данные
    const initialProgress = await req.progressTracker.getCurrentProgress(sessionId);
    res.write(`data: ${JSON.stringify(initialProgress)}\n\n`);

    // Обновлять каждую секунду
    const intervalId = setInterval(async () => {
      try {
        const progress = await req.progressTracker.getCurrentProgress(sessionId);
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
        
        // Если обработка завершена, остановить поток
        if (progress.overall_progress >= 100) {
          clearInterval(intervalId);
          res.end();
        }
      } catch (error) {
        req.logger.error('Progress API: SSE update failed', { 
          error: error.message 
        });
      }
    }, 1000);

    // Очистить интервал при закрытии соединения
    req.on('close', () => {
      clearInterval(intervalId);
      req.logger.info('Progress API: SSE connection closed', { sessionId });
    });

  } catch (error) {
    req.logger.error('Progress API: Failed to establish SSE', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/progress/:sessionId/validation
 * Получить статистику валидации
 */
router.get('/:sessionId/validation', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const stats = await req.companyValidator.getValidationStats(sessionId);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    req.logger.error('Progress API: Failed to get validation stats', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

