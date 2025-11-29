-- ═══════════════════════════════════════════════════════════════
-- FIX: Добавить недостающие колонки в api_credits_log
-- ═══════════════════════════════════════════════════════════════
--  Проблема: таблица создана с упрощенной структурой
--  Код ожидает: request_tokens, response_tokens, total_tokens, model_name
--  Есть в БД: tokens_used, api_provider
-- ═══════════════════════════════════════════════════════════════

-- 1️⃣ Добавить недостающие колонки для токенов
ALTER TABLE public.api_credits_log 
ADD COLUMN IF NOT EXISTS request_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS response_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0;

-- 2️⃣ Добавить model_name (показывает какая нейросеть работает!)
ALTER TABLE public.api_credits_log 
ADD COLUMN IF NOT EXISTS model_name TEXT;

-- 3️⃣ Опционально: можно переименовать api_provider в model_name
-- (если хотите заменить вместо добавления)
-- ALTER TABLE public.api_credits_log 
-- RENAME COLUMN api_provider TO model_name;

-- 4️⃣ Опционально: можно удалить tokens_used (заменили на request/response/total)
-- ALTER TABLE public.api_credits_log 
-- DROP COLUMN IF EXISTS tokens_used;

-- ═══════════════════════════════════════════════════════════════
--  ПРОВЕРКА: Посмотреть структуру таблицы после изменений
-- ═══════════════════════════════════════════════════════════════

SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'api_credits_log' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- ═══════════════════════════════════════════════════════════════
--  ОЖИДАЕМЫЕ КОЛОНКИ ПОСЛЕ ИСПРАВЛЕНИЯ:
-- ═══════════════════════════════════════════════════════════════
--  log_id              UUID (PRIMARY KEY)
--  session_id          UUID (REFERENCES search_sessions)
--  stage               VARCHAR(50)
--  timestamp           TIMESTAMP
--  tokens_used         INTEGER (можно удалить)
--  cost_usd            DECIMAL(10, 6)
--  api_provider        VARCHAR(50) (можно удалить)
--  created_at          TIMESTAMP
--  request_tokens      INTEGER  ← ДОБАВИЛИ
--  response_tokens     INTEGER  ← ДОБАВИЛИ
--  total_tokens        INTEGER  ← ДОБАВИЛИ
--  model_name          TEXT     ← ДОБАВИЛИ (для статистики!)
-- ═══════════════════════════════════════════════════════════════

