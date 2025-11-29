# 🚀 Quick Deployment Guide - v2.1.1 (Rate Limit Fix)

## 📋 Pre-Deployment Checklist

- [x] Код написан и протестирован локально
- [x] Добавлен mutex в SonarApiClient
- [x] Обновлены настройки rate limiting
- [x] Создана документация
- [ ] Запушено в git
- [ ] Задеплоено на Railway
- [ ] Протестировано на production

---

## 🔧 Шаги для Deployment

### 1. Коммит и Push

```bash
# Проверить статус
git status

# Добавить все изменения
git add src/services/SonarApiClient.js
git add src/services/SettingsManager.js
git add CHANGELOG-v2.1.md
git add RATE-LIMIT-FIX.md
git add test-rate-limit-fix.py
git add DEPLOYMENT-v2.1.1.md

# Коммит
git commit -m "fix(critical): Add mutex to prevent parallel API requests and 429 errors

- Add global request lock (mutex) in SonarApiClient
- Prevent parallel API requests that cause rate limiting
- Increase retry delay: 2s → 5s
- Decrease rate limit: 60/min → 20/min
- Add detailed logging for lock/unlock operations
- Expected: 95%+ success rate, -50% execution time

Fixes: Rate Limit 429 errors
Version: 2.1.1"

# Push в ветку release/v2.1
git push origin release/v2.1
```

### 2. Railway Auto-Deploy

Railway автоматически:
1. Обнаружит push
2. Запустит build
3. Задеплоит новую версию
4. Перезапустит сервис

**Ожидаемое время:** ~2-3 минуты

### 3. Проверка логов Railway

```bash
# Откройте Railway dashboard
# Или используйте CLI:
railway logs --follow
```

**Что искать:**

✅ **Хорошие признаки:**
```
🔓 Lock acquired, proceeding with request
⏸️  Waiting for previous request to complete...
🔓 Lock released (success)
✅ SUCCESS! Got response
```

❌ **Плохие признаки (не должно быть):**
```
❌ ERROR: Request failed with status code 429
warn: Sonar API rate limited
```

### 4. Тестирование на Production

#### A. Быстрый тест через curl:

```bash
# Проверить статус API
curl https://your-app.railway.app/api/health

# Проверить статистику API
curl https://your-app.railway.app/api/debug/api-stats
```

#### B. Полный тест через Python скрипт:

```bash
# Обновить BASE_URL в скрипте
python3 test-rate-limit-fix.py
```

**Ожидаемый результат:**
- ✅ Success rate: 95%+
- ✅ No rate limit errors
- ✅ Sequential execution

#### C. Тест через UI:

1. Откройте `https://your-app.railway.app/auto-search.html`
2. Запустите поиск с 5+ запросами
3. Откройте DevTools → Network
4. Проверьте что нет 429 errors
5. Откройте Railway logs одновременно
6. Убедитесь что запросы идут последовательно

---

## 📊 Мониторинг после Deployment

### Первые 10 минут:

1. **Логи Railway:** Мониторить в реальном времени
2. **API Stats:** Проверять каждые 2-3 минуты
3. **UI тесты:** Запустить несколько поисков

### Первые 24 часа:

1. **Rate limit errors:** Должно быть 0 (или очень мало)
2. **Success rate:** Должен быть 95%+
3. **Response time:** Должен уменьшиться на 30-50%

### Метрики для отслеживания:

```sql
-- В Supabase SQL Editor:

-- 1. Статистика rate limit за последние 24 часа
SELECT 
  status,
  COUNT(*) as count,
  AVG(response_time_ms) as avg_response_time
FROM sonar_api_calls
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY status;

-- 2. Rate limit ошибки по часам
SELECT 
  DATE_TRUNC('hour', timestamp) as hour,
  COUNT(*) as rate_limit_errors
FROM sonar_api_calls
WHERE status = 'rate_limited'
  AND timestamp > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- 3. Success rate trend
SELECT 
  DATE_TRUNC('hour', timestamp) as hour,
  COUNT(*) as total_requests,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
  ROUND(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 2) as success_rate_percent
FROM sonar_api_calls
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

---

## 🔄 Rollback Plan

Если что-то пойдет не так:

### Вариант 1: Git Revert

```bash
# Откатить последний коммит
git revert HEAD
git push origin release/v2.1

# Railway автоматически задеплоит предыдущую версию
```

### Вариант 2: Railway Rollback

1. Откройте Railway Dashboard
2. Deployments → История
3. Найдите предыдущий успешный deployment
4. Нажмите "Redeploy"

### Вариант 3: Быстрый патч

Если нужно временно отключить mutex:

```javascript
// В src/services/SonarApiClient.js
// Закомментировать блокировку:

// while (this.requestInProgress) {
//   await this._sleep(100);
// }
// this.requestInProgress = true;
```

---

## ✅ Success Criteria

Deployment считается успешным если:

1. ✅ **Build прошел успешно** на Railway
2. ✅ **Сервис запустился** без ошибок
3. ✅ **Логи показывают mutex работает** (`Lock acquired/released`)
4. ✅ **Нет 429 errors** в первые 10 минут
5. ✅ **Success rate 95%+** в API stats
6. ✅ **UI тесты проходят** без ошибок
7. ✅ **Response time уменьшился** (или не увеличился)

---

## 📞 Troubleshooting

### Проблема: Build failed

**Решение:**
```bash
# Проверить синтаксис
npm run lint

# Или просто запустить локально
npm start
```

### Проблема: Сервис не запускается

**Решение:**
1. Проверить Railway logs на startup errors
2. Убедиться что все env variables установлены
3. Проверить что Procfile корректный

### Проблема: Все еще есть 429 errors

**Возможные причины:**
1. Настройки не применились (перезапустить сервис)
2. Слишком много параллельных сессий (уменьшить `rate_limit`)
3. Perplexity API имеет строгие лимиты (связаться с поддержкой)

**Действия:**
1. Увеличить `retry_delay_seconds` до 10
2. Уменьшить `rate_limit_requests_per_min` до 10
3. Добавить логирование времени между запросами

---

## 📈 Expected Impact

### Положительное влияние:

- ✅ **95%+ success rate** (было ~50%)
- ✅ **-50% execution time** (меньше retry)
- ✅ **-60% token waste** (нет повторных запросов)
- ✅ **Стабильная работа** без rate limit спайков

### Потенциальное негативное влияние:

- ⚠️ **Запросы идут медленнее** (последовательно вместо параллельно)
  - **НО:** Общее время все равно меньше из-за отсутствия retry
- ⚠️ **Увеличенная задержка** (5s вместо 2s)
  - **НО:** Меньше ошибок = меньше повторов

**Итого:** Положительный эффект значительно перевешивает негативный! 🎉

---

## 📝 Post-Deployment Tasks

- [ ] Обновить документацию API (если нужно)
- [ ] Уведомить пользователей (если нужно)
- [ ] Создать tag в git: `git tag v2.1.1`
- [ ] Push tag: `git push origin v2.1.1`
- [ ] Обновить README с новой версией
- [ ] Закрыть issue/ticket (если есть)
- [ ] Записать lessons learned

---

**Ready to deploy? Let's go! 🚀**

