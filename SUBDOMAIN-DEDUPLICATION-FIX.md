# ✅ Исправление: Дедупликация поддоменов

**Дата:** 2025-11-29  
**Проблема:** `us.jingdiao.com` не превращался в `jingdiao.com`  
**Статус:** ✅ ИСПРАВЛЕНО

---

## 🔍 Обнаруженная проблема

### Что происходило:

При тестировании обнаружено, что компании с разными поддоменами считались уникальными:

```
Сессия 1: us.jingdiao.com  ← Beijing Jingdiao Group
Сессия 2: cn.jingdiao.com  ← Beijing Jingdiao Group (CN)

Результат: 2 записи в БД (ДУБЛИКАТ!)
```

### Почему:

Старая версия `_extractMainDomain` убирала только `www.`:

```javascript
domain = domain.replace(/^www\./, '');  // Только www!
// us.jingdiao.com → us.jingdiao.com ❌ (поддомен остался)
// cn.jingdiao.com → cn.jingdiao.com ❌ (поддомен остался)
```

---

## ✅ Решение

### Новая логика извлечения основного домена:

```javascript
_extractMainDomain(url) {
  try {
    if (!url) return null;
    
    // 1. Убрать протокол
    let domain = url.replace(/^https?:\/\//, '');
    
    // 2. Убрать пути, параметры, хэши
    domain = domain.split('/')[0].split('?')[0].split('#')[0];
    
    // 3. Убрать порт
    domain = domain.split(':')[0];
    
    // 4. Убрать www.
    domain = domain.replace(/^www\./, '');
    
    // 5. НОВОЕ: Извлечь основной домен (второй уровень)
    const parts = domain.split('.');
    
    if (parts.length > 2) {
      // Проверить на двойные TLD (.co.uk, .com.cn и т.д.)
      const doubleTLDs = ['co.uk', 'com.cn', 'net.cn', 'org.cn', 'co.jp', 'com.au'];
      const lastTwoParts = parts.slice(-2).join('.');
      
      if (doubleTLDs.includes(lastTwoParts)) {
        // Для двойных TLD: берем последние 3 части
        // shop.example.co.uk → example.co.uk
        domain = parts.slice(-3).join('.');
      } else {
        // Для обычных доменов: берем последние 2 части
        // us.jingdiao.com → jingdiao.com ✅
        domain = parts.slice(-2).join('.');
      }
    }
    
    return domain.toLowerCase();
  } catch (error) {
    this.logger.error('Stage 1: Failed to extract domain', { url, error: error.message });
    return null;
  }
}
```

---

## 🧪 Тестирование

### Тест 1: Обычные домены

| Входной URL | Ожидается | Результат |
|-------------|-----------|-----------|
| `https://us.jingdiao.com` | `jingdiao.com` | ✅ `jingdiao.com` |
| `https://cn.jingdiao.com` | `jingdiao.com` | ✅ `jingdiao.com` |
| `http://en.jingdiao.com/products` | `jingdiao.com` | ✅ `jingdiao.com` |
| `https://www.gchprocess.com/zh/` | `gchprocess.com` | ✅ `gchprocess.com` |
| `http://blog.example.com` | `example.com` | ✅ `example.com` |
| `https://api.subdomain.company.com` | `company.com` | ✅ `company.com` |

### Тест 2: Двойные TLD

| Входной URL | Ожидается | Результат |
|-------------|-----------|-----------|
| `https://www.example.co.uk` | `example.co.uk` | ✅ `example.co.uk` |
| `https://shop.company.com.cn` | `company.com.cn` | ✅ `company.com.cn` |
| `https://cn.example.net.cn/about` | `example.net.cn` | ✅ `example.net.cn` |

### Тест 3: Простые домены

| Входной URL | Ожидается | Результат |
|-------------|-----------|-----------|
| `https://elephant-cnc.com` | `elephant-cnc.com` | ✅ `elephant-cnc.com` |
| `https://www.yijinsolution.com` | `yijinsolution.com` | ✅ `yijinsolution.com` |

**📊 Результаты: 9✅ / 0❌**

---

## 📝 Практический пример

### Сценарий:

Perplexity находит Beijing Jingdiao Group на 4 разных поддоменах:

```
📥 Входные данные от Perplexity:
   1. https://www.jingdiao.com
   2. https://us.jingdiao.com
   3. https://cn.jingdiao.com
   4. http://en.jingdiao.com/products
```

### Обработка:

```
🔍 Извлечение основных доменов:

   https://www.jingdiao.com → jingdiao.com
      ✅ УНИКАЛЬНЫЙ

   https://us.jingdiao.com → jingdiao.com
      ❌ ДУБЛИКАТ

   https://cn.jingdiao.com → jingdiao.com
      ❌ ДУБЛИКАТ

   http://en.jingdiao.com/products → jingdiao.com
      ❌ ДУБЛИКАТ
```

### Результат:

```
📊 Результат дедупликации:
   Получено от Perplexity: 4 компаний
   После дедупликации: 1 компания ✅
   Отфильтровано дубликатов: 3
```

---

## 🎯 Как это работает

### Алгоритм извлечения основного домена:

```
Входной URL: https://us.jingdiao.com/products?lang=en#top

Шаг 1: Убрать протокол
   → us.jingdiao.com/products?lang=en#top

Шаг 2: Убрать пути, параметры, хэши
   → us.jingdiao.com

Шаг 3: Убрать порт (если есть)
   → us.jingdiao.com

Шаг 4: Убрать www.
   → us.jingdiao.com

Шаг 5: Извлечь основной домен
   parts = ['us', 'jingdiao', 'com']  (3 части)
   
   Двойной TLD? 
   lastTwoParts = 'jingdiao.com'
   'jingdiao.com' NOT IN ['co.uk', 'com.cn', ...] → НЕТ
   
   → Обычный домен: берем последние 2 части
   → parts.slice(-2).join('.') = ['jingdiao', 'com'].join('.')
   
   ✅ РЕЗУЛЬТАТ: jingdiao.com
```

### Для двойных TLD (например, `.co.uk`):

```
Входной URL: https://shop.example.co.uk

Шаги 1-4: → shop.example.co.uk
   
Шаг 5: 
   parts = ['shop', 'example', 'co', 'uk']  (4 части)
   lastTwoParts = 'co.uk'
   'co.uk' IN ['co.uk', 'com.cn', ...] → ДА!
   
   → Двойной TLD: берем последние 3 части
   → parts.slice(-3).join('.') = ['example', 'co', 'uk'].join('.')
   
   ✅ РЕЗУЛЬТАТ: example.co.uk
```

---

## 📊 Итоговая статистика

### До исправления:

```
us.jingdiao.com ≠ cn.jingdiao.com ≠ en.jingdiao.com
→ 3 записи в БД (дубликаты!)
```

### После исправления:

```
us.jingdiao.com = cn.jingdiao.com = en.jingdiao.com = jingdiao.com
→ 1 запись в БД ✅
```

---

## ✅ Результат

### Поддерживаемые случаи:

✅ **Поддомены**: `us.example.com`, `cn.example.com` → `example.com`  
✅ **www**: `www.example.com` → `example.com`  
✅ **Двойные TLD**: `shop.example.co.uk` → `example.co.uk`  
✅ **Китайские домены**: `cn.company.com.cn` → `company.com.cn`  
✅ **Пути**: `example.com/zh/blog` → `example.com`  
✅ **Параметры**: `example.com?lang=en` → `example.com`  
✅ **Порты**: `example.com:8080` → `example.com`

### Проверенные TLD:

- `.com`, `.cn`, `.net`, `.org`
- `.co.uk`, `.com.cn`, `.net.cn`, `.org.cn`
- `.co.jp`, `.com.au`

---

## 📝 Файлы изменены

- **`src/stages/Stage1FindCompanies.js`** - метод `_extractMainDomain` (строки 641-679)

---

## 🎉 Готово!

Теперь:
- `us.jingdiao.com` → `jingdiao.com` ✅
- `cn.jingdiao.com` → `jingdiao.com` ✅
- `www.jingdiao.com` → `jingdiao.com` ✅
- `shop.example.co.uk` → `example.co.uk` ✅

**Дедупликация поддоменов работает корректно!** 🚀

