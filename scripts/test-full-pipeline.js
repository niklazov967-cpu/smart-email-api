/**
 * Simple Full Pipeline Test v1.10.1
 * Tests Stage 1, 2, 3 with existing session
 */

require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const API_URL = process.env.RAILWAY_URL || 'https://smart-email-api-production.up.railway.app';
const TEST_TOPIC = 'CNC精密车削铣削加工服务';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
console.log('║                🚀 АВТОМАТИЧЕСКОЕ ТЕСТИРОВАНИЕ v1.10.1                    ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function streamLogs(url, description) {
  console.log(`\n${description}\n`);

  return new Promise((resolve, reject) => {
    axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      timeout: 600000
    }).then(response => {
      let buffer = '';
      
      response.data.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        
        lines.forEach(line => {
          if (line.trim()) {
            console.log(line);
          }
        });
      });
      
      response.data.on('end', () => {
        if (buffer.trim()) console.log(buffer);
        console.log('\n✅ Этап завершен!\n');
        resolve();
      });
      
      response.data.on('error', reject);
    }).catch(reject);
  });
}

async function createSession() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('ЭТАП 0: Подготовка - создание сессии и запросов');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Генерация запросов через API
  console.log(`Генерация sub-queries для темы: ${TEST_TOPIC}\n`);
  
  const response = await axios.post(`${API_URL}/api/queries/generate`, {
    topic: TEST_TOPIC,
    targetCount: 10
  });
  
  console.log(`✅ Сгенерировано запросов: ${response.data.queries.length}\n`);
  
  // Создать сессию вручную через Supabase
  const { data: session, error: sessionError } = await supabase
    .from('search_sessions')
    .insert({
      search_query: TEST_TOPIC,
      topic_description: TEST_TOPIC,
      target_count: 50,
      status: 'pending'
    })
    .select()
    .single();
  
  if (sessionError) throw sessionError;
  
  console.log(`✅ Создана сессия: ${session.session_id}\n`);
  
  // Сохранить queries
  const queries = response.data.queries.map(q => ({
    session_id: session.session_id,
    query_cn: q.query_cn,
    query_ru: q.query_ru,
    relevance: q.relevance,
    is_selected: true
  }));
  
  const { error: queriesError } = await supabase
    .from('session_queries')
    .insert(queries);
  
  if (queriesError) throw queriesError;
  
  console.log(`✅ Сохранено ${queries.length} sub-queries\n`);
  
  return session.session_id;
}

async function runStages(sessionId) {
  // Stage 1
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('ЭТАП 1: Поиск компаний');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  await streamLogs(
    `${API_URL}/api/process/stage1/${sessionId}`,
    '🔍 Stage 1: Поиск компаний'
  );
  
  await sleep(3000);
  
  // Stage 2
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('ЭТАП 2: Поиск сайтов + Stage 2 Retry (2x попытки!)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  await streamLogs(
    `${API_URL}/api/process/stage2`,
    '🌐 Stage 2: Поиск официальных сайтов'
  );
  
  await sleep(3000);
  
  // Stage 3
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('ЭТАП 3: Поиск email + Stage 3 Retry (2x попытки!)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  await streamLogs(
    `${API_URL}/api/process/stage3`,
    '📧 Stage 3: Поиск email адресов'
  );
}

async function getFinalStats() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('ЭТАП 4: Финальная статистика');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const { execSync } = require('child_process');
  const stats = execSync('node scripts/get-stats.js', { encoding: 'utf-8' });
  console.log(stats);
}

async function runTest() {
  try {
    console.log(`⏱️  Начало: ${new Date().toLocaleString('ru-RU')}\n`);
    
    const sessionId = await createSession();
    await runStages(sessionId);
    await sleep(2000);
    await getFinalStats();
    
    console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
    console.log('║              🎊 ТЕСТИРОВАНИЕ ЗАВЕРШЕНО УСПЕШНО! 🎊                        ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');
    
    console.log(`⏱️  Окончание: ${new Date().toLocaleString('ru-RU')}\n`);
    
  } catch (error) {
    console.error('\n❌ ОШИБКА:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

runTest();
