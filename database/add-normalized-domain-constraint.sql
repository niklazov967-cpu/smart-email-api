-- Миграция: Добавление normalized_domain для предотвращения дубликатов
-- Решает проблему race condition при параллельном запуске Stage 1

-- Шаг 1: Добавить колонку normalized_domain
ALTER TABLE pending_companies 
ADD COLUMN IF NOT EXISTS normalized_domain TEXT;

-- Шаг 2: Заполнить существующие записи
-- Извлечь домен из website: https://www.example.com/path → example.com
UPDATE pending_companies 
SET normalized_domain = 
  CASE 
    WHEN website IS NOT NULL THEN
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(trim(website)), 
            '^https?://', ''  -- Удалить https:// or http://
          ),
          '^www\.', ''  -- Удалить www.
        ),
        '/.*$', ''  -- Удалить путь после домена
      )
    ELSE NULL
  END
WHERE normalized_domain IS NULL AND website IS NOT NULL;

-- Шаг 3: Создать индекс для ускорения поиска
CREATE INDEX IF NOT EXISTS idx_pending_companies_normalized_domain 
ON pending_companies(normalized_domain)
WHERE normalized_domain IS NOT NULL;

-- Шаг 4: Создать UNIQUE constraint для предотвращения дубликатов
-- Используем частичный unique index (только для записей с доменом)
DROP INDEX IF EXISTS idx_pending_companies_unique_domain;
CREATE UNIQUE INDEX idx_pending_companies_unique_domain 
ON pending_companies(normalized_domain) 
WHERE normalized_domain IS NOT NULL;

-- Шаг 5: Добавить комментарии
COMMENT ON COLUMN pending_companies.normalized_domain IS 
  'Нормализованный домен (без протокола, www, пути) для дедупликации. Пример: example.com';

COMMENT ON INDEX idx_pending_companies_unique_domain IS 
  'Гарантирует уникальность домена. Решает race condition при параллельном Stage 1.';

-- Проверка результата
SELECT 
  COUNT(*) as total_companies,
  COUNT(DISTINCT normalized_domain) as unique_domains,
  COUNT(*) - COUNT(DISTINCT normalized_domain) as duplicate_count,
  ROUND(100.0 * (COUNT(*) - COUNT(DISTINCT normalized_domain)) / NULLIF(COUNT(*), 0), 2) as duplicate_percentage
FROM pending_companies
WHERE normalized_domain IS NOT NULL;

-- Показать дубликаты (если есть)
SELECT 
  normalized_domain,
  COUNT(*) as count,
  array_agg(company_name) as company_names,
  array_agg(session_id::text) as sessions
FROM pending_companies
WHERE normalized_domain IS NOT NULL
GROUP BY normalized_domain
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
LIMIT 20;

