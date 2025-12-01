/**
 * API для резервного копирования базы данных
 */

const express = require('express');
const router = express.Router();

/**
 * POST /api/backup/create
 * Создать резервную копию всех таблиц БД
 */
router.post('/create', async (req, res) => {
  try {
    const { db, logger } = req;
    
    logger.info('Creating database backup...');

    // 1. Получить все данные из таблиц
    const tables = [
      'pending_companies',
      'pending_companies_ru',
      'search_sessions',
      'system_settings'
    ];

    const backupData = {
      metadata: {
        created_at: new Date().toISOString(),
        version: '1.0',
        tables: tables
      },
      data: {}
    };

    // 2. Выгрузить каждую таблицу
    for (const table of tables) {
      try {
        const { data, error } = await db.supabase
          .from(table)
          .select('*');

        if (error) {
          logger.warn(`Failed to backup table ${table}:`, error.message);
          backupData.data[table] = {
            error: error.message,
            rows: []
          };
        } else {
          backupData.data[table] = {
            rows: data || [],
            count: data?.length || 0
          };
          logger.info(`✅ Backed up ${table}: ${data?.length || 0} rows`);
        }
      } catch (err) {
        logger.error(`Error backing up ${table}:`, err);
        backupData.data[table] = {
          error: err.message,
          rows: []
        };
      }
    }

    // 3. Создать JSON файл
    const filename = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const jsonContent = JSON.stringify(backupData, null, 2);
    
    // 4. Статистика
    const stats = {
      companies: backupData.data.pending_companies?.count || 0,
      translations: backupData.data.pending_companies_ru?.count || 0,
      sessions: backupData.data.search_sessions?.count || 0,
      settings: backupData.data.system_settings?.count || 0,
      size: Buffer.byteLength(jsonContent, 'utf8')
    };

    logger.info('Database backup created successfully', stats);

    // 5. Вернуть данные для скачивания
    res.json({
      success: true,
      filename: filename,
      stats: stats,
      downloadUrl: `/api/backup/download?data=${encodeURIComponent(jsonContent)}`
    });

  } catch (error) {
    req.logger?.error('Error creating backup:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/backup/download
 * Скачать backup файл
 */
router.get('/download', async (req, res) => {
  try {
    const data = req.query.data;
    
    if (!data) {
      return res.status(400).json({ error: 'No data provided' });
    }

    const filename = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(decodeURIComponent(data));
    
  } catch (error) {
    req.logger?.error('Error downloading backup:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/backup/restore
 * Восстановить базу данных из backup файла
 */
router.post('/restore', async (req, res) => {
  try {
    const { db, logger } = req;
    const backupData = req.body;

    if (!backupData || !backupData.data) {
      return res.status(400).json({
        success: false,
        error: 'Invalid backup data'
      });
    }

    logger.info('Starting database restore...');

    const results = {};

    // Восстановить каждую таблицу
    for (const [tableName, tableData] of Object.entries(backupData.data)) {
      if (!tableData.rows || tableData.rows.length === 0) {
        results[tableName] = {
          success: true,
          inserted: 0,
          message: 'No data to restore'
        };
        continue;
      }

      try {
        // Используем upsert для избежания конфликтов
        const { data, error } = await db.supabase
          .from(tableName)
          .upsert(tableData.rows, {
            onConflict: tableName === 'pending_companies' ? 'company_id' :
                       tableName === 'pending_companies_ru' ? 'company_id' :
                       tableName === 'search_sessions' ? 'session_id' :
                       tableName === 'system_settings' ? 'category,key' : null
          });

        if (error) {
          logger.error(`Failed to restore ${tableName}:`, error.message);
          results[tableName] = {
            success: false,
            error: error.message
          };
        } else {
          logger.info(`✅ Restored ${tableName}: ${tableData.rows.length} rows`);
          results[tableName] = {
            success: true,
            inserted: tableData.rows.length
          };
        }
      } catch (err) {
        logger.error(`Error restoring ${tableName}:`, err);
        results[tableName] = {
          success: false,
          error: err.message
        };
      }
    }

    res.json({
      success: true,
      results: results,
      message: 'Restore completed'
    });

  } catch (error) {
    req.logger?.error('Error restoring backup:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

