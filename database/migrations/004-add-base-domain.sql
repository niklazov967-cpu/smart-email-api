-- Migration: Add base_domain column to pending_companies
-- Run this SQL in Supabase Dashboard -> SQL Editor

-- Add base_domain column
ALTER TABLE pending_companies 
ADD COLUMN IF NOT EXISTS base_domain TEXT;

-- Add comment
COMMENT ON COLUMN pending_companies.base_domain IS 
'Domain name without TLD (e.g., wayken from wayken.cn) - for TLD-based deduplication';

-- Verify
SELECT 
  COUNT(*) as total,
  COUNT(base_domain) as with_base_domain,
  COUNT(*) - COUNT(base_domain) as without_base_domain
FROM pending_companies;

