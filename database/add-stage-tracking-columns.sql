-- Добавление колонок для отслеживания прогресса по этапам
-- Система позволяет точно знать какие этапы пройдены, пропущены или провалены

-- Добавить колонки для статусов этапов
ALTER TABLE pending_companies 
  ADD COLUMN IF NOT EXISTS stage1_status TEXT DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS stage2_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stage3_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stage4_status TEXT DEFAULT NULL;

-- Добавить колонку для текущего этапа (число от 1 до 4)
ALTER TABLE pending_companies 
  ADD COLUMN IF NOT EXISTS current_stage INTEGER DEFAULT 1;

-- Создать индекс для быстрого поиска компаний по текущему этапу
CREATE INDEX IF NOT EXISTS idx_pending_companies_current_stage 
  ON pending_companies(current_stage);

-- Создать индекс для комбинированного поиска (session + stage)
CREATE INDEX IF NOT EXISTS idx_pending_companies_session_stage 
  ON pending_companies(session_id, current_stage);

-- Обновить существующие записи на основе их текущего поля stage
UPDATE pending_companies 
SET 
  stage1_status = 'completed',
  stage2_status = CASE 
    WHEN website IS NOT NULL AND stage IN ('website_found', 'contacts_found', 'email_found', 'completed', 'rejected', 'needs_review', 'site_analyzed') 
      THEN 'completed'
    WHEN stage = 'names_found' AND website IS NULL 
      THEN NULL
    ELSE 'completed'
  END,
  stage3_status = CASE 
    WHEN email IS NOT NULL 
      THEN 'completed'
    WHEN website IS NOT NULL AND email IS NULL AND stage IN ('website_found', 'site_analyzed')
      THEN NULL
    ELSE NULL
  END,
  stage4_status = CASE 
    WHEN stage = 'completed' THEN 'completed'
    WHEN stage = 'rejected' THEN 'rejected'
    WHEN stage = 'needs_review' THEN 'needs_review'
    ELSE NULL
  END,
  current_stage = CASE 
    -- Stage 4 завершен
    WHEN stage IN ('completed', 'rejected', 'needs_review') THEN 4
    -- Stage 3 завершен (есть email), готов для Stage 4
    WHEN email IS NOT NULL AND stage NOT IN ('completed', 'rejected', 'needs_review') THEN 3
    -- Stage 2 завершен (есть website), готов для Stage 3
    WHEN website IS NOT NULL AND email IS NULL THEN 2
    -- Только Stage 1 завершен (нет website), готов для Stage 2
    WHEN website IS NULL THEN 1
    ELSE 1
  END
WHERE current_stage IS NULL OR current_stage = 1;

-- Показать статистику после обновления
SELECT 
  current_stage,
  COUNT(*) as companies_count,
  COUNT(CASE WHEN stage2_status IS NOT NULL THEN 1 END) as with_stage2,
  COUNT(CASE WHEN stage3_status IS NOT NULL THEN 1 END) as with_stage3,
  COUNT(CASE WHEN stage4_status IS NOT NULL THEN 1 END) as with_stage4
FROM pending_companies
GROUP BY current_stage
ORDER BY current_stage;

-- Комментарии для документации
COMMENT ON COLUMN pending_companies.stage1_status IS 'Статус этапа 1: completed (всегда)';
COMMENT ON COLUMN pending_companies.stage2_status IS 'Статус этапа 2: completed, skipped, failed, NULL';
COMMENT ON COLUMN pending_companies.stage3_status IS 'Статус этапа 3: completed, skipped, failed, NULL';
COMMENT ON COLUMN pending_companies.stage4_status IS 'Статус этапа 4: completed, rejected, needs_review, NULL';
COMMENT ON COLUMN pending_companies.current_stage IS 'Текущий этап обработки (1-4). Определяет какой этап выполнять следующим.';

