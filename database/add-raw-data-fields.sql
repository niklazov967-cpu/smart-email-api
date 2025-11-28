-- Добавить поля для хранения сырых данных от AI на каждом этапе

ALTER TABLE pending_companies
ADD COLUMN IF NOT EXISTS stage1_raw_data JSONB,
ADD COLUMN IF NOT EXISTS stage2_raw_data JSONB,
ADD COLUMN IF NOT EXISTS stage3_raw_data JSONB,
ADD COLUMN IF NOT EXISTS ai_generated_description TEXT,
ADD COLUMN IF NOT EXISTS ai_confidence_score INTEGER;

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_pending_companies_stage1_raw ON pending_companies USING GIN (stage1_raw_data);
CREATE INDEX IF NOT EXISTS idx_pending_companies_stage2_raw ON pending_companies USING GIN (stage2_raw_data);
CREATE INDEX IF NOT EXISTS idx_pending_companies_stage3_raw ON pending_companies USING GIN (stage3_raw_data);

COMMENT ON COLUMN pending_companies.stage1_raw_data IS 'Сырые данные от Perplexity в Stage 1';
COMMENT ON COLUMN pending_companies.stage2_raw_data IS 'Сырые данные от Perplexity в Stage 2';
COMMENT ON COLUMN pending_companies.stage3_raw_data IS 'Сырые данные от Perplexity в Stage 3';
COMMENT ON COLUMN pending_companies.ai_generated_description IS 'Описание сгенерированное DeepSeek из всех данных';
COMMENT ON COLUMN pending_companies.ai_confidence_score IS 'Уверенность AI в корректности данных (0-100)';

