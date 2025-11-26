const axios = require('axios');

/**
 * DeepSeekClient - Клиент для DeepSeek API
 * Используется для задач без доступа к интернету:
 * - Генерация под-запросов
 * - Валидация компаний
 * - Генерация тегов
 * - Переводы
 */
class DeepSeekClient {
  constructor(apiKey, logger) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.deepseek.com/v1';
    this.logger = logger;
    this.model = 'deepseek-chat'; // Основная модель
    this.maxRetries = 3;
    this.retryDelay = 2000; // 2 секунды
    this.timeout = 60000; // 60 секунд
  }

  /**
   * Выполнить запрос к DeepSeek API
   * @param {string} prompt - Текст запроса
   * @param {object} options - Опции запроса
   * @returns {string} Ответ от API
   */
  async query(prompt, options = {}) {
    const {
      maxTokens = 2000,
      temperature = 0.7,
      systemPrompt = 'You are a helpful assistant that provides accurate and structured responses.',
      stage = 'unknown'
    } = options;

    this.logger.debug('DeepSeekClient: Starting query', {
      stage,
      promptLength: prompt.length,
      maxTokens
    });

    let attempt = 0;
    let lastError = null;

    while (attempt < this.maxRetries) {
      try {
        const startTime = Date.now();

        const response = await axios.post(
          `${this.baseUrl}/chat/completions`,
          {
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ],
            temperature,
            max_tokens: maxTokens,
            stream: false
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: this.timeout
          }
        );

        const responseTime = Date.now() - startTime;
        const content = response.data.choices[0].message.content;
        const usage = response.data.usage;

        this.logger.info('DeepSeekClient: Query successful', {
          stage,
          responseTime,
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens
        });

        return content;

      } catch (error) {
        attempt++;
        lastError = error;

        this.logger.warn('DeepSeekClient: Query failed', {
          stage,
          attempt,
          maxRetries: this.maxRetries,
          error: error.message,
          status: error.response?.status
        });

        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          this.logger.info(`DeepSeekClient: Retrying in ${delay}ms`);
          await this._sleep(delay);
        }
      }
    }

    // Все попытки исчерпаны
    this.logger.error('DeepSeekClient: All retries exhausted', {
      stage,
      error: lastError.message
    });
    throw new Error(`DeepSeek API request failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Проверка доступности API
   */
  async healthCheck() {
    try {
      const response = await this.query('Test', {
        maxTokens: 10,
        stage: 'health_check'
      });
      return { healthy: true, response };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = DeepSeekClient;
