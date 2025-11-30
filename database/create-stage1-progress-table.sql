-- Таблица для отслеживания прогресса Stage 1 в реальном времени
CREATE TABLE IF NOT EXISTS stage1_progress (
  session_id UUID PRIMARY KEY REFERENCES search_sessions(session_id) ON DELETE CASCADE,
  total_queries INTEGER NOT NULL DEFAULT 0,
  processed_queries INTEGER NOT NULL DEFAULT 0,
  remaining_queries INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'idle', -- idle, processing, completed, error
  current_query TEXT,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индекс для быстрого поиска по session_id
CREATE INDEX IF NOT EXISTS idx_stage1_progress_session_id ON stage1_progress(session_id);

-- Индекс для поиска активных процессов
CREATE INDEX IF NOT EXISTS idx_stage1_progress_status ON stage1_progress(status);

-- Комментарии
COMMENT ON TABLE stage1_progress IS 'Реалтайм прогресс обработки Stage 1 (поиск компаний)';
COMMENT ON COLUMN stage1_progress.session_id IS 'ID сессии (внешний ключ)';
COMMENT ON COLUMN stage1_progress.total_queries IS 'Всего запросов для обработки';
COMMENT ON COLUMN stage1_progress.processed_queries IS 'Уже обработано запросов';
COMMENT ON COLUMN stage1_progress.remaining_queries IS 'Осталось обработать запросов';
COMMENT ON COLUMN stage1_progress.status IS 'Текущий статус: idle, processing, completed, error';
COMMENT ON COLUMN stage1_progress.current_query IS 'Текущий обрабатываемый запрос (для отображения)';
COMMENT ON COLUMN stage1_progress.last_error IS 'Последняя ошибка (если была)';

