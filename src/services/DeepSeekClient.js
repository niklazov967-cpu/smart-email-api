const axios = require('axios');

/**
 * DeepSeekClient - Клиент для DeepSeek API
 * Используется для задач без доступа к интернету:
 * - Генерация под-запросов
 * - Валидация компаний
 * - Генерация описаний и тегов
 * - Переводы
 * 
 * Поддерживаемые модели:
 * - deepseek-chat (базовая, дешёвая)
 * - deepseek-reasoner (продвинутая, для сложного анализа)
 */
class DeepSeekClient {
  constructor(apiKey, logger, modelType = 'chat') {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.deepseek.com/v1';
    this.logger = logger;
    
    // Выбор модели в зависимости от типа задачи
    this.models = {
      chat: 'deepseek-chat',           // Базовая: быстро, дёшево
      reasoner: 'deepseek-reasoner'    // Продвинутая: умнее, для сложных задач
    };
    
    this.model = this.models[modelType] || this.models.chat;
    this.maxRetries = 3;
    this.retryDelay = 2000;
    this.timeout = 120000; // 2 минуты для reasoner (он может думать дольше)
  }

  /**
   * Сменить модель для следующих запросов
   */
  setModel(modelType) {
    if (this.models[modelType]) {
      this.model = this.models[modelType];
      this.logger.info('DeepSeek model changed', { model: this.model });
    }
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

    // ВАЖНО: Проверка длины промпта (DeepSeek Chat имеет лимиты)
    const estimatedInputTokens = Math.ceil(prompt.length / 4); // Примерно 4 символа = 1 токен
    
    if (estimatedInputTokens > 4000) {
      this.logger.warn('DeepSeekClient: Prompt too long, truncating', {
        originalLength: prompt.length,
        estimatedTokens: estimatedInputTokens,
        stage
      });
      // Обрезать промпт до безопасного размера
      prompt = prompt.substring(0, 12000); // ~3000 токенов
    }

    this.logger.debug('DeepSeekClient: Starting query', {
      stage,
      promptLength: prompt.length,
      estimatedInputTokens,
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
        const messageData = response.data.choices[0].message;
        
        // DeepSeek Reasoner может возвращать reasoning_content отдельно
        const content = messageData.content || '';
        const reasoningContent = messageData.reasoning_content || '';
        
        // Если content пустой, используем reasoning_content
        const finalContent = content || reasoningContent;
        
        const usage = response.data.usage;

        // Debug: логируем структуру ответа
        this.logger.debug('DeepSeekClient: Response structure', {
          hasContent: !!content,
          hasReasoningContent: !!reasoningContent,
          contentLength: content.length,
          reasoningContentLength: reasoningContent.length,
          finalContentLength: finalContent.length
        });

        this.logger.info('DeepSeekClient: Query successful', {
          stage,
          responseTime,
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          costEstimate: this._estimateCost(usage.prompt_tokens, usage.completion_tokens)
        });

        return finalContent;

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
   * Перевести текст с китайского на русский
   * @param {string} text - Текст для перевода
   * @param {string} fieldName - Название поля (для контекста)
   * @returns {string} Переведенный текст
   */
  async translate(text, fieldName = '') {
    if (!text || text.trim().length === 0) {
      return '';
    }

    // Определяем контекст на основе типа поля
    let context = '';
    if (fieldName.includes('tag')) {
      context = 'Это технический тег. ';
    } else if (fieldName === 'services') {
      context = 'Это список услуг компании. ';
    } else if (fieldName === 'company_name') {
      context = 'Это название компании. ';
    }

    const prompt = `${context}Переведи на русский язык следующий текст с китайского.
Сохрани все технические термины, аббревиатуры (CNC, CAD, CAM и т.д.) без изменений.
Если текст уже на русском или английском, верни его без изменений.
Верни ТОЛЬКО перевод без объяснений, комментариев или дополнительного текста.

Текст: ${text}`;

    try {
      const translation = await this.query(prompt, {
        maxTokens: 500,
        temperature: 0.3, // Низкая температура для более точного перевода
        systemPrompt: 'You are a professional translator specializing in technical Chinese to Russian translation.',
        stage: 'translation'
      });

      return translation.trim();
    } catch (error) {
      this.logger.error('DeepSeekClient: Translation failed', {
        fieldName,
        textLength: text.length,
        error: error.message
      });
      throw error;
    }
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

  /**
   * Оценить стоимость запроса в USD
   * DeepSeek Chat: $0.14/1M input tokens, $0.28/1M output tokens
   */
  _estimateCost(inputTokens, outputTokens) {
    const inputCost = (inputTokens / 1000000) * 0.14;
    const outputCost = (outputTokens / 1000000) * 0.28;
    const totalCost = inputCost + outputCost;
    return `$${totalCost.toFixed(6)}`;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = DeepSeekClient;
