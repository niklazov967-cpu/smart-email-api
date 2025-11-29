# 🎉 VERSION 2.0 - FINAL RELEASE

**Release Date:** November 29, 2025  
**Codename:** Analytics & Optimization

---

## 🎯 Major Features

### 1. 📊 API Statistics & Cost Tracking

**New Page:** `api-stats.html`

A comprehensive analytics dashboard for monitoring API costs and usage:

- **Summary Cards:**
  - Total cost (USD)
  - Total tokens used
  - Total API calls
  - Average cost per call

- **Interactive Charts:**
  - Bar chart: Cost breakdown by stage (Stage 1-4)
  - Bar chart: Cost breakdown by AI model (Sonar, DeepSeek)

- **Detailed Logs Table:**
  - Timestamp
  - Processing stage
  - AI model used
  - Request/Response/Total tokens
  - Cost per call (USD)
  - Pagination (50 records per page)

- **Advanced Filters:**
  - Filter by stage (Stage 1-4, Query Generation)
  - Filter by model (Sonar, Sonar Pro, DeepSeek Chat, DeepSeek Reasoner)
  - Filter by date range (from/to)
  - Reset filters button

- **Export:**
  - Export to CSV for Excel analysis
  - Preserves all filtering

**New API Endpoints:**
- `GET /api/credits/logs` - Retrieve all API call logs
- `GET /api/credits/summary` - Get aggregated statistics
- `DELETE /api/credits/logs` - Clear all logs (testing)

---

### 2. 🗄️ Database Schema Fixes

**Fixed Tables:**

#### `system_settings`
- Application now correctly uses `system_settings` table (was trying to use non-existent `settings` table)
- Fixed `SettingsManager.js` to use correct table and column names (`key` instead of `setting_key`, `value` instead of `setting_value`)

#### `api_credits_log`
- Added missing columns for detailed token tracking:
  - `request_tokens` (INTEGER) - Tokens in request
  - `response_tokens` (INTEGER) - Tokens in response
  - `total_tokens` (INTEGER) - Total tokens used
  - `model_name` (TEXT) - AI model identifier (e.g., "sonar-pro", "deepseek-chat")

**Migration Script:** `database/fix-api-credits-log.sql`

---

### 3. 🎨 UI/UX Improvements

#### Removed Unnecessary Pages
- **Deleted:** `public/dashboard.html` ("Единая панель управления")
  - Reason: Redundant with main step-by-step page
  - Updated all links pointing to it

#### Compact Tags Display
- **File:** `public/results.html`
- **Changes:**
  - Limited tags display to **3 tags per company** in table view
  - Tags now display on **single line** (no wrapping)
  - CSS: `flex-wrap: nowrap`, `overflow: hidden`
  - All 20 tags still visible in detail modal (👁️ button)
  - Result: Cleaner, more compact table layout

#### Navigation Updates
- Added **"📊 API Расходы"** button to main page header
- Updated `results.html` back button to point to `index.html` (instead of deleted dashboard)

---

### 4. 🔧 Backend Optimizations

**New Router:** `src/routes/credits.js`
- Handles all `/api/credits/*` endpoints
- Uses `SupabaseClient` for database operations
- Proper error handling and logging

**Fixed Files:**
- `src/app.js` - Integrated credits router
- `src/services/SettingsManager.js` - Fixed table references
- `src/app-simple.js` - Fixed settings upsert logic

---

## 📦 Files Changed

### Added
```
public/api-stats.html                  - API statistics dashboard
src/routes/credits.js                   - Credits API routes
database/fix-api-credits-log.sql        - Migration for api_credits_log
CHANGELOG-v2.0.md                       - This file
```

### Deleted
```
public/dashboard.html                   - Redundant unified control panel
```

### Modified
```
package.json                            - Version bump to 2.0.0
src/app.js                              - Added credits router
src/app-simple.js                       - Fixed system_settings usage
src/services/SettingsManager.js         - Fixed table/column names
public/index.html                       - Added API stats button
public/results.html                     - Limited tags to 3, single line
```

---

## 💡 Key Capabilities

### For Users
✅ **Full transparency** of API costs  
✅ **Model comparison** - See which AI model is cheaper (Perplexity vs DeepSeek)  
✅ **Stage analysis** - Identify most expensive processing stages  
✅ **Export data** - Download logs for external analysis  
✅ **Real-time tracking** - Monitor each API call as it happens  
✅ **Clean UI** - Compact results table without tag overflow  

### For Developers
✅ **Proper database schema** - No more missing columns  
✅ **Correct table references** - system_settings integration  
✅ **Detailed logging** - Track request/response tokens separately  
✅ **Model identification** - Know exactly which AI processed each request  
✅ **RESTful API** - Easy integration with external tools  

---

## 📊 Statistics

**Changes from v1.10.0:**
- Commits: 2
- Files Created: 4
- Files Deleted: 1
- Files Modified: 7
- Lines Added: +1,441
- Lines Removed: -639
- Net Change: +802 lines

---

## 🚀 Deployment

**Railway:**
- Automatically deploys on push to `main`
- No configuration changes required
- Worker process for translation still supported via `Procfile`

**Database Migration:**
User must manually execute `database/fix-api-credits-log.sql` in Supabase SQL Editor:
```sql
ALTER TABLE public.api_credits_log 
ADD COLUMN IF NOT EXISTS request_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS response_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS model_name TEXT;
```

---

## 🐛 Bug Fixes

1. **Settings Table Not Found**
   - **Issue:** Application tried to use non-existent `settings` table
   - **Fix:** Updated all references to use existing `system_settings` table
   - **Files:** `src/services/SettingsManager.js`, `src/app.js`, `src/app-simple.js`

2. **Empty api_credits_log Table**
   - **Issue:** Missing columns caused INSERT failures
   - **Fix:** Added `request_tokens`, `response_tokens`, `total_tokens`, `model_name` columns
   - **Migration:** `database/fix-api-credits-log.sql`

3. **Tag Overflow in Results Table**
   - **Issue:** Tags wrapped to multiple lines, making table messy
   - **Fix:** Limited to 3 tags, single line with `overflow: hidden`
   - **File:** `public/results.html`

---

## 🔮 Future Enhancements (v2.1+)

Potential features for next release:
- [ ] Real-time cost alerts (budget warnings)
- [ ] Cost optimization recommendations
- [ ] Historical cost trends (charts over time)
- [ ] API key rotation management
- [ ] Batch operations cost estimation
- [ ] Memory optimization for Stage 1 (streaming to temp table)

---

## 📖 Documentation

**Updated Guides:**
- `TRANSLATION-SERVICE-README.md` - How to run background translation worker on Railway
- `TRANSLATION-SERVICE-SUMMARY.md` - Complete translation service architecture

**New Documentation:**
- API Statistics page includes inline help
- Hover tooltips on all filters and buttons

---

## 🙏 Credits

**AI Models Used:**
- **Perplexity Sonar Pro** - Company search, website discovery
- **Perplexity Sonar Basic** - Contact analysis, service analysis
- **DeepSeek Chat** - Stage 4 validation, translations
- **DeepSeek Reasoner** - Query generation, Stage 3 retry

**Technology Stack:**
- Node.js 18+
- Express.js
- Supabase (PostgreSQL)
- Railway (Deployment)
- Vanilla JavaScript (Frontend)

---

## 🎉 Conclusion

Version 2.0 represents a major step forward in **cost transparency** and **user experience**. 

With comprehensive API analytics, users can now:
- Make informed decisions about processing volume
- Optimize costs by understanding which stages/models are expensive
- Export data for business reporting
- Enjoy a cleaner, more compact UI

**Thank you for using Smart Email API!** 🚀

---

**Previous Version:** [v1.10.0](./VERSION-1.0-CHANGELOG.md)  
**Repository:** https://github.com/niklazov967-cpu/smart-email-api  
**Issues/Feedback:** Please create an issue on GitHub

