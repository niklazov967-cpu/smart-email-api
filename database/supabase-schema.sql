-- Smart Email API - Supabase Schema
-- Скопируйте и выполните этот SQL в Supabase SQL Editor

-- 1. Таблица сессий поиска
CREATE TABLE IF NOT EXISTS search_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_query TEXT NOT NULL,
  topic_description TEXT,
  target_count INTEGER DEFAULT 50,
  priority VARCHAR(20) DEFAULT 'balanced',
  status VARCHAR(20) DEFAULT 'pending',
  companies_found INTEGER DEFAULT 0,
  companies_analyzed INTEGER DEFAULT 0,
  companies_added INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  perplexity_api_calls INTEGER DEFAULT 0,
  perplexity_tokens_used INTEGER DEFAULT 0,
  cache_hits INTEGER DEFAULT 0,
  total_cost_usd NUMERIC(10, 6) DEFAULT 0,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Таблица запросов для каждой сессии
CREATE TABLE IF NOT EXISTS session_queries (
  query_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES search_sessions(session_id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  query_cn TEXT,
  query_ru TEXT,
  relevance INTEGER,
  selected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Таблица найденных компаний (pending)
CREATE TABLE IF NOT EXISTS pending_companies (
  company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES search_sessions(session_id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  website TEXT,
  email TEXT,
  phone TEXT,
  contact_page TEXT,
  stage VARCHAR(50) DEFAULT 'names_found',
  services JSONB,
  tags JSONB,
  main_activity TEXT,
  confidence_score INTEGER,
  validation_score INTEGER,
  is_relevant BOOLEAN,
  search_query_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Таблица финализированных компаний
CREATE TABLE IF NOT EXISTS found_companies (
  company_id SERIAL PRIMARY KEY,
  session_id UUID REFERENCES search_sessions(session_id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  website TEXT,
  emails TEXT[],
  phones TEXT[],
  stage VARCHAR(50) DEFAULT 'finalized',
  main_activity TEXT,
  tags TEXT[],
  validation_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Таблица прогресса обработки
CREATE TABLE IF NOT EXISTS processing_progress (
  progress_id SERIAL PRIMARY KEY,
  session_id UUID REFERENCES search_sessions(session_id) ON DELETE CASCADE,
  stage VARCHAR(50) NOT NULL,
  step_name TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  progress_percent INTEGER DEFAULT 0,
  current_item INTEGER DEFAULT 0,
  total_items INTEGER DEFAULT 0,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Таблица настроек системы
CREATE TABLE IF NOT EXISTS system_settings (
  setting_id SERIAL PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  key VARCHAR(100) NOT NULL,
  value TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category, key)
);

-- 7. Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_session_queries_session ON session_queries(session_id);
CREATE INDEX IF NOT EXISTS idx_pending_companies_session ON pending_companies(session_id);
CREATE INDEX IF NOT EXISTS idx_found_companies_session ON found_companies(session_id);
CREATE INDEX IF NOT EXISTS idx_processing_progress_session ON processing_progress(session_id);
CREATE INDEX IF NOT EXISTS idx_search_sessions_status ON search_sessions(status);

-- 8. Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 9. Триггеры для автоматического обновления updated_at
CREATE TRIGGER update_search_sessions_updated_at BEFORE UPDATE ON search_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pending_companies_updated_at BEFORE UPDATE ON pending_companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_found_companies_updated_at BEFORE UPDATE ON found_companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_processing_progress_updated_at BEFORE UPDATE ON processing_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 10. Вставка начальных настроек
INSERT INTO system_settings (category, key, value, description) VALUES
  ('api', 'perplexity_api_key', '', 'Perplexity API key'),
  ('api', 'deepseek_api_key', '', 'DeepSeek API key'),
  ('processing_stages', 'stage1_companies_per_query', '12', 'Number of companies to find per query'),
  ('processing_stages', 'stage2_concurrent_requests', '3', 'Concurrent website lookups'),
  ('processing_stages', 'stage3_concurrent_requests', '2', 'Concurrent contact analysis'),
  ('processing_stages', 'stage4_concurrent_requests', '2', 'Concurrent service analysis'),
  ('processing_stages', 'stage5_max_tags', '20', 'Maximum tags to generate')
ON CONFLICT (category, key) DO NOTHING;

-- Готово! Таблицы созданы в Supabase.
-- Теперь можно запускать приложение.

