# Настройка Supabase для Smart Email API

## Шаг 1: Создание таблиц

1. Откройте Supabase Dashboard: https://ptbefsrvvcrjrfxxtogt.supabase.co
2. Перейдите в **SQL Editor**
3. Скопируйте содержимое файла `database/supabase-schema.sql`
4. Вставьте в SQL Editor
5. Нажмите **Run**

## Шаг 2: Проверка таблиц

После выполнения SQL, убедитесь что созданы следующие таблицы:

- ✅ `search_sessions` - Сессии поиска
- ✅ `session_queries` - Запросы для каждой сессии
- ✅ `pending_companies` - Компании в процессе обработки
- ✅ `found_companies` - Финализированные компании
- ✅ `processing_progress` - Прогресс обработки
- ✅ `system_settings` - Настройки системы

## Шаг 3: Настройка Row Level Security (опционально)

Для production рекомендуется включить RLS:

```sql
-- Разрешить все операции для authenticated пользователей
ALTER TABLE search_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE found_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Политики (для разработки - разрешить все)
CREATE POLICY "Allow all for anon" ON search_sessions FOR ALL USING (true);
CREATE POLICY "Allow all for anon" ON session_queries FOR ALL USING (true);
CREATE POLICY "Allow all for anon" ON pending_companies FOR ALL USING (true);
CREATE POLICY "Allow all for anon" ON found_companies FOR ALL USING (true);
CREATE POLICY "Allow all for anon" ON processing_progress FOR ALL USING (true);
CREATE POLICY "Allow all for anon" ON system_settings FOR ALL USING (true);
```

## Шаг 4: Запуск приложения

```bash
npm start
```

Сервер подключится к Supabase автоматически используя credentials из `.env`:

```
SUPABASE_URL=https://ptbefsrvvcrjrfxxtogt.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Преимущества Supabase

✅ **Данные сохраняются навсегда** (не теряются при перезапуске)
✅ **Real-time обновления** (можно подписаться на изменения)
✅ **Автоматические бэкапы**
✅ **Web интерфейс** для просмотра данных
✅ **REST API** из коробки
✅ **PostgreSQL** полная совместимость

## Troubleshooting

### Ошибка: "relation does not exist"
**Решение:** Выполните `database/supabase-schema.sql` в SQL Editor

### Ошибка: "permission denied"
**Решение:** Проверьте Row Level Security политики

### Ошибка: "Invalid API key"
**Решение:** Проверьте `SUPABASE_URL` и `SUPABASE_ANON_KEY` в `.env`

## Просмотр данных

### Через Supabase Dashboard
1. Откройте **Table Editor**
2. Выберите таблицу (например, `search_sessions`)
3. Просмотрите данные

### Через API
```bash
# Все сессии
curl http://localhost:3030/api/sessions

# Конкретная сессия
curl http://localhost:3030/api/debug/session/YOUR_SESSION_ID
```

### Через SQL Editor
```sql
-- Все сессии
SELECT * FROM search_sessions ORDER BY created_at DESC;

-- Компании с контактами
SELECT company_name, website, emails, phones 
FROM pending_companies 
WHERE session_id = 'YOUR_SESSION_ID';
```

