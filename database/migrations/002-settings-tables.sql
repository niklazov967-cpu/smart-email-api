-- Миграция 002: Таблицы настроек и истории изменений

-- Таблица settings (Хранилище настроек)
CREATE TABLE IF NOT EXISTS settings (
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

-- Таблица settings_history (История изменений настроек)
CREATE TABLE IF NOT EXISTS settings_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_id UUID REFERENCES settings(setting_id) ON DELETE CASCADE,
  setting_key VARCHAR(100) NOT NULL,
  category VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by VARCHAR(200),
  changed_at TIMESTAMP DEFAULT NOW(),
  reason TEXT,
  reverted_by VARCHAR(200),
  reverted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_settings_category_key ON settings(category, setting_key);
CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);
CREATE INDEX IF NOT EXISTS idx_settings_changed_at ON settings(changed_at);
CREATE INDEX IF NOT EXISTS idx_settings_editable ON settings(is_editable);

CREATE INDEX IF NOT EXISTS idx_settings_history_setting_id ON settings_history(setting_id);
CREATE INDEX IF NOT EXISTS idx_settings_history_changed_at ON settings_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_settings_history_category ON settings_history(category);

-- Комментарии к таблицам
COMMENT ON TABLE settings IS 'Хранилище всех настроек системы (117 параметров)';
COMMENT ON TABLE settings_history IS 'История всех изменений настроек для аудита';

