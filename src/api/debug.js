const express = require('express');
const router = express.Router();

/**
 * GET /api/debug/data
 * Получить ВСЕ данные из Supabase
 */
router.get('/data', async (req, res) => {
  try {
    const [sessions, queries, companies, progress] = await Promise.all([
      req.db.directSelect('search_sessions'),
      req.db.directSelect('session_queries'),
      req.db.directSelect('pending_companies'),
      req.db.directSelect('processing_progress')
    ]);

    res.json({
      success: true,
      data: {
        search_sessions: { count: sessions.length, items: sessions },
        session_queries: { count: queries.length, items: queries },
        pending_companies: { count: companies.length, items: companies },
        processing_progress: { count: progress.length, items: progress }
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

module.exports = router;

