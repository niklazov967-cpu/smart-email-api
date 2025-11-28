# Translation Service Quick Start

## 🚀 What is this?

Background service that automatically translates Chinese company data to Russian using DeepSeek API.

## 📋 Quick Setup (3 steps)

### 1. Create Database Table
```bash
# In Supabase SQL Editor, run:
database/create-translations-table.sql
database/add-translation-settings.sql
```

### 2. Start Background Worker
```bash
npm run translate:start
```

### 3. View Translations
Open `http://localhost:3030/results.html` - companies with translations show "✓ RU" badge

## 🎯 How It Works

```
Every 30 seconds:
1. Worker finds 5 companies without translations
2. Translates each field (name, description, services, tags)
3. Saves to translations table
4. Repeats

Cost: ~$0.001 per company (very cheap!)
Speed: ~1-2 minutes per company
```

## 🔧 Manual Translation

Want to translate specific company now?

1. Open results.html
2. Click 👁️ on company
3. Click "🌐 Перевести"
4. Wait 1-2 minutes
5. Refresh page

## 📊 Check Progress

```bash
# Statistics
curl http://localhost:3030/api/translations/stats

# View translations for company
curl http://localhost:3030/api/translations/COMPANY_ID
```

## ⚙️ Configuration

Edit in Supabase `system_settings` table:

- `translation_enabled` - true/false
- `translation_batch_size` - companies per batch (default: 5)
- `translation_interval_ms` - time between batches (default: 30000)

## 🛑 Stop Worker

```bash
npm run translate:stop
```

OR press `Ctrl+C`

## 📖 Full Documentation

- `TRANSLATION-SERVICE-SUMMARY.md` - Complete implementation details
- `TRANSLATION-SERVICE-TESTING.md` - Testing guide

## ❓ Troubleshooting

**Worker won't start?**
- Check DeepSeek API key in `.env`
- Check Supabase connection
- Run migrations first

**No translations appearing?**
- Check worker logs for errors
- Verify `translation_enabled = true` in settings
- Check translations table in Supabase

**Translation quality issues?**
- Technical terms are preserved (CNC, CAD, etc.)
- If poor, check DeepSeekClient.translate() prompt
- Try `deepseek-reasoner` model for better quality

## ✅ Success Indicators

- Worker logs show "✅ Company translated"
- Stats show increasing `completed` count
- Results page shows "✓ RU" badges
- Company modals show 🇨🇳 and 🇷🇺 text

---

**That's it!** Translation runs in background, no impact on main app. 🎉

