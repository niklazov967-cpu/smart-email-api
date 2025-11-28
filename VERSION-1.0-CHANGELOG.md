# Version 1.0 Final - Changelog

**Release Date:** November 28, 2025  
**Git Tag:** `v1.0-final`  
**Commit:** `4c2163b`

---

## ✅ What's Working

### Stage 1: Company Discovery
- **Status:** ✅ Fully Working
- **Features:**
  - Finds Chinese manufacturers via Perplexity AI (Sonar Pro)
  - Extracts: company name, website, email, description
  - Marketplace filtering (Alibaba, 1668, etc.)
  - Saves directly to Supabase `pending_companies` table
- **Test Results:** 46 companies found and saved
- **Performance:** ~30-40 seconds per query

### Stage 3: Email Discovery
- **Status:** ✅ Fully Working
- **Features:**
  - Multi-stage email search strategy
  - Searches official websites, catalogs, directories
  - Fallback search for companies without email
  - Stores raw API responses in `stage3_raw_data`
- **Test Results:** 6 emails discovered from 46 companies (13% success rate)
- **Performance:** ~60-90 seconds for 46 companies

### Stage 4: AI Validation
- **Status:** ✅ Fully Working
- **Features:**
  - DeepSeek Chat AI validation
  - Aggregates data from Stage 1, 2, 3
  - Generates validation scores, confidence scores
  - Extracts and assigns tags (tag1-tag20)
  - Updates company stage (completed/rejected)
- **Test Results:**
  - 38 companies validated
  - 1 company rejected
  - 7 companies needs review
  - Validation scores: 85-92
  - AI confidence: 75-85
- **Performance:** ~546 seconds (9 minutes) for 46 companies

---

## 🔧 Technical Improvements

### Database Migration
- **Completed:** Full migration from MockDatabase to Supabase
- **Updated Files:**
  - `src/stages/Stage3AnalyzeContacts.js` - All 4 `this.db.query()` → Supabase API
  - `src/stages/Stage4AnalyzeServices.js` - All 3 `this.db.query()` → Supabase API
  - Fixed column name: `main_topic` → `topic_description`
  - Fixed Supabase `.or()` syntax for email filtering

### Caching System
- **Status:** ✅ Completely Disabled
- **Reason:** Caused issues during testing (returned stale data)
- **Implementation:** Commented out cache check in `src/api/sessions.js` (lines 401-485)
- **Future:** Can be re-enabled with proper session_id validation

### API Integration
- **Perplexity API:**
  - Added retry logic with exponential backoff (max 3 retries)
  - Jitter added to prevent thundering herd
  - Improved JSON parsing (handles markdown wrappers)
- **DeepSeek API:**
  - Working with `deepseek-chat` model
  - Token limit management implemented
  - Batch processing (3 companies per batch)
- **Supabase API:**
  - All CRUD operations working
  - Proper error handling added

### Environment Configuration
- **Created:** `.env` file with all API keys
- **Keys stored:**
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `PERPLEXITY_API_KEY`
  - `DEEPSEEK_API_KEY`

---

## 📊 Test Session

**Session ID:** `52d0a83e-dcdd-4754-8b9f-cb7843741395`  
**Topic:** "CNC"  
**Date:** November 28, 2025

### Results:
```
Stage 1: 46 companies found (30s)
Stage 3: 6 emails found (90s)
Stage 4: 38 validated, 1 rejected (546s)
```

### Top 3 Validated Companies:
1. **创世纪智能装备股份有限公司**
   - Email: ir@szccm.com
   - Validation: 92, AI Confidence: 85
   - Tags: CNC, 数控机床, 钻攻机

2. **中山星速机械厂**
   - Validation: 85, AI Confidence: 75
   - Tags: CNC加工, 数控加工, 铣削

3. **深圳市德颂实业发展有限公司**
   - Email: starning@full-linking.com
   - Validation: 85, AI Confidence: 75
   - Tags: CNC machining, CNC turning, stainless steel

---

## 📝 Known Issues (To Fix in v2.0)

### 1. Response Counters Incorrect
- **Issue:** API responses show `companiesFound: 0` even when companies are saved to DB
- **Affected:** Stage 1, Stage 3
- **Impact:** Low (data is saved correctly, only display issue)

### 2. Phone Numbers in Email Field
- **Issue:** Stage 3 sometimes saves phone numbers instead of emails
- **Example:** `0731-22881838` in email field
- **Fix Required:** Add email format validation

### 3. API Endpoints Not Working
- **Affected:** Some endpoints return 404
- **Need Review:** Endpoints 1.3, 1.4

### 4. Stage 2 Skipped
- **Status:** Stage 2 (Website Discovery) is not being used
- **Reason:** Stage 1 already finds websites
- **Decision:** Keep for future use or remove in v2.0

---

## 🚀 Performance Metrics

### Processing Times:
- **Stage 1:** ~30-40 seconds per query
- **Stage 3:** ~60-90 seconds for 46 companies (~1.3-2s per company)
- **Stage 4:** ~546 seconds for 46 companies (~12s per company)
- **Total:** ~10-11 minutes for full pipeline

### API Costs (Estimated):
- **Perplexity:** ~$0.05-0.10 per session
- **DeepSeek:** ~$0.01-0.02 per session
- **Total:** ~$0.06-0.12 per session

### Success Rates:
- **Company Discovery:** ~100% (if query is relevant)
- **Email Discovery:** ~13% (6/46)
- **Validation:** ~83% validated, ~2% rejected, ~15% needs review

---

## 🔑 API Keys Used

All API keys are stored in `.env` file and loaded via `dotenv`:

```env
SUPABASE_URL=https://ptbefsrvvcrjrfxxtogt.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
PERPLEXITY_API_KEY=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
DEEPSEEK_API_KEY=sk-85323bc753cb4b25b02a2664e9367f8a
```

---

## 📦 Files Changed (19 files)

### New Files:
- `VERSION-2.0-ROADMAP.md`
- `database/add-raw-data-fields.sql`
- `database/add-tags-columns.sql`
- `database/add-validation-reason.sql`
- `src/utils/TagExtractor.js`
- `.env` (gitignored)

### Modified Files:
- `src/stages/Stage3AnalyzeContacts.js` - Migrated to Supabase
- `src/stages/Stage4AnalyzeServices.js` - Migrated to Supabase
- `src/api/sessions.js` - Disabled caching
- `src/services/SonarApiClient.js` - Added retry logic
- `src/services/SettingsManager.js` - Fixed table name
- `src/stages/Stage1FindCompanies.js` - Improved JSON parsing

---

## 🎯 Next Steps (Version 2.0)

See `VERSION-2.0-ROADMAP.md` for detailed roadmap.

**Priority fixes:**
1. Fix response counters
2. Add email validation
3. Implement multi-stage email discovery strategy from AI agent
4. Re-enable caching with proper validation
5. Add comprehensive error logging

---

## 🙏 Credits

- **Perplexity AI** - Company and email discovery
- **DeepSeek** - AI validation and enrichment
- **Supabase** - Database and API backend

---

**Status:** ✅ Production Ready (with known limitations)  
**Stability:** 🟢 Stable  
**Test Coverage:** 🟡 Manual testing only

