/**
 * Query Orchestrator - Управление всеми этапами обработки
 * Координирует выполнение Stage 1-6 для сессии поиска
 */
class QueryOrchestrator {
  constructor(services) {
    this.db = services.database;
    this.settings = services.settingsManager;
    this.sonarPro = services.sonarApiClient; // Pro для Stage 1, 4
    this.sonarBasic = services.sonarBasicClient; // Basic для Stage 2, 3
    this.logger = services.logger;
    this.progressTracker = services.progressTracker || null;
    this.companyValidator = services.companyValidator || null;

    // Загрузить все этапы
    const Stage1FindCompanies = require('../stages/Stage1FindCompanies');
    const Stage2FindWebsites = require('../stages/Stage2FindWebsites');
    const Stage3AnalyzeContacts = require('../stages/Stage3AnalyzeContacts');
    const Stage4AnalyzeServices = require('../stages/Stage4AnalyzeServices');
    const Stage5GenerateTags = require('../stages/Stage5GenerateTags');
    const Stage6Finalize = require('../stages/Stage6Finalize');
    
    // Stage 1, 4 используют Sonar Pro (сложный анализ)
    this.stage1 = new Stage1FindCompanies(this.sonarPro, this.settings, this.db, this.logger);
    this.stage4 = new Stage4AnalyzeServices(this.sonarPro, this.settings, this.db, this.logger);
    
    // Stage 2, 3 используют Sonar Basic (простой поиск)
    this.stage2 = new Stage2FindWebsites(this.sonarBasic, this.settings, this.db, this.logger);
    this.stage3 = new Stage3AnalyzeContacts(this.sonarBasic, this.settings, this.db, this.logger);
    
    // Stage 5 использует DeepSeek (уже в конструкторе Stage5)
    this.stage5 = new Stage5GenerateTags(services.deepseekClient || this.sonarPro, this.settings, this.db, this.logger);
    
    // Stage 6 не использует AI
    this.stage6 = new Stage6Finalize(this.sonarPro, this.settings, this.db, this.logger);
  }

  /**
   * Запустить полную обработку сессии
   */
  async processSession(sessionId, searchQuery) {
    this.logger.info('Orchestrator: Starting session processing', {
      sessionId,
      searchQuery
    });

    try {
      // Обновить статус сессии
      await this._updateSessionStatus(sessionId, 'active');

      // Stage 1: Найти компании
      if (this.progressTracker) {
        await this.progressTracker.startStage(sessionId, 'stage1', 'Поиск компаний', 1);
      }
      
      this.logger.info('Orchestrator: Stage 1 - Finding companies');
      const stage1Result = await this.stage1.execute(searchQuery, sessionId);
      
      if (!stage1Result.success || stage1Result.count === 0) {
        if (this.progressTracker) {
          await this.progressTracker.failStage(sessionId, 'Не найдено ни одной компании');
        }
        throw new Error('Stage 1 failed: No companies found');
      }

      if (this.progressTracker) {
        await this.progressTracker.completeStage(sessionId, `Найдено компаний: ${stage1Result.count}`);
      }

      this.logger.info('Orchestrator: Stage 1 completed', {
        companiesFound: stage1Result.count
      });

      // Stage 2: Найти сайты
      if (this.progressTracker) {
        await this.progressTracker.startStage(sessionId, 'stage2', 'Поиск сайтов', stage1Result.count);
      }
      
      this.logger.info('Orchestrator: Stage 2 - Finding websites');
      const stage2Result = await this.stage2.execute(sessionId);
      
      if (this.progressTracker) {
        await this.progressTracker.completeStage(sessionId, `Найдено сайтов: ${stage2Result.found}/${stage2Result.total}`);
      }
      
      this.logger.info('Orchestrator: Stage 2 completed', {
        websitesFound: stage2Result.found,
        notFound: stage2Result.notFound
      });

      // Stage 3: Анализ контактов
      if (this.progressTracker) {
        await this.progressTracker.startStage(sessionId, 'stage3', 'Анализ контактов', stage2Result.found);
      }
      
      this.logger.info('Orchestrator: Stage 3 - Analyzing contacts');
      const stage3Result = await this.stage3.execute(sessionId);
      
      if (this.progressTracker) {
        await this.progressTracker.completeStage(sessionId, `Email найдено: ${stage3Result.found} из ${stage3Result.processed}`);
      }
      
      this.logger.info('Orchestrator: Stage 3 completed', {
        processed: stage3Result.processed,
        foundContacts: stage3Result.found
      });

      // Stage 4: Описание услуг
      if (this.progressTracker) {
        await this.progressTracker.startStage(sessionId, 'stage4', 'Описание услуг', stage3Result.processed);
      }
      
      this.logger.info('Orchestrator: Stage 4 - Analyzing services');
      const stage4Result = await this.stage4.execute(sessionId);
      
      if (this.progressTracker) {
        await this.progressTracker.completeStage(sessionId, `Проанализировано: ${stage4Result.processed}`);
      }
      
      this.logger.info('Orchestrator: Stage 4 completed', {
        processed: stage4Result.processed
      });

      // Stage 4.5: Валидация компаний (НОВОЕ!)
      if (this.companyValidator && this.progressTracker) {
        await this.progressTracker.startStage(sessionId, 'stage4.5', 'Валидация по теме', stage4Result.processed);
        
        this.logger.info('Orchestrator: Stage 4.5 - Validating companies');
        
        // Получить компании для валидации
        const companies = await this.db.query(
          `SELECT * FROM pending_companies 
           WHERE session_id = $1 AND stage = 'site_analyzed'`,
          [sessionId]
        );

        const validationResults = await this.companyValidator.validateBatch(
          companies.rows,
          searchQuery,
          sessionId
        );

        const validationStats = await this.companyValidator.getValidationStats(sessionId);
        
        if (this.progressTracker) {
          await this.progressTracker.completeStage(
            sessionId, 
            `Валидация: ✅${validationStats.accepted} 📋${validationStats.review} ❌${validationStats.rejected}`,
            validationStats
          );
        }
        
        this.logger.info('Orchestrator: Stage 4.5 completed', validationStats);
      }

      // Stage 5: Генерация тегов
      if (this.progressTracker) {
        await this.progressTracker.startStage(sessionId, 'stage5', 'Генерация тегов', stage4Result.processed);
      }
      
      this.logger.info('Orchestrator: Stage 5 - Generating tags');
      const stage5Result = await this.stage5.execute(sessionId);
      
      if (this.progressTracker) {
        await this.progressTracker.completeStage(sessionId, `Теги сгенерированы: ${stage5Result.processed}`);
      }
      
      this.logger.info('Orchestrator: Stage 5 completed', {
        processed: stage5Result.processed
      });

      // Stage 6: Финализация
      if (this.progressTracker) {
        await this.progressTracker.startStage(sessionId, 'stage6', 'Финализация', stage5Result.processed);
      }
      
      this.logger.info('Orchestrator: Stage 6 - Finalization');
      const stage6Result = await this.stage6.execute(sessionId);
      
      if (this.progressTracker) {
        await this.progressTracker.completeStage(
          sessionId, 
          `Добавлено: ${stage6Result.finalized}, Пропущено: ${stage6Result.skipped}`
        );
      }
      
      this.logger.info('Orchestrator: Stage 6 completed', {
        finalized: stage6Result.finalized,
        skipped: stage6Result.skipped
      });

      // Обновить статус на завершено
      await this._updateSessionStatus(sessionId, 'completed');

      this.logger.info('Orchestrator: Session processing completed', {
        sessionId
      });

      return {
        success: true,
        sessionId,
        stages: {
          stage1: stage1Result,
          stage2: stage2Result,
          stage3: stage3Result,
          stage4: stage4Result,
          stage5: stage5Result,
          stage6: stage6Result
        }
      };

    } catch (error) {
      this.logger.error('Orchestrator: Session processing failed', {
        sessionId,
        error: error.message,
        stack: error.stack
      });

      // Обновить статус на failed
      await this._updateSessionStatus(sessionId, 'failed');
      await this._logError(sessionId, error);

      throw error;
    }
  }

  /**
   * Получить прогресс сессии
   */
  async getProgress(sessionId) {
    const session = await this.db.query(
      'SELECT * FROM search_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (session.rows.length === 0) {
      throw new Error('Session not found');
    }

    // Получить статистику по этапам
    const stagesStats = await this.db.query(
      `SELECT stage, COUNT(*) as count 
       FROM pending_companies 
       WHERE session_id = $1 
       GROUP BY stage`,
      [sessionId]
    );

    const stages = {};
    stagesStats.rows.forEach(row => {
      stages[row.stage] = parseInt(row.count);
    });

    return {
      session: session.rows[0],
      stages,
      progress: this._calculateProgress(session.rows[0], stages)
    };
  }

  _calculateProgress(session, stages) {
    const total = session.target_count || 50;
    const completed = session.companies_added || 0;
    
    return {
      percent: Math.round((completed / total) * 100),
      current: completed,
      target: total,
      stages: {
        names_found: stages.names_found || 0,
        website_found: stages.website_found || 0,
        site_analyzed: stages.site_analyzed || 0,
        tags_extracted: stages.tags_extracted || 0,
        completed: stages.completed || 0,
        failed: stages.failed || 0
      }
    };
  }

  async _updateSessionStatus(sessionId, status) {
    const endTime = ['completed', 'failed', 'cancelled'].includes(status) 
      ? new Date() 
      : null;

    await this.db.query(
      `UPDATE search_sessions 
       SET status = $1, end_time = $2, updated_at = NOW()
       WHERE session_id = $3`,
      [status, endTime, sessionId]
    );
  }

  async _logError(sessionId, error) {
    await this.db.query(
      `INSERT INTO processing_logs 
       (session_id, event_type, level, message, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [sessionId, 'session_error', 'ERROR', error.message]
    );

    // Увеличить счетчик ошибок
    await this.db.query(
      `UPDATE search_sessions 
       SET errors_count = errors_count + 1
       WHERE session_id = $1`,
      [sessionId]
    );
  }
}

module.exports = QueryOrchestrator;

