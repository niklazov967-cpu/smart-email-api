const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function migrate() {
  console.log('Starting migration...\n');
  
  // Шаг 1: Создать записи
  console.log('Step 1: Creating records...');
  const { data: companies } = await supabase
    .from('translations')
    .select('company_id')
    .eq('translation_status', 'completed');
  
  const uniqueCompanyIds = [...new Set(companies.map(c => c.company_id))];
  console.log(`Found ${uniqueCompanyIds.length} unique companies with translations`);
  
  for (const companyId of uniqueCompanyIds) {
    await supabase
      .from('pending_companies_ru')
      .upsert({ company_id: companyId, translation_status: 'pending' });
  }
  console.log('✅ Records created\n');
  
  // Шаг 2: Заполнить переводы
  console.log('Step 2: Filling translations...');
  
  for (const companyId of uniqueCompanyIds) {
    const { data: translations } = await supabase
      .from('translations')
      .select('*')
      .eq('company_id', companyId)
      .eq('translation_status', 'completed');
    
    if (!translations || translations.length === 0) continue;
    
    const updateData = { updated_at: new Date().toISOString() };
    
    translations.forEach(t => {
      const ruFieldName = `${t.field_name}_ru`;
      updateData[ruFieldName] = t.translated_text;
    });
    
    await supabase
      .from('pending_companies_ru')
      .update(updateData)
      .eq('company_id', companyId);
    
    console.log(`  Migrated: ${companyId} (${translations.length} fields)`);
  }
  
  // Шаг 3: Обновить статусы
  console.log('\nStep 3: Updating statuses...');
  
  const { data: ruRecords } = await supabase
    .from('pending_companies_ru')
    .select('*');
  
  for (const ru of ruRecords) {
    let fieldCount = 0;
    if (ru.company_name_ru) fieldCount++;
    if (ru.description_ru) fieldCount++;
    if (ru.ai_generated_description_ru) fieldCount++;
    
    const status = fieldCount >= 2 ? 'completed' : fieldCount > 0 ? 'partial' : 'pending';
    
    await supabase
      .from('pending_companies_ru')
      .update({ 
        translation_status: status,
        translated_at: new Date().toISOString()
      })
      .eq('company_id', ru.company_id);
  }
  
  console.log('✅ Statuses updated\n');
  
  // Статистика
  const { data: stats } = await supabase
    .from('pending_companies_ru')
    .select('translation_status');
  
  const counts = { completed: 0, partial: 0, pending: 0, failed: 0 };
  stats.forEach(s => counts[s.translation_status]++);
  
  console.log('Migration completed!');
  console.log(`Total: ${stats.length}`);
  console.log(`Completed: ${counts.completed}`);
  console.log(`Partial: ${counts.partial}`);
  console.log(`Pending: ${counts.pending}`);
}

migrate().catch(console.error);
