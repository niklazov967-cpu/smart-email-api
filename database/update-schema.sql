-- Скрипт для обновления существующих таблиц в Supabase
-- Выполните этот SQL в Supabase SQL Editor

-- Обновить search_sessions
ALTER TABLE search_sessions 
  ADD COLUMN IF NOT EXISTS topic_description TEXT,
  ADD COLUMN IF NOT EXISTS target_count INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS companies_analyzed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS companies_added INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicates_skipped INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS errors_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS perplexity_api_calls INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS perplexity_tokens_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_hits INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;

-- Обновить session_queries
ALTER TABLE session_queries
  ADD COLUMN IF NOT EXISTS query_text TEXT,
  ADD COLUMN IF NOT EXISTS selected BOOLEAN DEFAULT false;

-- Обновить session_queries - изменить тип query_id на UUID если это SERIAL
-- ВНИМАНИЕ: Это удалит существующие данные!
-- ALTER TABLE session_queries DROP CONSTRAINT IF EXISTS session_queries_pkey CASCADE;
-- ALTER TABLE session_queries ALTER COLUMN query_id TYPE UUID USING gen_random_uuid();
-- ALTER TABLE session_queries ADD PRIMARY KEY (query_id);

-- Обновить pending_companies
ALTER TABLE pending_companies
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_page TEXT,
  ADD COLUMN IF NOT EXISTS services JSONB,
  ADD COLUMN IF NOT EXISTS confidence_score INTEGER;

-- Преобразовать массивы в JSONB (если нужно)
-- ALTER TABLE pending_companies ADD COLUMN IF NOT EXISTS tags_new JSONB;
-- UPDATE pending_companies SET tags_new = to_jsonb(tags) WHERE tags IS NOT NULL;
-- ALTER TABLE pending_companies DROP COLUMN IF EXISTS tags;
-- ALTER TABLE pending_companies RENAME COLUMN tags_new TO tags;

COMMENT ON TABLE search_sessions IS 'Updated schema - compatible with HybridDatabase';
COMMENT ON TABLE session_queries IS 'Updated schema - compatible with HybridDatabase';
COMMENT ON TABLE pending_companies IS 'Updated schema - compatible with HybridDatabase';

