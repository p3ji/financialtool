# Wishlist Feature Specification: Planning as a Couple

This document serves as the complete technical design, architecture, math specification, UI layout, and test harness reference for implementing **Couple Mode & Staggered Retirement Support**.

---

## 1. Overview & Goal

Allow couples to model a joint retirement plan where each partner has their own:
- **Current Age**
- **Employment Income** (post-tax)
- **Planned Retirement Age** (independent stop-work date)
- **DB Pension Plan** (start age & annual amount)
- **CPP & OAS Benefits** (start ages & amounts at 65)

While sharing:
- **Household Annual Expenses**
- **Investment Portfolio** (current balance, ROI, and SWR)

---

## 2. Architecture & Design Principles

### Single Timeline Axis
All simulation math runs on a single timeline axis indexed by the **Primary Person's Age** (`currentAge = age + m/12`). Partner ages are translated onto the primary timeline via the age difference:

$$\text{ageDiff} = \text{partnerCurrentAge} - \text{primaryCurrentAge}$$
$$\text{toPrimary}(\text{partnerRealAge}) = \text{partnerRealAge} - \text{ageDiff}$$

### Independent Employment Periods
Employment income for both partners is modeled independently during each month $m$:
- $\text{monthsToEmpStop} = \text{Math.max}(0, \text{Math.round}((\text{plannedRetAge} - \text{age}) \times 12))$
- $\text{monthsToPartnerEmpStop} = \text{Math.max}(0, \text{Math.round}((\text{partnerPlannedRetAge} - \text{age}) \times 12))$
- $\text{isPrimaryWorking} = m < \text{monthsToEmpStop}$
- $\text{isPartnerWorking} = m < \text{monthsToPartnerEmpStop}$
- $\text{empIncome} = (\text{isPrimaryWorking} ? \text{income} : 0) + (\text{isPartnerWorking} ? \text{partnerIncome} : 0)$

### Retirement-Date-Independent FI Detection
In `FinCalc.analyze()`, the **accumulation pass** sets both `plannedRetAge` and `partnerPlannedRetAge` to `MAX_WORK_AGE` (75) so the FI age and FI portfolio target remain independent of chosen retirement dates.

---

## 3. UI Layout & DOM Specifications

### HTML Structure (`index.html`)
Wrap input sections in `.inputs-column-container` and create `#spouseProfilePanel` beside `#primaryProfilePanel`:

```html
<div class="inputs-column-container">
  <!-- Primary Profile -->
  <div id="primaryProfilePanel" class="glass-panel">
    <!-- Primary Inputs ... -->
    <div class="input-group">
      <input type="checkbox" id="chkCouple">
      <label for="chkCouple">Planning as a couple</label>
    </div>
  </div>

  <!-- Spouse / Partner Profile -->
  <div id="spouseProfilePanel" class="glass-panel spouse-inputs-section" style="display: none;">
    <h3>Spouse / Partner Profile</h3>
    <input type="number" id="partnerAge" value="35">
    <input type="number" id="partnerIncome" value="0">
    <div id="partnerRetAgeSection" style="display: none;">
      <input type="number" id="partnerPlannedRetAge" value="55">
    </div>
    <div id="partnerPensionInputs" style="display: none;">
      <input type="number" id="partnerPensionAge" value="60">
      <input type="number" id="partnerPensionAmount" value="0">
    </div>
    <div id="partnerCppOasInputs" style="display: none;">
      <input type="number" id="partnerCppStartAge" value="65">
      <input type="number" id="partnerCppAmountAt65" value="0">
      <input type="number" id="partnerOasStartAge" value="65">
      <input type="number" id="partnerOasAmountAt65" value="0">
    </div>
  </div>
</div>
```

### CSS Layout (`style.css`)
Responsive 2-column side-by-side on desktop ($\ge 1200\text{px}$), auto-stacking vertically on tablet/mobile ($< 1200\text{px}$):

```css
.inputs-column-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}

@media (min-width: 1200px) {
    .dashboard.has-couple-mode {
        grid-template-columns: minmax(680px, 720px) 1fr;
    }
    .dashboard.has-couple-mode .inputs-column-container {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.5rem;
    }
}
```

---

## 4. DOM Controller & State Persistence (`app.js`)

### Input Mapping & Event Listeners
All partner elements must be added to the global `inputs` map and bound to both `input` and `change` events:

```javascript
const inputs = {
    // Primary fields...
    partnerAge: document.getElementById('partnerAge'),
    partnerIncome: document.getElementById('partnerIncome'),
    partnerPlannedRetAge: document.getElementById('partnerPlannedRetAge'),
    partnerPensionAge: document.getElementById('partnerPensionAge'),
    partnerPensionAmount: document.getElementById('partnerPensionAmount'),
    partnerCppStartAge: document.getElementById('partnerCppStartAge'),
    partnerCppAmountAt65: document.getElementById('partnerCppAmountAt65'),
    partnerOasStartAge: document.getElementById('partnerOasStartAge'),
    partnerOasAmountAt65: document.getElementById('partnerOasAmountAt65')
};

Object.entries(inputs).forEach(([key, input]) => {
    if (input) {
        input.addEventListener('input', calculateRetirement);
        input.addEventListener('change', calculateRetirement);
    }
});
```

### Form State Persistence
Ensure `saveFormState()` includes all partner keys:
```javascript
const elements = [
    'currentAge', 'plannedRetirementAge', 'annualIncome', 'annualExpenses',
    'currentBalance', 'roi', 'swr', 'pensionAge', 'pensionAmount',
    'partnerAge', 'partnerIncome', 'partnerPlannedRetAge', 'partnerPensionAge', 'partnerPensionAmount',
    'partnerCppStartAge', 'partnerCppAmountAt65', 'partnerOasStartAge', 'partnerOasAmountAt65',
    'chkIncludeRetAge', 'chkIncludePortfolio', 'chkIncludePension', 'chkIncludeCppOas', 'chkCouple'
];
```

And `loadFormState()` populates DOM values first before running `updatePartnerVisibility()` and `calculateRetirement()` once at the end.

---

## 5. Report Tab & Timeline Integration

### Household Summary (Report Tab Section 1)
```javascript
const totalIncome = income + (includeCouple ? partnerIncome : 0);
const savings = totalIncome - expenses;
const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;
```
Narrate combined household income and individual contributions separately when couple mode is active.

---

## 6. Verification Test Harness

When re-implementing, test against the following suites:
1. `npm test` — Pure engine math invariants.
2. `npm run test:dom` — jsdom DOM wiring test.
3. `npm run test:playwright` — Headless browser interaction & visibility test.
4. `npm run test:matrix` — Multi-scenario couple state matrix test.
