-- Добавить topic_description в pending_companies
-- Это позволит каждой компании иметь ссылку на главную тему сессии

ALTER TABLE pending_companies 
ADD COLUMN IF NOT EXISTS topic_description TEXT;

-- Заполнить topic_description из search_sessions для существующих компаний
UPDATE pending_companies pc
SET topic_description = ss.topic_description
FROM search_sessions ss
WHERE pc.session_id = ss.session_id
  AND pc.topic_description IS NULL;

-- Создать индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_pending_companies_topic ON pending_companies (topic_description);

COMMENT ON COLUMN pending_companies.topic_description IS 'Главная тема поиска (из сессии)';
