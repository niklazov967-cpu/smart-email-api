const express = require('express');
const router = express.Router();

/**
 * GET /api/companies
 * Получить список компаний
 */
router.get('/', async (req, res) => {
  try {
    const {
      session_id,
      limit = 100,
      offset = 0,
      search,
      has_email,
      has_website
    } = req.query;
    
    let query = 'SELECT * FROM company_records WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    if (session_id) {
      query += ` AND session_id = $${paramIndex}`;
      params.push(session_id);
      paramIndex++;
    }
    
    if (has_email === 'true') {
      query += ` AND email IS NOT NULL AND email != ''`;
    }
    
    if (has_website === 'true') {
      query += ` AND website IS NOT NULL AND website != ''`;
    }
    
    if (search) {
      query += ` AND (company_name_cn ILIKE $${paramIndex} OR company_name_ru ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    query += ` ORDER BY date_added DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await req.db.query(query, params);
    
    // Получить общее количество
    const countQuery = query.replace(/ORDER BY.*$/, '').replace(/LIMIT.*$/, '');
    const countResult = await req.db.query(
      countQuery.replace(/SELECT \*/, 'SELECT COUNT(*) as total'),
      params.slice(0, -2)
    );
    
    res.json({
      success: true,
      count: result.rows.length,
      total: parseInt(countResult.rows[0]?.total || 0),
      data: result.rows
    });
  } catch (error) {
    req.logger.error('Failed to get companies', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/companies/:id
 * Получить детали компании
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await req.db.query(
      'SELECT * FROM company_records WHERE record_id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Company not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    req.logger.error('Failed to get company', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/companies/export
 * Экспортировать компании
 */
router.post('/export', async (req, res) => {
  try {
    const {
      session_id,
      format = 'json',
      include_raw_data = false
    } = req.body;
    
    let query = 'SELECT * FROM company_records WHERE 1=1';
    const params = [];
    
    if (session_id) {
      query += ' AND session_id = $1';
      params.push(session_id);
    }
    
    query += ' ORDER BY date_added DESC';
    
    const result = await req.db.query(query, params);
    
    // Подготовить данные для экспорта
    const exportData = result.rows.map(company => {
      const data = {
        company_name_cn: company.company_name_cn,
        company_name_ru: company.company_name_ru,
        company_name_en: company.company_name_en,
        website: company.website,
        email: company.email,
        phone: company.phone,
        wechat: company.wechat,
        whatsapp: company.whatsapp,
        tags: [],
        services: company.services || [],
        materials: company.materials || [],
        equipment: company.equipment || [],
        specialization: company.specialization,
        description: company.description,
        date_added: company.date_added
      };
      
      // Собрать теги
      for (let i = 1; i <= 20; i++) {
        const tag = company[`tag${i}`];
        if (tag) {
          data.tags.push(tag);
        }
      }
      
      if (include_raw_data && company.raw_sonar_data) {
        data.raw_sonar_data = company.raw_sonar_data;
      }
      
      return data;
    });
    
    if (format === 'csv') {
      // Простой CSV экспорт
      const headers = Object.keys(exportData[0] || {});
      const csvRows = [
        headers.join(','),
        ...exportData.map(row => 
          headers.map(header => {
            const value = row[header];
            if (Array.isArray(value)) {
              return `"${value.join('; ')}"`;
            }
            return `"${String(value || '').replace(/"/g, '""')}"`;
          }).join(',')
        )
      ];
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=companies_${Date.now()}.csv`);
      res.send(csvRows.join('\n'));
    } else {
      // JSON экспорт
      res.json({
        success: true,
        format: 'json',
        count: exportData.length,
        exported_at: new Date().toISOString(),
        data: exportData
      });
    }
  } catch (error) {
    req.logger.error('Failed to export companies', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/companies/stats
 * Получить статистику по компаниям
 */
router.get('/stats', async (req, res) => {
  try {
    const { session_id } = req.query;
    
    let query = 'SELECT COUNT(*) as total FROM company_records WHERE 1=1';
    const params = [];
    
    if (session_id) {
      query += ' AND session_id = $1';
      params.push(session_id);
    }
    
    const totalResult = await req.db.query(query, params);
    const total = parseInt(totalResult.rows[0].total);
    
    // Статистика по наличию данных
    const withEmailResult = await req.db.query(
      query.replace('COUNT(*)', "COUNT(*) FILTER (WHERE email IS NOT NULL AND email != '')"),
      params
    );
    const withEmail = parseInt(withEmailResult.rows[0].total);
    
    const withWebsiteResult = await req.db.query(
      query.replace('COUNT(*)', "COUNT(*) FILTER (WHERE website IS NOT NULL AND website != '')"),
      params
    );
    const withWebsite = parseInt(withWebsiteResult.rows[0].total);
    
    res.json({
      success: true,
      data: {
        total,
        with_email: withEmail,
        with_website: withWebsite,
        with_both: withEmail && withWebsite ? Math.min(withEmail, withWebsite) : 0
      }
    });
  } catch (error) {
    req.logger.error('Failed to get stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

