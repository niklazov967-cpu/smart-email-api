const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function deleteEmptySessions() {
  console.log('🔍 Поиск пустых сессий...\n');
  
  // Получить все сессии
  const { data: sessions, error: sessionsError } = await supabase
    .from('search_sessions')
    .select('session_id, topic_description, created_at');
  
  if (sessionsError) {
    console.error('❌ Ошибка получения сессий:', sessionsError);
    return;
  }
  
  console.log(`Всего сессий: ${sessions.length}\n`);
  
  const emptySessions = [];
  
  // Проверить каждую сессию на наличие компаний
  for (const session of sessions) {
    const { count } = await supabase
      .from('pending_companies')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session.session_id);
    
    if (count === 0) {
      emptySessions.push(session);
      console.log(`🗑️  Пустая сессия: ${session.topic_description || session.session_id}`);
      console.log(`   ID: ${session.session_id}`);
      console.log(`   Создана: ${new Date(session.created_at).toLocaleString('ru-RU')}`);
      console.log(`   Компаний: 0\n`);
    }
  }
  
  if (emptySessions.length === 0) {
    console.log('✅ Пустых сессий не найдено!');
    return;
  }
  
  console.log(`\n📊 Найдено пустых сессий: ${emptySessions.length}`);
  console.log(`💾 Осталось сессий с данными: ${sessions.length - emptySessions.length}\n`);
  
  // Удалить пустые сессии
  console.log('🗑️  Удаление пустых сессий...\n');
  
  for (const session of emptySessions) {
    const { error } = await supabase
      .from('search_sessions')
      .delete()
      .eq('session_id', session.session_id);
    
    if (error) {
      console.error(`❌ Ошибка удаления ${session.session_id}:`, error.message);
    } else {
      console.log(`✅ Удалена: ${session.topic_description || session.session_id}`);
    }
  }
  
  console.log(`\n✅ Удаление завершено!`);
  console.log(`   Удалено: ${emptySessions.length}`);
  console.log(`   Осталось: ${sessions.length - emptySessions.length}`);
}

deleteEmptySessions().catch(console.error);
