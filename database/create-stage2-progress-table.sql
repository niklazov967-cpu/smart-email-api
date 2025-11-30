-- Таблица для отслеживания прогресса Stage 2 в реальном времени
CREATE TABLE IF NOT EXISTS stage2_progress (
  session_id UUID PRIMARY KEY REFERENCES search_sessions(session_id) ON DELETE CASCADE,
  total_companies INTEGER NOT NULL DEFAULT 0,
  processed_companies INTEGER NOT NULL DEFAULT 0,
  remaining_companies INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'idle', -- idle, processing, completed, error
  current_company TEXT,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индекс для быстрого поиска по session_id
CREATE INDEX IF NOT EXISTS idx_stage2_progress_session_id ON stage2_progress(session_id);

-- Индекс для поиска активных процессов
CREATE INDEX IF NOT EXISTS idx_stage2_progress_status ON stage2_progress(status);

-- Комментарии
COMMENT ON TABLE stage2_progress IS 'Реалтайм прогресс обработки Stage 2 (поиск сайтов)';
COMMENT ON COLUMN stage2_progress.session_id IS 'ID сессии (внешний ключ)';
COMMENT ON COLUMN stage2_progress.total_companies IS 'Всего компаний для обработки';
COMMENT ON COLUMN stage2_progress.processed_companies IS 'Уже обработано компаний';
COMMENT ON COLUMN stage2_progress.remaining_companies IS 'Осталось обработать компаний';
COMMENT ON COLUMN stage2_progress.status IS 'Текущий статус: idle, processing, completed, error';
COMMENT ON COLUMN stage2_progress.current_company IS 'Текущая обрабатываемая компания (для отображения)';
COMMENT ON COLUMN stage2_progress.last_error IS 'Последняя ошибка (если была)';

