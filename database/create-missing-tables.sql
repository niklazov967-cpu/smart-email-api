-- Создать недостающие таблицы в Supabase
-- Выполните этот SQL в Supabase SQL Editor

-- Таблица запросов для сессий (создать если не существует)
CREATE TABLE IF NOT EXISTS session_queries (
  query_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES search_sessions(session_id) ON DELETE CASCADE,
  main_topic TEXT NOT NULL,
  query_cn TEXT,
  query_ru TEXT,
  query_text TEXT,
  relevance NUMERIC(3,2),
  is_main BOOLEAN DEFAULT false,
  is_selected BOOLEAN DEFAULT false,
  selected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Добавить недостающие колонки если таблица уже существует
ALTER TABLE session_queries 
  ADD COLUMN IF NOT EXISTS query_cn TEXT,
  ADD COLUMN IF NOT EXISTS query_ru TEXT,
  ADD COLUMN IF NOT EXISTS query_text TEXT,
  ADD COLUMN IF NOT EXISTS relevance NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS is_main BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_selected BOOLEAN DEFAULT false;

-- Обновить processing_progress для пошаговой обработки
ALTER TABLE processing_progress 
  ADD COLUMN IF NOT EXISTS stage_name VARCHAR(50),
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS result_data JSONB,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_session_queries_session ON session_queries(session_id);
CREATE INDEX IF NOT EXISTS idx_session_queries_is_selected ON session_queries(session_id, is_selected) WHERE is_selected = true;
CREATE INDEX IF NOT EXISTS idx_session_queries_selected ON session_queries(session_id, selected) WHERE selected = true;
CREATE INDEX IF NOT EXISTS idx_processing_progress_session_stage ON processing_progress(session_id, stage_name);
CREATE INDEX IF NOT EXISTS idx_processing_progress_status ON processing_progress(session_id, stage_name, status);

-- Триггер для updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_session_queries_updated_at BEFORE UPDATE ON session_queries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE session_queries IS 'Запросы для поиска компаний (сгенерированные и выбранные пользователем)';
COMMENT ON TABLE processing_progress IS 'Прогресс обработки этапов (с кэшированием результатов)';

