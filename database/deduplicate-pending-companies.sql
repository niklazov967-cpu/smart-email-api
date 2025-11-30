-- ===============================================
-- ДЕДУПЛИКАЦИЯ pending_companies
-- Удаление дубликатов по домену сайта
-- Дата: 29 ноября 2024
-- ===============================================

-- Шаг 1: Анализ дубликатов (ТОЛЬКО ПРОСМОТР)
-- Покажет сколько дубликатов по каждому домену
SELECT 
  REGEXP_REPLACE(
    REGEXP_REPLACE(website, '^https?://', ''),
    '^www\.',
    ''
  ) AS clean_domain,
  COUNT(*) as count,
  array_agg(company_id ORDER BY created_at) as company_ids,
  array_agg(company_name ORDER BY created_at) as company_names,
  array_agg(website ORDER BY created_at) as websites
FROM pending_companies
WHERE website IS NOT NULL 
  AND website != ''
GROUP BY clean_domain
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- ===============================================
-- Шаг 2: Подробный анализ (ТОЛЬКО ПРОСМОТР)
-- Покажет детали всех дубликатов
-- ===============================================

WITH duplicates AS (
  SELECT 
    company_id,
    company_name,
    website,
    created_at,
    stage,
    email,
    REGEXP_REPLACE(
      REGEXP_REPLACE(website, '^https?://', ''),
      '^www\.',
      ''
    ) AS clean_domain,
    ROW_NUMBER() OVER (
      PARTITION BY REGEXP_REPLACE(
        REGEXP_REPLACE(website, '^https?://', ''),
        '^www\.',
        ''
      )
      ORDER BY created_at ASC
    ) AS row_num
  FROM pending_companies
  WHERE website IS NOT NULL 
    AND website != ''
)
SELECT 
  clean_domain,
  company_id,
  company_name,
  website,
  email,
  stage,
  created_at,
  CASE WHEN row_num = 1 THEN '✅ KEEP' ELSE '❌ DELETE' END as action
FROM duplicates
WHERE clean_domain IN (
  SELECT clean_domain 
  FROM duplicates 
  GROUP BY clean_domain 
  HAVING COUNT(*) > 1
)
ORDER BY clean_domain, row_num;

-- ===============================================
-- Шаг 3: СУХОЙ ПРОГОН (DRY RUN) - БЕЗОПАСНО
-- Покажет что будет удалено БЕЗ УДАЛЕНИЯ
-- ===============================================

WITH duplicates AS (
  SELECT 
    company_id,
    company_name,
    website,
    REGEXP_REPLACE(
      REGEXP_REPLACE(website, '^https?://', ''),
      '^www\.',
      ''
    ) AS clean_domain,
    ROW_NUMBER() OVER (
      PARTITION BY REGEXP_REPLACE(
        REGEXP_REPLACE(website, '^https?://', ''),
        '^www\.',
        ''
      )
      ORDER BY created_at ASC
    ) AS row_num
  FROM pending_companies
  WHERE website IS NOT NULL 
    AND website != ''
)
SELECT 
  COUNT(*) as will_be_deleted,
  array_agg(company_id) as company_ids_to_delete
FROM duplicates
WHERE row_num > 1;

-- ===============================================
-- Шаг 4: РЕАЛЬНОЕ УДАЛЕНИЕ (ОСТОРОЖНО!)
-- ⚠️  УДАЛЯЕТ ДУБЛИКАТЫ НАВСЕГДА
-- ⚠️  Сохраняет самую старую запись (created_at ASC)
-- ⚠️  Запустите сначала Шаги 1-3 для проверки!
-- ===============================================

-- UNCOMMENT ДЛЯ ВЫПОЛНЕНИЯ (убрать --)
-- WITH duplicates AS (
--   SELECT 
--     company_id,
--     REGEXP_REPLACE(
--       REGEXP_REPLACE(website, '^https?://', ''),
--       '^www\.',
--       ''
--     ) AS clean_domain,
--     ROW_NUMBER() OVER (
--       PARTITION BY REGEXP_REPLACE(
--         REGEXP_REPLACE(website, '^https?://', ''),
--         '^www\.',
--         ''
--       )
--       ORDER BY created_at ASC
--     ) AS row_num
--   FROM pending_companies
--   WHERE website IS NOT NULL 
--     AND website != ''
-- )
-- DELETE FROM pending_companies
-- WHERE company_id IN (
--   SELECT company_id 
--   FROM duplicates 
--   WHERE row_num > 1
-- );

-- ===============================================
-- Шаг 5: Проверка после удаления
-- Должно быть 0 дубликатов
-- ===============================================

SELECT 
  'Проверка: дубликатов не должно быть' as check_name,
  COUNT(*) as duplicates_count
FROM (
  SELECT 
    REGEXP_REPLACE(
      REGEXP_REPLACE(website, '^https?://', ''),
      '^www\.',
      ''
    ) AS clean_domain,
    COUNT(*) as count
  FROM pending_companies
  WHERE website IS NOT NULL 
    AND website != ''
  GROUP BY clean_domain
  HAVING COUNT(*) > 1
) as dups;

-- ===============================================
-- Шаг 6: Статистика после очистки
-- ===============================================

SELECT 
  'Всего компаний' as metric,
  COUNT(*) as value
FROM pending_companies
UNION ALL
SELECT 
  'Компаний с сайтом' as metric,
  COUNT(*) as value
FROM pending_companies
WHERE website IS NOT NULL AND website != ''
UNION ALL
SELECT 
  'Компаний с email' as metric,
  COUNT(*) as value
FROM pending_companies
WHERE email IS NOT NULL AND email != ''
UNION ALL
SELECT 
  'Уникальных доменов' as metric,
  COUNT(DISTINCT REGEXP_REPLACE(
    REGEXP_REPLACE(website, '^https?://', ''),
    '^www\.',
    ''
  )) as value
FROM pending_companies
WHERE website IS NOT NULL AND website != '';

-- ===============================================
-- АЛЬТЕРНАТИВА: Более агрессивная дедупликация
-- Удаляет дубликаты по названию компании (без сайта)
-- ===============================================

-- UNCOMMENT ДЛЯ ВЫПОЛНЕНИЯ
-- WITH duplicates AS (
--   SELECT 
--     company_id,
--     company_name,
--     ROW_NUMBER() OVER (
--       PARTITION BY LOWER(TRIM(company_name))
--       ORDER BY 
--         CASE WHEN website IS NOT NULL THEN 0 ELSE 1 END,
--         CASE WHEN email IS NOT NULL THEN 0 ELSE 1 END,
--         created_at ASC
--     ) AS row_num
--   FROM pending_companies
-- )
-- DELETE FROM pending_companies
-- WHERE company_id IN (
--   SELECT company_id 
--   FROM duplicates 
--   WHERE row_num > 1
-- );

-- ===============================================
-- ИНСТРУКЦИЯ ПО ИСПОЛЬЗОВАНИЮ
-- ===============================================

/*

1. СНАЧАЛА ПРОВЕРИТЬ:
   - Выполните Шаг 1: Посмотрите сколько дубликатов
   - Выполните Шаг 2: Посмотрите детали дубликатов
   - Выполните Шаг 3: Сухой прогон (сколько будет удалено)

2. СОЗДАТЬ BACKUP (ВАЖНО!):
   Если используете Supabase:
   - Dashboard → Database → Backups → Create backup
   
   Если используете PostgreSQL напрямую:
   pg_dump -U user -d database -t pending_companies > backup.sql

3. ВЫПОЛНИТЬ УДАЛЕНИЕ:
   - Раскомментируйте Шаг 4 (уберите -- в начале строк)
   - Выполните SQL
   - Проверьте результат

4. ПРОВЕРИТЬ РЕЗУЛЬТАТ:
   - Выполните Шаг 5: Должно быть 0 дубликатов
   - Выполните Шаг 6: Посмотрите статистику

5. ЕСЛИ ЧТО-ТО ПОШЛО НЕ ТАК:
   - Восстановите из backup
   - Свяжитесь с разработчиком

ЛОГИКА УДАЛЕНИЯ:
- Сохраняется САМАЯ СТАРАЯ запись (created_at ASC)
- Удаляются все более новые дубликаты
- Сравнение по clean_domain (без протокола и www)

ПРИМЕРЫ clean_domain:
- https://www.example.com → example.com
- http://example.com → example.com
- https://www.example.com/path → example.com (путь удален в ROW_NUMBER)

БЕЗОПАСНОСТЬ:
- Шаги 1-3 БЕЗОПАСНЫ (только чтение)
- Шаг 4 УДАЛЯЕТ данные (требует раскомментирования)
- Всегда делайте backup перед Шагом 4!

*/

