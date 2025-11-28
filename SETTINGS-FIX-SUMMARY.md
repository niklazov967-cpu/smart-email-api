# Исправления для работы с system_settings

## ✅ Что исправлено:

### 1. `src/services/SettingsManager.js`
- Изменен SQL запрос: `setting_key` → `key`, `setting_value` → `value`
- Убран `setting_type` (нет в вашей схеме)
- Метод `_parseSettings()` теперь использует `row.key` и `row.value`

### 2. `src/services/TranslationService.js`
- Исправлено получение DeepSeek API key из settings
- Теперь поддерживает структуру `settings.deepseek.api_key`
- Fallback на `process.env.DEEPSEEK_API_KEY`

### 3. `src/workers/translationWorker.js`
- Исправлено чтение настроек: `settings.translation.batch_size` вместо `settings.translation_batch_size`
- Правильное приведение типов: `parseInt()` для чисел
- Правильная проверка boolean: `=== 'true'`

## 📋 Структура настроек в БД:

```sql
-- Таблица system_settings имеет структуру:
category | key          | value
---------|--------------|-------
translation | batch_size  | 5
translation | interval_ms | 30000
translation | enabled     | true
translation | deepseek_model | deepseek-chat
```

## 🔄 Как настройки загружаются:

```javascript
// SettingsManager.getAllSettings() возвращает:
{
  translation: {
    batch_size: "5",
    interval_ms: "30000",
    enabled: "true",
    deepseek_model: "deepseek-chat"
  },
  api: {
    api_key: "...",
    model_name: "sonar-pro",
    // и т.д.
  }
}
```

## ✅ Как проверить что всё работает:

### 1. Проверить настройки в БД:
```sql
SELECT * FROM system_settings WHERE category = 'translation';
```

### 2. Перезапустить сервер:
```bash
# Ctrl+C для остановки
npm start
```

### 3. Проверить API:
```bash
curl http://localhost:3030/api/translations/stats
```

Должно вернуть:
```json
{
  "success": true,
  "stats": {
    "totalCompanies": 30,
    "translatedCompanies": 0,
    "totalTranslations": 0,
    "pending": 0,
    "completed": 0,
    "failed": 0
  }
}
```

### 4. Запустить worker:
```bash
npm run translate:start
```

Worker должен запуститься с правильными настройками:
```
🚀 Translation Worker starting...
✅ Database connected
📝 Settings loaded { batchSize: 5, intervalMs: 30000, enabled: true }
✅ Translation Service initialized
✅ Translation Worker ready
▶️ Translation Worker started
```

## 🎯 Что дальше:

После успешного запуска:
1. Откройте `http://localhost:3030/results.html`
2. Увидите карточку "Переведено 0%"
3. Worker начнет обрабатывать компании каждые 30 секунд
4. Прогресс будет обновляться каждые 10 секунд на странице

---

**Все исправления применены!** 🎉

