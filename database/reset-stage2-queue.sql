-- ═══════════════════════════════════════════════════════════════════════════
-- Сброс Stage 2 для компаний без сайта (для выполнения в Supabase SQL Editor)
-- ═══════════════════════════════════════════════════════════════════════════

-- ШАГ 1: Проверка - сколько компаний без сайта
SELECT 
  'Компаний без сайта' as metric,
  COUNT(*) as count
FROM pending_companies
WHERE (website IS NULL OR website = '')
  AND current_stage >= 1;

-- ШАГ 2: Статистика по текущим статусам Stage 2
SELECT 
  'Текущие статусы Stage 2' as info,
  stage2_status,
  COUNT(*) as count
FROM pending_companies
WHERE (website IS NULL OR website = '')
  AND current_stage >= 1
GROUP BY stage2_status
ORDER BY count DESC;

-- ШАГ 3: Примеры компаний (первые 10)
SELECT 
  company_name,
  stage2_status,
  current_stage,
  website,
  created_at
FROM pending_companies
WHERE (website IS NULL OR website = '')
  AND current_stage >= 1
ORDER BY created_at DESC
LIMIT 10;

-- ═══════════════════════════════════════════════════════════════════════════
-- ВНИМАНИЕ! Следующий запрос ОБНОВИТ данные в БД
-- Раскомментируйте и выполните только если уверены!
-- ═══════════════════════════════════════════════════════════════════════════

/*
-- ШАГ 4: Сброс параметров для добавления в очередь Stage 2
UPDATE pending_companies
SET 
  stage2_status = NULL,           -- Готов для обработки
  current_stage = 1,               -- Stage 1 завершен
  website_status = NULL,           -- Сбросить старый статус
  stage2_raw_data = NULL,          -- Очистить старые данные
  updated_at = NOW()
WHERE (website IS NULL OR website = '')
  AND current_stage >= 1
RETURNING company_id, company_name, stage2_status, current_stage;
*/

-- ШАГ 5: Проверка после обновления (выполнить после ШАГ 4)
/*
SELECT 
  'После сброса - готовы для Stage 2' as status,
  COUNT(*) as count
FROM pending_companies
WHERE stage2_status IS NULL
  AND current_stage >= 1
  AND (website IS NULL OR website = '');
*/

