-- Добавить поле validation_reason в pending_companies для хранения причины валидации

ALTER TABLE pending_companies
ADD COLUMN IF NOT EXISTS validation_reason TEXT;

-- Индекс для быстрого поиска по validation_score
CREATE INDEX IF NOT EXISTS idx_pending_companies_validation_score 
ON pending_companies (validation_score);

-- Индекс для быстрого поиска rejected компаний
CREATE INDEX IF NOT EXISTS idx_pending_companies_stage_rejected 
ON pending_companies (stage) 
WHERE stage = 'rejected';

