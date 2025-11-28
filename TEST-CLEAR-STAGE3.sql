-- ТЕСТИРОВАНИЕ: Очистка Stage 3 для компании 东莞俊英制造有限公司
-- Выполните этот SQL в Supabase SQL Editor

UPDATE pending_companies
SET 
  email = NULL,
  contacts_json = NULL,
  stage3_raw_data = NULL,
  stage = 'website_found',
  updated_at = NOW()
WHERE company_name = '东莞俊英制造有限公司'
  AND session_id = '52d0a83e-dcdd-4754-8b9f-cb7843741395'
RETURNING company_id, company_name, website, email, stage;

