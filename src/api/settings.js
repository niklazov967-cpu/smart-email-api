const express = require('express');
const router = express.Router();

/**
 * GET /api/settings
 * Получить все настройки
 */
router.get('/', async (req, res) => {
  try {
    const settings = await req.settingsManager.getAllSettings();
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    req.logger.error('Failed to get settings', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/settings/:category
 * Получить настройки по категории
 */
router.get('/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const settings = await req.settingsManager.getCategory(category);
    res.json({
      success: true,
      category,
      data: settings
    });
  } catch (error) {
    req.logger.error('Failed to get category', { error: error.message });
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/settings/:category/:key
 * Получить конкретную настройку
 */
router.get('/:category/:key', async (req, res) => {
  try {
    const { category, key } = req.params;
    const value = await req.settingsManager.getSetting(category, key);
    res.json({
      success: true,
      category,
      key,
      value
    });
  } catch (error) {
    req.logger.error('Failed to get setting', { error: error.message });
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/settings/:category/:key
 * Обновить настройку
 */
router.put('/:category/:key', async (req, res) => {
  try {
    const { category, key } = req.params;
    const { value, reason } = req.body;
    const changedBy = req.body.changedBy || 'api_user';
    
    if (value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Value is required'
      });
    }
    
    const result = await req.settingsManager.setSetting(category, key, value, changedBy, reason || '');
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    req.logger.error('Failed to update setting', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/settings/:category/:key/reset
 * Восстановить настройку по умолчанию
 */
router.post('/:category/:key/reset', async (req, res) => {
  try {
    const { category, key } = req.params;
    const changedBy = req.body.changedBy || 'api_user';
    
    const result = await req.settingsManager.resetSetting(category, key, changedBy);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    req.logger.error('Failed to reset setting', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/settings/:category/reset
 * Восстановить всю категорию по умолчанию
 */
router.post('/:category/reset', async (req, res) => {
  try {
    const { category } = req.params;
    const changedBy = req.body.changedBy || 'api_user';
    
    const results = await req.settingsManager.resetCategory(category, changedBy);
    
    res.json({
      success: true,
      category,
      results
    });
  } catch (error) {
    req.logger.error('Failed to reset category', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/settings/:category/:key/history
 * Получить историю изменений настройки
 */
router.get('/:category/:key/history', async (req, res) => {
  try {
    const { category, key } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    const history = await req.settingsManager.getHistory(category, key, limit);
    
    res.json({
      success: true,
      category,
      key,
      history
    });
  } catch (error) {
    req.logger.error('Failed to get history', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/settings/export
 * Экспортировать все настройки
 */
router.get('/export', async (req, res) => {
  try {
    const exportData = await req.settingsManager.exportSettings();
    
    res.json({
      success: true,
      ...exportData
    });
  } catch (error) {
    req.logger.error('Failed to export settings', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/settings/import
 * Импортировать настройки
 */
router.post('/import', async (req, res) => {
  try {
    const { settings, exported_at, version } = req.body;
    const changedBy = req.body.changedBy || 'api_user';
    
    if (!settings) {
      return res.status(400).json({
        success: false,
        error: 'Settings data is required'
      });
    }
    
    const results = await req.settingsManager.importSettings(
      { settings, exported_at, version },
      changedBy
    );
    
    res.json({
      success: true,
      imported: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });
  } catch (error) {
    req.logger.error('Failed to import settings', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

