-- ═══════════════════════════════════════════════════════════════
-- Добавить таблицу api_credits_log
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.api_credits_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES search_sessions(session_id),
  stage VARCHAR(50),
  timestamp TIMESTAMP DEFAULT NOW(),
  tokens_used INTEGER DEFAULT 0,
  cost_usd DECIMAL(10, 6) DEFAULT 0,
  api_provider VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_api_credits_session ON api_credits_log(session_id);
CREATE INDEX IF NOT EXISTS idx_api_credits_timestamp ON api_credits_log(timestamp);

-- Проверка
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'api_credits_log' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ═══════════════════════════════════════════════════════════════
-- Альтернатива: если не хотите создавать таблицу, 
-- можно отключить логирование кредитов в коде
-- ═══════════════════════════════════════════════════════════════

