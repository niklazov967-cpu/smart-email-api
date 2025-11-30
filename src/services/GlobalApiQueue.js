/**
 * Global API Queue Manager
 * Единая глобальная очередь для ВСЕХ AI API запросов
 * Гарантирует что запросы выполняются последовательно
 */
class GlobalApiQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.queueLength = 0;
    this.lastRequestTime = 0;
    this.minDelayBetweenRequests = 500; // 500ms между запросами (увеличена скорость)
  }

  /**
   * Добавить запрос в глобальную очередь
   * @param {Function} requestFn - Async функция запроса
   * @param {Object} metadata - Метаданные для логирования
   * @returns {Promise} - Результат запроса
   */
  async enqueue(requestFn, metadata = {}) {
    const { stage = 'unknown', model = 'unknown', sessionId = null } = metadata;
    
    return new Promise((resolve, reject) => {
      this.queue.push({
        requestFn,
        resolve,
        reject,
        metadata: {
          stage,
          model,
          sessionId,
          enqueuedAt: Date.now()
        }
      });
      
      this.queueLength = this.queue.length;
      console.log(`📥 [GlobalQueue] Added to queue: ${stage} (${model}) | Queue: ${this.queueLength}`);
      
      // Запустить обработку если не идет
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Обработать очередь последовательно
   */
  async processQueue() {
    if (this.isProcessing) {
      return; // Уже обрабатывается
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      this.queueLength = this.queue.length;

      const { requestFn, resolve, reject, metadata } = item;
      const waitTime = Date.now() - metadata.enqueuedAt;

      console.log(`📤 [GlobalQueue] Processing: ${metadata.stage} (${metadata.model})`);
      console.log(`   Queue position: 1 of ${this.queueLength + 1}`);
      console.log(`   Wait time: ${waitTime}ms`);
      console.log(`   Remaining in queue: ${this.queueLength}`);

      try {
        // Соблюдать минимальную задержку между запросами
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        if (timeSinceLastRequest < this.minDelayBetweenRequests) {
          const delayNeeded = this.minDelayBetweenRequests - timeSinceLastRequest;
          console.log(`   ⏸️  Throttling: waiting ${delayNeeded}ms...`);
          await this._sleep(delayNeeded);
        }

        // Выполнить запрос
        const startTime = Date.now();
        const result = await requestFn();
        const duration = Date.now() - startTime;

        this.lastRequestTime = Date.now();

        console.log(`   ✅ Completed in ${duration}ms`);
        resolve(result);

      } catch (error) {
        console.error(`   ❌ Failed: ${error.message}`);
        reject(error);
      }
    }

    this.isProcessing = false;
    console.log(`📭 [GlobalQueue] Queue empty, waiting for new requests...`);
  }

  /**
   * Получить текущую длину очереди
   */
  getQueueLength() {
    return this.queueLength;
  }

  /**
   * Получить статус очереди
   */
  getStatus() {
    return {
      queueLength: this.queueLength,
      isProcessing: this.isProcessing,
      lastRequestTime: this.lastRequestTime
    };
  }

  /**
   * Sleep helper
   */
  async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Экспортируем SINGLETON - одна очередь на весь процесс
module.exports = new GlobalApiQueue();

