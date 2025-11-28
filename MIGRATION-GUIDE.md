# Руководство по миграции на новую систему переводов

## Обзор изменений

Заменили сложную таблицу `translations` на простую таблицу-зеркало `pending_companies_ru`, которая содержит только переведенные текстовые поля.

### Преимущества новой системы:
- ✅ Простота: Один LEFT JOIN вместо множества подзапросов
- ✅ Скорость: Меньше таблиц = быстрее SELECT
- ✅ Понятность: Структура зеркальна основной таблице
- ✅ Меньше кода: Упрощение TranslationService
- ✅ UI проще: Автоматическое отображение русского текста

## Порядок выполнения миграции

### Шаг 1: Создать новую таблицу

Выполните в Supabase SQL Editor:

```sql
-- Файл: database/create-companies-ru-table.sql
```

Результат: Таблица `pending_companies_ru` создана с 25 полями (5 основных + 20 тегов + метаданные).

### Шаг 2: Мигрировать существующие данные

Выполните в Supabase SQL Editor:

```sql
-- Файл: database/migrate-translations-to-ru-table.sql
```

Скрипт автоматически:
- Создаст записи для всех компаний с переводами
- Перенесет все переведенные поля из `translations` в `pending_companies_ru`
- Определит статус перевода (completed/partial/pending)
- Покажет статистику миграции

**Ожидаемый результат:**
```
Migration completed!
total_records: XXX
completed: XXX
partial: XXX
pending: XXX
```

### Шаг 3: Перезапустить сервер

```bash
# Остановить сервер (Ctrl+C)
# Запустить заново
npm start
```

Сервер автоматически подхватит новый код:
- `TranslationService.js` - работает с `pending_companies_ru`
- `debug.js` - API endpoints обновлены
- `results.html` - frontend показывает русский текст

### Шаг 4: Перезапустить worker перевода

```bash
# Остановить старый worker
npm run translate:stop

# Запустить новый
npm run translate:start
```

Worker теперь:
- Ищет компании без записей в `pending_companies_ru`
- Переводит поля и сохраняет в `pending_companies_ru`
- Обновляет статус (pending/partial/completed/failed)

### Шаг 5: Проверить работу системы

#### 5.1 Проверить API статистики

```bash
curl http://localhost:3000/api/debug/translations/stats
```

Ожидаемый ответ:
```json
{
  "success": true,
  "stats": {
    "total": 150,
    "completed": 100,
    "partial": 30,
    "pending": 10,
    "failed": 0,
    "untranslated": 10
  }
}
```

#### 5.2 Проверить загрузку компаний с переводами

```bash
curl http://localhost:3000/api/debug/companies?include_translations=true&limit=5
```

Ожидаемый ответ должен содержать:
```json
{
  "companies": [
    {
      "company_id": "...",
      "company_name": "深圳...",
      "pending_companies_ru": {
        "company_name_ru": "Шэньчжэнь...",
        "translation_status": "completed",
        ...
      }
    }
  ]
}
```

#### 5.3 Проверить frontend

1. Откройте `http://localhost:3000/results.html`
2. Выберите сессию
3. Проверьте:
   - ✅ Названия компаний показаны на русском (если есть перевод)
   - ✅ Теги показаны на русском
   - ✅ Badge статуса перевода (✓ RU, ⏳, ⚠️)
   - ✅ В модальном окне русский текст показан первым, китайский серым ниже

#### 5.4 Проверить worker перевода

Следите за логами worker:

```bash
# В другом терминале
tail -f logs/translation-worker.log
```

Должны видеть:
```
TranslationService: Found untranslated companies { total: 150, untranslated: 50 }
TranslationService: Starting translation { companyId: '...' }
TranslationService: Field translated { field: 'company_name', ... }
TranslationService: Translation completed { translatedCount: 5, failedCount: 0 }
```

### Шаг 6: Тестирование на 5 компаниях

Для быстрой проверки:

1. Выберите 5 компаний без переводов:

```sql
SELECT company_id, company_name 
FROM pending_companies 
WHERE company_id NOT IN (SELECT company_id FROM pending_companies_ru)
LIMIT 5;
```

2. Запустите worker и дождитесь перевода (примерно 1-2 минуты на компанию)

3. Проверьте результат:

```sql
SELECT 
  pc.company_name,
  ru.company_name_ru,
  ru.translation_status
FROM pending_companies pc
LEFT JOIN pending_companies_ru ru ON pc.company_id = ru.company_id
WHERE ru.translation_status IS NOT NULL
ORDER BY ru.translated_at DESC
LIMIT 5;
```

4. Откройте `results.html` и убедитесь что русские названия отображаются

### Шаг 7: Удалить старую таблицу (опционально)

**⚠️ ВНИМАНИЕ:** Выполняйте только после полного тестирования!

```sql
-- Файл: database/drop-translations-table.sql

-- Опционально: создать backup
CREATE TABLE translations_backup AS SELECT * FROM translations;

-- Удалить старую таблицу
DROP TABLE IF EXISTS translations CASCADE;
```

## Откат (если что-то пошло не так)

Если нужно вернуться к старой системе:

1. Остановить сервер и worker
2. Восстановить старые файлы из git:
   ```bash
   git checkout HEAD~1 src/services/TranslationService.js
   git checkout HEAD~1 src/api/debug.js
   git checkout HEAD~1 public/results.html
   ```
3. Перезапустить сервер и worker

Таблица `pending_companies_ru` не мешает старой системе, её можно оставить.

## Мониторинг после миграции

### Проверка производительности

Сравните время загрузки страницы:

```bash
# До миграции (с translations)
time curl -s http://localhost:3000/api/debug/companies?limit=100 > /dev/null

# После миграции (с pending_companies_ru)
time curl -s http://localhost:3000/api/debug/companies?include_translations=true&limit=100 > /dev/null
```

Ожидаемое улучшение: **2-3x быстрее**

### Проверка использования DeepSeek API

Следите за статистикой в `results.html`:
- Количество запросов к DeepSeek
- Примерная стоимость
- Прогресс перевода

## FAQ

**Q: Нужно ли переводить компании заново?**  
A: Нет, скрипт миграции автоматически перенесет все существующие переводы.

**Q: Что если миграция прошла не полностью?**  
A: Можно запустить скрипт миграции повторно, он использует `ON CONFLICT DO NOTHING`.

**Q: Можно ли удалить translations сразу?**  
A: Рекомендуется протестировать систему 1-2 дня, затем удалить.

**Q: Как проверить что всё работает правильно?**  
A: Сравните количество переведенных компаний до и после миграции.

## Контакты

При возникновении проблем проверьте логи:
- Сервер: `logs/app.log`
- Worker: `logs/translation-worker.log`

