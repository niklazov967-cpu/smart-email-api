/**
 * Stage 5: Резервная генерация тегов
 * До-генерирует теги для компаний у которых их недостаточно
 */
const TagExtractor = require('../utils/TagExtractor');

class Stage5GenerateTags {
  constructor(sonarClient, settingsManager, database, logger) {
    this.sonar = sonarClient;
    this.settings = settingsManager;
    this.db = database;
    this.logger = logger;
    this.tagExtractor = new TagExtractor();
  }

  async execute(sessionId) {
    this.logger.info('Stage 5: Starting tag补充', { sessionId });

    try {
      // Получить компании с недостаточным количеством тегов
      const result = await this.db.query(
        `SELECT company_id, company_name, description, services, tag1, tag2, tag3
         FROM pending_companies 
         WHERE session_id = $1
           AND (tag1 IS NULL OR tag2 IS NULL OR tag3 IS NULL)
           AND description IS NOT NULL`,
        [sessionId]
      );

      const companies = result.rows;
      let updated = 0;

      for (const company of companies) {
        // Если есть описание - до-извлечь теги
        if (company.description) {
          const tagData = this.tagExtractor.extractTagsForDB(company.description);
          const services = this.tagExtractor.extractServices(company.description);
          
          // Обновить только если нашли новые теги
          const newTagsCount = Object.values(tagData).filter(t => t).length;
          if (newTagsCount > 0) {
            await this.db.query(
              `UPDATE pending_companies 
               SET tag1 = COALESCE(tag1, $1), tag2 = COALESCE(tag2, $2), tag3 = COALESCE(tag3, $3),
                   tag4 = COALESCE(tag4, $4), tag5 = COALESCE(tag5, $5), tag6 = COALESCE(tag6, $6),
                   tag7 = COALESCE(tag7, $7), tag8 = COALESCE(tag8, $8), tag9 = COALESCE(tag9, $9),
                   tag10 = COALESCE(tag10, $10), tag11 = COALESCE(tag11, $11), tag12 = COALESCE(tag12, $12),
                   tag13 = COALESCE(tag13, $13), tag14 = COALESCE(tag14, $14), tag15 = COALESCE(tag15, $15),
                   tag16 = COALESCE(tag16, $16), tag17 = COALESCE(tag17, $17), tag18 = COALESCE(tag18, $18),
                   tag19 = COALESCE(tag19, $19), tag20 = COALESCE(tag20, $20),
                   services = COALESCE(services, $21),
                   updated_at = NOW()
               WHERE company_id = $22`,
              [tagData.tag1, tagData.tag2, tagData.tag3, tagData.tag4, tagData.tag5,
               tagData.tag6, tagData.tag7, tagData.tag8, tagData.tag9, tagData.tag10,
               tagData.tag11, tagData.tag12, tagData.tag13, tagData.tag14, tagData.tag15,
               tagData.tag16, tagData.tag17, tagData.tag18, tagData.tag19, tagData.tag20,
               services, company.company_id]
            );
            
            updated++;
            
            this.logger.info('Stage 5: Tags generated', {
              company: company.company_name,
              tagsCount: newTagsCount
            });
          }
        }
      }

      this.logger.info('Stage 5: Tag generation completed', {
        total: companies.length,
        updated,
        skipped: companies.length - updated,
        sessionId
      });

      return {
        success: true,
        total: companies.length,
        updated,
        skipped: companies.length - updated
      };

    } catch (error) {
      this.logger.error('Stage 5: Tag generation failed', {
        error: error.message,
        sessionId
      });
      throw error;
    }
  }
}

module.exports = Stage5GenerateTags;
