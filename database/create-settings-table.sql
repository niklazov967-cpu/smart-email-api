-- Создание таблицы settings для хранения настроек системы
-- Выполните этот SQL в Supabase SQL Editor

-- Таблица settings (Хранилище настроек)
CREATE TABLE IF NOT EXISTS public.settings (
  setting_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(100) NOT NULL,
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT,
  setting_type VARCHAR(20) NOT NULL CHECK (setting_type IN ('string', 'integer', 'float', 'boolean', 'json')),
  default_value TEXT,
  description TEXT,
  is_editable BOOLEAN DEFAULT true,
  require_restart BOOLEAN DEFAULT false,
  validation_rules JSONB,
  changed_by VARCHAR(200),
  changed_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(category, setting_key)
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_settings_category_key ON public.settings(category, setting_key);
CREATE INDEX IF NOT EXISTS idx_settings_category ON public.settings(category);
CREATE INDEX IF NOT EXISTS idx_settings_changed_at ON public.settings(changed_at);
CREATE INDEX IF NOT EXISTS idx_settings_editable ON public.settings(is_editable);

-- Комментарий к таблице
COMMENT ON TABLE public.settings IS 'Хранилище всех настроек системы';

-- Проверка что таблица создана
SELECT 
  column_name, 
  data_type, 
  column_default
FROM information_schema.columns
WHERE table_name = 'settings' AND table_schema = 'public'
ORDER BY ordinal_position;

