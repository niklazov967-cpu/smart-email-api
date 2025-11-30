-- Простая миграция: создание UNIQUE индекса
-- Выполнить через Railway dashboard или railway CLI

DROP INDEX IF EXISTS idx_company_name_domain;

CREATE UNIQUE INDEX idx_company_name_domain 
ON pending_companies(company_name, normalized_domain) 
WHERE normalized_domain IS NOT NULL;

COMMENT ON INDEX idx_company_name_domain IS 'Composite UNIQUE: company_name + normalized_domain';

-- Проверка
SELECT 
  COUNT(*) as total_records,
  COUNT(normalized_domain) as records_with_domain,
  ROUND(100.0 * COUNT(normalized_domain) / COUNT(*), 1) as coverage_percent
FROM pending_companies;

