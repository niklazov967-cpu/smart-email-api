const express = require('express');
const router = express.Router();

/**
 * GET /api/debug/data
 * Получить ВСЕ данные из Supabase
 */
router.get('/data', async (req, res) => {
  try {
    // Более надежный способ - запрашивать таблицы по одной и обрабатывать ошибки
    const results = {};
    const tables = [
      'search_sessions',
      'session_queries', 
      'pending_companies',
      'processing_progress'
    ];
    
    for (const table of tables) {
      try {
        const data = await req.db.directSelect(table);
        results[table] = { count: data.length, items: data };
      } catch (error) {
        req.logger.error(`Failed to fetch ${table}:`, error.message);
        results[table] = { 
          count: 0, 
          items: [], 
          error: error.message 
        };
      }
    }

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    req.logger.error('Error in /api/debug/data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/debug/session/:sessionId
 * Получить ВСЕ данные конкретной сессии из Supabase
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const [sessions, queries, pending, found, progress] = await Promise.all([
      req.db.directSelect('search_sessions', { session_id: sessionId }),
      req.db.directSelect('session_queries', { session_id: sessionId }),
      req.db.directSelect('pending_companies', { session_id: sessionId }),
      req.db.directSelect('found_companies', { session_id: sessionId }),
      req.db.directSelect('processing_progress', { session_id: sessionId })
    ]);

    const session = sessions[0];

    res.json({
      success: true,
      sessionId,
      data: {
        session,
        queries: {
          count: queries.length,
          items: queries
        },
        pending_companies: {
          count: pending.length,
          items: pending
        },
        found_companies: {
          count: found.length,
          items: found.map(c => ({
            name: c.company_name,
            website: c.website,
            emails: c.emails,
            phones: c.phones,
            stage: c.stage,
            main_activity: c.main_activity,
            tags: c.tags
          }))
        },
        progress: {
          count: progress.length,
          items: progress
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/debug/test-website
 * Тестовая проверка сайта через Perplexity
 */
router.post('/test-website', async (req, res) => {
  try {
    const { website, companyName } = req.body;
    
    if (!website) {
      return res.status(400).json({
        success: false,
        error: 'Website URL is required'
      });
    }

    const prompt = `Открой и проанализируй главную страницу и страницу контактов этого сайта:

САЙТ: ${website}
${companyName ? `КОМПАНИЯ: ${companyName}` : ''}

ЗАДАЧА:
1. **Открой главную страницу** ${website}
2. Найди и **открой страницу контактов** (Contact, About Us, Contact Us, 联系我们, 关于我们)
3. Ищи email адреса в:
   - Шапке сайта (header)
   - **Футере сайта (footer)** ← часто здесь!
   - На странице контактов
   - На странице "О нас"
   - В любых формах связи
4. Извлеки ВСЕ email адреса (info@, admin@, sales@, export@, service@, contact@)

ВАЖНО:
- **ОБЯЗАТЕЛЬНО проверь футер** (нижняя часть страницы) - там часто указан основной email
- Если на главной странице нет email - перейди на страницу контактов
- Email может быть написан как текстом, так и в виде ссылки (mailto:)
- Если email написан как изображение - попробуй распознать текст

РЕЗУЛЬТАТ: JSON формат:
{
  "emails": ["email@example.com", "sales@example.com"],
  "contact_page": "URL страницы где нашел",
  "found_in": "header | footer | contact page | about page",
  "status": "success | error",
  "note": "где именно нашел email или почему не смог открыть сайт"
}

Если сайт не открывается: {"emails": [], "status": "error", "note": "детальное объяснение почему сайт недоступен"}

ВЕРНИ ТОЛЬКО JSON, без дополнительного текста.`;

    const response = await req.sonarProClient.query(prompt, {
      stage: 'test_website',
      sessionId: 'test',
      useCache: false
    });

    res.json({
      success: true,
      website,
      response: response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/debug/test-fallback
 * Тестовая проверка fallback поиска email
 */
router.post('/test-fallback', async (req, res) => {
  try {
    const { website, companyName } = req.body;
    
    if (!website || !companyName) {
      return res.status(400).json({
        success: false,
        error: 'Website and companyName are required'
      });
    }

    const prompt = `Найди email-адрес для этой компании через поиск в интернете:

КОМПАНИЯ: ${companyName}
САЙТ: ${website}

ЗАДАЧА:
Используй поиск в интернете (не пытайся открыть сайт напрямую):
1. Поищи упоминания компании "${companyName}" в интернете
2. Поищи информацию по домену "${website}"
3. Проверь каталоги, справочники, B2B площадки (Alibaba, Made-in-China, 1688)
4. Найди ЛЮБЫЕ email-адреса связанные с этой компанией

ВАЖНО:
- Email может быть на Alibaba, 1688, Made-in-China, других B2B площадках
- Email может быть в отзывах, новостях, справочниках компаний
- Ищи любые упоминания контактов этой компании
- НЕ пытайся открыть сайт напрямую - используй ПОИСК В ИНТЕРНЕТЕ

РЕЗУЛЬТАТ: JSON формат:
{
  "emails": ["email@example.com"],
  "source": "где нашел (Alibaba/Made-in-China/каталог/новости)",
  "found_in": "fallback search",
  "note": "источник информации"
}

Если не найдено: {"emails": [], "note": "причина"}

ВЕРНИ ТОЛЬКО JSON, без дополнительного текста.`;

    const response = await req.sonarProClient.query(prompt, {
      stage: 'test_fallback',
      sessionId: 'test',
      useCache: false
    });

    res.json({
      success: true,
      website,
      companyName,
      response: response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/debug/companies
 * Получить список компаний с фильтрацией (и переводами если доступны)
 */
router.get('/companies', async (req, res) => {
  try {
    const { session_id, limit = 100, include_translations = 'true' } = req.query;

    // Если запрошены переводы, используем Supabase с JOIN
    if (include_translations === 'true') {
      let query = req.db.supabase
        .from('pending_companies')
        .select(`
          *,
          search_sessions!inner (
            topic_description
          ),
          pending_companies_ru (
            company_name_ru,
            description_ru,
            ai_generated_description_ru,
            services_ru,
            validation_reason_ru,
            tag1_ru, tag2_ru, tag3_ru, tag4_ru, tag5_ru,
            tag6_ru, tag7_ru, tag8_ru, tag9_ru, tag10_ru,
            tag11_ru, tag12_ru, tag13_ru, tag14_ru, tag15_ru,
            tag16_ru, tag17_ru, tag18_ru, tag19_ru, tag20_ru,
            translation_status,
            translated_at
          )
        `)
        .limit(parseInt(limit));

      if (session_id) {
        query = query.eq('session_id', session_id);
      }

      const { data: companies, error } = await query;

      if (error) throw error;

      return res.json({
        success: true,
        count: companies?.length || 0,
        total: companies?.length || 0,
        companies: companies || []
      });
    }

    // Без переводов - используем directSelect
    let companies;
    if (session_id) {
      companies = await req.db.directSelect('pending_companies', { session_id });
    } else {
      companies = await req.db.directSelect('pending_companies');
    }

    // Применяем limit
    const limitedCompanies = companies.slice(0, parseInt(limit));

    res.json({
      success: true,
      count: limitedCompanies.length,
      total: companies.length,
      companies: limitedCompanies
    });
  } catch (error) {
    req.logger.error('Error fetching companies:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/debug/companies/:id
 * Удалить компанию по ID
 */
router.delete('/companies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    req.logger.info('Deleting company:', { company_id: id });
    
    // Используем directDelete если есть, иначе через Supabase
    if (req.db.supabase) {
      const { error } = await req.db.supabase
        .from('pending_companies')
        .delete()
        .eq('company_id', id);
      
      if (error) throw error;
    } else {
      // Fallback через SQL query если supabase недоступен
      await req.db.query(
        'DELETE FROM pending_companies WHERE company_id = $1',
        [id]
      );
    }
    
    res.json({ 
      success: true, 
      message: 'Company deleted successfully',
      company_id: id
    });
  } catch (error) {
    req.logger.error('Error deleting company:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/translations/stats
 * Получить статистику переводов
 */
router.get('/translations/stats', async (req, res) => {
  try {
    // Проверяем наличие TranslationService
    if (!req.translationService) {
      return res.status(500).json({
        success: false,
        error: 'Translation service not initialized'
      });
    }

    const stats = await req.translationService.getTranslationStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    req.logger.error('Error getting translation stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/translations/:companyId
 * Получить переводы компании из pending_companies_ru
 */
router.get('/translations/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;

    // Получить запись из pending_companies_ru
    const { data: translation, error } = await req.db.supabase
      .from('pending_companies_ru')
      .select('*')
      .eq('company_id', companyId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error;
    }

    if (!translation) {
      return res.json({
        success: true,
        companyId,
        translation: null,
        message: 'No translation found for this company'
      });
    }

    res.json({
      success: true,
      companyId,
      translation
    });
  } catch (error) {
    req.logger.error('Error getting company translation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/translations/trigger
 * Запустить перевод для конкретной компании
 */
router.post('/translations/trigger', async (req, res) => {
  try {
    const { companyId } = req.body;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'companyId is required'
      });
    }

    if (!req.translationService) {
      return res.status(500).json({
        success: false,
        error: 'Translation service not initialized'
      });
    }

    req.logger.info('Manual translation triggered', { companyId });

    // Запускаем перевод в фоне
    req.translationService.translateCompany(companyId)
      .then(result => {
        req.logger.info('Manual translation completed', { companyId, result });
      })
      .catch(error => {
        req.logger.error('Manual translation failed', { companyId, error: error.message });
      });

    res.json({
      success: true,
      message: 'Translation started',
      companyId
    });
  } catch (error) {
    req.logger.error('Error triggering translation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/translations/:companyId
 * Удалить все переводы компании
 */
router.delete('/translations/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;

    if (!req.translationService) {
      return res.status(500).json({
        success: false,
        error: 'Translation service not initialized'
      });
    }

    await req.translationService.deleteCompanyTranslations(companyId);

    res.json({
      success: true,
      message: 'Translations deleted',
      companyId
    });
  } catch (error) {
    req.logger.error('Error deleting translations:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;


