const express = require('express');
const router = express.Router();

/**
 * GET /api/debug/data
 * Получить ВСЕ данные из базы (МockDatabase)
 */
router.get('/data', async (req, res) => {
  try {
    res.json({
      success: true,
      data: req.db.data
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
 * Получить ВСЕ данные конкретной сессии
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const data = req.db.data;

    const session = data.search_sessions?.find(s => s.session_id === sessionId);
    const queries = data.session_queries?.filter(q => q.session_id === sessionId) || [];
    const pending = data.pending_companies?.filter(c => c.session_id === sessionId) || [];
    const found = data.found_companies?.filter(c => c.session_id === sessionId) || [];
    const progress = data.processing_progress?.filter(p => p.session_id === sessionId) || [];

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
            stage: c.stage
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

