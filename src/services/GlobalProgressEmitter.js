/**
 * GlobalProgressEmitter - Singleton для отслеживания прогресса global обработки
 * Используется для Stage 2, 3, 4 когда обрабатываются ВСЕ компании
 * 
 * НЕ использует БД, работает только в рамках текущего процесса
 * События отправляются через Server-Sent Events (SSE)
 */

const EventEmitter = require('events');

class GlobalProgressEmitter extends EventEmitter {
  constructor() {
    super();
    if (GlobalProgressEmitter.instance) {
      return GlobalProgressEmitter.instance;
    }

    this.progress = {
      stage2: { total: 0, processed: 0, current: null, active: false },
      stage3: { total: 0, processed: 0, current: null, active: false },
      stage4: { total: 0, processed: 0, current: null, active: false }
    };

    GlobalProgressEmitter.instance = this;
  }

  /**
   * Начать отслеживание прогресса для stage
   */
  startStage(stage, total) {
    console.log(`🚀 [GlobalProgressEmitter] Starting ${stage} tracking: ${total} items`);
    this.progress[stage] = {
      total,
      processed: 0,
      current: null,
      active: true
    };
    this.emit(`${stage}:update`, this.progress[stage]);
  }

  /**
   * Обновить прогресс для stage
   */
  updateStage(stage, processed, current = null) {
    if (!this.progress[stage].active) {
      console.log(`⚠️  [GlobalProgressEmitter] Stage ${stage} not active, ignoring update`);
      return;
    }

    this.progress[stage].processed = processed;
    this.progress[stage].current = current;
    console.log(`📊 [GlobalProgressEmitter] ${stage} update: ${processed}/${this.progress[stage].total} ${current ? `(${current})` : ''}`);
    this.emit(`${stage}:update`, this.progress[stage]);
  }

  /**
   * Обновить total для stage (например, когда начинается retry)
   */
  updateTotal(stage, newTotal) {
    if (!this.progress[stage].active) {
      console.log(`⚠️  [GlobalProgressEmitter] Stage ${stage} not active, ignoring total update`);
      return;
    }

    this.progress[stage].total = newTotal;
    console.log(`🔄 [GlobalProgressEmitter] ${stage} total updated: ${newTotal} items`);
    this.emit(`${stage}:update`, this.progress[stage]);
  }

  /**
   * Завершить отслеживание прогресса для stage
   */
  finishStage(stage) {
    this.progress[stage].active = false;
    this.progress[stage].current = null;
    this.emit(`${stage}:update`, this.progress[stage]);
  }

  /**
   * Получить текущий прогресс для stage
   */
  getProgress(stage) {
    return this.progress[stage];
  }

  /**
   * Сбросить прогресс для stage
   */
  resetStage(stage) {
    this.progress[stage] = {
      total: 0,
      processed: 0,
      current: null,
      active: false
    };
    this.emit(`${stage}:update`, this.progress[stage]);
  }
}

// Export singleton instance
module.exports = new GlobalProgressEmitter();

