-- Скрипт для очистки Stage 3 данных для компании 东莞俊英制造有限公司
-- Это позволит Stage 3 обработать её заново с новой логикой

UPDATE pending_companies
SET 
  email = NULL,
  contacts_json = NULL,
  stage3_raw_data = NULL,
  stage = 'website_found',  -- Вернуть к стадии после Stage 2
  updated_at = NOW()
WHERE company_name = '东莞俊英制造有限公司'
  AND session_id = '52d0a83e-dcdd-4754-8b9f-cb7843741395';

