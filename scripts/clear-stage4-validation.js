#!/usr/bin/env node
/**
 * Скрипт для очистки данных Stage 4 (валидация)
 * Удаляет validation_score, validation_reason, ai_generated_description, ai_confidence_score
 * Возвращает stage в зависимости от наличия email/website
 */

require('dotenv').config();
const path = require('path');
const SupabaseClient = require(path.join(__dirname, '../src/database/SupabaseClient'));
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

async function clearStage4Validation() {
  const db = new SupabaseClient();
  await db.initialize();
  
  logger.info('🧹 Starting Stage 4 validation data cleanup...');
  
  try {
    // Получаем все компании с validation_score
    const { data: companies, error: e1 } = await db.supabase
      .from('pending_companies')
      .select('company_id, company_name, email, website, validation_score, stage')
      .not('validation_score', 'is', null);
    
    if (e1) throw e1;
    
    logger.info(`📊 Found ${companies.length} companies with Stage 4 validation data`);
    
    let cleared = 0;
    let errors = 0;
    
    // Обновляем каждую компанию
    for (const company of companies) {
      try {
        // Определяем новый stage
        let newStage = 'names_found';
        if (company.email && company.email.trim() !== '') {
          newStage = 'contacts_found';
        } else if (company.website && company.website.trim() !== '') {
          newStage = 'website_found';
        }
        
        // Очищаем Stage 4 данные
        const { error: updateError } = await db.supabase
          .from('pending_companies')
          .update({
            validation_score: null,
            validation_reason: null,
            ai_generated_description: null,
            ai_confidence_score: null,
            stage: newStage,
            updated_at: new Date().toISOString()
          })
          .eq('company_id', company.company_id);
        
        if (updateError) {
          logger.error(`❌ Error updating ${company.company_name}:`, updateError.message);
          errors++;
        } else {
          cleared++;
          if (cleared % 10 === 0) {
            logger.info(`   Progress: ${cleared}/${companies.length}`);
          }
        }
      } catch (err) {
        logger.error(`❌ Error processing ${company.company_name}:`, err.message);
        errors++;
      }
    }
    
    logger.info(`✅ Cleared ${cleared} companies`);
    if (errors > 0) {
      logger.warn(`⚠️  ${errors} errors occurred`);
    }
    
    // Проверяем результат
    const { data: remaining } = await db.supabase
      .from('pending_companies')
      .select('company_id')
      .not('validation_score', 'is', null);
    
    logger.info(`📊 Remaining with validation: ${remaining ? remaining.length : 0}`);
    
    // Статистика по stage
    const { data: allCompanies } = await db.supabase
      .from('pending_companies')
      .select('stage');
    
    const stageCounts = {};
    if (allCompanies) {
      allCompanies.forEach(c => {
        stageCounts[c.stage] = (stageCounts[c.stage] || 0) + 1;
      });
    }
    
    logger.info('📈 Stage distribution:', stageCounts);
    logger.info('✅ Stage 4 cleanup completed!');
    
    process.exit(0);
    
  } catch (error) {
    logger.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

clearStage4Validation();

