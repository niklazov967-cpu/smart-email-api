/**
 * Stage 4: AI-валидация и обогащение данных
 * Собирает ВСЮ информацию от всех этапов и использует DeepSeek Reasoner для:
 * 1. Валидации соответствия теме
 * 2. Генерации улучшенного описания
 * 3. Улучшения тегов
 * 4. Оценки уверенности в данных
 */
class Stage4AnalyzeServices {
  constructor(deepseekClient, settingsManager, database, logger) {
    this.deepseek = deepseekClient; // DeepSeek (reasoner для сложного анализа)
    this.settings = settingsManager;
    this.db = database;
    this.logger = logger;
    this.globalProgressCallback = null; // Callback для global прогресса (SSE)
  }

  /**
   * Установить callback для global прогресса (SSE)
   */
  setGlobalProgressCallback(callback) {
    this.globalProgressCallback = callback;
  }

  async execute(sessionId = null) {
    // sessionId теперь опциональный - если не указан, обрабатываем ВСЕ компании
    this.logger.info('Stage 4: Starting AI enrichment and validation', { 
      sessionId: sessionId || 'ALL',
      mode: sessionId ? 'session' : 'global'
    });

    try {
      // Получить компании готовые для Stage 4
      let query = this.db.supabase
        .from('pending_companies')
        .select(`
          company_id, company_name, website, email, description, services, 
          session_id, search_query_text, topic_description,
          tag1, tag2, tag3, tag4, tag5, tag6, tag7, tag8, tag9, tag10,
          tag11, tag12, tag13, tag14, tag15, tag16, tag17, tag18, tag19, tag20,
          stage1_raw_data, stage2_raw_data, stage3_raw_data, stage,
          current_stage, stage4_status
        `)
        .gte('current_stage', 3) // Минимум Stage 3 завершен
        .is('stage4_status', null); // Только те у кого Stage 4 еще не обработан
      
      // Если указан sessionId, фильтруем только эту сессию
      if (sessionId) {
        query = query.eq('session_id', sessionId);
      }

      const { data: companies, error: companiesError } = await query;

      if (companiesError) {
        this.logger.error('Stage 4: Failed to get companies', { error: companiesError.message });
        throw companiesError;
      }
      
      if (!companies || companies.length === 0) {
        this.logger.info('Stage 4: No companies ready for validation', {
          sessionId: sessionId || 'ALL',
          reason: 'Either all processed or none passed Stage 3'
        });
        return {
          success: true,
          total: 0,
          validated: 0,
          rejected: 0,
          needsReview: 0
        };
      }
      
      this.logger.info('Stage 4: Loaded companies with topics', {
        companies: companies.length,
        mode: sessionId ? 'session-based' : 'all-companies'
      });
      
      let validated = 0;
      let rejected = 0;
      let needsReview = 0;

      this.logger.info('Stage 4: Processing companies with DeepSeek Chat', {
        total: companies.length,
        sessionId: sessionId || 'ALL'
      });

      // Использовать DeepSeek Chat для структурированных JSON ответов
      this.deepseek.setModel('deepseek-chat');

      // Обрабатывать компании батчами
      const BATCH_SIZE = 3;
      const DELAY_BETWEEN_BATCHES = 1000;
      
      let processedCount = 0;
      const totalCompanies = companies.length;
      
      for (let i = 0; i < companies.length; i += BATCH_SIZE) {
        const batch = companies.slice(i, i + BATCH_SIZE);
        
        // Обновить global прогресс перед обработкой батча
        if (this.globalProgressCallback) {
          this.globalProgressCallback(processedCount, batch[0]?.company_name);
        }
        
        this.logger.debug('Stage 4: Processing batch', {
          batch: Math.floor(i / BATCH_SIZE) + 1,
          total: Math.ceil(companies.length / BATCH_SIZE),
          companies: batch.length,
          progress: `${processedCount}/${totalCompanies}`
        });
        
        // Обработать батч параллельно, каждая компания использует свою topic_description
        const batchResults = await Promise.all(
          batch.map(company => {
            // Использовать topic_description из самой компании (уже в БД)
            const mainTopic = company.topic_description || company.search_query_text || 'Unknown topic';
            return this._enrichAndValidateCompany(company, mainTopic);
          })
        );
        
        processedCount += batch.length;
        
        // Обновить global прогресс после обработки батча
        if (this.globalProgressCallback) {
          this.globalProgressCallback(processedCount, null);
        }
        
        // Сохранить результаты батча
        for (let j = 0; j < batch.length; j++) {
          const company = batch[j];
          const result = batchResults[j];
          
          const updateData = {
            stage: result.stage,
            stage4_status: result.stage === 'completed' ? 'completed' : 
                           result.stage === 'rejected' ? 'rejected' : 'needs_review',
            current_stage: 4, // Финальный этап
            validation_score: result.score,
            validation_reason: result.reason,
            ai_generated_description: result.aiDescription,
            ai_confidence_score: result.confidence,
            updated_at: new Date().toISOString()
          };
          
          // Добавляем services если есть
          if (result.services) {
            updateData.services = result.services;
          }
          
          // Добавляем теги если есть
          for (let k = 1; k <= 20; k++) {
            const tagKey = `tag${k}`;
            if (result.tags && result.tags[tagKey]) {
              updateData[tagKey] = result.tags[tagKey];
            }
          }
          
          // 🎁 BONUS: Если DeepSeek нашел website в raw_data И у компании его еще нет
          if (result.website && !company.website) {
            updateData.website = result.website;
            this.logger.info('🎁 BONUS: Website found opportunistically in Stage 4', {
              company: company.company_name,
              website: result.website
            });
          }
          
          // 🎁 BONUS: Если DeepSeek нашел email в raw_data И у компании его еще нет
          if (result.email && !company.email) {
            updateData.email = result.email;
            this.logger.info('🎁 BONUS: Email found opportunistically in Stage 4', {
              company: company.company_name,
              email: result.email
            });
          }
          
          const { error: updateError } = await this.db.supabase
            .from('pending_companies')
            .update(updateData)
            .eq('company_id', company.company_id);
          
          if (updateError) {
            this.logger.error('Stage 4: Failed to update company', {
              company: company.company_name,
              error: updateError.message
            });
          }
          
          if (result.stage === 'completed') {
            validated++;
          } else if (result.stage === 'rejected') {
            rejected++;
          } else {
            needsReview++;
          }
        }
        
        // Задержка между батчами
        if (i + BATCH_SIZE < companies.length) {
          await this._sleep(DELAY_BETWEEN_BATCHES);
        }
      }

      this.logger.info('Stage 4: AI enrichment completed', {
        total: companies.length,
        validated,
        rejected,
        needsReview,
        sessionId: sessionId || 'ALL'
      });

      return {
        success: true,
        total: companies.length,
        validated,
        rejected,
        needsReview
      };

    } catch (error) {
      this.logger.error('Stage 4: AI enrichment failed', {
        error: error.message,
        sessionId: sessionId || 'ALL'
      });
      throw error;
    }
  }

  /**
   * Обогатить и валидировать компанию через DeepSeek Reasoner
   * Собирает ВСЮ информацию от всех этапов
   */
  async _enrichAndValidateCompany(company, mainTopic) {
    try {
      // Базовая проверка
      if (!company.company_name) {
        return this._basicValidation(company);
      }

      // Собрать ВСЮ информацию от всех этапов
      const allData = this._collectAllData(company);
      
      // Если данных вообще нет - skip AI
      if (!allData.hasAnyData) {
        return {
          stage: 'needs_review',
          score: 10,
          reason: 'Нет данных для анализа',
          aiDescription: null,
          confidence: 0,
          services: company.services,
          tags: this._extractCurrentTags(company)
        };
      }

      // Создать промпт для DeepSeek Reasoner
      const prompt = this._createEnrichmentPrompt(company, mainTopic, allData);
      
      // Запросить DeepSeek Reasoner (умная модель)
      const response = await this.deepseek.query(prompt, {
        stage: 'stage4_enrichment',
        maxTokens: 2000, // Больше токенов для полного анализа
        temperature: 0.3,
        systemPrompt: 'You are an expert business analyst. Analyze all available data and provide comprehensive insights in JSON format.'
      });
      
      // Парсить ответ
      const result = this._parseEnrichmentResponse(response, company);
      
      this.logger.debug('Stage 4: Company enriched', {
        company: company.company_name,
        relevance: result.score,
        confidence: result.confidence
      });
      
      return result;

    } catch (error) {
      this.logger.error('Stage 4: Company enrichment error', {
        company: company.company_name,
        error: error.message
      });
      
      // Fallback на базовую валидацию
      return this._basicValidation(company);
    }
  }

  /**
   * Собрать ВСЮ информацию от всех этапов
   */
  _collectAllData(company) {
    const data = {
      // Основные поля
      name: company.company_name,
      website: company.website,
      email: company.email,
      description: company.description,
      services: company.services,
      
      // Теги
      tags: [company.tag1, company.tag2, company.tag3, company.tag4, company.tag5,
             company.tag6, company.tag7, company.tag8, company.tag9, company.tag10].filter(t => t),
      
      // Сырые данные от каждого этапа
      stage1Data: company.stage1_raw_data,
      stage2Data: company.stage2_raw_data,
      stage3Data: company.stage3_raw_data,
      
      // Флаг наличия данных
      hasAnyData: !!(company.description || company.services || company.tag1 || 
                     company.stage1_raw_data || company.stage2_raw_data || company.stage3_raw_data)
    };
    
    return data;
  }

  /**
   * Создать промпт для DeepSeek Reasoner (полный анализ)
   */
  _createEnrichmentPrompt(company, mainTopic, allData) {
    // Подготовить данные для промпта
    const tags = allData.tags.join(', ') || 'none';
    const stage1Info = allData.stage1Data ? JSON.stringify(allData.stage1Data).substring(0, 500) : 'none';
    const stage2Info = allData.stage2Data ? JSON.stringify(allData.stage2Data).substring(0, 500) : 'none';
    const stage3Info = allData.stage3Data ? JSON.stringify(allData.stage3Data).substring(0, 500) : 'none';
    
    return `You are analyzing a company for relevance to a search topic.

SEARCH TOPIC:
"${mainTopic}"

COMPANY DATA:
Name: ${allData.name}
Website: ${allData.website || 'unknown'}
Email: ${allData.email || 'unknown'}

Current Description: ${(allData.description || '').substring(0, 300)}
Current Services: ${allData.services || 'none'}
Current Tags: ${tags}

RAW DATA FROM AI STAGES:
Stage 1 (Perplexity search): ${stage1Info}
Stage 2 (Website search): ${stage2Info}
Stage 3 (Contact search): ${stage3Info}

TASK:
Analyze ALL available information and provide:
1. Relevance score (0-100) to search topic
2. Improved description (merge all info)
3. Improved services list
4. Improved tags (up to 20) - ОБЯЗАТЕЛЬНО включи:
   - Виды обработки (токарная, фрезерная, 5-осевая и т.д.)
   - Материалы с которыми работают (нержавейка, алюминий, пластики, титан и т.д.)
   - Поверхностная обработка (анодирование, гальваника, порошковая покраска)
   - Отрасли применения (автомобильная, аэрокосм, медицинская)
   - Типы производства (мелкосерийное, прототипирование)
5. Confidence in data quality (0-100)
6. Validation reason
7. **Extract website from raw_data if company missing it**
8. **Extract email from raw_data if company missing it**

RULES:
⚠️ КРИТИЧЕСКИ ВАЖНО - РАЗЛИЧИЕ ПРОИЗВОДИТЕЛЬ vs СЕРВИС ОБРАБОТКИ:

❌ ОТКЛОНИТЬ (score < 30) если компания:
   - Производит/продает станки и оборудование (CNC machines, lathes, mills, equipment)
   - Ключевые слова: "制造商" (manufacturer), "生产" (produce/manufacturing), "设备" (equipment), "机床" (machine tool)
   - Примеры: "数控机床制造商", "CNC设备生产商", "станкостроительный завод"
   - Если в описании есть "equipment manufacturer", "machine manufacturer", "tool manufacturer" - это ПРОИЗВОДИТЕЛЬ!

✅ ПРИНЯТЬ (score > 70) если компания:
   - Предоставляет услуги обработки деталей (machining/processing services)
   - Ключевые слова: "加工服务" (machining service), "零件加工" (parts processing), "定制加工" (custom machining)
   - Примеры: "CNC加工厂", "精密零件加工", "металлообработка на заказ"
   - Услуги: токарная, фрезерная обработка, изготовление деталей

⚠️ ПРОВЕРКА: Если видишь слова "制造商", "生产设备", "机床", "equipment", "tool manufacturer" - 
   это ПРОИЗВОДИТЕЛЬ СТАНКОВ (score < 30), а НЕ компания по обработке деталей!

- Trading company (торговая компания оборудованием) = score <40  
- Use ALL data from stages to create comprehensive description
- Extract maximum value from raw AI responses

Return JSON:
{
  "relevance": 85,
  "confidence": 90,
  "description": "comprehensive description based on all data",
  "services": "service1, service2, service3",
  "tags": ["tag1", "tag2", ..., "tag20"],
  "reason": "why this score",
  "website": "https://... или null (если нашел в raw_data)",
  "email": "...@... или null (если нашел в raw_data)"
}`.trim();
  }

  /**
   * Парсить ответ от DeepSeek Reasoner
   */
  _parseEnrichmentResponse(response, company) {
    try {
      // Проверить что response не пустой
      if (!response || response.trim().length === 0) {
        throw new Error('Empty response from DeepSeek');
      }
      
      // DeepSeek Reasoner может возвращать рассуждения перед JSON
      // Ищем JSON блок в любой части ответа
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // Если нет полного JSON, попробуем найти начало
        const partialMatch = response.match(/\{\s*"relevance"[\s\S]*/);
        if (partialMatch) {
          // Есть начало JSON, но он обрезан - попробуем восстановить
          this.logger.warn('Partial JSON detected, attempting to reconstruct', {
            preview: partialMatch[0].substring(0, 200)
          });
          
          // Извлекаем хотя бы relevance и confidence
          const relevanceMatch = response.match(/"relevance":\s*(\d+)/);
          const confidenceMatch = response.match(/"confidence":\s*(\d+)/);
          
          if (relevanceMatch) {
            const relevance = parseInt(relevanceMatch[1]);
            const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 50;
            
            return this._createFallbackResult(relevance, confidence, company, 'Partial JSON response');
          }
        }
        
        throw new Error('No JSON in response');
      }

      let jsonText = jsonMatch[0];
      
      // Проверить закрыт ли JSON
      if (!jsonText.endsWith('}')) {
        this.logger.warn('JSON appears truncated, attempting to fix');
        // Попробуем закрыть незакрытые структуры
        const openBraces = (jsonText.match(/\{/g) || []).length;
        const closeBraces = (jsonText.match(/\}/g) || []).length;
        
        if (openBraces > closeBraces) {
          jsonText += '}'.repeat(openBraces - closeBraces);
        }
      }

      const data = JSON.parse(jsonText);
      
      // Убрали деление на категории - теперь все компании просто 'completed'
      // Главный параметр - это рейтинг релевантности (score)
      const stage = 'completed';
      const score = data.relevance || 0;
      
      // Подготовить теги
      const tags = {};
      const tagArray = Array.isArray(data.tags) ? data.tags : [];
      for (let i = 0; i < 20; i++) {
        tags[`tag${i + 1}`] = tagArray[i] || null;
      }
      
      return {
        stage,
        score,
        reason: data.reason || 'AI analysis completed',
        aiDescription: data.description || null,
        confidence: data.confidence || 50,
        services: data.services || company.services,
        website: data.website || null,
        email: data.email || null,
        tags
      };

    } catch (error) {
      this.logger.error('Failed to parse enrichment response', {
        error: error.message,
        responseLength: response ? response.length : 0,
        responsePreview: response ? response.substring(0, 500) : 'empty'
      });
      throw error;
    }
  }
  
  /**
   * Создать fallback результат из частичных данных
   */
  _createFallbackResult(relevance, confidence, company, reason) {
    // Убрали деление на категории - все компании 'completed'
    const stage = 'completed';
    
    // Сохранить существующие теги
    const tags = {};
    for (let i = 1; i <= 20; i++) {
      tags[`tag${i}`] = company[`tag${i}`] || null;
    }
    
    return {
      stage,
      score,
      reason: `${reason} (relevance: ${relevance})`,
      aiDescription: null,
      confidence,
      services: company.services,
      website: null,
      email: null,
      tags
    };
  }

  _extractCurrentTags(company) {
    const tags = {};
    for (let i = 1; i <= 20; i++) {
      tags[`tag${i}`] = company[`tag${i}`] || null;
    }
    return tags;
  }

  /**
   * Базовая валидация без AI (fallback)
   */
  _basicValidation(company) {
    const hasDescription = company.description && company.description.length > 0;
    const hasServices = company.services && company.services.length > 0;
    const hasTags = company.tag1 || company.tag2 || company.tag3;
    const hasEmail = company.email && company.email.length > 0;
    const hasWebsite = company.website && company.website.length > 0;

    let score = 0;
    const missing = [];
    
    if (hasDescription) score += 20; else missing.push('description');
    if (hasServices) score += 20; else missing.push('services');
    if (hasTags) score += 20; else missing.push('tags');
    if (hasEmail || hasWebsite) score += 40; else missing.push('contacts');
    
    // Убрали деление на категории - все компании 'completed'
    const stage = 'completed';
    
    // Сохранить существующие теги
    const tags = this._extractCurrentTags(company);
    
    return {
      stage,
      score,
      reason: missing.length > 0 
        ? `Базовая валидация: отсутствует ${missing.join(', ')}` 
        : 'Базовая валидация: все данные присутствуют',
      aiDescription: null,
      confidence: score,
      services: company.services,
      website: null,
      email: null,
      tags
    };
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Stage4AnalyzeServices;

