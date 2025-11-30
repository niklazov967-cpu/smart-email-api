const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ptbefsrvvcrjrfxxtogt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0YmVmc3J2dmNyanJmeHh0b2d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjIyMzIsImV4cCI6MjA3OTc5ODIzMn0.dGFxCU1q0uzc6HrZCUOJY3tp9_QHlFmUmqe2jtzVviA';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDuplicates() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  🔍 Проверка дубликатов в session_queries');
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Получить все запросы
    const { data: queries, error } = await supabase
        .from('session_queries')
        .select('query_id, session_id, query_cn, query_ru, created_at')
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('❌ Ошибка:', error.message);
        return;
    }
    
    console.log(`📊 Всего запросов в таблице: ${queries.length}\n`);
    
    // Проверка дубликатов по query_cn
    const cnMap = new Map();
    const cnDuplicates = [];
    
    queries.forEach(q => {
        if (q.query_cn) {
            const normalized = q.query_cn.toLowerCase().trim();
            if (!cnMap.has(normalized)) {
                cnMap.set(normalized, []);
            }
            cnMap.get(normalized).push(q);
        }
    });
    
    for (const [query, items] of cnMap.entries()) {
        if (items.length > 1) {
            cnDuplicates.push({ query, count: items.length, items });
        }
    }
    
    console.log(`📈 Уникальных query_cn: ${cnMap.size}`);
    console.log(`🔄 Дубликатов по query_cn: ${cnDuplicates.length}\n`);
    
    if (cnDuplicates.length > 0) {
        console.log('📋 Первые 10 дубликатов query_cn:\n');
        cnDuplicates.slice(0, 10).forEach((dup, i) => {
            console.log(`${i + 1}. "${dup.query}" - ${dup.count} повторений`);
            dup.items.forEach((item, j) => {
                console.log(`   ${j + 1}) query_id: ${item.query_id.substring(0, 8)}..., session_id: ${item.session_id.substring(0, 8)}..., created: ${new Date(item.created_at).toLocaleString('ru-RU')}`);
            });
            console.log('');
        });
    }
    
    // Проверка дубликатов по query_ru
    const ruMap = new Map();
    const ruDuplicates = [];
    
    queries.forEach(q => {
        if (q.query_ru) {
            const normalized = q.query_ru.toLowerCase().trim();
            if (!ruMap.has(normalized)) {
                ruMap.set(normalized, []);
            }
            ruMap.get(normalized).push(q);
        }
    });
    
    for (const [query, items] of ruMap.entries()) {
        if (items.length > 1) {
            ruDuplicates.push({ query, count: items.length, items });
        }
    }
    
    console.log(`📈 Уникальных query_ru: ${ruMap.size}`);
    console.log(`🔄 Дубликатов по query_ru: ${ruDuplicates.length}\n`);
    
    // Проверка дубликатов по комбинации query_cn + session_id
    const sessionQueryMap = new Map();
    const sessionQueryDuplicates = [];
    
    queries.forEach(q => {
        if (q.query_cn && q.session_id) {
            const key = `${q.session_id}|${q.query_cn.toLowerCase().trim()}`;
            if (!sessionQueryMap.has(key)) {
                sessionQueryMap.set(key, []);
            }
            sessionQueryMap.get(key).push(q);
        }
    });
    
    for (const [key, items] of sessionQueryMap.entries()) {
        if (items.length > 1) {
            sessionQueryDuplicates.push({ key, count: items.length, items });
        }
    }
    
    console.log(`🔍 Проверка дубликатов по session_id + query_cn:`);
    console.log(`   Уникальных комбинаций: ${sessionQueryMap.size}`);
    console.log(`   Дубликатов: ${sessionQueryDuplicates.length}\n`);
    
    if (sessionQueryDuplicates.length > 0) {
        console.log('⚠️  НАЙДЕНЫ ДУБЛИКАТЫ ПО SESSION + QUERY!\n');
        sessionQueryDuplicates.slice(0, 10).forEach((dup, i) => {
            const [sessionId, query] = dup.key.split('|');
            console.log(`${i + 1}. Session: ${sessionId.substring(0, 8)}..., Query: "${query}" - ${dup.count} повторений`);
            dup.items.forEach((item, j) => {
                console.log(`   ${j + 1}) query_id: ${item.query_id.substring(0, 8)}..., created: ${new Date(item.created_at).toLocaleString('ru-RU')}`);
            });
            console.log('');
        });
    } else {
        console.log('✅ Дубликатов по session + query НЕ найдено!\n');
    }
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('  📊 ИТОГОВАЯ СТАТИСТИКА');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Всего записей: ${queries.length}`);
    console.log(`  Уникальных query_cn: ${cnMap.size}`);
    console.log(`  Дубликатов query_cn: ${cnDuplicates.length}`);
    console.log(`  Уникальных query_ru: ${ruMap.size}`);
    console.log(`  Дубликатов query_ru: ${ruDuplicates.length}`);
    console.log(`  Дубликатов session+query: ${sessionQueryDuplicates.length}`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Вывод процента дубликатов
    const cnDuplicatePercent = ((cnDuplicates.length / cnMap.size) * 100).toFixed(1);
    const ruDuplicatePercent = ((ruDuplicates.length / ruMap.size) * 100).toFixed(1);
    
    console.log('📈 ПРОЦЕНТ ДУБЛИКАТОВ:');
    console.log(`  query_cn: ${cnDuplicatePercent}% запросов имеют дубликаты`);
    console.log(`  query_ru: ${ruDuplicatePercent}% запросов имеют дубликаты`);
    console.log(`  session+query: ${sessionQueryDuplicates.length > 0 ? 'ЕСТЬ' : 'НЕТ'}`);
    console.log('═══════════════════════════════════════════════════════\n');
}

checkDuplicates().catch(console.error);

