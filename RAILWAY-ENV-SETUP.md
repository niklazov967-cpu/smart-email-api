# 🚨 Быстрая настройка переменных окружения

## Проблема:
```
⚠️  Failed to load API routes: SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env
```

## ✅ Решение (2 минуты):

### Вариант 1: Через веб-интерфейс Railway (РЕКОМЕНДУЕТСЯ)

1. **Откройте проект:**
   https://railway.app/project/d51a9b81-1256-4083-bc94-2d895e79db57

2. **Выберите сервис** (кликните на него)

3. **Variables → Raw Editor** → вставьте:

```bash
SUPABASE_URL=https://ptbefsrvvcrjrfxxtogt.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0YmVmc3J2dmNyanJmeHh0b2d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjIyMzIsImV4cCI6MjA3OTc5ODIzMn0.dGFxCU1q0uzc6HrZCUOJY3tp9_QHlFmUmqe2jtzVviA
PERPLEXITY_API_KEY=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
DEEPSEEK_API_KEY=sk-85323bc753cb4b25b02a2664e9367f8a
NODE_ENV=production
PORT=3030
```

4. **Нажмите "Save"** (или Deploy)

5. **Railway автоматически перезапустит** сервис с новыми переменными

---

### Вариант 2: Через терминал (если хотите)

```bash
# В терминале выполните
cd "/Users/azimutgonbolo/Library/Mobile Documents/com~apple~CloudDocs/LTM/Сайты/Поставщики/CN Металлообработка/smart-email-api"

# Выберите сервис интерактивно
railway service

# Затем установите переменные (по одной)
railway variables --set SUPABASE_URL="https://ptbefsrvvcrjrfxxtogt.supabase.co"
railway variables --set SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0YmVmc3J2dmNyanJmeHh0b2d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjIyMzIsImV4cCI6MjA3OTc5ODIzMn0.dGFxCU1q0uzc6HrZCUOJY3tp9_QHlFmUmqe2jtzVviA"
railway variables --set PERPLEXITY_API_KEY="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"
railway variables --set DEEPSEEK_API_KEY="sk-85323bc753cb4b25b02a2664e9367f8a"
railway variables --set NODE_ENV="production"
railway variables --set PORT="3030"
```

---

## 📊 После настройки:

Проверьте что переменные установлены:

```bash
railway variables
```

Railway автоматически перезапустит приложение. Через 1-2 минуты проверьте:

```bash
railway open
```

Или откройте URL напрямую (найдите в Railway Dashboard → Settings → Domains)

---

## 🎯 Ожидаемый результат:

После настройки переменных приложение запустится без ошибок и будет доступно по адресу:
```
https://your-app-name.up.railway.app
```

✅ API будет работать
✅ Главная страница откроется
✅ Results.html будет доступна

---

**Рекомендую Вариант 1 (веб-интерфейс) - быстро и наглядно!** 🚀

