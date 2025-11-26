-- Миграция 004: Валидация компаний и прогресс-бар
-- Версия: 1.2.0

-- Таблица для логирования валидации компаний
CREATE TABLE IF NOT EXISTS validation_log (
    validation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pending_id UUID NOT NULL REFERENCES pending_companies(pending_id) ON DELETE CASCADE,
    session_id UUID REFERENCES search_sessions(session_id) ON DELETE SET NULL,
    relevance_score INTEGER NOT NULL,      -- Оценка релевантности 0-100
    is_relevant BOOLEAN NOT NULL,          -- Соответствует теме?
    recommendation TEXT NOT NULL,          -- accept, review, reject
    reason TEXT,                           -- Причина оценки
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_validation_session (session_id),
    INDEX idx_validation_recommendation (recommendation)
);

-- Добавить поля для валидации в pending_companies
ALTER TABLE pending_companies 
ADD COLUMN IF NOT EXISTS validation_result JSONB,
ADD COLUMN IF NOT EXISTS relevance_score INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT NULL;  -- accept, review, reject

-- Таблица для детального логирования процесса обработки
CREATE TABLE IF NOT EXISTS processing_progress (
    progress_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES search_sessions(session_id) ON DELETE CASCADE,
    stage TEXT NOT NULL,                   -- Текущий этап
    step_name TEXT NOT NULL,               -- Название шага
    status TEXT NOT NULL,                  -- pending, in_progress, completed, failed
    progress_percent INTEGER DEFAULT 0,    -- Прогресс 0-100
    current_item INTEGER DEFAULT 0,        -- Текущий элемент
    total_items INTEGER DEFAULT 0,         -- Всего элементов
    message TEXT,                          -- Сообщение о статусе
    details JSONB,                         -- Дополнительные детали
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_progress_session (session_id),
    INDEX idx_progress_status (status),
    INDEX idx_progress_created (created_at DESC)
);

-- Индекс для быстрого получения последнего прогресса сессии
CREATE INDEX IF NOT EXISTS idx_progress_session_updated 
ON processing_progress(session_id, updated_at DESC);

-- Комментарии
COMMENT ON TABLE validation_log IS 'Логирование валидации компаний на соответствие теме';
COMMENT ON TABLE processing_progress IS 'Детальное логирование прогресса обработки в реальном времени';

COMMENT ON COLUMN pending_companies.validation_result IS 'Полный результат валидации (JSON)';
COMMENT ON COLUMN pending_companies.relevance_score IS 'Оценка релевантности 0-100';
COMMENT ON COLUMN pending_companies.validation_status IS 'Рекомендация: accept, review, reject';

COMMENT ON COLUMN processing_progress.progress_percent IS 'Процент выполнения текущего этапа';
COMMENT ON COLUMN processing_progress.current_item IS 'Номер текущего обрабатываемого элемента';
COMMENT ON COLUMN processing_progress.total_items IS 'Общее количество элементов для обработки';

