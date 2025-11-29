-- ═══════════════════════════════════════════════════════════════
--  FIX: Добавить недостающие колонки в Supabase таблицы
-- ═══════════════════════════════════════════════════════════════
--  Проблема: таблицы sonar_api_calls и perplexity_cache были
--  созданы вручную без некоторых обязательных колонок
-- ═══════════════════════════════════════════════════════════════

-- 1️⃣ Добавить created_at в sonar_api_calls
ALTER TABLE public.sonar_api_calls 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- 2️⃣ Добавить created_at и updated_at в perplexity_cache
ALTER TABLE public.perplexity_cache 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- ═══════════════════════════════════════════════════════════════
--  ПРОВЕРКА: Посмотреть структуру таблиц после изменений
-- ═══════════════════════════════════════════════════════════════

-- Проверить sonar_api_calls
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'sonar_api_calls' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Проверить perplexity_cache
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'perplexity_cache' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- ═══════════════════════════════════════════════════════════════
--  ОЖИДАЕМЫЙ РЕЗУЛЬТАТ для sonar_api_calls:
-- ═══════════════════════════════════════════════════════════════
--  call_id          | uuid      | gen_random_uuid()
--  session_id       | uuid      | NULL
--  timestamp        | timestamp | NOW()
--  stage            | varchar   | NULL
--  prompt_type      | varchar   | NULL
--  prompt_hash      | varchar   | NULL
--  status           | varchar   | NULL
--  status_code      | integer   | NULL
--  error_message    | text      | NULL
--  tokens_used      | integer   | 0
--  response_time_ms | integer   | NULL
--  cached           | boolean   | false
--  model_used       | varchar   | NULL
--  retry_count      | integer   | 0
--  created_at       | timestamp | NOW()  ← ДОЛЖНА ПОЯВИТЬСЯ!
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
--  ОЖИДАЕМЫЙ РЕЗУЛЬТАТ для perplexity_cache:
-- ═══════════════════════════════════════════════════════════════
--  cache_id         | uuid      | gen_random_uuid()
--  prompt_hash      | varchar   | NULL
--  stage            | varchar   | NULL
--  prompt_text      | text      | NULL
--  response         | text      | NULL
--  response_json    | jsonb     | NULL
--  tokens_used      | integer   | 0
--  expires_at       | timestamp | NULL
--  usage_count      | integer   | 0
--  tokens_saved     | integer   | 0
--  last_used_at     | timestamp | NOW()
--  created_at       | timestamp | NOW()  ← ДОЛЖНА ПОЯВИТЬСЯ!
--  updated_at       | timestamp | NOW()  ← ДОЛЖНА ПОЯВИТЬСЯ!
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- ДОБАВИТЬ website_status В pending_companies
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.pending_companies 
ADD COLUMN IF NOT EXISTS website_status VARCHAR(50);

-- Проверка
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'pending_companies' 
  AND column_name = 'website_status'
  AND table_schema = 'public';

