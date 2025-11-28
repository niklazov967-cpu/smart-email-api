# 🎯 Version 2.0 Roadmap

Based on the successful methodology of an AI agent that achieved **83.5% email discovery rate**.

## 📊 Current Status (v1.0)
- Email discovery: ~75-90%
- Sources: General internet search via Perplexity
- Filtering: Basic marketplace filtering
- Keywords: Basic Chinese queries

## 🎯 Target (v2.0)
- Email discovery: 85%+ (matching the agent)
- Sources: Multiple specialized B2B platforms
- Filtering: Advanced company classification
- Keywords: Specialized manufacturing terms

---

## Priority 1: CRITICAL (Core Success Factors)

### 1.1 Multiple Chinese B2B Sources
**Current:** General Perplexity internet search
**Target:** Specific search on:
- 1688.com (Alibaba China)
- Made-in-China.com
- Baidu B2B
- Alibaba Chinese version
- Industry catalogs (中国机床工具工业协会)

**Implementation:**
```javascript
// Stage 1: Add specific B2B platform searches
const sources = [
  '1688.com "不锈钢数控车铣加工"',
  'Made-in-China.com CNC machining services',
  'Baidu B2B "小批量加工"'
];
```

### 1.2 Advanced Chinese Keywords
**Current:** Basic terms like `数控车床铣床金属加工承包商`
**Target:** Specialized manufacturing terms:
- `小批量加工` (small batch processing)
- `样品服务` (prototype service)
- `1件起订` (MOQ: 1 piece)
- `工厂直销` (direct from factory)
- `定制加工` (custom machining)
- `精密五金加工` (precision hardware)

**Implementation:**
```javascript
// QueryExpander: Use specialized terms
const specializedKeywords = {
  smallBatch: ['小批量加工', '样品服务', '1件起订'],
  direct: ['工厂直销', '自有工厂', '制造厂家'],
  custom: ['定制加工', '按图加工', 'OEM服务']
};
```

### 1.3 Trading Company Filtering
**Current:** Only marketplace URL filtering
**Target:** Exclude trading companies by keywords:
- `贸易公司` (trading company)
- `进出口` (import/export)
- "We source from factories"
- "Trading company"

**Implementation:**
```javascript
// Stage 1: Filter out trading companies
const tradingKeywords = [
  '贸易公司', 'trading company', '进出口',
  'import export', 'sourcing agent',
  'We source from', '代理商'
];

if (tradingKeywords.some(kw => description.includes(kw))) {
  reject('Trading company - not manufacturer');
}
```

---

## Priority 2: HIGH (Quality Improvement)

### 2.1 Systematic Contact Search
**Current:** Generic internet search
**Target:** Explicit section checking:
- Contact Us / 联系我们
- About Us / 关于我们
- Footer (bottom of page)
- Header (top of page)

**Implementation:**
```javascript
// Stage 3: Specify where to look
const searchLocations = [
  'Contact Us page (联系我们)',
  'About Us page (关于我们)',
  'Website footer (页脚)',
  'Website header (页眉)'
];
```

### 2.2 Multiple Contact Types
**Current:** Email only
**Target:** Collect multiple contact methods:
- Email (primary)
- WeChat ID
- WhatsApp number
- Telegram (if available)
- QQ (if available)

**Implementation:**
```sql
ALTER TABLE pending_companies ADD COLUMN wechat VARCHAR(100);
ALTER TABLE pending_companies ADD COLUMN whatsapp VARCHAR(50);
ALTER TABLE pending_companies ADD COLUMN telegram VARCHAR(100);
```

### 2.3 MOQ Verification
**Current:** No MOQ checking
**Target:** Verify small batch capability:
- "小批量接受" (small batch accepted)
- "1件起订" (MOQ: 1 piece)
- "prototype service"
- "sample service"

**Implementation:**
```javascript
// Stage 1/2: Check for small batch capability
const smallBatchIndicators = [
  '小批量接受', '小批量', '1件起订',
  'small batch', 'prototype', 'sample',
  'MOQ: 1', 'low volume'
];

const hasSmallBatch = smallBatchIndicators.some(kw => 
  description.toLowerCase().includes(kw.toLowerCase())
);
```

---

## Priority 3: MEDIUM (Optimization)

### 3.1 Enhanced Tag Extraction
**Current:** Basic service and material tags
**Target:** Detailed classification:

**Processing Types:**
- 车削/turning (токарная обработка)
- 铣削/milling (фрезерная обработка)
- 冲压/stamping (штамповка)
- 铸造/casting (литье)
- 焊接/welding (сварка)
- 磨削/grinding (шлифовка)

**Materials:**
- 不锈钢/stainless steel (нержавеющая сталь)
- 铝/aluminum (алюминий)
- 黄铜/brass (латунь)
- 铜/copper (медь)
- 钛/titanium (титан)
- 塑料/plastic (пластик)

### 3.2 Re-verification for Specific Materials
**Current:** One-pass tag extraction
**Target:** Second pass for critical requirements:
- If user needs stainless steel → re-check all companies
- Look in Materials section (材料)
- Check Case Studies (案例展示)
- Search product specifications

### 3.3 Company Capability Scores
**Current:** Binary accept/reject
**Target:** Scoring system:
- Small batch capability: 0-10
- Material diversity: 0-10
- Equipment level: 0-10
- Service quality indicators: 0-10

---

## Priority 4: LOW (Nice to Have)

### 4.1 Top Rankings Integration
Search for companies in:
- "Top 10/50/100 CNC Manufacturers in China"
- Industry association member lists
- Award winners and certified companies

### 4.2 Duplicate Detection
Enhanced duplicate checking:
- By company name (fuzzy match)
- By email domain
- By website domain
- By phone number

### 4.3 Parallel Processing
Optimize for batch operations:
- Process multiple companies simultaneously
- Implement retry logic
- Timeout handling (60-90s per company)

---

## 📊 Expected Results (v2.0)

| Metric | v1.0 | v2.0 Target |
|--------|------|-------------|
| Email discovery | 75-90% | 85%+ |
| Trading companies filtered | Basic | Advanced |
| Small batch verified | No | Yes |
| Contact types | 1 (email) | 4+ (email, WeChat, WhatsApp, etc) |
| Tag accuracy | Good | Excellent |
| Material verification | Single pass | Double pass |

---

## 🚀 Implementation Plan

### Phase 1: Core Improvements (Week 1-2)
1. Multiple B2B sources (Priority 1.1)
2. Advanced keywords (Priority 1.2)
3. Trading company filtering (Priority 1.3)

### Phase 2: Quality Enhancements (Week 3-4)
4. Systematic contact search (Priority 2.1)
5. Multiple contact types (Priority 2.2)
6. MOQ verification (Priority 2.3)

### Phase 3: Optimization (Week 5-6)
7. Enhanced tag extraction (Priority 3.1)
8. Material re-verification (Priority 3.2)
9. Capability scoring (Priority 3.3)

### Phase 4: Polish (Week 7-8)
10. Top rankings integration (Priority 4.1)
11. Duplicate detection (Priority 4.2)
12. Parallel processing (Priority 4.3)

---

## 💡 Key Success Factors (from Agent Analysis)

1. **Multiple sources** - Don't rely on one channel
2. **Parallel processing** - Scale the search
3. **Strict filtering** - Quality over quantity
4. **Criteria verification** - Every company verified
5. **Automation** - Minimize manual work
6. **Chinese keywords** - Better results with native terms
7. **B2B platforms** - Where manufacturers actually are

---

## 📝 Notes

This roadmap is based on the methodology that achieved:
- **206 companies processed**
- **172 companies with email (83.5%)**
- **147 companies working with stainless steel (85.5%)**

The agent's success came from:
- Systematic approach to multiple B2B platforms
- Specialized Chinese keywords for manufacturing
- Strict filtering of trading companies
- Comprehensive contact information collection
- Automated tag extraction and verification

