/**
 * ProgressTracker - Отслеживание прогресса обработки в реальном времени
 * Логирует каждый шаг и предоставляет данные для живого прогресс-бара
 */
class ProgressTracker {
  constructor(database, logger) {
    this.db = database;
    this.logger = logger;
    this.activeSteps = new Map(); // sessionId -> current step
  }

  /**
   * Начать новый этап обработки
   */
  async startStage(sessionId, stage, stepName, totalItems = 0) {
    try {
      const result = await this.db.query(
        `INSERT INTO processing_progress 
         (session_id, stage, step_name, status, progress_percent, current_item, total_items, started_at, message)
         VALUES ($1, $2, $3, 'in_progress', 0, 0, $4, NOW(), $5)
         RETURNING progress_id`,
        [sessionId, stage, stepName, totalItems, `Начало: ${stepName}`]
      );

      const progressId = result.rows[0].progress_id;
      this.activeSteps.set(sessionId, progressId);

      this.logger.info('ProgressTracker: Stage started', {
        sessionId,
        stage,
        stepName,
        progressId
      });

      return progressId;

    } catch (error) {
      this.logger.error('ProgressTracker: Failed to start stage', {
        error: error.message,
        sessionId
      });
      return null;
    }
  }

  /**
   * Обновить прогресс текущего этапа
   */
  async updateProgress(sessionId, currentItem, message = null, details = null) {
    try {
      const progressId = this.activeSteps.get(sessionId);
      if (!progressId) {
        this.logger.warn('ProgressTracker: No active step for session', { sessionId });
        return;
      }

      // Получить total_items для расчета процента
      const stepResult = await this.db.query(
        'SELECT total_items FROM processing_progress WHERE progress_id = $1',
        [progressId]
      );

      if (stepResult.rows.length === 0) return;

      const totalItems = stepResult.rows[0].total_items || 1;
      const progressPercent = Math.min(100, Math.round((currentItem / totalItems) * 100));

      await this.db.query(
        `UPDATE processing_progress 
         SET current_item = $1,
             progress_percent = $2,
             message = $3,
             details = $4,
             updated_at = NOW()
         WHERE progress_id = $5`,
        [currentItem, progressPercent, message, details ? JSON.stringify(details) : null, progressId]
      );

      this.logger.debug('ProgressTracker: Progress updated', {
        sessionId,
        currentItem,
        totalItems,
        progressPercent
      });

    } catch (error) {
      this.logger.error('ProgressTracker: Failed to update progress', {
        error: error.message,
        sessionId
      });
    }
  }

  /**
   * Завершить текущий этап
   */
  async completeStage(sessionId, message = 'Завершено', details = null) {
    try {
      const progressId = this.activeSteps.get(sessionId);
      if (!progressId) return;

      await this.db.query(
        `UPDATE processing_progress 
         SET status = 'completed',
             progress_percent = 100,
             message = $1,
             details = $2,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE progress_id = $3`,
        [message, details ? JSON.stringify(details) : null, progressId]
      );

      this.activeSteps.delete(sessionId);

      this.logger.info('ProgressTracker: Stage completed', {
        sessionId,
        progressId
      });

    } catch (error) {
      this.logger.error('ProgressTracker: Failed to complete stage', {
        error: error.message,
        sessionId
      });
    }
  }

  /**
   * Отметить ошибку в текущем этапе
   */
  async failStage(sessionId, errorMessage, details = null) {
    try {
      const progressId = this.activeSteps.get(sessionId);
      if (!progressId) return;

      await this.db.query(
        `UPDATE processing_progress 
         SET status = 'failed',
             message = $1,
             details = $2,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE progress_id = $3`,
        [errorMessage, details ? JSON.stringify(details) : null, progressId]
      );

      this.activeSteps.delete(sessionId);

      this.logger.error('ProgressTracker: Stage failed', {
        sessionId,
        progressId,
        error: errorMessage
      });

    } catch (error) {
      this.logger.error('ProgressTracker: Failed to mark stage as failed', {
        error: error.message,
        sessionId
      });
    }
  }

  /**
   * Получить текущий прогресс сессии
   */
  async getCurrentProgress(sessionId) {
    try {
      // Получить все этапы сессии
      const result = await this.db.query(
        `SELECT * FROM processing_progress 
         WHERE session_id = $1 
         ORDER BY created_at ASC`,
        [sessionId]
      );

      const stages = result.rows.map(row => ({
        progress_id: row.progress_id,
        stage: row.stage,
        step_name: row.step_name,
        status: row.status,
        progress_percent: row.progress_percent,
        current_item: row.current_item,
        total_items: row.total_items,
        message: row.message,
        details: row.details,
        started_at: row.started_at,
        completed_at: row.completed_at,
        duration_ms: row.completed_at 
          ? new Date(row.completed_at) - new Date(row.started_at)
          : Date.now() - new Date(row.started_at)
      }));

      // Рассчитать общий прогресс
      const totalStages = stages.length;
      const completedStages = stages.filter(s => s.status === 'completed').length;
      const currentStage = stages.find(s => s.status === 'in_progress');

      let overallProgress = 0;
      if (totalStages > 0) {
        // Каждый завершенный этап = часть от 100%
        const stageWeight = 100 / 6; // Всего 6 этапов
        overallProgress = completedStages * stageWeight;
        
        // Добавить прогресс текущего этапа
        if (currentStage) {
          overallProgress += (currentStage.progress_percent / 100) * stageWeight;
        }
      }

      return {
        session_id: sessionId,
        overall_progress: Math.round(overallProgress),
        total_stages: totalStages,
        completed_stages: completedStages,
        current_stage: currentStage,
        stages: stages
      };

    } catch (error) {
      this.logger.error('ProgressTracker: Failed to get progress', {
        error: error.message,
        sessionId
      });
      return {
        session_id: sessionId,
        overall_progress: 0,
        total_stages: 0,
        completed_stages: 0,
        current_stage: null,
        stages: []
      };
    }
  }

  /**
   * Получить последние логи для отображения
   */
  async getRecentLogs(sessionId, limit = 50) {
    try {
      const result = await this.db.query(
        `SELECT * FROM processing_progress 
         WHERE session_id = $1 
         ORDER BY updated_at DESC 
         LIMIT $2`,
        [sessionId, limit]
      );

      return result.rows.map(row => ({
        timestamp: row.updated_at,
        stage: row.stage,
        step_name: row.step_name,
        status: row.status,
        message: row.message,
        progress_percent: row.progress_percent,
        current_item: row.current_item,
        total_items: row.total_items
      }));

    } catch (error) {
      this.logger.error('ProgressTracker: Failed to get logs', {
        error: error.message,
        sessionId
      });
      return [];
    }
  }

  /**
   * Очистить старые логи (для оптимизации БД)
   */
  async cleanupOldLogs(daysToKeep = 30) {
    try {
      const result = await this.db.query(
        `DELETE FROM processing_progress 
         WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'`
      );

      this.logger.info('ProgressTracker: Cleaned up old logs', {
        deleted: result.rowCount
      });

      return result.rowCount;

    } catch (error) {
      this.logger.error('ProgressTracker: Failed to cleanup logs', {
        error: error.message
      });
      return 0;
    }
  }
}

module.exports = ProgressTracker;

