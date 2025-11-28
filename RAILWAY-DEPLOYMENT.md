# Railway.app Deployment Guide

## 🚂 Проект уже связан с Railway

Project ID: `d51a9b81-1256-4083-bc94-2d895e79db57`

## 📝 Что уже сделано:

✅ Railway CLI установлен
✅ Создан `railway.json` (конфигурация деплоя)
✅ Создан `Procfile` (web + worker процессы)
✅ Обновлен `package.json`:
   - `engines`: Node.js >=18.0.0
   - `main`: src/app-simple.js
   - `start`: node src/app-simple.js

## 🔐 Следующие шаги (ВРУЧНУЮ):

### 1. Авторизуйтесь в Railway CLI:

```bash
railway login
```

Откроется браузер → авторизуйтесь через GitHub

### 2. Свяжите проект:

```bash
railway link -p d51a9b81-1256-4083-bc94-2d895e79db57
```

### 3. Настройте Environment Variables:

```bash
railway variables set SUPABASE_URL="https://ptbefsrvvcrjrfxxtogt.supabase.co"
railway variables set SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0YmVmc3J2dmNyanJmeHh0b2d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjIyMzIsImV4cCI6MjA3OTc5ODIzMn0.dGFxCU1q0uzc6HrZCUOJY3tp9_QHlFmUmqe2jtzVviA"
railway variables set PERPLEXITY_API_KEY="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"
railway variables set DEEPSEEK_API_KEY="sk-85323bc753cb4b25b02a2664e9367f8a"
railway variables set NODE_ENV="production"
railway variables set PORT="3030"
```

### 4. Deploy:

```bash
railway up
```

Или просто push в GitHub (автодеплой включен):

```bash
git push origin main
```

## 🌐 После деплоя:

Railway автоматически создаст домен:
```
https://smart-email-api-production.up.railway.app
```

Проверьте:
```bash
# Открыть в браузере
railway open

# Посмотреть логи
railway logs

# Проверить статус
railway status
```

## 🔧 Настройка через веб-интерфейс (альтернатива CLI):

1. Откройте: https://railway.app/project/d51a9b81-1256-4083-bc94-2d895e79db57
2. Settings → Variables → добавьте переменные выше
3. Settings → Deploy → проверьте:
   - ✅ Start Command: `node src/app-simple.js`
   - ✅ Healthcheck Path: `/health`
4. Deployments → Deploy → выберите ветку `main`

## 📊 Мониторинг:

- **Metrics:** CPU, Memory, Network
- **Logs:** Реальное время
- **Credits:** $5/месяц бесплатно

## 🔄 Автодеплой:

Railway автоматически деплоит при каждом `git push origin main`

## ⚙️ Worker (Translation Service):

Если хотите запустить фоновый worker:

1. Railway Dashboard → New Service
2. Выберите тот же репозиторий
3. Start Command: `node src/workers/translationWorker.js`
4. Добавьте те же environment variables

**Важно:** Worker = отдельный сервис = дополнительный расход кредитов.

## 📱 Полезные команды:

```bash
# Логи
railway logs --follow

# SSH в контейнер
railway shell

# Запустить команду
railway run node scripts/test.js

# Открыть в браузере
railway open

# Переменные
railway variables
```

## 🎯 Готово!

После выполнения шагов 1-4 ваше приложение будет доступно онлайн 24/7.

**Ссылка на ваш проект:**
https://railway.app/project/d51a9b81-1256-4083-bc94-2d895e79db57

