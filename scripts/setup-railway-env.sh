#!/bin/bash

# Railway Environment Variables Setup Script
# Автоматическая настройка переменных окружения для Railway

echo "🚂 Setting up Railway environment variables..."
echo ""

# Проверка авторизации
if ! railway whoami &> /dev/null; then
    echo "❌ Вы не авторизованы в Railway CLI"
    echo "Выполните: railway login"
    exit 1
fi

# Проверка связи с проектом
if [ ! -f "railway.json" ]; then
    echo "❌ railway.json не найден"
    echo "Выполните: railway link -p d51a9b81-1256-4083-bc94-2d895e79db57"
    exit 1
fi

echo "✅ Railway CLI настроен"
echo ""
echo "📝 Настройка переменных окружения..."
echo ""

# Supabase
railway variables set SUPABASE_URL="https://ptbefsrvvcrjrfxxtogt.supabase.co"
echo "✅ SUPABASE_URL установлен"

railway variables set SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0YmVmc3J2dmNyanJmeHh0b2d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjIyMzIsImV4cCI6MjA3OTc5ODIzMn0.dGFxCU1q0uzc6HrZCUOJY3tp9_QHlFmUmqe2jtzVviA"
echo "✅ SUPABASE_ANON_KEY установлен"

# Perplexity
railway variables set PERPLEXITY_API_KEY="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"
echo "✅ PERPLEXITY_API_KEY установлен"

# DeepSeek
railway variables set DEEPSEEK_API_KEY="sk-85323bc753cb4b25b02a2664e9367f8a"
echo "✅ DEEPSEEK_API_KEY установлен"

# Node Environment
railway variables set NODE_ENV="production"
echo "✅ NODE_ENV установлен"

# Port (опционально, Railway сам установит)
railway variables set PORT="3030"
echo "✅ PORT установлен"

echo ""
echo "🎉 Все переменные успешно настроены!"
echo ""
echo "📊 Проверка переменных:"
railway variables
echo ""
echo "🚀 Готово к деплою!"
echo "Выполните: railway up"
echo "Или: git push origin main (автодеплой)"

