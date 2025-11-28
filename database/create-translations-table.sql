-- Create translations table for storing Russian translations of Chinese company data
-- This table stores translations separately to avoid blocking the main processing flow

CREATE TABLE IF NOT EXISTS translations (
  translation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES pending_companies(company_id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  original_text TEXT NOT NULL,
  translated_text TEXT,
  translation_status TEXT DEFAULT 'pending' CHECK (translation_status IN ('pending', 'completed', 'failed')),
  translated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Ensure one translation per company per field
  CONSTRAINT unique_company_field UNIQUE (company_id, field_name)
);

-- Index for finding pending translations
CREATE INDEX IF NOT EXISTS idx_translations_status ON translations(translation_status);

-- Index for finding translations by company
CREATE INDEX IF NOT EXISTS idx_translations_company ON translations(company_id);

-- Index for finding translations by field
CREATE INDEX IF NOT EXISTS idx_translations_field ON translations(field_name);

-- Composite index for efficient queries
CREATE INDEX IF NOT EXISTS idx_translations_company_status ON translations(company_id, translation_status);

-- Add comment for documentation
COMMENT ON TABLE translations IS 'Stores Russian translations of Chinese company data fields';
COMMENT ON COLUMN translations.field_name IS 'Field name from pending_companies table (company_name, description, services, tag1-tag20, etc.)';
COMMENT ON COLUMN translations.translation_status IS 'Translation status: pending, completed, failed';
COMMENT ON COLUMN translations.retry_count IS 'Number of translation attempts for failed translations';

