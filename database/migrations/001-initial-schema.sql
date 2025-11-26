-- Миграция 001: Основные таблицы системы
-- Создание расширений
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Таблица search_sessions (Сессии поиска и обработки)
CREATE TABLE IF NOT EXISTS search_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date TIMESTAMP DEFAULT NOW(),
  search_query TEXT NOT NULL,
  target_count INTEGER DEFAULT 50,
  priority VARCHAR(20) DEFAULT 'balanced' CHECK (priority IN ('fast', 'balanced', 'quality')),
  queries_processed INTEGER DEFAULT 0,
  queries_total INTEGER DEFAULT 0,
  companies_found INTEGER DEFAULT 0,
  companies_analyzed INTEGER DEFAULT 0,
  companies_added INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  websites_unavailable INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  perplexity_api_calls INTEGER DEFAULT 0,
  perplexity_tokens_used INTEGER DEFAULT 0,
  cache_hits INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'failed', 'cancelled')),
  total_processing_time_minutes INTEGER DEFAULT 0,
  start_time TIMESTAMP DEFAULT NOW(),
  end_time TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Таблица pending_companies (Компании на обработку)
CREATE TABLE IF NOT EXISTS pending_companies (
  pending_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES search_sessions(session_id) ON DELETE CASCADE,
  company_name VARCHAR(500) NOT NULL,
  company_name_pinyin VARCHAR(500),
  stage VARCHAR(50) DEFAULT 'names_found' CHECK (stage IN ('names_found', 'website_found', 'site_analyzed', 'tags_extracted', 'completed', 'failed')),
  website VARCHAR(500),
  website_status VARCHAR(50) DEFAULT 'pending',
  email VARCHAR(200),
  email_found BOOLEAN DEFAULT false,
  data_json JSONB,
  attempts INTEGER DEFAULT 0,
  last_attempt_time TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Таблица processed_websites (Проанализированные сайты)
CREATE TABLE IF NOT EXISTS processed_websites (
  website_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_company_id UUID REFERENCES pending_companies(pending_id),
  company_name VARCHAR(500),
  website_url VARCHAR(500) UNIQUE NOT NULL,
  primary_email VARCHAR(200),
  alternative_emails TEXT[],
  phone VARCHAR(50),
  phone_local VARCHAR(50),
  wechat VARCHAR(100),
  whatsapp VARCHAR(50),
  contact_page_url VARCHAR(500),
  company_name_english VARCHAR(500),
  raw_analysis_json JSONB,
  analysis_date TIMESTAMP DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'success' CHECK (status IN ('success', 'no_email', 'unavailable', 'error')),
  sonar_confidence FLOAT DEFAULT 0.0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Таблица company_records (Финальные записи компаний)
CREATE TABLE IF NOT EXISTS company_records (
  record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES search_sessions(session_id),
  company_name_ru VARCHAR(500),
  company_name_cn VARCHAR(500) NOT NULL,
  company_name_en VARCHAR(500),
  website VARCHAR(500),
  email VARCHAR(200) UNIQUE NOT NULL,
  phone VARCHAR(50),
  wechat VARCHAR(100),
  whatsapp VARCHAR(50),
  
  -- Теги (до 20 штук)
  tag1 VARCHAR(100),
  tag2 VARCHAR(100),
  tag3 VARCHAR(100),
  tag4 VARCHAR(100),
  tag5 VARCHAR(100),
  tag6 VARCHAR(100),
  tag7 VARCHAR(100),
  tag8 VARCHAR(100),
  tag9 VARCHAR(100),
  tag10 VARCHAR(100),
  tag11 VARCHAR(100),
  tag12 VARCHAR(100),
  tag13 VARCHAR(100),
  tag14 VARCHAR(100),
  tag15 VARCHAR(100),
  tag16 VARCHAR(100),
  tag17 VARCHAR(100),
  tag18 VARCHAR(100),
  tag19 VARCHAR(100),
  tag20 VARCHAR(100),
  
  -- Дополнительная информация
  services TEXT[],
  materials TEXT[],
  equipment TEXT[],
  technologies TEXT[],
  certifications TEXT[],
  specialization TEXT,
  description TEXT,
  production_scale VARCHAR(100),
  quality_score INTEGER DEFAULT 5 CHECK (quality_score >= 1 AND quality_score <= 10),
  
  -- Мета-данные
  date_added TIMESTAMP DEFAULT NOW(),
  source_query TEXT,
  raw_sonar_data JSONB,
  confidence_score FLOAT DEFAULT 0.0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Таблица unique_emails (Уникальные email для проверки дубликатов)
CREATE TABLE IF NOT EXISTS unique_emails (
  email_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_address VARCHAR(200) UNIQUE NOT NULL,
  company_record_id UUID REFERENCES company_records(record_id),
  first_seen TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Таблица perplexity_cache (Кеш Sonar результатов)
CREATE TABLE IF NOT EXISTS perplexity_cache (
  cache_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_hash VARCHAR(64) UNIQUE NOT NULL,
  stage VARCHAR(50) NOT NULL,
  prompt_text TEXT,
  response TEXT NOT NULL,
  response_json JSONB,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  usage_count INTEGER DEFAULT 0,
  tokens_saved INTEGER DEFAULT 0,
  last_used_at TIMESTAMP DEFAULT NOW()
);

-- Таблица sonar_api_calls (История вызовов Sonar)
CREATE TABLE IF NOT EXISTS sonar_api_calls (
  call_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES search_sessions(session_id),
  timestamp TIMESTAMP DEFAULT NOW(),
  stage VARCHAR(50),
  prompt_type VARCHAR(100),
  prompt_hash VARCHAR(64),
  status VARCHAR(50) CHECK (status IN ('success', 'rate_limited', 'error', 'timeout')),
  http_status INTEGER,
  tokens_used INTEGER DEFAULT 0,
  response_time_ms INTEGER,
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  from_cache BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Таблица processing_logs (Логирование обработки)
CREATE TABLE IF NOT EXISTS processing_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP DEFAULT NOW(),
  session_id UUID REFERENCES search_sessions(session_id),
  event_type VARCHAR(100) NOT NULL,
  level VARCHAR(20) DEFAULT 'INFO' CHECK (level IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')),
  data_json JSONB,
  status VARCHAR(50),
  message TEXT,
  sonar_related BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_search_sessions_status ON search_sessions(status);
CREATE INDEX IF NOT EXISTS idx_search_sessions_created_at ON search_sessions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pending_companies_session ON pending_companies(session_id);
CREATE INDEX IF NOT EXISTS idx_pending_companies_stage ON pending_companies(stage);
CREATE INDEX IF NOT EXISTS idx_pending_companies_email ON pending_companies(email);

CREATE INDEX IF NOT EXISTS idx_processed_websites_url ON processed_websites(website_url);
CREATE INDEX IF NOT EXISTS idx_processed_websites_email ON processed_websites(primary_email);

CREATE INDEX IF NOT EXISTS idx_company_records_session ON company_records(session_id);
CREATE INDEX IF NOT EXISTS idx_company_records_email ON company_records(email);
CREATE INDEX IF NOT EXISTS idx_company_records_created_at ON company_records(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_unique_emails_address ON unique_emails(email_address);

CREATE INDEX IF NOT EXISTS idx_perplexity_cache_hash ON perplexity_cache(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_perplexity_cache_expires ON perplexity_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_perplexity_cache_stage ON perplexity_cache(stage);

CREATE INDEX IF NOT EXISTS idx_sonar_api_calls_session ON sonar_api_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_sonar_api_calls_timestamp ON sonar_api_calls(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sonar_api_calls_status ON sonar_api_calls(status);

CREATE INDEX IF NOT EXISTS idx_processing_logs_session ON processing_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_processing_logs_timestamp ON processing_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_processing_logs_level ON processing_logs(level);

-- Триггеры для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_search_sessions_updated_at BEFORE UPDATE ON search_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pending_companies_updated_at BEFORE UPDATE ON pending_companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_company_records_updated_at BEFORE UPDATE ON company_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

