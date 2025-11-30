-- ═══════════════════════════════════════════════════════════════════════════
-- Сброс Stage 3 для компаний без email (для выполнения в Supabase SQL Editor)
-- ═══════════════════════════════════════════════════════════════════════════

-- ШАГ 1: Проверка - сколько компаний с сайтом, но без email
SELECT 
  'Компаний с сайтом, но без email' as metric,
  COUNT(*) as count
FROM pending_companies
WHERE website IS NOT NULL
  AND (email IS NULL OR email = '')
  AND current_stage >= 1;

-- ШАГ 2: Статистика по текущим статусам Stage 3
SELECT 
  'Текущие статусы Stage 3' as info,
  stage3_status,
  COUNT(*) as count
FROM pending_companies
WHERE website IS NOT NULL
  AND (email IS NULL OR email = '')
  AND current_stage >= 1
GROUP BY stage3_status
ORDER BY count DESC;

-- ШАГ 3: Статистика по Stage 2 (для контекста)
SELECT 
  'Статусы Stage 2 у компаний без email' as info,
  stage2_status,
  COUNT(*) as count
FROM pending_companies
WHERE website IS NOT NULL
  AND (email IS NULL OR email = '')
  AND current_stage >= 1
GROUP BY stage2_status
ORDER BY count DESC;

-- ШАГ 4: Примеры компаний (первые 10)
SELECT 
  company_name,
  website,
  stage2_status,
  stage3_status,
  current_stage,
  created_at
FROM pending_companies
WHERE website IS NOT NULL
  AND (email IS NULL OR email = '')
  AND current_stage >= 1
ORDER BY created_at DESC
LIMIT 10;

-- ═══════════════════════════════════════════════════════════════════════════
-- ВНИМАНИЕ! Следующий запрос ОБНОВИТ данные в БД
-- Раскомментируйте и выполните только если уверены!
-- ═══════════════════════════════════════════════════════════════════════════

/*
-- ШАГ 5: Сброс параметров для добавления в очередь Stage 3
UPDATE pending_companies
SET 
  stage3_status = NULL,           -- Готов для обработки
  current_stage = 2,               -- Stage 2 завершен, готов для Stage 3
  contacts_json = NULL,            -- Очистить старые контакты
  stage3_raw_data = NULL,          -- Очистить старые данные
  updated_at = NOW()
WHERE website IS NOT NULL
  AND (email IS NULL OR email = '')
  AND current_stage >= 1
RETURNING company_id, company_name, website, stage3_status, current_stage;
*/

-- ШАГ 6: Проверка после обновления (выполнить после ШАГ 5)
/*
SELECT 
  'После сброса - готовы для Stage 3' as status,
  COUNT(*) as count
FROM pending_companies
WHERE stage3_status IS NULL
  AND current_stage >= 2
  AND website IS NOT NULL
  AND (email IS NULL OR email = '');
*/

