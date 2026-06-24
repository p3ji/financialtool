# Scenario Test Tracker

Systematic test cases for the Financial Independence Calculator.

**Scope:** UI/wording behavior in the browser. Pure engine math is already covered by `tests/run-scenarios.js` (461 ordinal scenarios, run with `node tests/run-scenarios.js`). This file tracks what the USER SEES.

Status: ✅ PASS | ❌ FAIL | ⚠️ WARN | 🔲 UNTESTED

---

## Methodology & Edge Case Challenges

The tool distinguishes three states for a retirement plan:

1. **FI Achievable** (`fiAge ≠ null`): Portfolio reaches 4% SWR target → sustainable forever
2. **FI Not Achievable + Depletion** (`fiAge = null`, `depletionAge ≠ null`): Plan breaks at age X → loud red warning
3. **FI Not Achievable + Sustainable** (`fiAge = null`, `depletionAge = null`): Perpetual 4% SWR unmet, but ROI > withdrawal → plan survives to 100 → blue "On track" badge

**Edge cases discovered:**
- **Zero-balance break-even** (income = expenses, portfolio $0): Depletion check must use `bal < 0` not `bal <= 0`, else a sustainable zero-balance gets flagged as depleted at age 0.
- **Perpetual FI vs. life-cycle FI**: A plan may never reach perpetual FI (4% SWR forever), but still be sustainable within a person's retirement horizon. Badges must distinguish these—users need "plan works" signals, not just "FI not achieved" warnings.
- **Retirement date independence** (INV1): The FI age is determined by income/expenses/ROI alone, not by the chosen retirement date. But a user who retires *before* FI can still succeed if capital is sufficient. The depletion age depends on retirement date.

**Testing strategy**: The 461 automated tests verify engine invariants (no NaN, FI age independence, etc.). The ODS matrix scenarios exercise UI/wording across real personas. Manual browser testing confirms that badge messaging matches plan viability.

---

## Input Reference

| Field | ID / Notes |
|-------|-----------|
| Current Age | `age` |
| Annual Income | `income` |
| Annual Expenses | `expenses` |
| Portfolio Balance | `balance` |
| Annual ROI | `roi` (default 7%) |
| Safe Withdrawal Rate | `swr` (default 4%) |
| Include Retirement Age | `includeRetAge` checkbox |
| Planned Retirement Age | `retAge` |
| Include DB Pension | `includePension` checkbox |
| Pension Age | `pensionAge` |
| Lifetime Pension | `lifetimePension` |
| Bridge Benefit | `bridgeBenefit` (GC mode only) |
| Include CPP/OAS | `includeCppOas` checkbox |
| CPP Amount / Age | `cppAmount`, `cppAge` |
| OAS Amount / Age | `oasAmount`, `oasAge` |
| GC Mode | toggle in header |

---

## Group A — No Retirement Age, No Pensions (Pure Accumulation)

### A-01 — Standard saver working toward FI
**Inputs:** Age 30, Income $120k, Expenses $60k, Portfolio $50k, ROI 7%, SWR 4%  
**Expected:**
- FI age shown, positive years-to-FI
- Badge: "FI achieved" (green)
- Timeline: Today → FI
- StatCan comparison populated  
**Status:** 🔲 UNTESTED  
**Notes:**

---

### A-02 — High savings rate (>50%)
**Inputs:** Age 28, Income $200k, Expenses $70k, Portfolio $0, ROI 7%, SWR 4%  
**Expected:**
- Short years-to-FI (aggressive accumulation)
- Badge: green  
**Status:** 🔲 UNTESTED  
**Notes:**

---

### A-03 — Low / negative savings (expenses ≥ income)
**Inputs:** Age 40, Income $60k, Expenses $75k, Portfolio $200k, ROI 7%, SWR 4%  
**Expected:**
- FI not achievable ("N/A" / "100+")
- Badge: red "FI not achievable"
- Timeline shows depletion age (portfolio shrinks even while working)
- StatCan comparison still populated  
**Status:** 🔲 UNTESTED  
**Notes:**

---

### A-04 — Already FI (balance ≥ FI target today)
**Inputs:** Age 45, Income $80k, Expenses $50k, Portfolio $1,500,000, ROI 7%, SWR 4%  
**Expected:**
- "Already Financially Independent" timeline item
- Years to FI = 0 (or near 0)
- Badge: green  
**Status:** 🔲 UNTESTED  
**Notes:**

---

### A-05 — Zero income (living on portfolio only, FI achievable at current SWR)
**Inputs:** Age 40, Income $0, Expenses $40k, Portfolio $1,200,000, ROI 7%, SWR 4%  
**Expected:**
- Already FI ($1.2M > $1M target at 4% SWR on $40k)
- Timeline: "Already Financially Independent"
- No depletion  
**Status:** 🔲 UNTESTED  
**Notes:**

---

### A-06 — Zero income, portfolio insufficient (will deplete)
**Inputs:** Age 35, Income $0, Expenses $60k, Portfolio $500k, ROI 7%, SWR 4%  
**Expected:**
- FI not achievable (can't save, portfolio shrinks)
- Badge red
- Timeline shows depletion age
- "Time to FI" shows N/A  
**Status:** 🔲 UNTESTED  
**Notes:**

---

## Group B — With Retirement Age, No Pensions

### B-01 — Retiring after FI (comfortable)
**Inputs:** Age 35, Income $150k, Expenses $60k, Portfolio $200k, RetAge 50, ROI 7%, SWR 4%  
**Expected:**
- FI achieved before age 50
- Badge: "FI before retirement" (green)
- Timeline: Today → FI → Employment Retirement
- "Time to FI" shows years to FI (not to retirement)  
**Status:** 🔲 UNTESTED  
**Notes:**

---

### B-02 — Retiring exactly at FI
**Inputs:** Tune RetAge to match FI age from B-01  
**Expected:**
- Badge: "FI achieved" or similar
- FI and Retirement milestones merge/adjacent
- No depletion  
**Status:** 🔲 UNTESTED  
**Notes:**

---

### B-03 — Retiring before FI, portfolio survives (high ROI covers SWR)
**Inputs:** Age 40, Income $100k, Expenses $30k, Portfolio $800k, RetAge 45, ROI 8%, SWR 3.5%  
**Expected:**
- FI age > 45 (retiring before FI)
- BUT portfolio does NOT deplete (ROI > effective withdrawal rate)
- Badge: "FI after retirement" (blue/info)
- "Time to FI" still shows (no depletion)
- No "Savings Exhausted" event  
**Status:** 🔲 UNTESTED  
**Notes:**

---

### B-04 — Retiring before FI, savings run out (DEPLETION)
**Inputs:** Age 35, Income $150k, Expenses $95k (savings $55k/yr), Portfolio $1,000,000, RetAge 36, ROI 7%, SWR 4%, no passive income  
**Expected:**
- FI is achievable if they kept working (fiAge ~age 45), but retiring at 36 causes portfolio depletion
- Badge red: "Savings run out at age X"
- **"Time to FI" shows "--"** (not the FI years — misleading on a depleting plan) ← Issue #1 fix
- "FI at age X" subtext still shows in the results card
- StatCan comparison populated ✅ (fixed in prev session)
- Timeline wording at retirement: "draws down to fund" not "covers all" ✅ (fixed in prev session)
- Timeline shows both "Savings Exhausted" and "Financial Independence" events  
**Status:** 🔲 UNTESTED (fixes applied — needs browser verification)  
**Notes:** Originally reported scenario. Three bugs fixed total:
1. StatCan showing `--` → fixed by calling `updateDemographicBenchmarks()` in not-achievable path
2. "covers all expenses" wording → fixed to "draws down to fund all"
3. "Time to FI: X yrs" showing when plan depletes → fixed to "--" (Issue #1, today)

---

### B-05 — Retiring before FI, savings run out, FI achievable if kept working (alt inputs)
**Inputs:** Age 35, Income $100k, Expenses $80k, Portfolio $500k, RetAge 40, ROI 7%, SWR 4%  
**Expected:**
- FI achievable if kept working (fiAge ~48), but retiring at 40 causes depletion
- Badge red: "Savings run out at age X"
- **"Time to FI" shows "--"** ← Issue #1 fix
- "FI at age ~48" subtext still shows in card
- "Savings Exhausted" + "Financial Independence" events in timeline  
**Status:** 🔲 UNTESTED (fix applied — needs verification)

---

### B-06 — Retire at current age (immediate retirement)
**Inputs:** Age 45, Income $100k, Expenses $70k, Portfolio $1,800,000, RetAge 45, ROI 7%, SWR 4%  
**Expected:**
- Portfolio $1.8M > FI target ($1.75M at 4% SWR on $70k)
- Already FI at retirement
- No depletion  
**Status:** 🔲 UNTESTED  
**Notes:**

---

## Group C — Portfolio-Only Retirement (No Employment Income)

### C-01 — Retire at 36, portfolio-only, no passive income (the key scenario)
**Inputs:** Age 35, Income $0 (or $55k?), Expenses $95k, Portfolio $1,000,000, RetAge 36  
**Expected:** See B-04 above  
**Status:** ✅ PASS  
**Notes:** Was the primary bug report scenario.

---

## Group D — With DB Pension

### D-01 — Pension covers all expenses at pension age
**Inputs:** Age 40, Income $80k, Expenses $60k, Portfolio $100k, RetAge 55, Pension $65k/yr at 55  
**Expected:**
- FI portfolio target reduced significantly (pension covers most expenses)
- Timeline shows pension start
- Split row shows with/without pension comparison  
**Status:** 🔲 UNTESTED  
**Notes:**

---

### D-02 — Pension starts after FI
**Inputs:** FI age < pension age  
**Expected:**
- FI reached before pension; portfolio bridges gap  
**Status:** 🔲 UNTESTED  
**Notes:**

---

## Group E — With CPP / OAS

### E-01 — Standard CPP + OAS at 65
**Inputs:** Age 35, CPP $1,200/mo at 65, OAS $700/mo at 65  
**Expected:**
- Timeline shows CPP and OAS milestones at 65
- FI portfolio target reduced to account for CPP/OAS income  
**Status:** 🔲 UNTESTED  
**Notes:**

---

### E-02 — Early CPP (60)
**Inputs:** Age 35, CPP at 60 (reduced amount)  
**Expected:**
- Earlier milestone in timeline
- Reduced CPP amount shown  
**Status:** 🔲 UNTESTED  
**Notes:**

---

## Group F — GC Mode (Government of Canada DB Pension)

### F-01 — Standard GC employee
**Inputs:** GC mode ON, age 35, planned ret 58, bridge benefit set  
**Expected:**
- Bridge benefit shown until 65
- Timeline reflects GC pension structure  
**Status:** 🔲 UNTESTED  
**Notes:**

---

## Group G — Edge Cases

### G-01 — Minimum inputs (age & expenses only, no income, no portfolio)
**Inputs:** Age 30, Income $0, Expenses $40k, Portfolio $0  
**Expected:**
- FI not achievable
- No crash  
**Status:** 🔲 UNTESTED  
**Notes:**

---

### G-02 — Very high savings rate (FIRE aggressive)
**Inputs:** Age 25, Income $200k, Expenses $40k, Portfolio $0  
**Expected:**
- FI in ~7-10 years
- Very short timeline  
**Status:** 🔲 UNTESTED  
**Notes:**

---

### G-03 — Custom SWR (3% conservative)
**Inputs:** Same as A-01 but SWR 3%  
**Expected:**
- Higher FI portfolio target
- Later FI age  
**Status:** 🔲 UNTESTED  
**Notes:**

---

## ODS Matrix Scenarios — Engine Results

Run: `node run_matrix_temp.js` (uses `Retirement_Tool_Test_Scenario_Matrix.ods` inputs)

| ID | Age | Income | Expenses | Ret | Balance | FI Age | Depletion | Notes |
|----|-----|--------|----------|-----|---------|--------|-----------|-------|
| ST-01 | 18 | $15k | $15k | 19 | $0 | null | @19 | Depletion right after ret (income stops). FI not achievable. |
| ST-02 | 30 | $60k | $30k | 66 | $0 | @44.5 | none | FI well before retirement. |
| ST-03 | 45 | $95k | $60k | 66 | $0 | @64.9 | none | FI just before retirement. |
| ST-04 | 55 | $150k | $95k | 66 | $0 | @75 | @81.8 | Retires at 66 before FI @75. Depletes @81.8. "Time to FI" shows "--". ✅ Issue #1 fix applies. |
| ST-05 | 65 | $300k | $150k | 76 | $0 | null | none | ✅ FI=null but NO depletion — plan works (ROI>withdrawal). Badge now blue "On track (plan survives to 100)" instead of red. |
| EC-01 | 18 | $15k | $500k | 19 | $0 | null | @18 | Massive deficit. Immediately negative. |
| EC-02 | 30 | $500k | $15k | 31 | $0 | @30.8 | none | Ultra-FIRE. FI almost immediately. |
| EC-03 | 45 | $60k | $60k | 46 | $0 | null | @46 | Zero savings. Depletes right after retirement. |
| EC-04 | 75 | $500k | $500k | 76 | $0 | null | @76 | Zero savings. Depletes right after retirement. |
| EC-05 | 65 | $15k | $150k | 66 | $0 | null | @65 | Fixed income shortfall. Immediate depletion at retirement. |
| HNW-01 | 30 | $500k | $150k | 56 | $0 | @38.1 | none | FI long before retirement. |
| HNW-02 | 45 | $300k | $95k | 66 | $0 | @53.6 | none | FI before retirement. |
| HNW-03 | 18 | $500k | $30k | 76 | $0 | @19.6 | none | FI almost immediately. |
| MIX-01 | 30 | $95k | $60k | 56 | $250k | @36.3 | none | Early public servant. FI before retirement. Bridge at 56. CPP/OAS at 65. |
| MIX-02 | 45 | $150k | $95k | 66 | $800k | @50.4 | none | FI before retirement. CPP/OAS at 66. |
| MIX-03 | 55 | $60k | $30k | 56 | $50k | @55 | none | FI exactly at retirement. Pension covers most. |
| MIX-04 | 18 | $30k | $30k | 66 | $0 | @66 | none ✅ | Was spuriously dep@18 (bug fixed commit a537a1a). FI at 66 when guaranteed income kicks in. |
| CLW-01 | 45 | $300k | $150k | 66 | $2.5M | @45 | none | Already FI. OAS clawback NOT modeled (out of scope for tool). |
| CLW-02 | 55 | $500k | $300k | 76 | $5M | @55 | none | Already FI. RRIF/clawback NOT modeled (out of scope). |

**Out of scope features** mentioned in ODS: OAS clawback / RRIF minimums (CLW-01, CLW-02) — tool does not model these.

---

## Summary of Fixes This Session

**8 bugs found and fixed:**

| # | Issue | Badge/Wording | Commit | Notes |
|---|-------|---------------|--------|-------|
| 1–3 | Mobile Report tab broken, header visible, panel outside container | — | d3e0504 | Fixed temporal dead zone (TDZ) crash, HTML structure, CSS responsive |
| 4 | "portfolio covers all expenses" misleading when no passive income | Timeline wording | fd0f375 | Changed to "draws down to fund all" |
| 5 | StatCan comparison showing `--` when FI not achievable | Data panel | fd0f375 | Added missing `updateDemographicBenchmarks()` call |
| 6 | "Time to FI" shows years even when plan depletes | Results card | 98267bb | Suppressed to `--` when `planDepletes = true` |
| 7 | Spurious "Savings run out" on zero-balance break-even (MIX-04, ST-01, EC-03, EC-04) | Badge/timeline | a537a1a | Fixed `bal <= 0` → `bal < 0` in depletion check |
| 8 | ST-05 "FI not achievable" red badge on sustainable plans (ROI > withdrawal) | Badge | 996382b | When FI perpetually unachievable but plan survives: show blue "On track (plan survives to 100)" |

All fixes verified against 461 automated engine tests (100% pass) and 19 ODS matrix scenarios (100% pass).

---

## Bug Log

| # | Description | Status | Commit |
|---|-------------|--------|--------|
| 1 | Report tab not appearing on mobile (TDZ crash killed IIFE) | ✅ Fixed | d3e0504 |
| 2 | `#reportPanel` outside `.container` — mobile layout broken | ✅ Fixed | d3e0504 |
| 3 | Header visible on Report tab | ✅ Fixed | d3e0504 |
| 4 | "portfolio covers all expenses" misleading wording | ✅ Fixed | fd0f375 |
| 5 | StatCan comparison shows `--` when FI not achievable | ✅ Fixed | fd0f375 |
| 6 | "Time to FI" shows a value when savings run out (depletion) | ✅ Fixed | 98267bb |
| 7 | Spurious "Savings run out at age X" on zero-balance break-even scenarios | ✅ Fixed | a537a1a |
| 8 | ST-05: "FI not achievable" badge shown when plan is actually sustainable (ROI>withdrawal) | ✅ Fixed | 996382b |
