const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load from .env (not .env.local for scripts)
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const DRY_RUN = process.argv.includes('--dry-run');

console.log('═══════════════════════════════════════════════════════');
console.log('  🔄 Сброс этапов для компаний БЕЗ website, но С email');
console.log('═══════════════════════════════════════════════════════');
if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - изменения НЕ будут применены\n');
}

async function getCompaniesWithEmailNoWebsite() {
    console.log('\n🔍 Поиск компаний без website, но с email...');
    
    const { data, error } = await supabase
        .from('pending_companies')
        .select('company_id, company_name, website, email, stage2_status, stage3_status, stage4_status, current_stage')
        .or('website.is.null,website.eq.""')  // Нет website
        .not('email', 'is', null)              // Есть email
        .not('email', 'eq', '');               // Email не пустой
    
    if (error) {
        console.error('❌ Ошибка при получении компаний:', error.message);
        throw error;
    }
    
    console.log(`\n📊 СТАТИСТИКА:`);
    console.log(`   Найдено компаний с email, но БЕЗ website: ${data.length}`);
    
    // Группировка по статусам
    const byCurrentStage = data.reduce((acc, c) => {
        const stage = `Stage ${c.current_stage}`;
        acc[stage] = (acc[stage] || 0) + 1;
        return acc;
    }, {});
    
    console.log(`\n📈 По current_stage:`);
    Object.entries(byCurrentStage).forEach(([stage, count]) => {
        console.log(`   ${stage}: ${count} компаний`);
    });
    
    const byStage2Status = data.reduce((acc, c) => {
        const status = c.stage2_status || 'NULL';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {});
    
    console.log(`\n📈 По stage2_status:`);
    Object.entries(byStage2Status).forEach(([status, count]) => {
        console.log(`   ${status}: ${count} компаний`);
    });
    
    const byStage3Status = data.reduce((acc, c) => {
        const status = c.stage3_status || 'NULL';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {});
    
    console.log(`\n📈 По stage3_status:`);
    Object.entries(byStage3Status).forEach(([status, count]) => {
        console.log(`   ${status}: ${count} компаний`);
    });
    
    console.log(`\n📋 Примеры компаний (первые 10):`);
    data.slice(0, 10).forEach((company, index) => {
        console.log(`   ${index + 1}. ${company.company_name}`);
        console.log(`      Email: ${company.email}`);
        console.log(`      Website: ${company.website || 'N/A'}`);
        console.log(`      current_stage: ${company.current_stage} → 1`);
        console.log(`      stage2_status: ${company.stage2_status || 'NULL'} → NULL`);
    });
    if (data.length > 10) {
        console.log(`   ... и еще ${data.length - 10} компаний`);
    }
    
    return data;
}

async function resetCompaniesForStage2(companies) {
    if (companies.length === 0) {
        console.log('\nℹ️  Нет компаний для обновления.');
        return 0;
    }
    
    console.log('\n🔄 Обновление записей...');
    let updatedCount = 0;
    
    if (!DRY_RUN) {
        const companyIds = companies.map(c => c.company_id);
        
        const { count, error } = await supabase
            .from('pending_companies')
            .update({
                current_stage: 1,          // Вернуть на Stage 1 (готов для Stage 2)
                stage2_status: null,       // Сбросить Stage 2
                stage3_status: null,       // Сбросить Stage 3 (чтобы перепроверить email)
                stage4_status: null,       // Сбросить Stage 4
                website_status: null,      // Очистить статус сайта
                stage2_raw_data: null,     // Очистить данные Stage 2
                stage3_raw_data: null,     // Очистить данные Stage 3 (для перепроверки)
                contacts_json: null,       // Сохраняем email, но очищаем contacts_json для перепроверки
                updated_at: new Date().toISOString()
            })
            .in('company_id', companyIds)
            .select('*', { count: 'exact' });
        
        if (error) {
            console.error('❌ Ошибка при обновлении компаний:', error.message);
            throw error;
        }
        updatedCount = count;
    } else {
        updatedCount = companies.length; // В dry run предполагаем что все обновятся
    }
    
    console.log(`\n✅ Обновлено записей: ${updatedCount}`);
    return updatedCount;
}

async function main() {
    try {
        const companiesToReset = await getCompaniesWithEmailNoWebsite();
        const updatedCount = await resetCompaniesForStage2(companiesToReset);
        
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('  📊 ИТОГОВАЯ СТАТИСТИКА');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`  Компаний БЕЗ website, но С email: ${companiesToReset.length}`);
        console.log(`  Будут добавлены в очередь обработки: ${updatedCount}`);
        console.log('  Параметры:');
        console.log('    - current_stage: 1 (Stage 1 завершен, готов для Stage 2)');
        console.log('    - stage2_status: NULL (готов для Stage 2 - поиск website)');
        console.log('    - stage3_status: NULL (будет перепроверен после Stage 2)');
        console.log('    - stage4_status: NULL (будет обработан после Stage 3)');
        console.log('    - website_status: NULL');
        console.log('    - stage2_raw_data: NULL (очищены старые данные)');
        console.log('    - stage3_raw_data: NULL (очищены для перепроверки)');
        console.log('    - contacts_json: NULL (очищены)');
        console.log('    - email: СОХРАНЕН (не изменен)');
        console.log('\n  🎯 ЧТО ПРОИЗОЙДЕТ ДАЛЬШЕ:');
        console.log('    1. Stage 2: поиск website (Perplexity + DeepSeek Retry)');
        console.log('       → Попробуют найти website для компании');
        console.log('       → 🎁 BONUS: могут найти НОВЫЙ email (улучшенный)');
        console.log('    2. Stage 3: перепроверка email на НОВОМ сайте');
        console.log('       → Если Stage 2 найдет website, Stage 3 проверит его');
        console.log('       → Может найти ЛУЧШИЙ email на официальном сайте');
        console.log('    3. Stage 4: AI валидация и обогащение');
        console.log('\n  💡 ЗАЧЕМ ЭТО НУЖНО:');
        console.log('    - Email был найден БЕЗ website (из каталогов)');
        console.log('    - Возможно есть официальный сайт с ЛУЧШИМ email');
        console.log('    - Stage 2 попытается найти официальный website');
        console.log('    - Stage 3 найдет официальный email на сайте');
        console.log('    - Результат: ПОЛНЫЕ данные (website + лучший email)');
        if (DRY_RUN) {
            console.log('\n⚠️  DRY RUN - для реального выполнения запустите без --dry-run');
        } else {
            console.log('\n✅ Изменения применены! Компании готовы для полной обработки.');
        }
        console.log('═══════════════════════════════════════════════════════\n');
        
    } catch (error) {
        console.error('\n❌ Произошла ошибка в основном процессе:', error.message);
        process.exit(1);
    }
}

main();

