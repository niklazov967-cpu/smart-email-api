-- Очистка данных Stage 4 для всех компаний
-- Убираем validation_score, validation_reason, ai_generated_description, ai_confidence_score
-- Возвращаем stage в зависимости от наличия email/website

UPDATE pending_companies
SET 
  validation_score = NULL,
  validation_reason = NULL,
  ai_generated_description = NULL,
  ai_confidence_score = NULL,
  stage = CASE 
    WHEN email IS NOT NULL AND email != '' THEN 'contacts_found'
    WHEN website IS NOT NULL AND website != '' THEN 'website_found'
    ELSE 'names_found'
  END,
  updated_at = NOW()
WHERE validation_score IS NOT NULL;

-- Вывести результат
SELECT 
  COUNT(*) as total_cleared,
  COUNT(CASE WHEN email IS NOT NULL THEN 1 END) as with_email,
  COUNT(CASE WHEN website IS NOT NULL THEN 1 END) as with_website
FROM pending_companies
WHERE validation_score IS NULL;

