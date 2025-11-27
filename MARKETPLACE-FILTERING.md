# 🚫 Фильтрация маркетплейсов в Stage 1

## Проблема

**До изменений:**
Perplexity часто возвращал ссылки на профили компаний на маркетплейсах (Alibaba, 1688.com), которые:
- ❌ Не являются корпоративными сайтами
- ❌ Не содержат полной информации о компании
- ❌ Затрудняют прямой контакт с производителем

**Пример:**
```json
{
  "name": "深圳精密制造有限公司",
  "website": "https://shenzhen-precision.en.alibaba.com",
  "email": null
}
```

## Решение

### 1. Обновлён промпт Stage 1

**Добавлено в инструкции для Perplexity:**
```
**НЕ УКАЗЫВАЙ маркетплейсы** (Alibaba, 1688, Made-in-China, Global Sources, 
Taobao, Tmall, JD.com) - **ТОЛЬКО официальные корпоративные сайты**

Если у компании нет своего сайта, а только профиль на маркетплейсе - 
оставь website = null
```

### 2. Добавлена фильтрация на уровне кода

**Метод `_isMarketplace(url)`:**
Проверяет URL на наличие маркетплейсов:
- alibaba.com
- 1688.com
- made-in-china.com
- globalsources.com
- taobao.com
- tmall.com
- jd.com
- aliexpress.com
- dhgate.com
- tmart.com
- amazon.cn

**Метод `_filterMarketplaces(companies)`:**
Если обнаружен маркетплейс:
- ✅ Название компании - **сохраняется**
- ✅ Email - **сохраняется** (если найден)
- ✅ Phone - **сохраняется** (если найден)
- ❌ Website - **удаляется** (будет null)

## Процесс фильтрации

```
┌─────────────────────────────────────────────────────────────┐
│                    STAGE 1: ПОИСК КОМПАНИЙ                  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Perplexity возвращает 10 компаний:                         │
│  1. 深圳拓发 → tuofa-cncmachining.com         ✅ Корп. сайт │
│  2. 东莞骏盈 → junying-prototype.com          ✅ Корп. сайт │
│  3. 苏州精密 → suzhou.en.alibaba.com          ⚠️  Alibaba   │
│  4. 广州制造 → guangzhou-mfg.com.cn           ✅ Корп. сайт │
│  5. 深圳万合 → shop123.1688.com               ⚠️  1688      │
│  ...                                                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              _removeDuplicates(companies)                   │
│  Удаление дубликатов по названию                            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│           _filterMarketplaces(companies)  🔍                │
│                                                              │
│  Для каждой компании:                                       │
│    if (_isMarketplace(company.website)) {                  │
│      company.website = null;  // Убрать маркетплейс        │
│    }                                                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  РЕЗУЛЬТАТ ПОСЛЕ ФИЛЬТРАЦИИ:                                │
│  1. 深圳拓发 → tuofa-cncmachining.com         ✅            │
│  2. 东莞骏盈 → junying-prototype.com          ✅            │
│  3. 苏州精密 → NULL  (Alibaba удалён)         ⚠️ → Stage 2  │
│  4. 广州制造 → guangzhou-mfg.com.cn           ✅            │
│  5. 深圳万合 → NULL  (1688 удалён)            ⚠️ → Stage 2  │
│  ...                                                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                 _saveCompanies(companies)                   │
│                                                              │
│  Определение stage для каждой компании:                     │
│  • website + (email OR phone) → 'contacts_found'           │
│  • website (без контактов)    → 'website_found'            │
│  • NULL website               → 'names_found'              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                      БАЗА ДАННЫХ                            │
│                                                              │
│  pending_companies:                                         │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 深圳拓发 | tuofa-cncmachining.com | contacts_found │    │
│  │ 东莞骏盈 | junying-prototype.com  | contacts_found │    │
│  │ 苏州精密 | NULL                   | names_found    │ ← │
│  │ 广州制造 | guangzhou-mfg.com.cn   | website_found  │    │
│  │ 深圳万合 | NULL                   | names_found    │ ← │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Примеры фильтрации

### Пример 1: Alibaba профиль

**Входные данные:**
```json
{
  "name": "苏州精密机械有限公司",
  "website": "https://suzhou-precision.en.alibaba.com",
  "email": null,
  "phone": "+86-512-1234-5678"
}
```

**Проверка:**
```javascript
_isMarketplace("https://suzhou-precision.en.alibaba.com")
// → true (содержит 'alibaba.com')
```

**Результат:**
```json
{
  "name": "苏州精密机械有限公司",
  "website": null,  // ← Удалён маркетплейс
  "email": null,
  "phone": "+86-512-1234-5678"  // ← Сохранён
}
```

**Сохранение в БД:**
```sql
INSERT INTO pending_companies 
  (company_name, website, email, phone, stage)
VALUES 
  ('苏州精密机械有限公司', NULL, NULL, '+86-512-1234-5678', 'names_found');
```

**Что дальше:**
- ✅ Stage 2 найдёт корпоративный сайт компании
- ✅ Телефон уже сохранён

---

### Пример 2: 1688 магазин с email

**Входные данные:**
```json
{
  "name": "深圳万合精密制造",
  "website": "https://shop123456.1688.com",
  "email": "sales@wanhe-precision.com",
  "phone": null
}
```

**Проверка:**
```javascript
_isMarketplace("https://shop123456.1688.com")
// → true (содержит '1688.com')
```

**Результат:**
```json
{
  "name": "深圳万合精密制造",
  "website": null,  // ← Удалён маркетплейс
  "email": "sales@wanhe-precision.com",  // ← Сохранён!
  "phone": null
}
```

**Сохранение в БД:**
```sql
INSERT INTO pending_companies 
  (company_name, website, email, phone, stage)
VALUES 
  ('深圳万合精密制造', NULL, 'sales@wanhe-precision.com', NULL, 'names_found');
```

**Преимущество:**
- ✅ Email уже известен (с маркетплейса)
- ✅ Stage 2 найдёт корпоративный сайт
- ✅ Stage 3 может пропустить (email есть)

---

### Пример 3: Корпоративный сайт

**Входные данные:**
```json
{
  "name": "深圳拓发精密制造有限公司",
  "website": "https://www.tuofa-cncmachining.com",
  "email": "info@tuofa.com",
  "phone": "+86-755-2345-6789"
}
```

**Проверка:**
```javascript
_isMarketplace("https://www.tuofa-cncmachining.com")
// → false (не содержит маркетплейсов)
```

**Результат:**
```json
{
  "name": "深圳拓发精密制造有限公司",
  "website": "https://www.tuofa-cncmachining.com",  // ← Сохранён
  "email": "info@tuofa.com",
  "phone": "+86-755-2345-6789"
}
```

**Сохранение в БД:**
```sql
INSERT INTO pending_companies 
  (company_name, website, email, phone, stage)
VALUES 
  ('深圳拓发精密制造有限公司', 
   'https://www.tuofa-cncmachining.com', 
   'info@tuofa.com', 
   '+86-755-2345-6789', 
   'contacts_found');  ← Все данные есть!
```

**Преимущество:**
- ✅ Полная информация
- ✅ Stage 2 пропускается
- ✅ Stage 3 пропускается
- ✅ Переход сразу к Stage 4

---

## Логирование

### При фильтрации отдельной компании:

```javascript
this.logger.debug('Stage 1: Marketplace URL filtered', {
  company: '苏州精密机械有限公司',
  marketplace: 'https://suzhou-precision.en.alibaba.com'
});
```

### После фильтрации всех компаний:

```javascript
this.logger.info('Stage 1: Marketplaces filtered', {
  count: 3  // Количество отфильтрованных маркетплейсов
});
```

### При сохранении:

```javascript
this.logger.info('Stage 1: Companies saved', {
  total: 10,
  withWebsite: 7,      // Корпоративные сайты
  withEmail: 5,
  withPhone: 8,
  withDescription: 9
});
```

---

## Список фильтруемых маркетплейсов

```javascript
const marketplaces = [
  'alibaba.com',        // Alibaba International
  '1688.com',           // Alibaba China (內貿)
  'made-in-china.com',  // Made-in-China
  'globalsources.com',  // Global Sources
  'tmart.com',          // Tmart
  'dhgate.com',         // DHgate
  'aliexpress.com',     // AliExpress (B2C)
  'taobao.com',         // Taobao (B2C)
  'tmall.com',          // Tmall (B2C)
  'jd.com',             // JD.com (京东)
  'amazon.cn'           // Amazon China
];
```

---

## Преимущества фильтрации

### 1. Качество данных
- ✅ Только корпоративные сайты компаний
- ✅ Прямой контакт с производителем
- ✅ Полная информация о компании

### 2. Сохранение полезной информации
- ✅ Название компании всегда сохраняется
- ✅ Email/Phone из маркетплейсов сохраняются
- ✅ Описание компании сохраняется

### 3. Эффективность
- ✅ Stage 2 находит корпоративные сайты
- ✅ Не теряется информация о компании
- ✅ Двухслойная защита: промпт + код

### 4. Прозрачность
- ✅ Логирование каждого фильтрованного URL
- ✅ Статистика по отфильтрованным компаниям
- ✅ Понятное поведение системы

---

## Итоговая статистика

### Типичный результат Stage 1 (12 компаний):

```
┌─────────────────────────────────────────────────────────┐
│                   STAGE 1 РЕЗУЛЬТАТЫ                    │
├─────────────────────────────────────────────────────────┤
│ Всего компаний:              12                         │
│                                                          │
│ С корпоративными сайтами:     8  (67%)                  │
│   • С контактами:             5  → contacts_found       │
│   • Без контактов:            3  → website_found        │
│                                                          │
│ С маркетплейсами (удалены):   3  (25%)                  │
│   • Alibaba:                  2  → names_found          │
│   • 1688:                     1  → names_found          │
│                                                          │
│ Без сайта:                    1  (8%)                   │
│   • Только название:          1  → names_found          │
└─────────────────────────────────────────────────────────┘

Stage 2 будет обрабатывать: 4 компании (3 маркетплейса + 1 без сайта)
Stage 2 пропустит:           8 компаний (уже есть корп. сайт)

Экономия в Stage 2: 67%! ⚡
```

---

*Документ создан: 27 ноября 2025*  
*Версия системы: 2.1 (Фильтрация маркетплейсов)*

