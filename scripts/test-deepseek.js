/**
 * Тест DeepSeek API - проверка доступности и генерации запросов
 */
const axios = require('axios');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-85323bc753cb4b25b02a2664e9367f8a';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1';

async function testDeepSeek() {
  console.log('🧪 Тестирование DeepSeek API...\n');
  console.log(`🔑 API Key: ${DEEPSEEK_API_KEY.substring(0, 10)}... (length: ${DEEPSEEK_API_KEY.length})`);
  console.log(`🌐 URL: ${DEEPSEEK_URL}/chat/completions\n`);

  const prompt = `Создай 5 поисковых запросов на китайском языке для темы: "Токарная обработка металлов на ЧПУ"

Формат: JSON с массивом queries (query_cn, query_ru, relevance).`;

  try {
    console.log('📤 Отправляю запрос...');
    const startTime = Date.now();

    const response = await axios.post(
      `${DEEPSEEK_URL}/chat/completions`,
      {
        model: 'deepseek-chat',
        messages: [
          { 
            role: 'system', 
            content: 'You are a helpful assistant that ALWAYS returns valid JSON. Never include explanatory text outside the JSON structure.' 
          },
          { 
            role: 'user', 
            content: prompt 
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const responseTime = Date.now() - startTime;
    const content = response.data.choices[0].message.content;
    const usage = response.data.usage;

    console.log(`✅ УСПЕХ! Время ответа: ${responseTime}ms`);
    console.log(`\n📊 Использование токенов:`);
    console.log(`   - Входящие: ${usage.prompt_tokens}`);
    console.log(`   - Исходящие: ${usage.completion_tokens}`);
    console.log(`   - Всего: ${usage.total_tokens}`);
    console.log(`\n📝 Ответ (первые 500 символов):`);
    console.log(content.substring(0, 500));
    console.log(`\n✅ DeepSeek работает корректно!`);
    
    return true;

  } catch (error) {
    console.log(`\n❌ ОШИБКА: ${error.message}`);
    
    if (error.response) {
      console.log(`   HTTP Status: ${error.response.status}`);
      console.log(`   Response data:`, JSON.stringify(error.response.data, null, 2));
    } else if (error.code === 'ECONNABORTED') {
      console.log(`   Причина: Timeout (превышено время ожидания)`);
    } else if (error.code === 'ENOTFOUND') {
      console.log(`   Причина: DNS lookup failed (не удается найти сервер)`);
    } else {
      console.log(`   Code: ${error.code}`);
      console.log(`   Stack:`, error.stack);
    }
    
    console.log(`\n❌ DeepSeek API недоступен или некорректен`);
    return false;
  }
}

// Запуск
testDeepSeek()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });

