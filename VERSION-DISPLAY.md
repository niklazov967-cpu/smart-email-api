# 🎯 Automatic Version Display - v2.1.4

**Дата:** 30 ноября 2024  
**Статус:** ✅ Deployed

---

## 📋 Что реализовано

### Автоматическое отображение версии коммита на главной странице

**На главной странице теперь показывается:**

1. **Версия приложения:**
   ```
   v2.1.4 | DeepSeek + Perplexity Integration
   ```

2. **Информация о коммите** (новая строка):
   ```
   📦 Commit: 1f5c7cb | 🌿 main | 📅 30 нояб. 2024, 07:11
   ```
   
   При наведении на эту строку показывается **полное сообщение коммита**.

---

## 🔧 Техническая реализация

### 1. Скрипт генерации версии

**Файл:** `scripts/generate-version.js`

**Функциональность:**
- Извлекает информацию из git
- Создает `public/version.json` с полной информацией
- Создает `public/version.js` для runtime доступа

**Извлекаемые данные:**
```json
{
  "commit": "1f5c7cb...",           // Полный hash
  "commitShort": "1f5c7cb",         // Короткий hash
  "branch": "main",                 // Текущая ветка
  "tag": "v2.1.4",                  // Git tag
  "commitDate": "2025-11-30 ...",   // Дата коммита
  "commitMessage": "feat: Add...",  // Сообщение коммита
  "author": "Azimut Gonbolo",       // Автор
  "buildDate": "2025-11-30..."      // Дата сборки
}
```

### 2. NPM Scripts

**package.json:**
```json
{
  "scripts": {
    "prestart": "node scripts/generate-version.js",
    "start": "node src/app-simple.js",
    "version:generate": "node scripts/generate-version.js"
  }
}
```

**prestart hook** автоматически запускается **перед** `npm start`:
```
npm start
  ↓
  prestart (generate version)
  ↓
  start (run app)
```

### 3. Frontend отображение

**public/index.html:**

#### HTML разметка:
```html
<p class="version" id="appVersion">Загрузка версии...</p>
<p class="commit-info" id="commitInfo"></p>
```

#### JavaScript логика:
```javascript
async function loadVersion() {
  // 1. Пытаемся загрузить version.json
  const versionResponse = await fetch('/version.json');
  if (versionResponse.ok) {
    const versionData = await versionResponse.json();
    
    // Отображаем основную версию
    document.getElementById('appVersion').textContent = 
      `v${versionData.tag} | DeepSeek + Perplexity Integration`;
    
    // Отображаем commit info
    document.getElementById('commitInfo').innerHTML = 
      `📦 Commit: ${versionData.commitShort} | 
       🌿 ${versionData.branch} | 
       📅 ${formatDate(versionData.commitDate)}`;
    
    return;
  }
  
  // 2. Fallback к старому API /api/version
  // 3. Fallback к статической версии
}
```

#### CSS стилизация:
```css
.commit-info {
  font-size: 12px;
  color: #888;
  font-family: 'Courier New', monospace;
}

.commit-info code {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
  color: #667eea;
  font-weight: 600;
}

.commit-info span {
  cursor: help;  /* Показывает что есть tooltip */
}
```

---

## 🚀 Workflow

### Local Development:

```bash
# 1. Сделали изменения
git add .
git commit -m "feat: New feature"

# 2. Запустили локально
npm start
  # prestart hook → генерирует version.json
  # start → запускает приложение

# 3. Открыли http://localhost:3030
# Видим: v2.1.4-3-g1f5c7cb | Commit: 1f5c7cb | main | ...
```

### Production (Railway):

```bash
# 1. Push в main
git push origin main

# 2. Railway обнаруживает изменения
# 3. Railway запускает npm install
# 4. Railway запускает npm start
#    ↓
#    prestart hook запускается
#    ↓
#    version.json создается с актуальным коммитом
#    ↓
#    Приложение запускается
# 5. Пользователи видят актуальную версию
```

---

## 📊 Форматы отображения

### Основная версия:
```
v2.1.4 | DeepSeek + Perplexity Integration
```

### Commit info (обычный вид):
```
📦 Commit: 1f5c7cb | 🌿 main | 📅 30 нояб. 2024, 07:11
```

### Commit info (при наведении):
```
[Tooltip показывает:]
feat: Add automatic git commit version display on homepage (v2.1.4)
```

### Примеры разных состояний:

**Production (main):**
```
v2.1.4 | DeepSeek + Perplexity Integration
📦 Commit: 1f5c7cb | 🌿 main | 📅 30 нояб. 2024, 07:11
```

**Development (feature branch):**
```
v2.1.4-5-ga3b4c5d | DeepSeek + Perplexity Integration
📦 Commit: a3b4c5d | 🌿 feature/new-ui | 📅 30 нояб. 2024, 15:30
```

**No git info available:**
```
Версия 2.1.4
(commit info скрыт)
```

---

## 🎯 Преимущества

### 1. Автоматическое обновление
- ✅ Не нужно вручную менять версию
- ✅ Всегда актуально
- ✅ Нет риска забыть обновить

### 2. Отладка
- ✅ Мгновенно видно какой коммит задеплоен
- ✅ Легко сравнить local vs production
- ✅ Видно дату deployment

### 3. Прозрачность
- ✅ Пользователи видят что версия обновляется
- ✅ Support знают точную версию при отладке
- ✅ Профессиональный вид

### 4. Git-based
- ✅ Единственный источник правды - git
- ✅ Нет рассинхронизации
- ✅ Работает с любым git workflow

---

## 🔍 Troubleshooting

### Проблема: version.json не создается

**Причины:**
1. Git не установлен на сервере
2. Prestart hook не запускается
3. Нет прав на запись в public/

**Решение:**
```bash
# Проверить что git доступен
git --version

# Вручную создать version.json
npm run version:generate

# Проверить права
ls -la public/version.json
```

### Проблема: Показывает "unknown"

**Причина:** Git info недоступен

**Решение:**
- Fallback к package.json version работает автоматически
- Пользователь видит статическую версию
- Не критично для работы приложения

### Проблема: Дата в неправильном формате

**Причина:** Локализация браузера

**Решение:**
```javascript
// В loadVersion() можно настроить формат
const commitDate = new Date(versionData.commitDate).toLocaleString('ru-RU', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});
```

---

## 📁 Файлы

### Новые файлы:
- `scripts/generate-version.js` - скрипт генерации
- `public/version.json` - сгенерированный файл (gitignored)
- `public/version.js` - runtime версия (gitignored)

### Измененные файлы:
- `package.json` - добавлен prestart hook
- `public/index.html` - обновлен UI и логика загрузки
- `.gitignore` - добавлены version.json и version.js

---

## 🔄 Git Ignore

**В .gitignore добавлено:**
```gitignore
# Auto-generated version files
public/version.json
public/version.js
```

**Почему?**
- Файлы генерируются при каждом build
- Не нужно коммитить (будут конфликты)
- Railway создаст их автоматически при deploy

---

## ✅ Checklist

- [x] Скрипт generate-version.js создан
- [x] Prestart hook добавлен в package.json
- [x] Frontend обновлен для отображения
- [x] CSS стили добавлены
- [x] Fallback логика реализована
- [x] .gitignore обновлен
- [x] Документация создана
- [x] Коммит и push выполнены
- [x] Tag v2.1.4 создан
- [ ] Проверено на production (после deployment)

---

## 🎉 Итог

Теперь на главной странице **автоматически** отображается:

1. **Версия** из git tag
2. **Commit hash** для точной идентификации
3. **Ветка** (main/dev/feature/...)
4. **Дата** коммита
5. **Сообщение** коммита (в tooltip)

Всё это **обновляется автоматически** при каждом deployment!

---

**Версия:** 2.1.4  
**Автор:** AI Assistant  
**Дата:** 30 ноября 2024

