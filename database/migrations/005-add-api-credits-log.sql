-- Миграция: Создание таблицы для логирования расходов на API
-- Версия: 005 (для v3.0.0)
-- Дата: 2024-12-03

-- Таблица для хранения всех API вызовов
CREATE TABLE IF NOT EXISTS api_credits_log (
    id BIGSERIAL PRIMARY KEY,
    
    -- Время вызова
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Сервис и модель
    service VARCHAR(50) NOT NULL,           -- 'deepseek', 'perplexity'
    model_name VARCHAR(100) NOT NULL,       -- 'deepseek-chat', 'sonar', 'sonar-pro' и т.д.
    
    -- Контекст вызова
    stage VARCHAR(100),                     -- 'stage1', 'stage2', 'stage3', 'query_generation' и т.д.
    session_id UUID,                        -- ID сессии (если есть)
    company_id UUID,                        -- ID компании (если есть)
    
    -- Метрики для LLM (DeepSeek, Perplexity)
    request_tokens INTEGER DEFAULT 0,       -- Входящие токены
    response_tokens INTEGER DEFAULT 0,      -- Исходящие токены
    total_tokens INTEGER DEFAULT 0,         -- Всего токенов
    
    -- Стоимость
    cost_usd DECIMAL(12, 8) NOT NULL DEFAULT 0,  -- Стоимость в USD (до 8 знаков после запятой)
    
    -- Дополнительная информация
    metadata JSONB DEFAULT '{}'             -- Любые дополнительные данные
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_api_credits_log_created_at ON api_credits_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_credits_log_service ON api_credits_log(service);
CREATE INDEX IF NOT EXISTS idx_api_credits_log_stage ON api_credits_log(stage);
CREATE INDEX IF NOT EXISTS idx_api_credits_log_session_id ON api_credits_log(session_id);
CREATE INDEX IF NOT EXISTS idx_api_credits_log_date ON api_credits_log(DATE(created_at));

-- Комментарии к таблице
COMMENT ON TABLE api_credits_log IS 'Лог всех API вызовов с расходами (v3.0)';
COMMENT ON COLUMN api_credits_log.service IS 'Сервис: deepseek, perplexity';
COMMENT ON COLUMN api_credits_log.model_name IS 'Модель: deepseek-chat, sonar, sonar-pro';
COMMENT ON COLUMN api_credits_log.stage IS 'Этап обработки: stage1, stage2, stage3, query_generation';
COMMENT ON COLUMN api_credits_log.cost_usd IS 'Стоимость вызова в USD';

