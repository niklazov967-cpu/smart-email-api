const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCompanyNameUniqueness() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  🔍 Проверка уникальности company_name');
    console.log('═══════════════════════════════════════════════════════\n');

    try {
        // Получить все компании
        const { data: companies, error } = await supabase
            .from('pending_companies')
            .select('company_name, company_id, website, email, normalized_domain, created_at');

        if (error) {
            console.error('❌ Ошибка при получении компаний:', error.message);
            return;
        }

        console.log(`📊 Всего компаний в БД: ${companies.length}\n`);

        // Группировка по company_name (case-insensitive)
        const nameMap = new Map();
        companies.forEach(c => {
            const name = c.company_name.trim().toLowerCase();
            if (!nameMap.has(name)) {
                nameMap.set(name, []);
            }
            nameMap.get(name).push(c);
        });

        // Найти дубликаты
        const duplicates = Array.from(nameMap.entries())
            .filter(([_, comps]) => comps.length > 1)
            .sort((a, b) => b[1].length - a[1].length); // Сортировка по количеству

        const totalDuplicateRecords = duplicates.reduce((sum, [_, comps]) => sum + comps.length - 1, 0);

        console.log(`✅ Уникальных названий: ${nameMap.size}`);
        console.log(`🔄 Названий с дубликатами: ${duplicates.length}`);
        console.log(`📊 Всего дублирующихся записей: ${totalDuplicateRecords}\n`);

        if (duplicates.length > 0) {
            console.log('📋 Топ-20 дубликатов (по количеству записей):\n');
            duplicates.slice(0, 20).forEach(([name, comps], idx) => {
                console.log(`${idx + 1}. ${comps[0].company_name} (${comps.length} записей)`);
                comps.slice(0, 5).forEach((c, i) => {
                    const web = c.website ? c.website.substring(0, 40) : 'N/A';
                    const email = c.email ? c.email.substring(0, 30) : 'N/A';
                    const domain = c.normalized_domain || 'N/A';
                    const date = new Date(c.created_at).toLocaleDateString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    console.log(`   [${i + 1}] Website: ${web}`);
                    console.log(`       Email: ${email} | Domain: ${domain}`);
                    console.log(`       Created: ${date}`);
                });
                if (comps.length > 5) {
                    console.log(`   ... и еще ${comps.length - 5} записей`);
                }
                console.log('');
            });

            // Анализ: сколько дубликатов с разными доменами
            let sameDomainDuplicates = 0;
            let differentDomainDuplicates = 0;

            duplicates.forEach(([name, comps]) => {
                const domains = new Set(comps.map(c => c.normalized_domain).filter(d => d));
                if (domains.size <= 1) {
                    sameDomainDuplicates++;
                } else {
                    differentDomainDuplicates++;
                }
            });

            console.log('═══════════════════════════════════════════════════════');
            console.log('  📊 АНАЛИЗ ДУБЛИКАТОВ');
            console.log('═══════════════════════════════════════════════════════');
            console.log(`  Дубликаты с ОДИНАКОВЫМ доменом: ${sameDomainDuplicates}`);
            console.log(`  Дубликаты с РАЗНЫМИ доменами: ${differentDomainDuplicates}`);
            console.log('');
            console.log('  💡 Интерпретация:');
            console.log('  - Одинаковый домен → настоящие дубликаты (можно удалить)');
            console.log('  - Разные домены → возможно разные компании с похожими названиями');
            console.log('═══════════════════════════════════════════════════════\n');

        } else {
            console.log('✅ Дубликатов по company_name НЕ НАЙДЕНО!\n');
        }

        console.log('═══════════════════════════════════════════════════════');
        console.log('  📊 ИТОГОВАЯ СТАТИСТИКА');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`  Всего компаний: ${companies.length}`);
        console.log(`  Уникальных названий: ${nameMap.size}`);
        console.log(`  Процент уникальности: ${((nameMap.size / companies.length) * 100).toFixed(1)}%`);
        console.log(`  Названий с дубликатами: ${duplicates.length}`);
        console.log(`  Дубликатов записей: ${totalDuplicateRecords}`);
        console.log(`  Процент дубликатов: ${((totalDuplicateRecords / companies.length) * 100).toFixed(1)}%`);
        console.log('═══════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('\n❌ Произошла ошибка в основном процессе:', error.message);
    }
}

checkCompanyNameUniqueness();

