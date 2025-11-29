const express = require('express');
const router = express.Router();
const SupabaseClient = require('../database/SupabaseClient');

/**
 * GET /api/credits/logs
 * Получить все логи API вызовов
 */
router.get('/logs', async (req, res) => {
  try {
    const db = new SupabaseClient();
    await db.initialize();

    const { data, error } = await db.supabase
      .from('api_credits_log')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Failed to fetch API logs:', error);
      return res.json({
        success: false,
        error: error.message,
        logs: []
      });
    }

    res.json({
      success: true,
      logs: data || [],
      total: data?.length || 0
    });

  } catch (error) {
    console.error('Error in /api/credits/logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      logs: []
    });
  }
});

/**
 * GET /api/credits/summary
 * Получить сводную статистику
 */
router.get('/summary', async (req, res) => {
  try {
    const db = new SupabaseClient();
    await db.initialize();

    // Получить все логи
    const { data: logs, error } = await db.supabase
      .from('api_credits_log')
      .select('*');

    if (error) {
      console.error('Failed to fetch API logs:', error);
      return res.json({
        success: false,
        error: error.message
      });
    }

    // Подсчитать статистику
    const totalCost = logs.reduce((sum, log) => sum + (parseFloat(log.cost_usd) || 0), 0);
    const totalTokens = logs.reduce((sum, log) => sum + (parseInt(log.total_tokens) || 0), 0);
    const totalCalls = logs.length;

    // Статистика по этапам
    const stageStats = {};
    logs.forEach(log => {
      const stage = log.stage || 'unknown';
      if (!stageStats[stage]) {
        stageStats[stage] = {
          calls: 0,
          tokens: 0,
          cost: 0
        };
      }
      stageStats[stage].calls++;
      stageStats[stage].tokens += parseInt(log.total_tokens) || 0;
      stageStats[stage].cost += parseFloat(log.cost_usd) || 0;
    });

    // Статистика по моделям
    const modelStats = {};
    logs.forEach(log => {
      const model = log.model_name || 'unknown';
      if (!modelStats[model]) {
        modelStats[model] = {
          calls: 0,
          tokens: 0,
          cost: 0
        };
      }
      modelStats[model].calls++;
      modelStats[model].tokens += parseInt(log.total_tokens) || 0;
      modelStats[model].cost += parseFloat(log.cost_usd) || 0;
    });

    res.json({
      success: true,
      summary: {
        totalCost,
        totalTokens,
        totalCalls,
        avgCostPerCall: totalCalls > 0 ? totalCost / totalCalls : 0,
        stageStats,
        modelStats
      }
    });

  } catch (error) {
    console.error('Error in /api/credits/summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/credits/logs
 * Очистить все логи (для тестирования)
 */
router.delete('/logs', async (req, res) => {
  try {
    const db = new SupabaseClient();
    await db.initialize();

    const { error } = await db.supabase
      .from('api_credits_log')
      .delete()
      .neq('log_id', '00000000-0000-0000-0000-000000000000'); // Удалить все

    if (error) {
      console.error('Failed to clear API logs:', error);
      return res.json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      message: 'Логи успешно очищены'
    });

  } catch (error) {
    console.error('Error in DELETE /api/credits/logs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

