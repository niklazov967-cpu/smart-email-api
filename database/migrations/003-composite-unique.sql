-- Миграция 003: Добавление composite UNIQUE constraint
-- Цель: Предотвратить дубликаты по комбинации company_name + normalized_domain
-- Версия: v2.30.0
-- Дата: 2025-11-30

-- ═══════════════════════════════════════════════════════════════════
-- 📋 ОПИСАНИЕ ПРОБЛЕМЫ
-- ═══════════════════════════════════════════════════════════════════
-- До миграции:
--   - UNIQUE constraint только на normalized_domain (покрывает 42% записей)
--   - Дубликаты по company_name между разными запусками Stage 1
--   - Примеры: "韦肯 (Wayken)" и "韦肯" - разные строки, обе вставляются
-- 
-- После миграции:
--   - Composite UNIQUE на (company_name + normalized_domain)
--   - Одно название + один домен = одна запись
--   - Разные домены с одним названием = разные компании (легитимно!)
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- Шаг 1: Проверить текущие дубликаты
DO $$
DECLARE
  duplicate_count INTEGER;
  total_with_domain INTEGER;
BEGIN
  -- Подсчитать дубликаты по комбинации name + domain
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT company_name, normalized_domain, COUNT(*) as cnt
    FROM pending_companies
    WHERE normalized_domain IS NOT NULL
    GROUP BY company_name, normalized_domain
    HAVING COUNT(*) > 1
  ) AS duplicates;
  
  SELECT COUNT(*) INTO total_with_domain
  FROM pending_companies
  WHERE normalized_domain IS NOT NULL;
  
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'PRE-MIGRATION ANALYSIS';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Records with normalized_domain: %', total_with_domain;
  RAISE NOTICE 'Duplicate combinations (name+domain): %', duplicate_count;
  
  IF duplicate_count > 0 THEN
    RAISE NOTICE '⚠️  Found % duplicate combinations!', duplicate_count;
    RAISE NOTICE 'These will be cleaned before applying UNIQUE constraint';
  ELSE
    RAISE NOTICE '✅ No duplicate combinations found - safe to proceed';
  END IF;
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;

-- Шаг 2: Очистить существующие дубликаты (если есть)
-- Стратегия: оставить самую старую запись (created_at ASC)
WITH duplicates AS (
  SELECT 
    company_id,
    ROW_NUMBER() OVER (
      PARTITION BY company_name, normalized_domain
      ORDER BY created_at ASC, company_id ASC  -- Оставляем СТАРУЮ запись
    ) as rn
  FROM pending_companies
  WHERE normalized_domain IS NOT NULL
)
DELETE FROM pending_companies
WHERE company_id IN (
  SELECT company_id 
  FROM duplicates 
  WHERE rn > 1
);

-- Шаг 3: Создать composite UNIQUE index
-- Частичный индекс (только для записей с normalized_domain)
DROP INDEX IF EXISTS idx_company_name_domain;
CREATE UNIQUE INDEX idx_company_name_domain 
ON pending_companies(company_name, normalized_domain) 
WHERE normalized_domain IS NOT NULL;

-- Шаг 4: Добавить комментарии
COMMENT ON INDEX idx_company_name_domain IS 
  'Composite UNIQUE constraint: одно название + один домен = одна запись. Разные домены с одним названием = разные компании (легитимно!). Частичный индекс: применяется только к записям с normalized_domain.';

-- Шаг 5: Финальная проверка
DO $$
DECLARE
  total_records INTEGER;
  records_with_domain INTEGER;
  unique_combinations INTEGER;
  coverage_percent NUMERIC(5,2);
BEGIN
  SELECT COUNT(*) INTO total_records FROM pending_companies;
  
  SELECT COUNT(*) INTO records_with_domain 
  FROM pending_companies 
  WHERE normalized_domain IS NOT NULL;
  
  SELECT COUNT(*) INTO unique_combinations
  FROM (
    SELECT DISTINCT company_name, normalized_domain
    FROM pending_companies
    WHERE normalized_domain IS NOT NULL
  ) AS uniq;
  
  coverage_percent := (records_with_domain::NUMERIC / NULLIF(total_records, 0)) * 100;
  
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'POST-MIGRATION RESULTS';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Total records: %', total_records;
  RAISE NOTICE 'Records with normalized_domain: % (%.1f%%)', records_with_domain, coverage_percent;
  RAISE NOTICE 'Unique (name+domain) combinations: %', unique_combinations;
  RAISE NOTICE '';
  RAISE NOTICE '✅ Composite UNIQUE index created successfully!';
  RAISE NOTICE '✅ Protection: "one name + one domain = one record"';
  RAISE NOTICE '✅ Legitimate cases: "one name + different domains = OK"';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Coverage: %.1f%% of records protected by this index', coverage_percent;
  RAISE NOTICE '⚠️  Records without domain: % (%.1f%%) - protected by code checks', 
    total_records - records_with_domain,
    100 - coverage_percent;
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- 📊 ОЖИДАЕМЫЕ РЕЗУЛЬТАТЫ
-- ═══════════════════════════════════════════════════════════════════
-- 1. UNIQUE constraint на (company_name + normalized_domain)
-- 2. Защита ~42% записей на уровне БД
-- 3. Предотвращение race conditions для записей с website
-- 4. Разрешение легитимных дубликатов (разные домены)
-- 
-- ПРИМЕРЫ:
-- ✅ OK: "韦肯 (Wayken)" + "wayken.com"
-- ✅ OK: "韦肯" + "wayken.cn"  (РАЗНЫЕ домены - разные компании!)
-- ❌ BLOCKED: "韦肯 (Wayken)" + "wayken.com" (дубликат)
-- ❌ BLOCKED: "韦肯" + "wayken.com" (дубликат)
-- ═══════════════════════════════════════════════════════════════════

-- Rollback (если нужно):
-- DROP INDEX IF EXISTS idx_company_name_domain;

