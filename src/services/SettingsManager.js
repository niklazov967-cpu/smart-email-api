const winston = require('winston');

/**
 * SettingsManager - Управление настройками системы
 * Загружает, кеширует и обновляет все 117 параметров конфигурации
 */
class SettingsManager {
  constructor(database, logger = null) {
    this.db = database;
    this.logger = logger || winston.createLogger({
      level: 'info',
      format: winston.format.simple(),
      transports: [new winston.transports.Console()]
    });
    
    this.cachedSettings = null;
    this.lastCacheTime = 0;
    this.CACHE_DURATION = 5 * 60 * 1000; // 5 минут
  }

  /**
   * Получить все настройки (с кешем)
   */
  async getAllSettings() {
    const now = Date.now();
    
    // Проверить кеш
    if (this.cachedSettings && (now - this.lastCacheTime) < this.CACHE_DURATION) {
      this.logger.debug('Settings loaded from cache');
      return this.cachedSettings;
    }

    this.logger.debug('Loading settings from database');
    
    const result = await this.db.query(
      'SELECT category, key, value FROM system_settings ORDER BY category, key'
    );

    this.cachedSettings = this._parseSettings(result.rows);
    this.lastCacheTime = now;
    
    this.logger.info(`Loaded ${result.rows.length} settings from database`);
    return this.cachedSettings;
  }

  /**
   * Получить параметр по ключу
   */
  async getSetting(category, settingKey) {
    const settings = await this.getAllSettings();
    const value = settings[category]?.[settingKey];
    
    if (value === undefined) {
      throw new Error(`Setting not found: ${category}.${settingKey}`);
    }
    
    return value;
  }

  /**
   * Получить все параметры категории
   */
  async getCategory(category) {
    try {
      const settings = await this.getAllSettings();
      
      if (!settings[category]) {
        this.logger.warn(`Category not found in DB: ${category}, using defaults`);
        return this._getDefaultSettings(category);
      }
      
      // Проверить критичные поля для API категории
      if (category === 'api' && !settings[category].api_key) {
        this.logger.warn(`API key missing in DB settings for category: ${category}, using defaults`);
        return this._getDefaultSettings(category);
      }
      
      return settings[category];
    } catch (error) {
      this.logger.error(`Failed to get category settings: ${category}`, error);
      return this._getDefaultSettings(category);
    }
  }

  /**
   * Получить дефолтные настройки для категории
   */
  _getDefaultSettings(category) {
    const defaults = {
      processing_stages: {
        stage1_max_companies: 12,
        stage1_min_companies: 8,
        stage2_timeout: 30000,
        stage3_max_emails: 5,
        stage4_max_services: 10,
        stage5_max_tags: 20,
        api_call_delay: 2000
      },
      api: {
        api_key: process.env.PERPLEXITY_API_KEY || '',
        api_base_url: 'https://api.perplexity.ai',
        model_name: 'sonar-pro',
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 4000,
        max_retries: 3,
        api_timeout_seconds: 60,
        retry_delay_seconds: 2,
        rate_limit_requests_per_min: 60
      },
      deepseek: {
        api_key: process.env.DEEPSEEK_API_KEY || '',
        api_base_url: 'https://api.deepseek.com',
        model_name: 'deepseek-chat',
        temperature: 0.7,
        max_tokens: 4000,
        timeout_seconds: 60
      }
    };
    
    return defaults[category] || {};
  }

  /**
   * Установить новое значение параметра
   */
  async setSetting(category, settingKey, newValue, changedBy, reason = '') {
    // Получить старое значение
    const settingInfo = await this.db.query(
      `SELECT setting_id, value 
       FROM system_settings 
       WHERE category = $1 AND key = $2`,
      [category, settingKey]
    );

    if (settingInfo.rows.length === 0) {
      throw new Error(`Setting not found: ${category}.${settingKey}`);
    }

    const { setting_id, value: oldValue } = settingInfo.rows[0];

    // Обновить в БД (используем system_settings с полями key и value)
    await this.db.query(
      `UPDATE system_settings 
       SET value = $1, updated_at = NOW() 
       WHERE category = $2 AND key = $3`,
      [String(newValue), category, settingKey]
    );

    // settings_history может не существовать - обернем в try/catch
    try {
      await this.db.query(
        `INSERT INTO settings_history 
         (setting_id, setting_key, category, old_value, new_value, changed_by, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [setting_id, settingKey, category, oldValue, String(newValue), changedBy, reason]
      );
    } catch (historyError) {
      this.logger.warn('Failed to save settings history (table may not exist)', { error: historyError.message });
    }

    // Очистить кеш
    this.cachedSettings = null;

    this.logger.info(`Setting changed: ${category}.${settingKey}`, {
      oldValue,
      newValue,
      changedBy
    });

    return {
      success: true,
      requireRestart: false, // У system_settings нет этого поля
      oldValue,
      newValue
    };
  }

  /**
   * Восстановить параметр по умолчанию
   */
  async resetSetting(category, settingKey, changedBy) {
    const setting = await this.db.query(
      'SELECT value FROM system_settings WHERE category = $1 AND key = $2',
      [category, settingKey]
    );

    if (setting.rows.length === 0) {
      throw new Error(`Setting not found: ${category}.${settingKey}`);
    }

    // У system_settings нет default_value, используем из кода
    const defaults = this._getDefaultSettings(category);
    const defaultValue = defaults[settingKey];
    
    return this.setSetting(category, settingKey, defaultValue, changedBy, 'Reset to default');
  }

  /**
   * Восстановить всю категорию по умолчанию
   */
  async resetCategory(category, changedBy) {
    const settings = await this.db.query(
      'SELECT key FROM system_settings WHERE category = $1',
      [category]
    );

    const results = [];
    for (const row of settings.rows) {
      try {
        const result = await this.resetSetting(category, row.key, changedBy);
        results.push({ key: row.key, ...result });
      } catch (error) {
        results.push({ key: row.key, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Получить историю изменений параметра
   */
  async getHistory(category, settingKey, limit = 50) {
    try {
      const result = await this.db.query(
        `SELECT * FROM settings_history 
         WHERE category = $1 AND setting_key = $2 
         ORDER BY changed_at DESC 
         LIMIT $3`,
        [category, settingKey, limit]
      );

      return result.rows;
    } catch (error) {
      this.logger.warn('Settings history table does not exist', { error: error.message });
      return [];
    }
  }

  /**
   * Экспортировать все настройки в JSON
   */
  async exportSettings() {
    const settings = await this.getAllSettings();
    
    return {
      exported_at: new Date().toISOString(),
      version: '1.0.0',
      settings
    };
  }

  /**
   * Импортировать настройки из JSON
   */
  async importSettings(settingsData, changedBy) {
    const results = [];
    
    for (const [category, categorySettings] of Object.entries(settingsData.settings || {})) {
      for (const [key, value] of Object.entries(categorySettings)) {
        try {
          const result = await this.setSetting(category, key, value, changedBy, 'Imported from file');
          results.push({ category, key, ...result });
        } catch (error) {
          results.push({ category, key, success: false, error: error.message });
        }
      }
    }

    return results;
  }

  /**
   * Валидировать значение параметра
   */
  async _validateSetting(settingKey, value, type, rules) {
    // Проверить тип
    if (type === 'integer') {
      const intValue = parseInt(value);
      if (!Number.isInteger(intValue)) {
        throw new Error(`${settingKey}: Must be integer`);
      }
      if (rules.min !== undefined && intValue < rules.min) {
        throw new Error(`${settingKey}: Minimum value is ${rules.min}`);
      }
      if (rules.max !== undefined && intValue > rules.max) {
        throw new Error(`${settingKey}: Maximum value is ${rules.max}`);
      }
    }
    
    if (type === 'float') {
      const floatValue = parseFloat(value);
      if (isNaN(floatValue)) {
        throw new Error(`${settingKey}: Must be a number`);
      }
      if (rules.min !== undefined && floatValue < rules.min) {
        throw new Error(`${settingKey}: Minimum value is ${rules.min}`);
      }
      if (rules.max !== undefined && floatValue > rules.max) {
        throw new Error(`${settingKey}: Maximum value is ${rules.max}`);
      }
    }
    
    if (type === 'boolean') {
      if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
        throw new Error(`${settingKey}: Must be boolean`);
      }
    }
    
    if (type === 'string') {
      const strValue = String(value);
      
      if (rules.enum && !rules.enum.includes(strValue)) {
        throw new Error(`${settingKey}: Must be one of: ${rules.enum.join(', ')}`);
      }
      
      if (rules.pattern && !new RegExp(rules.pattern).test(strValue)) {
        throw new Error(`${settingKey}: Invalid format`);
      }
      
      if (rules.minLength && strValue.length < rules.minLength) {
        throw new Error(`${settingKey}: Minimum length is ${rules.minLength}`);
      }
    }

    return true;
  }

  /**
   * Парсить настройки в объект
   */
  _parseSettings(rows) {
    const result = {};
    
    rows.forEach(row => {
      if (!result[row.category]) {
        result[row.category] = {};
      }
      // Используем новые названия колонок: key и value (без префикса setting_)
      result[row.category][row.key] = row.value;
    });
    
    return result;
  }

  /**
   * Парсить значение по типу
   */
  _parseValue(value, type) {
    if (value === null || value === undefined) return null;
    
    if (type === 'json') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    if (type === 'integer') return parseInt(value);
    if (type === 'float') return parseFloat(value);
    if (type === 'boolean') return value === 'true' || value === true;
    
    return value;
  }

  /**
   * Очистить кеш (принудительно)
   */
  clearCache() {
    this.cachedSettings = null;
    this.lastCacheTime = 0;
    this.logger.debug('Settings cache cleared');
  }
}

module.exports = SettingsManager;

