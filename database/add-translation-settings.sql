-- Add translation settings to system_settings table
-- Run this after creating the translations table

INSERT INTO system_settings (setting_key, setting_value, description, category)
VALUES 
  ('translation_batch_size', '5', 'Number of companies to translate per batch', 'translation'),
  ('translation_interval_ms', '30000', 'Interval between translation batches (ms)', 'translation'),
  ('translation_enabled', 'true', 'Enable/disable background translation', 'translation'),
  ('deepseek_model_translation', 'deepseek-chat', 'DeepSeek model for translation', 'translation')
ON CONFLICT (setting_key) DO UPDATE
SET 
  setting_value = EXCLUDED.setting_value,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

-- Verify settings were added
SELECT * FROM system_settings WHERE category = 'translation';

