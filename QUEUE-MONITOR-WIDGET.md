# 📊 API Queue Monitor Widget - v2.1.2

**Дата:** 29 ноября 2024  
**Компонент:** Виджет мониторинга очереди AI запросов в реальном времени

---

## 🎯 Описание

Виджет показывает в реальном времени количество AI запросов в очереди (Sonar Pro + Sonar Basic). Обновляется каждую секунду.

### Визуальные состояния:

- 🟢 **Idle** (зеленый) - Очередь пуста, нет активных запросов
- 🟡 **Busy** (оранжевый) - В очереди 1-5 запросов или идет обработка
- 🔴 **Overloaded** (красный) - В очереди больше 5 запросов

---

## 📁 Файлы

1. **`queue-monitor.js`** - JavaScript логика мониторинга
2. **`queue-monitor.css`** - CSS стили для виджета
3. **API endpoint:** `/api/debug/queue-status` - возвращает текущий статус очереди

---

## 🚀 Установка

### Вариант 1: Автоматическое подключение

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/queue-monitor.css">
</head>
<body>
  <!-- Ваш контент -->
  
  <!-- Виджет в правом верхнем углу -->
  <div class="queue-badge loading queue-badge-fixed-top-right" id="queueBadge">
    <span class="queue-pulse"></span>
    <span>AI Queue:</span>
    <span class="queue-count" id="queueCount">—</span>
  </div>
  
  <!-- Скрипт запустится автоматически -->
  <script src="/queue-monitor.js"></script>
</body>
</html>
```

### Вариант 2: Ручное управление

```html
<script src="/queue-monitor.js"></script>
<script>
  // Запустить мониторинг
  window.QueueMonitor.start(1000); // Обновление каждую секунду
  
  // Остановить мониторинг
  window.QueueMonitor.stop();
  
  // Получить текущий статус (без обновления DOM)
  const status = await window.QueueMonitor.getStatus();
  console.log(status);
</script>
```

---

## 🎨 Варианты размещения

### 1. Фиксированный в правом верхнем углу

```html
<div class="queue-badge loading queue-badge-fixed-top-right" id="queueBadge">
  <span class="queue-pulse"></span>
  <span>AI Queue:</span>
  <span class="queue-count" id="queueCount">—</span>
</div>
```

### 2. Абсолютно позиционированный (внутри контейнера)

```html
<div class="header" style="position: relative;">
  <h1>Заголовок</h1>
  
  <div class="queue-badge loading queue-badge-absolute-top-right" id="queueBadge">
    <span class="queue-pulse"></span>
    <span>AI Queue:</span>
    <span class="queue-count" id="queueCount">—</span>
  </div>
</div>
```

### 3. Inline (в строке с текстом)

```html
<h1>
  Заголовок
  <div class="queue-badge loading queue-badge-inline" id="queueBadge">
    <span class="queue-pulse"></span>
    <span>AI Queue:</span>
    <span class="queue-count" id="queueCount">—</span>
  </div>
</h1>
```

---

## 🔌 API Endpoint

### GET `/api/debug/queue-status`

**Response:**

```json
{
  "success": true,
  "timestamp": 1701234567890,
  "queues": {
    "sonar_pro": {
      "queueLength": 3,
      "inProgress": true,
      "timestamp": 1701234567890
    },
    "sonar_basic": {
      "queueLength": 1,
      "inProgress": false,
      "timestamp": 1701234567890
    }
  }
}
```

**Параметры:**
- `queueLength` - количество запросов в очереди
- `inProgress` - флаг выполнения запроса сейчас
- `timestamp` - время последнего обновления

---

## 🎛️ JavaScript API

### `window.QueueMonitor.start(updateInterval)`

Запустить мониторинг очереди.

```javascript
// Обновление каждую секунду (по умолчанию)
window.QueueMonitor.start();

// Обновление каждые 2 секунды
window.QueueMonitor.start(2000);
```

### `window.QueueMonitor.stop()`

Остановить мониторинг.

```javascript
window.QueueMonitor.stop();
```

### `window.QueueMonitor.update()`

Обновить статус немедленно (не дожидаясь следующего интервала).

```javascript
await window.QueueMonitor.update();
```

### `window.QueueMonitor.getStatus()`

Получить текущий статус очереди без обновления DOM.

```javascript
const status = await window.QueueMonitor.getStatus();
console.log(status);
// {
//   success: true,
//   sonarPro: { queueLength: 2, inProgress: true, ... },
//   sonarBasic: { queueLength: 0, inProgress: false, ... },
//   timestamp: 1701234567890
// }
```

---

## 📡 Events

Виджет генерирует custom event при каждом обновлении:

### `queueStatusUpdated`

```javascript
window.addEventListener('queueStatusUpdated', (event) => {
  const {
    totalQueue,
    inProgress,
    sonarPro,
    sonarBasic,
    timestamp
  } = event.detail;
  
  console.log(`Total queue: ${totalQueue}`);
  console.log(`In progress: ${inProgress}`);
});
```

**Event Detail:**
```javascript
{
  totalQueue: 4,           // Общая длина очереди
  inProgress: true,        // Есть ли активный запрос
  sonarPro: { ... },       // Статус Sonar Pro
  sonarBasic: { ... },     // Статус Sonar Basic
  timestamp: 1701234567890 // Время события
}
```

---

## 🎨 Кастомизация стилей

### Изменить цвета состояний

```css
/* Idle (зеленый) */
.queue-badge.idle {
  background: linear-gradient(135deg, #your-color-1, #your-color-2);
}

/* Busy (оранжевый) */
.queue-badge.busy {
  background: linear-gradient(135deg, #your-color-1, #your-color-2);
}

/* Overloaded (красный) */
.queue-badge.overloaded {
  background: linear-gradient(135deg, #your-color-1, #your-color-2);
}
```

### Изменить размер

```css
.queue-badge {
  padding: 12px 20px; /* Увеличить */
  font-size: 16px;
}

.queue-count {
  font-size: 22px;
}
```

### Отключить анимации

```css
.queue-badge {
  animation: none !important;
}

.queue-pulse {
  animation: none !important;
}
```

---

## 🧪 Тестирование

### 1. Проверить что endpoint работает

```bash
curl http://localhost:3000/api/debug/queue-status
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "timestamp": 1701234567890,
  "queues": {
    "sonar_pro": { "queueLength": 0, "inProgress": false, "timestamp": 1701234567890 },
    "sonar_basic": { "queueLength": 0, "inProgress": false, "timestamp": 1701234567890 }
  }
}
```

### 2. Проверить что виджет запустился

Откройте DevTools Console, должно быть:
```
Queue Monitor Widget loaded successfully
Queue badge found, starting monitoring...
```

### 3. Симулировать нагрузку

Запустите несколько поисков одновременно и наблюдайте как меняется счетчик.

---

## 🔧 Troubleshooting

### Виджет не появляется

1. Проверьте что есть элемент с `id="queueBadge"`
2. Проверьте что подключены CSS и JS файлы
3. Откройте DevTools Console на ошибки

### Счетчик показывает "?"

1. Проверьте что API endpoint `/api/debug/queue-status` доступен
2. Проверьте Network tab в DevTools
3. Убедитесь что `sonarProClient` и `sonarBasicClient` инициализированы в `req`

### Счетчик не обновляется

1. Проверьте что JavaScript не падает (DevTools Console)
2. Убедитесь что мониторинг запущен: `window.queueMonitorActive === true`
3. Проверьте что не заблокирован интервал

---

## 📊 Производительность

### Нагрузка на сервер:

- **1 запрос/секунду** к `/api/debug/queue-status`
- **Легкий endpoint:** только чтение переменных из памяти
- **Нет обращений к БД**
- **Response time:** < 5ms

### Нагрузка на клиент:

- **Минимальная:** обновление 2 текстовых элементов
- **JavaScript:** < 1ms на обновление
- **CSS animations:** Hardware-accelerated

---

## 🔄 Обновление виджета

Для обновления виджета на всех страницах:

1. Обновите `queue-monitor.js` и/или `queue-monitor.css`
2. Браузер автоматически загрузит новые версии при следующей загрузке страницы
3. Для мгновенного обновления: Hard refresh (Ctrl+Shift+R)

---

## 📋 Интеграция в существующие страницы

### Checklist:

- [ ] Добавить `<link rel="stylesheet" href="/queue-monitor.css">` в `<head>`
- [ ] Добавить HTML бейдж куда нужно
- [ ] Добавить `<script src="/queue-monitor.js"></script>` перед `</body>`
- [ ] Проверить что endpoint `/api/debug/queue-status` работает
- [ ] Протестировать в браузере

### Страницы с виджетом:

- ✅ `index.html` - главная страница (fixed top-right)
- ✅ `auto-search.html` - автопоиск (absolute top-right в header)
- ⬜ `step-by-step.html` - пошаговый режим
- ⬜ `results.html` - результаты
- ⬜ `progress.html` - прогресс
- ⬜ `queries.html` - запросы

---

## 🎯 Будущие улучшения

- [ ] Показывать историю нагрузки (мини-график)
- [ ] Алерты при превышении порога
- [ ] Детальная информация при клике (модальное окно)
- [ ] WebSocket для real-time updates (вместо polling)
- [ ] Индикатор последней активности AI

---

**Версия:** 2.1.2  
**Автор:** AI Assistant  
**Дата:** 29 ноября 2024

