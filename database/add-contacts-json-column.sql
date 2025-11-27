-- Добавить колонку contacts_json в таблицу pending_companies
-- Эта колонка хранит детальную информацию о найденных контактах

ALTER TABLE pending_companies 
ADD COLUMN IF NOT EXISTS contacts_json JSONB;

-- Добавить индекс для быстрого поиска по contacts_json
CREATE INDEX IF NOT EXISTS idx_pending_companies_contacts_json 
ON pending_companies USING GIN (contacts_json);

-- Комментарий к колонке
COMMENT ON COLUMN pending_companies.contacts_json IS 
'JSON с детальной информацией о контактах: emails, contact_page, found_in, note';

