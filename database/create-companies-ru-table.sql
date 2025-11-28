-- Создание таблицы pending_companies_ru
-- Таблица-зеркало для хранения русских переводов китайских данных

CREATE TABLE IF NOT EXISTS pending_companies_ru (
  company_id UUID PRIMARY KEY REFERENCES pending_companies(company_id) ON DELETE CASCADE,
  
  -- Переведенные текстовые поля
  company_name_ru TEXT,
  description_ru TEXT,
  ai_generated_description_ru TEXT,
  services_ru TEXT,
  validation_reason_ru TEXT,
  
  -- Теги на русском (tag1_ru...tag20_ru)
  tag1_ru VARCHAR(100),
  tag2_ru VARCHAR(100),
  tag3_ru VARCHAR(100),
  tag4_ru VARCHAR(100),
  tag5_ru VARCHAR(100),
  tag6_ru VARCHAR(100),
  tag7_ru VARCHAR(100),
  tag8_ru VARCHAR(100),
  tag9_ru VARCHAR(100),
  tag10_ru VARCHAR(100),
  tag11_ru VARCHAR(100),
  tag12_ru VARCHAR(100),
  tag13_ru VARCHAR(100),
  tag14_ru VARCHAR(100),
  tag15_ru VARCHAR(100),
  tag16_ru VARCHAR(100),
  tag17_ru VARCHAR(100),
  tag18_ru VARCHAR(100),
  tag19_ru VARCHAR(100),
  tag20_ru VARCHAR(100),
  
  -- Метаданные перевода
  translation_status VARCHAR(20) DEFAULT 'pending' 
    CHECK (translation_status IN ('pending', 'completed', 'partial', 'failed')),
  translated_at TIMESTAMPTZ,
  translation_error TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индекс для быстрого поиска по статусу перевода
CREATE INDEX IF NOT EXISTS idx_companies_ru_status 
  ON pending_companies_ru(translation_status);

-- Комментарии к таблице
COMMENT ON TABLE pending_companies_ru IS 
  'Таблица-зеркало для хранения русских переводов данных из pending_companies';

COMMENT ON COLUMN pending_companies_ru.translation_status IS 
  'Статус перевода: pending (создан), partial (частично переведен), completed (полностью переведен), failed (ошибка)';

-- Успешное создание
SELECT 'Table pending_companies_ru created successfully!' as status;

