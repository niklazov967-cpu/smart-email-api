# Translation Service Testing Guide

## Overview
This document describes how to test the background translation service.

## Prerequisites
1. Supabase database accessible
2. DeepSeek API key configured
3. At least 5-10 companies with Chinese text in the database

## Step 1: Create translations table

Run the SQL migration:
```sql
-- Execute: database/create-translations-table.sql
```

This creates the `translations` table with proper indexes.

## Step 2: Add default settings

Add these settings to `system_settings` table:
```sql
INSERT INTO system_settings (setting_key, setting_value, description, category)
VALUES 
  ('translation_batch_size', '5', 'Number of companies to translate per batch', 'translation'),
  ('translation_interval_ms', '30000', 'Interval between translation batches (ms)', 'translation'),
  ('translation_enabled', 'true', 'Enable/disable background translation', 'translation'),
  ('deepseek_model_translation', 'deepseek-chat', 'DeepSeek model for translation', 'translation')
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value;
```

## Step 3: Test Translation API Endpoints

### 3.1 Check Translation Stats
```bash
curl http://localhost:3030/api/translations/stats
```

Expected response:
```json
{
  "success": true,
  "stats": {
    "totalCompanies": 10,
    "translatedCompanies": 0,
    "totalTranslations": 0,
    "pending": 0,
    "completed": 0,
    "failed": 0
  }
}
```

### 3.2 Trigger Manual Translation
```bash
curl -X POST http://localhost:3030/api/translations/trigger \
  -H "Content-Type: application/json" \
  -d '{"companyId": "YOUR_COMPANY_ID"}'
```

Expected response:
```json
{
  "success": true,
  "message": "Translation started",
  "companyId": "..."
}
```

### 3.3 Check Company Translations
```bash
curl http://localhost:3030/api/translations/YOUR_COMPANY_ID
```

Expected response:
```json
{
  "success": true,
  "companyId": "...",
  "count": 5,
  "translations": [
    {
      "field_name": "company_name",
      "original_text": "深圳精密制造有限公司",
      "translated_text": "Шэньчжэньская компания точного производства",
      "translation_status": "completed",
      "translated_at": "2025-11-28T..."
    },
    ...
  ]
}
```

## Step 4: Test Background Worker

### 4.1 Start the worker
```bash
npm run translate:start
```

OR

```bash
./scripts/start-translation-worker.sh
```

Expected output:
```
🚀 Translation Worker starting...
✅ Database connected
📝 Settings loaded { batchSize: 5, intervalMs: 30000, enabled: true }
✅ Translation Service initialized
✅ Translation Worker ready
▶️ Translation Worker started
🔄 Cycle #1 - Looking for companies to translate...
📋 Found 5 companies to translate
🌐 Translating company 1/5...
✅ Company translated { translated: 8, skipped: 2, failed: 0 }
...
```

### 4.2 Monitor logs
Watch the worker logs for:
- Cycle count increasing
- Companies being processed
- Translations succeeding/failing
- Statistics updates

### 4.3 Stop the worker
```bash
npm run translate:stop
```

OR press `Ctrl+C`

## Step 5: Test UI Integration

### 5.1 Open results page
```
http://localhost:3030/results.html
```

### 5.2 Check translation badges
- Companies with translations should show "✓ RU" badge next to name
- Badge colors:
  - Green (✓ RU) = completed
  - Yellow (⏳) = pending
  - Red (❌) = failed

### 5.3 View company details
1. Click "👁️" (eye icon) to open company modal
2. Check for:
   - Translation button if no translations exist
   - Bilingual display (🇨🇳 / 🇷🇺) for translated fields
   - Company name, description, services, tags all shown in both languages

### 5.4 Trigger manual translation
1. Click "🌐 Перевести" button in modal
2. Wait for confirmation
3. Refresh page after 30-60 seconds
4. Check if translations appear

## Expected Results

### Translation Quality
- Technical terms preserved (CNC, CAD, CAM, etc.)
- Chinese company names transliterated
- Service descriptions accurately translated
- Tags remain concise

### Performance
- ~1.5 seconds per field translation
- Batch of 5 companies takes ~1-2 minutes
- No impact on main API server

### Error Handling
- Failed translations marked in database
- Worker continues after errors
- Retry logic for API failures

## Common Issues

### Issue: Worker not starting
- Check DeepSeek API key in .env
- Check Supabase connection
- Check settings table has translation_enabled=true

### Issue: Translations not appearing
- Check worker logs for errors
- Check translations table for records
- Verify company_id matches

### Issue: Translation quality poor
- Adjust prompt in DeepSeekClient.translate()
- Try different DeepSeek model (deepseek-reasoner)
- Increase max_tokens if translations truncated

## Manual Cleanup

To reset translations for testing:
```sql
DELETE FROM translations WHERE company_id = 'YOUR_COMPANY_ID';
```

To reset all translations:
```sql
TRUNCATE TABLE translations;
```

## Success Criteria

✅ Translations table created successfully
✅ API endpoints return valid responses
✅ Background worker starts and processes companies
✅ Translations saved to database
✅ UI displays translation badges and bilingual text
✅ Manual translation trigger works
✅ Worker handles errors gracefully
✅ No performance impact on main server

