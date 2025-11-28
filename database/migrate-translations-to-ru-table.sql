-- Миграция данных из translations в pending_companies_ru
-- Выполните этот SQL после создания таблицы pending_companies_ru

-- ШАГ 1: Создать записи для всех компаний с переводами
INSERT INTO pending_companies_ru (company_id, translation_status)
SELECT DISTINCT company_id, 'pending'
FROM translations
ON CONFLICT (company_id) DO NOTHING;

-- ШАГ 2: Заполнить переведенные поля
UPDATE pending_companies_ru ru
SET 
  company_name_ru = (
    SELECT translated_text FROM translations 
    WHERE company_id = ru.company_id 
      AND field_name = 'company_name' 
      AND translation_status = 'completed'
    LIMIT 1
  ),
  description_ru = (
    SELECT translated_text FROM translations 
    WHERE company_id = ru.company_id 
      AND field_name = 'description'
      AND translation_status = 'completed'
    LIMIT 1
  ),
  ai_generated_description_ru = (
    SELECT translated_text FROM translations 
    WHERE company_id = ru.company_id 
      AND field_name = 'ai_generated_description'
      AND translation_status = 'completed'
    LIMIT 1
  ),
  services_ru = (
    SELECT translated_text FROM translations 
    WHERE company_id = ru.company_id 
      AND field_name = 'services'
      AND translation_status = 'completed'
    LIMIT 1
  ),
  validation_reason_ru = (
    SELECT translated_text FROM translations 
    WHERE company_id = ru.company_id 
      AND field_name = 'validation_reason'
      AND translation_status = 'completed'
    LIMIT 1
  ),
  -- Теги
  tag1_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag1' AND translation_status = 'completed' LIMIT 1),
  tag2_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag2' AND translation_status = 'completed' LIMIT 1),
  tag3_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag3' AND translation_status = 'completed' LIMIT 1),
  tag4_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag4' AND translation_status = 'completed' LIMIT 1),
  tag5_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag5' AND translation_status = 'completed' LIMIT 1),
  tag6_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag6' AND translation_status = 'completed' LIMIT 1),
  tag7_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag7' AND translation_status = 'completed' LIMIT 1),
  tag8_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag8' AND translation_status = 'completed' LIMIT 1),
  tag9_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag9' AND translation_status = 'completed' LIMIT 1),
  tag10_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag10' AND translation_status = 'completed' LIMIT 1),
  tag11_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag11' AND translation_status = 'completed' LIMIT 1),
  tag12_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag12' AND translation_status = 'completed' LIMIT 1),
  tag13_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag13' AND translation_status = 'completed' LIMIT 1),
  tag14_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag14' AND translation_status = 'completed' LIMIT 1),
  tag15_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag15' AND translation_status = 'completed' LIMIT 1),
  tag16_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag16' AND translation_status = 'completed' LIMIT 1),
  tag17_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag17' AND translation_status = 'completed' LIMIT 1),
  tag18_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag18' AND translation_status = 'completed' LIMIT 1),
  tag19_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag19' AND translation_status = 'completed' LIMIT 1),
  tag20_ru = (SELECT translated_text FROM translations WHERE company_id = ru.company_id AND field_name = 'tag20' AND translation_status = 'completed' LIMIT 1),
  
  -- Метаданные
  translated_at = (
    SELECT MAX(translated_at) 
    FROM translations 
    WHERE company_id = ru.company_id
  ),
  updated_at = NOW();

-- ШАГ 3: Определить статус перевода (completed/partial)
UPDATE pending_companies_ru ru
SET translation_status = CASE
  -- Если переведены основные поля (company_name + минимум 3 из description/services/tags)
  WHEN (
    SELECT COUNT(*) 
    FROM translations 
    WHERE company_id = ru.company_id 
      AND translation_status = 'completed'
      AND field_name IN ('company_name', 'description', 'ai_generated_description', 'services', 'tag1', 'tag2', 'tag3')
  ) >= 4 THEN 'completed'
  
  -- Если есть хотя бы один переведенный текст
  WHEN (
    SELECT COUNT(*) 
    FROM translations 
    WHERE company_id = ru.company_id 
      AND translation_status = 'completed'
  ) > 0 THEN 'partial'
  
  -- Иначе pending
  ELSE 'pending'
END;

-- ШАГ 4: Проверка результатов миграции
SELECT 
  'Migration completed!' as status,
  COUNT(*) as total_records,
  SUM(CASE WHEN translation_status = 'completed' THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN translation_status = 'partial' THEN 1 ELSE 0 END) as partial,
  SUM(CASE WHEN translation_status = 'pending' THEN 1 ELSE 0 END) as pending
FROM pending_companies_ru;

