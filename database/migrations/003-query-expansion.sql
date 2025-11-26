-- Миграция 003: Таблица для запросов сессии и счетчик кредитов
-- Версия: 1.1.0

-- Таблица для хранения сгенерированных запросов для каждой сессии
CREATE TABLE IF NOT EXISTS session_queries (
    query_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES search_sessions(session_id) ON DELETE CASCADE,
    main_topic TEXT NOT NULL,              -- Основная тема (не изменяется)
    query_cn TEXT NOT NULL,                -- Запрос на китайском
    query_ru TEXT NOT NULL,                -- Перевод на русский
    relevance INTEGER DEFAULT 50,          -- Релевантность 0-100
    is_main BOOLEAN DEFAULT FALSE,         -- Это основная тема?
    is_selected BOOLEAN DEFAULT FALSE,     -- Выбран пользователем?
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Индексы для быстрого поиска
    INDEX idx_session_queries_session (session_id),
    INDEX idx_session_queries_selected (session_id, is_selected)
);

-- Таблица для отслеживания использования API (кредиты Perplexity)
CREATE TABLE IF NOT EXISTS api_credits_log (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES search_sessions(session_id) ON DELETE SET NULL,
    stage TEXT NOT NULL,                   -- На каком этапе был запрос
    request_tokens INTEGER DEFAULT 0,      -- Токены в запросе
    response_tokens INTEGER DEFAULT 0,     -- Токены в ответе
    total_tokens INTEGER DEFAULT 0,        -- Всего токенов
    cost_usd DECIMAL(10, 6) DEFAULT 0,     -- Стоимость в USD
    model_name TEXT,                       -- Модель API
    timestamp TIMESTAMP DEFAULT NOW(),
    
    -- Индексы
    INDEX idx_credits_session (session_id),
    INDEX idx_credits_timestamp (timestamp)
);

-- Добавить поля для отслеживания кредитов в search_sessions
ALTER TABLE search_sessions 
ADD COLUMN IF NOT EXISTS total_cost_usd DECIMAL(10, 4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_requests INTEGER DEFAULT 0;

-- Комментарии к таблицам
COMMENT ON TABLE session_queries IS 'Сгенерированные под-запросы для каждой сессии поиска';
COMMENT ON TABLE api_credits_log IS 'Логирование использования API и подсчет кредитов Perplexity';

COMMENT ON COLUMN session_queries.main_topic IS 'Основная тема поиска (фундаментальная, не изменяется)';
COMMENT ON COLUMN session_queries.query_cn IS 'Сгенерированный запрос на китайском языке';
COMMENT ON COLUMN session_queries.query_ru IS 'Перевод запроса на русский';
COMMENT ON COLUMN session_queries.is_main IS 'TRUE если это основная тема (первый запрос)';
COMMENT ON COLUMN session_queries.is_selected IS 'Выбран пользователем для поиска';

COMMENT ON COLUMN api_credits_log.cost_usd IS 'Стоимость запроса в USD (calculated)';
COMMENT ON COLUMN api_credits_log.total_tokens IS 'Общее количество токенов (request + response)';

