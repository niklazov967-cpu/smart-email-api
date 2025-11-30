# Railway CLI Setup

## 🎯 Проблема

Railway CLI требует интерактивный терминал (TTY) для команды `railway link`, что невозможно в автоматизированных средах.

## ✅ Решение

Создать файл конфигурации `.railway/config.json` вручную.

## 📋 Шаги настройки

### 1. Проверить авторизацию

```bash
railway whoami
```

Должно вывести: `Logged in as niklazov967@gmail.com 👋`

### 2. Получить Project ID

```bash
railway variables | grep RAILWAY_PROJECT_ID
```

Вывод:
```
║ RAILWAY_PROJECT_ID    │ d51a9b81-1256-4083-bc94-2d895e79db57   ║
```

### 3. Создать конфигурационный файл

```bash
mkdir -p .railway
echo '{"projectId": "d51a9b81-1256-4083-bc94-2d895e79db57", "environment": "production"}' > .railway/config.json
```

### 4. Проверить работу

```bash
railway logs --tail 50
```

Должны вывестись логи проекта! ✅

## 🔧 Полезные команды

### Просмотр логов (последние 50 строк)
```bash
railway logs --tail 50
```

### Просмотр логов в реальном времени
```bash
railway logs --follow
```

### Фильтрация логов по ключевым словам
```bash
railway logs --tail 100 | grep -i "error"
railway logs --tail 100 | grep -i "\[INIT\]"
```

### Проверка статуса деплоя
```bash
railway status
```

### Просмотр переменных окружения
```bash
railway variables
```

### Информация о проекте
```bash
railway service
```

## 📝 Примечания

- Файл `.railway/config.json` добавлен в `.gitignore`
- Project ID: `d51a9b81-1256-4083-bc94-2d895e79db57`
- Project Name: `appealing-nourishment`
- Environment: `production`

## 🚨 Важно

**НЕ** коммитить `.railway/` директорию в Git! Она содержит локальную конфигурацию и добавлена в `.gitignore`.

## 🔍 Отладка

Если `railway logs` не работает:

1. Проверьте авторизацию: `railway whoami`
2. Проверьте существование файла: `cat .railway/config.json`
3. Проверьте Project ID: `railway variables | grep PROJECT_ID`
4. Попробуйте пересоздать config:
   ```bash
   rm -rf .railway
   mkdir -p .railway
   echo '{"projectId": "d51a9b81-1256-4083-bc94-2d895e79db57", "environment": "production"}' > .railway/config.json
   ```

---

**Version:** 2.4.5
**Date:** 2025-11-30
**Status:** ✅ Working

