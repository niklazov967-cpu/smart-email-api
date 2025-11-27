-- Добавить поле description в pending_companies для краткого описания из Stage 1
-- Выполните этот SQL в вашем Supabase SQL Editor

-- Добавить колонку description
ALTER TABLE pending_companies 
ADD COLUMN IF NOT EXISTS description TEXT;

-- Добавить комментарий к колонке
COMMENT ON COLUMN pending_companies.description IS 'Краткое описание услуг компании (1-2 предложения) - заполняется в Stage 1';

-- Индекс для full-text поиска по описанию (опционально)
CREATE INDEX IF NOT EXISTS idx_pending_companies_description 
ON pending_companies USING gin(to_tsvector('english', description));

-- Готово!
SELECT 'Description field added successfully!' as status;

