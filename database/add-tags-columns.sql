-- Добавление колонок для тегов и сервисов в таблицу pending_companies

-- Добавить колонку services (если нет)
ALTER TABLE pending_companies 
ADD COLUMN IF NOT EXISTS services TEXT;

-- Добавить 20 колонок для тегов (если нет)
ALTER TABLE pending_companies 
ADD COLUMN IF NOT EXISTS tag1 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag2 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag3 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag4 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag5 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag6 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag7 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag8 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag9 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag10 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag11 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag12 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag13 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag14 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag15 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag16 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag17 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag18 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag19 VARCHAR(100),
ADD COLUMN IF NOT EXISTS tag20 VARCHAR(100);

-- Создать индексы для быстрого поиска по тегам
CREATE INDEX IF NOT EXISTS idx_pending_companies_tag1 ON pending_companies(tag1);
CREATE INDEX IF NOT EXISTS idx_pending_companies_tag2 ON pending_companies(tag2);
CREATE INDEX IF NOT EXISTS idx_pending_companies_tag3 ON pending_companies(tag3);
CREATE INDEX IF NOT EXISTS idx_pending_companies_services ON pending_companies(services);

-- Вывести успех
SELECT 'Tags columns added successfully!' as result;

