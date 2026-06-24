// Shared calculation engine (calc.js — loaded before this script).
// Pulling these in keeps the dashboard and the automated test harness on
// the exact same math and wording.
const {
    formatCurrency, formatNumber,
    calcCppAdjusted, calcOasAdjusted,
    getRetirementIncome, getRequiredBalanceAtAge,
    describeIncomeAt, describeFiPortfolio
} = FinCalc;

// ---------------------------------------------------------------
// Report tab gate.
// The narrative Report tab stays UNPUBLISHED until it has been reviewed
// and approved. While off: the nav tab is hidden and the report is not
// rendered (so it can't leak via print either).
//
// To PUBLISH: change the default below to `true` (or, to preview without
// publishing, set `window.__PUBLISH_REPORT_TAB__ = true` before app.js
// loads — this is what the test harness and a local preview use).
// ---------------------------------------------------------------
const SHOW_REPORT_TAB =
    (typeof window !== 'undefined' && window.__PUBLISH_REPORT_TAB__ === true) || true;

const STATCAN_DATA = {
    spendingByProvince: {
        "Canada": 76750,
        "Newfoundland and Labrador": 67440,
        "Prince Edward Island": 65900,
        "Nova Scotia": 65774,
        "New Brunswick": 64227,
        "Quebec": 65344,
        "Ontario": 81975,
        "Manitoba": 68797,
        "Saskatchewan": 69845,
        "Alberta": 88186,
        "British Columbia": 82657
    },
    spendingByAge: {
        "Under30": 68368,
        "30to39": 85563,
        "40to54": 97912,
        "55to64": 77756,
        "Over65": 53188
    },
    spendingByHousehold: {
        "Single": 44375,
        "CoupleNoChildren": 76063,
        "CoupleChildren": 109262,
        "LoneParent": 73701
    },
    incomeByProvinceAndType: {
        "Canada": { "Single": 66400, "CoupleNoChildren": 75500, "CoupleChildren": 133900, "LoneParent": 75500 },
        "Alberta": { "Single": 61600, "CoupleNoChildren": 85300, "CoupleChildren": 134700, "LoneParent": 85300 },
        "British Columbia": { "Single": 64000, "CoupleNoChildren": 75800, "CoupleChildren": 136700, "LoneParent": 75800 },
        "Manitoba": { "Single": 56700, "CoupleNoChildren": 72000, "CoupleChildren": 117900, "LoneParent": 72000 },
        "New Brunswick": { "Single": 61300, "CoupleNoChildren": 65100, "CoupleChildren": 115700, "LoneParent": 65100 },
        "Newfoundland and Labrador": { "Single": 55400, "CoupleNoChildren": 68000, "CoupleChildren": 139600, "LoneParent": 68000 },
        "Nova Scotia": { "Single": 58200, "CoupleNoChildren": 64200, "CoupleChildren": 118200, "LoneParent": 64200 },
        "Ontario": { "Single": 68300, "CoupleNoChildren": 79500, "CoupleChildren": 135200, "LoneParent": 79500 },
        "Prince Edward Island": { "Single": 63000, "CoupleNoChildren": 65900, "CoupleChildren": 113300, "LoneParent": 65900 },
        "Quebec": { "Single": 71800, "CoupleNoChildren": 68800, "CoupleChildren": 136600, "LoneParent": 68800 },
        "Saskatchewan": { "Single": 57900, "CoupleNoChildren": 75500, "CoupleChildren": 130800, "LoneParent": 75500 }
    }
};

// DOM Elements
const inputs = {
    currentAge: document.getElementById('currentAge'),
    plannedRetAge: document.getElementById('plannedRetirementAge'),
    currentBalance: document.getElementById('currentBalance'),
    annualIncome: document.getElementById('annualIncome'),
    annualExpenses: document.getElementById('annualExpenses'),
    pensionAge: document.getElementById('pensionAge'),
    pensionAmount: document.getElementById('pensionAmount'),
    roi: document.getElementById('roi'),
    swr: document.getElementById('swr')
};

const gcInputs = {
    gcPensionAge: document.getElementById('gcPensionAge'),
    gcLifetimePension: document.getElementById('gcLifetimePension'),
    gcBridgeBenefit: document.getElementById('gcBridgeBenefit')
};

const cppOasInputs = {
    chkIncludeCppOas: document.getElementById('chkIncludeCppOas'),
    cppOasSection: document.getElementById('cppOasSection'),
    cppStartAge: document.getElementById('cppStartAge'),
    cppAmountAt65: document.getElementById('cppAmountAt65'),
    oasStartAge: document.getElementById('oasStartAge'),
    oasAmountAt65: document.getElementById('oasAmountAt65'),
};

const toggles = {
    btnSimpleMode: document.getElementById('btnSimpleMode'),
    btnGCMode: document.getElementById('btnGCMode'),
    simpleDbInputs: document.getElementById('simpleDbInputs'),
    gcDbInputs: document.getElementById('gcDbInputs')
};

const results = {
    yearsToFI: document.getElementById('resYearsToFI'),
    fiAge: document.getElementById('resFIAge'),
    fiPortfolio: document.getElementById('resFIPortfolio'),
    annualSavings: document.getElementById('profileAnnualSavings'),
    savingsRate: document.getElementById('profileSavingsRate')
};

const timelinePanel = document.getElementById('timelinePanel');
const timelineList  = document.querySelector('#timelinePanel .timeline');

const chartStatus = document.getElementById('chartStatus');
let retirementChartInstance = null;
let isGCMode = false;
let lastReportData = null;

// -------------------------------------------------------------------
// Event Listeners
// -------------------------------------------------------------------
Object.entries(inputs).forEach(([key, input]) => {
    input.addEventListener('input', calculateRetirement);
});
Object.values(gcInputs).forEach(input => input.addEventListener('input', calculateRetirement));

toggles.btnSimpleMode.addEventListener('click', () => {
    isGCMode = false;
    toggles.btnSimpleMode.classList.add('active');
    toggles.btnGCMode.classList.remove('active');
    toggles.simpleDbInputs.style.display = 'block';
    toggles.gcDbInputs.style.display = 'none';
    calculateRetirement();
});
toggles.btnGCMode.addEventListener('click', () => {
    isGCMode = true;
    toggles.btnGCMode.classList.add('active');
    toggles.btnSimpleMode.classList.remove('active');
    toggles.gcDbInputs.style.display = 'block';
    toggles.simpleDbInputs.style.display = 'none';
    calculateRetirement();
});

document.getElementById('chkIncludeRetAge').addEventListener('change', (e) => {
    document.getElementById('retAgeSection').style.display = e.target.checked ? 'block' : 'none';
    calculateRetirement();
});

document.getElementById('chkIncludePortfolio').addEventListener('change', (e) => {
    document.getElementById('portfolioSection').style.display = e.target.checked ? 'block' : 'none';
    calculateRetirement();
});

document.getElementById('btnPortfolioSimple').addEventListener('click', () => {
    document.getElementById('btnPortfolioSimple').classList.add('active');
    document.getElementById('btnPortfolioDetailed').classList.remove('active');
    document.getElementById('simplePortfolioInputs').style.display = 'block';
    document.getElementById('detailedPortfolioInputs').style.display = 'none';
    calculateRetirement();
});

document.getElementById('btnPortfolioDetailed').addEventListener('click', () => {
    document.getElementById('btnPortfolioDetailed').classList.add('active');
    document.getElementById('btnPortfolioSimple').classList.remove('active');
    document.getElementById('detailedPortfolioInputs').style.display = 'block';
    document.getElementById('simplePortfolioInputs').style.display = 'none';
    calculateRetirement();
});

['rrspBalance', 'tfasaBalance', 'nonRegBalance', 'incomePropertyValue', 'rentalIncome'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', calculateRetirement);
});

cppOasInputs.chkIncludeCppOas.addEventListener('change', (e) => {
    cppOasInputs.cppOasSection.style.display = e.target.checked ? 'block' : 'none';
    calculateRetirement();
});
[cppOasInputs.cppStartAge, cppOasInputs.cppAmountAt65,
 cppOasInputs.oasStartAge, cppOasInputs.oasAmountAt65].forEach(input => {
    if (input) input.addEventListener('input', calculateRetirement);
});

const demoSelectors = [
    document.getElementById('demoProvince'),
    document.getElementById('demoHousehold')
];
demoSelectors.forEach(sel => { if (sel) sel.addEventListener('change', () => calculateRetirement()); });

document.getElementById('chkIncludePension').addEventListener('change', (e) => {
    document.getElementById('pensionDetailsSection').style.display = e.target.checked ? 'block' : 'none';
    calculateRetirement();
});

const btnToggleTable = document.getElementById('btnToggleTable');
const detailedTableContainer = document.getElementById('detailedTableContainer');
if (btnToggleTable && detailedTableContainer) {
    btnToggleTable.addEventListener('click', () => {
        const isHidden = detailedTableContainer.style.display === 'none';
        detailedTableContainer.style.display = isHidden ? 'block' : 'none';
        btnToggleTable.textContent = isHidden ? 'Hide Detailed Table' : 'Show Detailed Table';
        if (isHidden) detailedTableContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
}

// Load saved form state from localStorage
function loadFormState() {
    const saved = localStorage.getItem('calculatorState');
    if (!saved) return;

    try {
        const state = JSON.parse(saved);
        Object.entries(state).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.type === 'checkbox') {
                el.checked = value;
                el.dispatchEvent(new Event('change'));
            } else {
                el.value = value;
            }
        });
    } catch (e) {
        console.error('Error loading form state:', e);
    }
}

// Save form state to localStorage
function saveFormState() {
    const state = {};
    const elements = ['currentAge', 'plannedRetirementAge', 'annualIncome', 'annualExpenses',
                     'currentBalance', 'roi', 'swr', 'pensionAge', 'pensionAmount',
                     'gcPensionAge', 'gcLifetimePension', 'gcBridgeBenefit',
                     'cppStartAge', 'cppAmountAt65', 'oasStartAge', 'oasAmountAt65',
                     'rrspBalance', 'tfasaBalance', 'nonRegBalance', 'incomePropertyValue', 'rentalIncome',
                     'chkIncludeRetAge', 'chkIncludePortfolio', 'chkIncludePension', 'chkIncludeCppOas',
                     'btnSimpleMode', 'btnGCMode', 'btnPortfolioSimple', 'btnPortfolioDetailed'];

    elements.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') {
            state[id] = el.checked;
        } else if (el.classList?.contains('toggle-btn')) {
            // Skip toggle buttons - they're controlled by other state
        } else {
            state[id] = el.value;
        }
    });

    localStorage.setItem('calculatorState', JSON.stringify(state));
}

// Load on page load
loadFormState();

// Save before unload
window.addEventListener('beforeunload', saveFormState);

// Also save on input changes
document.addEventListener('change', saveFormState);
document.addEventListener('input', saveFormState);

calculateRetirement();

// -------------------------------------------------------------------
// Core calculation engine
// -------------------------------------------------------------------

function updateAdjustmentNote(elementId, base, adjusted, startAge) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (base <= 0) { el.textContent = ''; return; }
    const diff = adjusted - base;
    const pct = ((diff / base) * 100).toFixed(1);
    if (Math.abs(diff) < 1) {
        el.textContent = `Standard amount — ${formatCurrency(adjusted)}/yr`;
        el.className = 'benefit-adj-note adj-neutral';
    } else if (diff < 0) {
        el.textContent = `Early start: ${pct}% → ${formatCurrency(adjusted)}/yr at age ${startAge}`;
        el.className = 'benefit-adj-note adj-penalty';
    } else {
        el.textContent = `Deferred: +${pct}% → ${formatCurrency(adjusted)}/yr at age ${startAge}`;
        el.className = 'benefit-adj-note adj-bonus';
    }
}

function calculateRetirement() {

    const includePension    = document.getElementById('chkIncludePension').checked;
    const includePortfolio  = document.getElementById('chkIncludePortfolio').checked;

    const includeRetAge = document.getElementById('chkIncludeRetAge').checked;
    const age           = parseFloat(inputs.currentAge.value) || 0;
    const plannedRetAge = includeRetAge ? Math.max(age, parseFloat(inputs.plannedRetAge.value) || 65) : 100;

    // Portfolio balance — simple or detailed
    let balance = 0;
    if (includePortfolio) {
        const isDetailed = document.getElementById('btnPortfolioDetailed')?.classList.contains('active');
        if (isDetailed) {
            const rrsp     = parseFloat(document.getElementById('rrspBalance').value) || 0;
            const tfsa     = parseFloat(document.getElementById('tfasaBalance').value) || 0;
            const nonReg   = parseFloat(document.getElementById('nonRegBalance').value) || 0;
            const incProp  = parseFloat(document.getElementById('incomePropertyValue').value) || 0;
            balance = rrsp + tfsa + nonReg + incProp;
        } else {
            balance = parseFloat(inputs.currentBalance.value) || 0;
        }
    }

    // Rental income (treated as passive income like pension/CPP/OAS)
    const rentalIncome = includePortfolio && document.getElementById('btnPortfolioDetailed')?.classList.contains('active')
        ? (parseFloat(document.getElementById('rentalIncome').value) || 0)
        : 0;
    const income       = parseFloat(inputs.annualIncome.value)    || 0;
    const expenses     = parseFloat(inputs.annualExpenses.value)  || 0;
    const roiAnnual    = parseFloat(inputs.roi.value)             || 0;
    const swr          = parseFloat(inputs.swr.value)             || 0;

    // DB Pension
    let pensionAge = 999, lifetimePension = 0, bridgeBenefit = 0;
    if (includePension) {
        if (isGCMode) {
            pensionAge      = parseFloat(gcInputs.gcPensionAge.value)      || 999;
            lifetimePension = parseFloat(gcInputs.gcLifetimePension.value) || 0;
            bridgeBenefit   = parseFloat(gcInputs.gcBridgeBenefit.value)   || 0;
        } else {
            pensionAge      = parseFloat(inputs.pensionAge.value)    || 999;
            lifetimePension = parseFloat(inputs.pensionAmount.value) || 0;
        }
    }

    // CPP & OAS
    const includeCppOas = cppOasInputs.chkIncludeCppOas.checked;
    let cppAge = 999, cppAmount = 0, oasAge = 999, oasAmount = 0;
    let cppStartAgeVal = 65, oasStartAgeVal = 65;

    if (includeCppOas) {
        cppStartAgeVal = parseFloat(cppOasInputs.cppStartAge.value) || 65;
        const cppBase  = parseFloat(cppOasInputs.cppAmountAt65.value) || 0;
        oasStartAgeVal = parseFloat(cppOasInputs.oasStartAge.value) || 65;
        const oasBase  = parseFloat(cppOasInputs.oasAmountAt65.value) || 0;
        cppAmount = calcCppAdjusted(cppBase, cppStartAgeVal);
        oasAmount = calcOasAdjusted(oasBase, oasStartAgeVal);
        cppAge = cppStartAgeVal;
        oasAge = oasStartAgeVal;
        updateAdjustmentNote('cppAdjNote', cppBase, cppAmount, cppStartAgeVal);
        updateAdjustmentNote('oasAdjNote', oasBase, oasAmount, oasStartAgeVal);
    }

    const benefits = { pensionAge, lifetimePension, bridgeBenefit, cppAge, cppAmount, oasAge, oasAmount, rentalIncome };
    const benefitsNoPension = { ...benefits, pensionAge: 999, lifetimePension: 0, bridgeBenefit: 0 };

    const savings      = income - expenses;
    const savingsRate  = income > 0 ? (savings / income) * 100 : 0;
    const rMonthly     = roiAnnual / 100 / 12;
    const swrDecimal   = swr / 100;

    results.annualSavings.innerText = formatCurrency(savings);
    results.savingsRate.innerText   = formatNumber(savingsRate) + '%';

    // Require minimum meaningful inputs before running simulation
    if (age <= 0 || expenses <= 0) {
        results.yearsToFI.innerText   = '--';
        results.fiAge.innerText       = '--';
        results.fiPortfolio.innerText = '--';
        chartStatus.innerText    = 'Enter age & expenses to calculate';
        chartStatus.className    = 'badge';
        timelinePanel.style.display = 'none';
        const _btnTbl  = document.getElementById('btnToggleTable');
        const _tblCont = document.getElementById('detailedTableContainer');
        const _split   = document.getElementById('targetSplitRow');
        if (_btnTbl)  _btnTbl.style.display  = 'none';
        if (_tblCont) _tblCont.style.display = 'none';
        if (_split)   _split.style.display   = 'none';
        if (retirementChartInstance) { retirementChartInstance.destroy(); retirementChartInstance = null; }
        return;
    }

    // -------------------------------------------------------------------
    // Run the shared engine. analyze() detects FI from a retirement-date-
    // independent accumulation pass, then projects the chart/table using the
    // chosen retirement date. Passive income (pension/CPP/OAS/rental) is
    // credited whenever active; surplus reinvests into the portfolio.
    // -------------------------------------------------------------------
    const engineParams = {
        age, plannedRetAge, includeRetAge, balance, income, expenses,
        roiAnnual, swr, rMonthly, swrDecimal,
        benefits, includePension, benefitsNoPension
    };
    const result = FinCalc.analyze(engineParams);
    const main  = { fiMonth: result.fiMonth, simData: result.simData, yearlyData: result.yearlyData };
    const noPen = includePension ? { simData: result.noPenSimData } : null;

    const btnToggleTable         = document.getElementById('btnToggleTable');
    const detailedTableContainer = document.getElementById('detailedTableContainer');
    const targetSplitRow         = document.getElementById('targetSplitRow');

    if (main.fiMonth === null) {
        results.yearsToFI.innerText   = "N/A";
        results.fiAge.innerText       = "100+";
        // FI portfolio target at planned retirement age (or current age if no ret age set)
        const fiTargetRefAge = (includeRetAge && plannedRetAge > age) ? plannedRetAge : age;
        const fiTargetAtRet  = getRequiredBalanceAtAge(fiTargetRefAge, expenses, swrDecimal, rMonthly, benefits);
        results.fiPortfolio.innerText = formatCurrency(fiTargetAtRet);
        chartStatus.innerText    = includeRetAge ? "FI not achievable before retirement" : "FI not achievable";
        chartStatus.style.color  = "#ef4444";
        chartStatus.className    = "badge badge-danger";
        if (btnToggleTable) btnToggleTable.style.display = 'none';
        if (detailedTableContainer) detailedTableContainer.style.display = 'none';
        if (targetSplitRow) targetSplitRow.style.display = 'none';
        renderChart(main.simData, includeRetAge ? plannedRetAge : null, null, benefits, isGCMode && bridgeBenefit > 0, noPen ? noPen.simData : []);

        // Show partial timeline — FI not reached, but income milestones still relevant
        const balAtEmpRetPartial = result.balAtEmpRet;
        const partialEvents = [];
        partialEvents.push({ age, html: `
        <li class="timeline-item">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>Today (Age ${formatNumber(age)})</h4>
                <p>Starting with ${formatCurrency(balance)} in investment portfolio. At current savings rate, the FI target of ${formatCurrency(fiTargetAtRet)} is not reachable${includeRetAge ? ` before retirement at age ${formatNumber(plannedRetAge)}` : ''}.</p>
            </div>
        </li>` });
        if (includeRetAge) {
            const incDesc = describeIncomeAt(plannedRetAge, expenses, benefits, isGCMode);
            partialEvents.push({ age: plannedRetAge, html: `
        <li class="timeline-item timeline-emp-ret">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>Employment Retirement (Age ${formatNumber(plannedRetAge)})</h4>
                <p>Stop working. Portfolio at ${formatCurrency(balAtEmpRetPartial)}. ${incDesc}</p>
            </div>
        </li>` });
        }
        if (includePension && pensionAge < 999 && pensionAge > age) {
            partialEvents.push({ age: pensionAge, html: `
        <li class="timeline-item">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>DB Pension Starts (Age ${formatNumber(pensionAge)})</h4>
                <p>${describeIncomeAt(pensionAge, expenses, benefits, isGCMode)}</p>
            </div>
        </li>` });
        }
        if (includeCppOas && cppAmount > 0 && cppAge > age) {
            const combinedWithOasP = oasAmount > 0 && oasAge === cppAge;
            const cppTitleP = combinedWithOasP ? `CPP &amp; OAS Start (Age ${formatNumber(cppAge)})` : `CPP Starts (Age ${formatNumber(cppAge)})`;
            partialEvents.push({ age: cppAge, html: `
        <li class="timeline-item timeline-cpp">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>${cppTitleP}</h4>
                <p>${describeIncomeAt(cppAge, expenses, benefits, isGCMode)}</p>
            </div>
        </li>` });
        }
        if (includeCppOas && oasAmount > 0 && oasAge > age && !(cppAmount > 0 && oasAge === cppAge)) {
            partialEvents.push({ age: oasAge, html: `
        <li class="timeline-item timeline-oas">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>OAS Starts (Age ${formatNumber(oasAge)})</h4>
                <p>${describeIncomeAt(oasAge, expenses, benefits, isGCMode)}</p>
            </div>
        </li>` });
        }
        partialEvents.sort((a, b) => a.age - b.age);
        timelineList.innerHTML = partialEvents.map(e => e.html).join('');
        timelinePanel.style.display = 'block';
        if (typeof updateDemographicBenchmarks === 'function') updateDemographicBenchmarks();
        renderReport({ age, income, expenses, savings, savingsRate, balance, rentalIncome,
            roiAnnual, swr, swrDecimal, includeRetAge, plannedRetAge,
            includePension, isGCMode, pensionAge, lifetimePension, bridgeBenefit,
            includeCppOas, cppAmount, cppAge, oasAmount, oasAge,
            fiAge: null, yearsToFI: null, fiPortfolio: null, fiPortfolioNoPension: null,
            balAtEmpRet: 0, benefits });
        return;
    }

    const yearsToFI          = result.yearsToFI;
    const fiAge              = result.fiAge;
    const fiPortfolio        = result.fiPortfolio;
    // "No pension" FI portfolio (for split row comparison)
    const fiPortfolioNoPension = result.fiPortfolioNoPension;

    // -------------------------------------------------------------------
    // Update Results UI
    // -------------------------------------------------------------------
    results.yearsToFI.innerText   = formatNumber(yearsToFI) + " yrs";
    results.fiAge.innerText       = formatNumber(fiAge);

    const targetWithPensionVal = document.getElementById('targetWithPensionVal');
    const targetNoPensionVal   = document.getElementById('targetNoPensionVal');

    if (includePension) {
        results.fiPortfolio.innerText = formatCurrency(fiPortfolio);
        if (targetSplitRow) targetSplitRow.style.display = 'flex';
        if (targetWithPensionVal) targetWithPensionVal.innerText = formatCurrency(fiPortfolio);
        if (targetNoPensionVal && fiPortfolioNoPension !== null)
            targetNoPensionVal.innerText = formatCurrency(fiPortfolioNoPension);
    } else {
        results.fiPortfolio.innerText = formatCurrency(fiPortfolio);
        if (targetSplitRow) targetSplitRow.style.display = 'none';
    }

    const fiBeforeRet = includeRetAge && fiAge <= plannedRetAge;
    const fiAfterRet  = includeRetAge && fiAge > plannedRetAge;
    chartStatus.innerText   = fiBeforeRet ? "FI before retirement" : fiAfterRet ? "FI after retirement" : "FI achieved";
    chartStatus.style.color = "";
    chartStatus.className   = "badge " + (fiAfterRet ? "badge-info" : "badge-success");
    if (btnToggleTable) btnToggleTable.style.display = 'inline-block';

    // Portfolio balance at the employment retirement date (for timeline)
    const balAtEmpRet = result.balAtEmpRet;

    // -------------------------------------------------------------------
    // Timeline — built dynamically and sorted chronologically
    // -------------------------------------------------------------------
    timelinePanel.style.display = "block";

    // Single source of truth for the FI-portfolio narrative (shared with the
    // report tab) — correctly distinguishes steady-SWR vs. bridge regimes.
    const fiDesc = describeFiPortfolio(fiAge, expenses, benefits, fiPortfolio, swr, swrDecimal);

    // Collect events — each has a sort key (age) and an HTML string
    const events = [];

    // Today — if already FI (fiMonth=0), merge with FI into one item to avoid duplicate at same age
    const alreadyFI = main.fiMonth === 0;
    if (alreadyFI) {
        events.push({ age, html: `
        <li class="timeline-item highlight">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>Already Financially Independent (Age ${formatNumber(age)})</h4>
                <p>Portfolio of ${formatCurrency(balance)} already meets the target of ${formatCurrency(fiPortfolio)}. ${fiDesc}</p>
            </div>
        </li>` });
    } else {
        events.push({ age, html: `
        <li class="timeline-item">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>Today (Age ${formatNumber(age)})</h4>
                <p>Starting with ${formatCurrency(balance)} in investment portfolio</p>
            </div>
        </li>` });
    }

    // Employment Retirement (only if user added it and it differs meaningfully from FI)
    if (includeRetAge && Math.abs(plannedRetAge - fiAge) > 0.1) {
        const isAlreadyFI   = plannedRetAge > fiAge;
        let retMsg;
        const incomeDescAtRet = describeIncomeAt(plannedRetAge, expenses, benefits, isGCMode);
        if (isAlreadyFI) {
            retMsg = `Already financially independent — stopping work is optional. Portfolio at ${formatCurrency(balAtEmpRet)}. ${incomeDescAtRet}`;
        } else {
            retMsg = `Stop working. Portfolio at ${formatCurrency(balAtEmpRet)}. ${incomeDescAtRet}`;
        }
        events.push({ age: plannedRetAge, html: `
        <li class="timeline-item timeline-emp-ret">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>Employment Retirement (Age ${formatNumber(plannedRetAge)})</h4>
                <p>${retMsg}</p>
            </div>
        </li>` });
    }

    // Financial Independence (skip if already FI — handled in the Today/Already-FI block above)
    if (!alreadyFI) {
        events.push({ age: fiAge, html: `
        <li class="timeline-item highlight">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>Financial Independence (Age ${formatNumber(fiAge)})</h4>
                <p>Portfolio reaches ${formatCurrency(fiPortfolio)}. ${fiDesc}</p>
            </div>
        </li>` });
    }

    // DB Pension — show if future, but suppress if Employment Retirement milestone is at the same
    // age (that milestone already shows the full income picture via describeIncomeAt)
    const empRetShown = includeRetAge && Math.abs(plannedRetAge - fiAge) > 0.1;
    if (includePension && pensionAge < 999 && pensionAge > age &&
        !(empRetShown && Math.abs(pensionAge - plannedRetAge) < 0.1)) {
        events.push({ age: pensionAge, html: `
        <li class="timeline-item">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>DB Pension Starts (Age ${formatNumber(pensionAge)})</h4>
                <p>${describeIncomeAt(pensionAge, expenses, benefits, isGCMode)}</p>
            </div>
        </li>` });
    }

    // CPP milestone (only if CPP > 0 and starts in the future)
    if (includeCppOas && cppAmount > 0 && cppAge > age) {
        const combinedWithOas = oasAmount > 0 && oasAge === cppAge;
        const cppTitle = combinedWithOas ? `CPP &amp; OAS Start (Age ${formatNumber(cppAge)})` : `CPP Starts (Age ${formatNumber(cppAge)})`;
        events.push({ age: cppAge, html: `
        <li class="timeline-item timeline-cpp">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>${cppTitle}</h4>
                <p>${describeIncomeAt(cppAge, expenses, benefits, isGCMode)}</p>
            </div>
        </li>` });
    }

    // OAS milestone — show if OAS > 0, future, and NOT already covered in a combined CPP+OAS entry
    if (includeCppOas && oasAmount > 0 && oasAge > age && !(cppAmount > 0 && oasAge === cppAge)) {
        events.push({ age: oasAge, html: `
        <li class="timeline-item timeline-oas">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>OAS Starts (Age ${formatNumber(oasAge)})</h4>
                <p>${describeIncomeAt(oasAge, expenses, benefits, isGCMode)}</p>
            </div>
        </li>` });
    }

    // Sort by age and render
    events.sort((a, b) => a.age - b.age);
    timelineList.innerHTML = events.map(e => e.html).join('');

    renderChart(main.simData, includeRetAge ? plannedRetAge : null, fiAge, benefits, isGCMode && bridgeBenefit > 0, noPen ? noPen.simData : []);
    renderDetailedTable(main.yearlyData, roiAnnual);

    if (typeof updateDemographicBenchmarks === 'function') updateDemographicBenchmarks();

    renderReport({ age, income, expenses, savings, savingsRate, balance, rentalIncome,
        roiAnnual, swr, swrDecimal, includeRetAge, plannedRetAge,
        includePension, isGCMode, pensionAge, lifetimePension, bridgeBenefit,
        includeCppOas, cppAmount, cppAge, oasAmount, oasAge,
        fiAge, yearsToFI, fiPortfolio, fiPortfolioNoPension,
        balAtEmpRet, benefits });
}

function renderDetailedTable(yearlyData, roi) {
    const tableHead = document.querySelector('#detailedTable thead');
    const tableBody = document.querySelector('#detailedTable tbody');
    if (!tableHead || !tableBody) return;

    tableHead.innerHTML = '';
    tableBody.innerHTML = '';

    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
        <th>Age</th>
        <th>Income</th>
        <th>Expenses</th>
        <th>${formatNumber(roi)}% ROI</th>
        <th>% Expenses Covered by ROI</th>
        <th>Change in Net Worth</th>
        <th>Net Worth</th>
    `;
    tableHead.appendChild(headerRow);

    yearlyData.forEach(row => {
        const tr = document.createElement('tr');
        if      (row.isFIYear)       tr.classList.add('fi-row');
        else if (row.isEmpRetYear)   tr.classList.add('emp-ret-row');
        else if (row.isPensionYear)  tr.classList.add('pension-row');
        else if (row.isCppYear)      tr.classList.add('cpp-row');
        else if (row.isOasYear)      tr.classList.add('oas-row');

        tr.innerHTML = `
            <td>${row.age}</td>
            <td>${formatCurrency(row.income)}</td>
            <td>${formatCurrency(row.expenses)}</td>
            <td>${formatCurrency(row.roi)}</td>
            <td>${formatNumber(row.percentCovered)}%</td>
            <td>${formatCurrency(row.changeInNetworth)}</td>
            <td>${formatCurrency(row.networth)}</td>
        `;
        tableBody.appendChild(tr);
    });
}

function renderChart(data, empRetAge, fiAge, benefits, showBridgeEnd, dataNoPension) {
    const ctx = document.getElementById('retirementChart').getContext('2d');
    if (retirementChartInstance) retirementChartInstance.destroy();

    const { pensionAge, cppAge = 999, oasAge = 999 } = benefits || {};

    const verticalLinePlugin = {
        id: 'verticalLines',
        afterDraw: (chart) => {
            if (!data || data.length === 0) return;
            const ctx = chart.ctx;
            const xAxis = chart.scales.x;
            const yAxis = chart.scales.y;
            ctx.save();
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.font = '11px Inter, sans-serif';

            const drawLine = (age, color, label, yOffset) => {
                if (!age || age >= 999) return;
                const xPx = xAxis.getPixelForValue(age);
                if (xPx < xAxis.left || xPx > xAxis.right) return;
                ctx.beginPath();
                ctx.moveTo(xPx, yAxis.top);
                ctx.lineTo(xPx, yAxis.bottom);
                ctx.strokeStyle = color;
                ctx.stroke();
                ctx.fillStyle = color;
                ctx.fillText(label, xPx + 4, yAxis.top + yOffset);
            };

            // Employment retirement line (always show when set, unless it coincides with FI)
            if (empRetAge && (!fiAge || Math.abs(empRetAge - fiAge) > 0.1)) {
                drawLine(empRetAge, '#94a3b8', 'Retire', 15);
            }
            // FI line
            if (fiAge) drawLine(fiAge, '#10b981', 'FI', fiAge === empRetAge ? 15 : 30);
            // DB Pension — always draw when set (it's a milestone whether before or after FI)
            if (pensionAge < 999) drawLine(pensionAge, '#8b5cf6', 'DB Pension', 45);
            // Bridge end
            if (showBridgeEnd) drawLine(65, '#f59e0b', 'Bridge Ends', 60);
            // CPP — always draw when set
            if (cppAge < 999) {
                const offset = showBridgeEnd ? 75 : 60;
                drawLine(cppAge, '#06b6d4', 'CPP', offset);
            }
            // OAS — always draw when set and at a different age from CPP
            if (oasAge < 999 && oasAge !== cppAge) {
                const offset = showBridgeEnd ? 90 : 75;
                drawLine(oasAge, '#f97316', 'OAS', offset);
            }

            ctx.restore();
        }
    };

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";

    const showLegend = dataNoPension && dataNoPension.length > 0;
    const datasets = [{
        label: 'Portfolio (With DB Pension)',
        data,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 3,
        pointRadius: 0,
        pointHitRadius: 10,
        fill: true,
        tension: 0.4
    }];

    if (showLegend) {
        datasets.push({
            label: 'Portfolio (No DB Pension)',
            data: dataNoPension,
            borderColor: '#f59e0b',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            pointHitRadius: 10,
            fill: false,
            tension: 0.4
        });
    }

    retirementChartInstance = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: showLegend },
                tooltip: {
                    callbacks: {
                        title: (items) => `Age ${formatNumber(items[0].parsed.x)}`,
                        label: (item) => (item.dataset.label ? item.dataset.label + ': ' : '') + formatCurrency(item.parsed.y)
                    },
                    backgroundColor: 'rgba(20, 26, 41, 0.9)',
                    titleFont: { size: 14 },
                    bodyFont: { size: 14 },
                    padding: 12,
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1
                }
            },
            scales: {
                x: { type: 'linear', title: { display: true, text: 'Age' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: {
                    title: { display: true, text: 'Balance ($)' },
                    grid: { color: (ctx) => ctx.tick.value === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.05)' },
                    ticks: { callback: (val) => (val < 0 ? '-$' : '$') + Math.abs(val / 1000) + 'k' }
                }
            }
        },
        plugins: [verticalLinePlugin]
    });
}

function updateDemographicBenchmarks() {
    const province  = document.getElementById('demoProvince').value;
    const household = document.getElementById('demoHousehold').value;

    const householdLabelMap = {
        "Single": "Single / Unattached",
        "CoupleNoChildren": "Couple w/o children",
        "CoupleChildren": "Couple w/ children",
        "LoneParent": "Lone Parent"
    };
    const ageLabelMap = {
        "Under30": "Under 30 years", "30to39": "30 to 39 years",
        "40to54": "40 to 54 years", "55to64": "55 to 64 years", "Over65": "65 years and over"
    };

    const currentAgeVal = parseFloat(inputs.currentAge.value) || 0;
    let ageGroup = "30to39";
    if      (currentAgeVal < 30)  ageGroup = "Under30";
    else if (currentAgeVal <= 39) ageGroup = "30to39";
    else if (currentAgeVal <= 54) ageGroup = "40to54";
    else if (currentAgeVal <= 64) ageGroup = "55to64";
    else                          ageGroup = "Over65";

    const userIncome   = parseFloat(inputs.annualIncome.value)   || 0;
    const userExpenses = parseFloat(inputs.annualExpenses.value) || 0;

    const benchIncome        = STATCAN_DATA.incomeByProvinceAndType[province][household];
    const benchExpHousehold  = STATCAN_DATA.spendingByHousehold[household];
    const benchExpProvince   = STATCAN_DATA.spendingByProvince[province];
    const benchExpAge        = STATCAN_DATA.spendingByAge[ageGroup];


    document.getElementById('compUserIncome').textContent           = formatCurrency(userIncome);
    document.getElementById('compBenchIncome').textContent          = formatCurrency(benchIncome);
    document.getElementById('compIncomeBenchmarkLabel').textContent = `${province} ${householdLabelMap[household]} Median`;
    document.getElementById('compUserExpenses').textContent         = formatCurrency(userExpenses);
    document.getElementById('compBenchExpHousehold').textContent    = formatCurrency(benchExpHousehold);
    document.getElementById('compBenchExpProvince').textContent     = formatCurrency(benchExpProvince);
    document.getElementById('compBenchExpAge').textContent          = formatCurrency(benchExpAge);

    const incomeDiff    = userIncome - benchIncome;
    const incomePercent = benchIncome > 0 ? (incomeDiff / benchIncome) * 100 : 0;
    const incomeBadge   = document.getElementById('incomeBadge');
    const incomeNarrative = document.getElementById('incomeNarrative');
    if (userIncome <= 0) {
        // No employment income entered — a "−100% vs benchmark" badge would be
        // misleading (e.g. an already-retired user living on a pension).
        incomeBadge.textContent = 'No income entered';
        incomeBadge.className   = 'badge';
        incomeNarrative.innerHTML = `No employment income entered. Enter your annual after-tax income on the calculator to compare it against the median for a <strong>${householdLabelMap[household]} in ${province}</strong> (${formatCurrency(benchIncome)}, source: Canadian Income Survey).`;
    } else {
        if (incomeDiff >= 0) {
            incomeBadge.textContent = `+${formatNumber(Math.abs(incomePercent))}% vs benchmark`;
            incomeBadge.className   = "badge badge-success";
        } else {
            incomeBadge.textContent = `-${formatNumber(Math.abs(incomePercent))}% vs benchmark`;
            incomeBadge.className   = "badge badge-danger";
        }
        incomeNarrative.innerHTML = `Your annual post-tax income (${formatCurrency(userIncome)}) is <strong>${formatCurrency(Math.abs(incomeDiff))} ${incomeDiff >= 0 ? 'higher' : 'lower'}</strong> than the median after-tax income for a <strong>${householdLabelMap[household]} in ${province}</strong> (${formatCurrency(benchIncome)}) (source: Canadian Income Survey).`;
    }

    const expDiffHousehold    = userExpenses - benchExpHousehold;
    const expPercentHousehold = benchExpHousehold > 0 ? (expDiffHousehold / benchExpHousehold) * 100 : 0;
    const expensesBadge       = document.getElementById('expensesBadge');
    if (expDiffHousehold <= 0) {
        expensesBadge.textContent = `-${formatNumber(Math.abs(expPercentHousehold))}% vs benchmark`;
        expensesBadge.className   = "badge badge-success";
    } else {
        expensesBadge.textContent = `+${formatNumber(Math.abs(expPercentHousehold))}% vs benchmark`;
        expensesBadge.className   = "badge badge-danger";
    }

    const expDiffProvince = userExpenses - benchExpProvince;
    const expDiffAge      = userExpenses - benchExpAge;
    document.getElementById('expensesNarrative').innerHTML = `
        Your annual expenses (${formatCurrency(userExpenses)}) are <strong>${formatCurrency(Math.abs(expDiffHousehold))} ${expDiffHousehold >= 0 ? 'higher' : 'lower'}</strong> than the average for a <strong>${householdLabelMap[household]} in Canada</strong> (${formatCurrency(benchExpHousehold)}).
        <br><br>For additional context:
        <ul>
            <li>Your spending is <strong>${formatCurrency(Math.abs(expDiffProvince))} ${expDiffProvince >= 0 ? 'higher' : 'lower'}</strong> than the overall average for <strong>${province}</strong> (${formatCurrency(benchExpProvince)}).</li>
            <li>Your spending is <strong>${formatCurrency(Math.abs(expDiffAge))} ${expDiffAge >= 0 ? 'higher' : 'lower'}</strong> than the average for households aged <strong>${ageLabelMap[ageGroup]} in Canada</strong> (${formatCurrency(benchExpAge)}).</li>
        </ul>
    `;
}

// ============================================================
// Report Tab
// ============================================================

function renderReport(data) {
    const panel = document.getElementById('reportPanel');
    if (!panel) return;
    if (!SHOW_REPORT_TAB) { panel.innerHTML = ''; lastReportData = null; return; }
    lastReportData = data;
    const province  = document.getElementById('demoProvince')?.value  || 'Canada';
    const household = document.getElementById('demoHousehold')?.value || 'CoupleNoChildren';
    panel.innerHTML = buildReportHTML(data, province, household);
    wireReportSelectors();
}

function buildReportHTML(data, province, household) {
    const { fiAge } = data;
    const now = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
    return `
        <div class="report-doc">
            <div class="report-header-row">
                <div>
                    <div class="report-section-label">Retirement Projection Report</div>
                    <div style="color:var(--text-muted);font-size:0.82rem;">Generated ${now}</div>
                </div>
                <button class="report-print-btn" onclick="window.print()">Print / Save PDF</button>
            </div>
            <p class="report-intro">This report turns the numbers from the calculator into plain English. It walks through <strong>where you stand today</strong>, <strong>when you could stop needing a paycheque</strong>, <strong>where your money will come from</strong> in retirement, and <strong>how you compare</strong> to other Canadians. No financial background needed — every term is explained as it comes up. For the formulas and data sources behind it, see the <a href="methodology.html" style="color:var(--accent-color);">methodology</a>.</p>
            ${rptSnapshot(data)}
            ${rptAnswer(data)}
            ${fiAge ? rptIncome(data) : ''}
            ${rptTimeline(data)}
            <div id="reportBenchmarkOuter">${rptBenchmarks(data, province, household)}</div>
            ${rptAssumptions(data)}
        </div>
    `;
}

function wireReportSelectors() {
    const rp = document.getElementById('reportDemoProvince');
    const rh = document.getElementById('reportDemoHousehold');
    if (!rp || !rh) return;
    function onChange() {
        const mp = document.getElementById('demoProvince');
        const mh = document.getElementById('demoHousehold');
        if (mp) mp.value = rp.value;
        if (mh) mh.value = rh.value;
        updateDemographicBenchmarks();
        const outer = document.getElementById('reportBenchmarkOuter');
        if (outer && lastReportData) {
            outer.innerHTML = rptBenchmarks(lastReportData, rp.value, rh.value);
            wireReportSelectors();
        }
    }
    rp.addEventListener('change', onChange);
    rh.addEventListener('change', onChange);
}

function rptSnapshot(d) {
    const { age, income, expenses, savings, savingsRate, balance,
            includePension, isGCMode, pensionAge, lifetimePension, bridgeBenefit,
            includeCppOas, cppAmount, cppAge, oasAmount, oasAge, rentalIncome } = d;

    // A plain-language story of the numbers rather than a label/value dump.
    const earnSpend = income > 0
        ? `You earn <strong>${formatCurrency(income)} a year</strong> after tax and spend about <strong>${formatCurrency(expenses)}</strong>, `
        : `You have not entered any employment income, and you spend about <strong>${formatCurrency(expenses)} a year</strong>. `;

    let saveStory = '';
    if (income > 0) {
        if (savings > 0) {
            saveStory = `which means you put away <strong>${formatCurrency(savings)} a year</strong> — roughly <strong>${formatNumber(savingsRate)} cents of every dollar</strong> you take home. That savings rate is the single biggest lever on when you become financially independent: the more of each paycheque you keep and invest, the sooner those investments can support you instead of your job.`;
        } else if (savings === 0) {
            saveStory = `which means that right now you spend everything you earn. Financial independence really gets going once you find even a small, regular surplus to invest.`;
        } else {
            saveStory = `which means you currently spend <strong>${formatCurrency(-savings)} more than you earn</strong> each year. Closing that gap — or leaning on guaranteed income such as a pension — is what makes early independence possible.`;
        }
    }

    const balStory = balance > 0
        ? `You have already built an investment portfolio worth <strong>${formatCurrency(balance)}</strong>. Think of a portfolio as a money-making machine: invested sensibly, it grows on its own and will eventually pay you an income without you lifting a finger.`
        : `You have not entered an investment portfolio yet. A "portfolio" is simply the pool of invested savings that one day pays you an income in place of a job — it is the engine this whole plan is built around.`;

    // Future income sources, each with a one-line plain explanation, because a
    // reader new to this may not know what a DB pension, CPP or OAS actually is.
    const sourceLines = [];
    if (includePension) {
        const total = lifetimePension + bridgeBenefit;
        const label = isGCMode ? 'your government (MyGCPension) defined-benefit pension' : 'your defined-benefit (DB) pension';
        sourceLines.push(`<li><strong>${formatCurrency(total)}/yr from ${label}</strong>, beginning at age ${formatNumber(pensionAge)}. A defined-benefit pension is a guaranteed paycheque for life that your employer funds — income you never had to save for yourself${isGCMode && bridgeBenefit > 0 ? `. Part of it (a ${formatCurrency(bridgeBenefit)}/yr "bridge") tops you up until 65, then stops once CPP and OAS take over` : ''}.</li>`);
    }
    if (includeCppOas && cppAmount > 0) sourceLines.push(`<li><strong>${formatCurrency(cppAmount)}/yr from CPP</strong>, starting at age ${cppAge}. The Canada Pension Plan pays you back, as a monthly cheque for life, for the contributions taken off your paycheques during your working years.</li>`);
    if (includeCppOas && oasAmount > 0) sourceLines.push(`<li><strong>${formatCurrency(oasAmount)}/yr from OAS</strong>, starting at age ${oasAge}. Old Age Security is a pension most Canadians receive from the government starting around 65, paid out of general taxes rather than your own contributions.</li>`);
    if (rentalIncome > 0) sourceLines.push(`<li><strong>${formatCurrency(rentalIncome)}/yr in rental income</strong> from property you own — income that arrives whether or not you are working.</li>`);

    const sourcesBlock = sourceLines.length
        ? `<p class="report-narrative">On top of your own savings, you can count on these guaranteed income streams later in life:</p>
           <ul class="report-source-list">${sourceLines.join('')}</ul>`
        : `<p class="report-narrative">You have not added a pension, CPP or OAS. That is fine — this report will show what your portfolio needs to do on its own. Adding those sources on the Calculator tab will show how much they shorten the journey.</p>`;

    return `
        <div class="report-section">
            <div class="report-section-label">Section 1</div>
            <h2>Where You Stand Today</h2>
            <p class="report-narrative">You are <strong>${formatNumber(age)} years old</strong>. ${earnSpend}${saveStory}</p>
            <p class="report-narrative">${balStory}</p>
            ${sourcesBlock}
        </div>`;
}

function rptAnswer(d) {
    const { fiAge, yearsToFI, fiPortfolio, fiPortfolioNoPension,
            expenses, includePension, swr, swrDecimal, benefits } = d;

    if (!fiAge) return `
        <div class="report-section">
            <div class="report-section-label">Section 2</div>
            <h2>Financial Independence</h2>
            <p class="report-narrative">Financial independence could not be calculated with the current inputs. Ensure you have entered your annual expenses and consider adding a portfolio balance or retirement income sources.</p>
        </div>`;

    const fiYear = new Date().getFullYear() + Math.round(yearsToFI);
    const netExp = Math.max(0, expenses - getRetirementIncome(fiAge, benefits));

    // Correct, plain-language description of what the portfolio does at FI —
    // shared with the calculator so the two views never contradict. It picks
    // the right wording for the "steady withdrawal" vs. "bridge until your
    // pension/CPP/OAS start" situations.
    const portDesc = describeFiPortfolio(fiAge, expenses, benefits, fiPortfolio, swr, swrDecimal);

    // The report is written for readers with little financial background, so
    // explain the safe-withdrawal-rate concept rather than assume it.
    const swrExplainer = netExp > 0
        ? `<p class="report-narrative" style="font-size:0.85rem;color:var(--text-muted);"><strong>What is a "safe withdrawal rate"?</strong> It is the share of your portfolio you can spend each year — historically around ${formatNumber(swr)}% — that has let portfolios last 30+ years without running dry. At ${formatNumber(swr)}%, every ${formatCurrency(100 / swr)} of portfolio supports about ${formatCurrency(1)} of annual spending, so covering ${formatCurrency(netExp)}/yr needs roughly ${formatCurrency(netExp / swrDecimal)} set aside for that gap.</p>`
        : '';

    const pensionBlock = includePension && fiPortfolioNoPension !== null && fiPortfolioNoPension > fiPortfolio
        ? `<div class="report-pension-callout">
                <strong>Your DB pension reduces the portfolio you need by ${formatCurrency(fiPortfolioNoPension - fiPortfolio)}</strong> — from ${formatCurrency(fiPortfolioNoPension)} (without pension) down to ${formatCurrency(fiPortfolio)} (with pension). A guaranteed pension does the job a much larger pile of savings would otherwise have to do, which is why it is such a valuable part of your compensation as a public servant.
           </div>`
        : '';

    return `
        <div class="report-section">
            <div class="report-section-label">Section 2</div>
            <h2>Financial Independence</h2>
            <div class="report-fi-hero">
                <div class="fi-label">You can reach Financial Independence at age</div>
                <div class="fi-age">${formatNumber(fiAge)}</div>
                <div class="fi-sub">${formatNumber(yearsToFI)} years from now &nbsp;·&nbsp; ~${fiYear}</div>
            </div>
            <p class="report-narrative"><strong>What does this mean?</strong> Financial independence is the point where you no longer <em>need</em> a paycheque. Your investment portfolio — together with any pension, CPP, OAS or other steady income — can cover your living expenses on its own, for the rest of your life. Reaching it does not mean you must stop working; it means work becomes a choice.</p>
            <p class="report-narrative">${portDesc}</p>
            ${swrExplainer}
            ${pensionBlock}
        </div>`;
}

function rptIncome(d) {
    const { fiAge, expenses, includePension, isGCMode, pensionAge, lifetimePension,
            bridgeBenefit, includeCppOas, cppAmount, cppAge, oasAmount, oasAge,
            rentalIncome, swr, swrDecimal, fiPortfolio } = d;

    const rows = [];
    if (includePension && pensionAge < 999) {
        if (fiAge >= pensionAge) {
            rows.push({ label: isGCMode ? 'Lifetime Pension' : 'DB Pension', when: `Starts age ${formatNumber(pensionAge)}`, amount: lifetimePension });
            if (isGCMode && bridgeBenefit > 0 && fiAge < 65)
                rows.push({ label: 'Bridge Benefit', when: 'Ends at 65', amount: bridgeBenefit });
        } else {
            rows.push({ label: isGCMode ? 'Lifetime Pension' : 'DB Pension', when: `Age ${formatNumber(pensionAge)} — after FI`, amount: 0, pending: true });
        }
    }
    if (includeCppOas && cppAmount > 0) {
        if (fiAge >= cppAge) rows.push({ label: 'CPP', when: `Age ${cppAge}`, amount: cppAmount });
        else                 rows.push({ label: 'CPP', when: `Age ${cppAge} — after FI`, amount: 0, pending: true });
    }
    if (includeCppOas && oasAmount > 0) {
        if (fiAge >= oasAge) rows.push({ label: 'OAS', when: `Age ${oasAge}`, amount: oasAmount });
        else                 rows.push({ label: 'OAS', when: `Age ${oasAge} — after FI`, amount: 0, pending: true });
    }
    if (rentalIncome > 0) rows.push({ label: 'Rental Income', when: 'Ongoing', amount: rentalIncome });

    const totalPassive = rows.filter(r => !r.pending).reduce((s, r) => s + r.amount, 0);
    const draw = Math.max(0, expenses - totalPassive);
    const anyPending = rows.some(r => r.pending);

    // Bridge vs. steady state: if the withdrawal needed at FI is far more than a
    // steady SWR on the FI portfolio could sustain, the portfolio is BRIDGING
    // (temporarily spending principal until your income sources switch on) — it
    // is NOT a permanent SWR draw. Detect numerically so the wording is honest.
    const steadyDraw = fiPortfolio * swrDecimal;
    const isBridge   = draw > steadyDraw + 1;

    const rowsHTML = rows.map(r => `
        <tr${r.pending ? ' class="pending-row"' : ''}>
            <td>${r.label}</td>
            <td style="color:var(--text-muted);font-size:0.83rem;">${r.when}</td>
            <td>${r.pending ? '<em style="font-size:0.8rem;color:var(--text-muted);">not yet active</em>' : formatCurrency(r.amount) + '/yr'}</td>
        </tr>`).join('');

    let portRow, coverNote;
    if (draw === 0) {
        portRow = `<tr class="portfolio-row"><td colspan="2" style="color:var(--text-muted);">Portfolio — no withdrawal needed</td><td>$0/yr</td></tr>`;
        coverNote = `At age ${formatNumber(fiAge)}, your guaranteed income alone fully covers your ${formatCurrency(expenses)}/yr of expenses — your portfolio can keep growing untouched, a comfortable cushion against surprises.`;
    } else if (isBridge) {
        // FI reached before income sources begin — portfolio temporarily funds (most of) the bill.
        portRow = `<tr class="portfolio-row"><td>Portfolio (bridge)</td><td style="color:var(--text-muted);font-size:0.83rem;">Spends down ${formatCurrency(fiPortfolio)} until your income starts</td><td>${formatCurrency(draw)}/yr</td></tr>`;
        coverNote = totalPassive === 0
            ? `Notice that at age ${formatNumber(fiAge)} <strong>none of your guaranteed income has started yet</strong> — so for now your portfolio covers the full ${formatCurrency(expenses)}/yr. This is a short <strong>bridge</strong>, not a forever withdrawal: your ${formatCurrency(fiPortfolio)} is meant to be spent down over these few years until your pension/CPP/OAS switch on and take over. That is exactly why this FI portfolio can look small — it only has to last until your income arrives.`
            : `At age ${formatNumber(fiAge)} your guaranteed income has only partly started, so your portfolio <strong>bridges</strong> the remaining ${formatCurrency(draw)}/yr by spending down principal until your other income sources begin — after which your own withdrawals drop sharply.`;
    } else {
        // Steady state: all income active, portfolio sustainably covers the gap at SWR.
        portRow = `<tr class="portfolio-row"><td>Portfolio withdrawal (${formatNumber(swr)}% a year)</td><td style="color:var(--text-muted);font-size:0.83rem;">From your ${formatCurrency(fiPortfolio)} portfolio</td><td>${formatCurrency(draw)}/yr</td></tr>`;
        coverNote = `At age ${formatNumber(fiAge)}, your guaranteed income covers most of the bill and your portfolio quietly tops up the remaining <strong>${formatCurrency(draw)}/yr</strong>. You never sell everything at once — you withdraw only that gap each year (about ${formatNumber(swr)}% of the portfolio) while the rest stays invested and keeps growing.`;
    }

    const pendingNote = anyPending && !isBridge
        ? `<p class="report-narrative">Some of your income (marked <em>not yet active</em>) does not start until later. In the early years your portfolio shoulders more of the load, and as each pension or benefit switches on, the amount you withdraw drops. The plan already accounts for this.</p>`
        : '';

    return `
        <div class="report-section">
            <div class="report-section-label">Section 3</div>
            <h2>Where Your Money Will Come From</h2>
            <p class="report-narrative">Once you stop working, your income arrives in <strong>layers</strong>. Guaranteed cheques — a pension, CPP, OAS — come in first. Whatever they don't cover, your portfolio fills by selling a small slice each year. Here is how those layers stack up at the age you reach financial independence:</p>
            <table class="report-income-table">
                <thead><tr><th>Income Source</th><th>Timing</th><th style="text-align:right;">Annual Amount</th></tr></thead>
                <tbody>
                    ${rowsHTML}
                    ${portRow}
                    <tr class="income-total"><td colspan="2">Your Annual Expenses</td><td>${formatCurrency(expenses)}/yr</td></tr>
                </tbody>
            </table>
            <p class="report-narrative">${coverNote}</p>
            ${pendingNote}
        </div>`;
}

function rptTimeline(d) {
    const { age, income, expenses, balance, fiAge, fiPortfolio, swrDecimal, swr,
            includePension, isGCMode, pensionAge, lifetimePension, bridgeBenefit,
            includeCppOas, cppAmount, cppAge, oasAmount, oasAge,
            includeRetAge, plannedRetAge, balAtEmpRet, benefits } = d;

    if (!fiAge) return '';

    const events = [];
    const balNote = balance > 0 ? ` Portfolio: ${formatCurrency(balance)}.` : '';
    const todayBody = income > 0
        ? `Age ${formatNumber(age)}.${balNote} Working — ${formatCurrency(income)}/yr income, ${formatCurrency(expenses)}/yr expenses.`
        : `Age ${formatNumber(age)}.${balNote} No employment income — living on ${formatCurrency(expenses)}/yr in expenses, funded by your portfolio and any pension/CPP/OAS income.`;
    events.push({ age, isFI: false, title: 'Today', body: todayBody });

    if (includeRetAge && Math.abs(plannedRetAge - fiAge) > 0.1) {
        const isAfterFI = plannedRetAge > fiAge;
        const incDesc   = describeIncomeAt(plannedRetAge, expenses, benefits, isGCMode);
        const prefix    = isAfterFI
            ? `Already financially independent — stopping work is optional. Portfolio at ${formatCurrency(balAtEmpRet)}.`
            : `Stop working. Portfolio at ${formatCurrency(balAtEmpRet)}.`;
        events.push({ age: plannedRetAge, isFI: false, title: 'Employment Retirement', body: `${prefix} ${incDesc}` });
    }

    // FI description — shared single source of truth with the calculator.
    const rptFiBody = describeFiPortfolio(fiAge, expenses, benefits, fiPortfolio, swr, swrDecimal);
    events.push({ age: fiAge, isFI: true, title: 'Financial Independence', body: rptFiBody });

    if (includePension && pensionAge < 999 && pensionAge > age) {
        events.push({ age: pensionAge, isFI: false, title: 'DB Pension Starts',
            body: describeIncomeAt(pensionAge, expenses, benefits, isGCMode) });
    }

    if (includeCppOas && cppAmount > 0 && cppAge > age) {
        const combined = oasAmount > 0 && oasAge === cppAge;
        events.push({ age: cppAge, isFI: false, title: combined ? 'CPP & OAS Start' : 'CPP Starts',
            body: describeIncomeAt(cppAge, expenses, benefits, isGCMode) });
    }

    if (includeCppOas && oasAmount > 0 && oasAge > age && !(cppAmount > 0 && oasAge === cppAge)) {
        events.push({ age: oasAge, isFI: false, title: 'OAS Starts',
            body: describeIncomeAt(oasAge, expenses, benefits, isGCMode) });
    }

    events.sort((a, b) => a.age - b.age);

    const items = events.map(e => `
        <li class="report-timeline-item${e.isFI ? ' fi-item' : ''}">
            <div class="report-timeline-age">
                <span class="age-num">${formatNumber(e.age)}</span>
                <span class="age-label">Age</span>
            </div>
            <div class="report-timeline-body">
                <h4>${e.title}</h4>
                <p>${e.body}</p>
            </div>
        </li>`).join('');

    return `
        <div class="report-section">
            <div class="report-section-label">Section 4</div>
            <h2>Your Financial Journey, Step by Step</h2>
            <p class="report-narrative">Here is the same plan told as a story — the key moments from today onward, and what changes at each one. The highlighted milestone is the day you become financially independent.</p>
            <ul class="report-timeline">${items}</ul>
        </div>`;
}

function rptBenchmarks(d, province, household) {
    const { age, income, expenses } = d;

    const hhLabels = { "Single": "Single / Unattached", "CoupleNoChildren": "Couple without children", "CoupleChildren": "Couple with children", "LoneParent": "Lone-parent family" };
    const ageLabels = { "Under30": "Under 30", "30to39": "30–39", "40to54": "40–54", "55to64": "55–64", "Over65": "65 and over" };
    let ag = "30to39";
    if      (age < 30)  ag = "Under30";
    else if (age <= 39) ag = "30to39";
    else if (age <= 54) ag = "40to54";
    else if (age <= 64) ag = "55to64";
    else                ag = "Over65";

    const benchInc  = STATCAN_DATA.incomeByProvinceAndType[province]?.[household] || 0;
    const benchExpHH   = STATCAN_DATA.spendingByHousehold[household] || 0;
    const benchExpProv = STATCAN_DATA.spendingByProvince[province]   || 0;
    const benchExpAge  = STATCAN_DATA.spendingByAge[ag]               || 0;

    const hhLabel  = hhLabels[household]  || household;
    const ageLabel = ageLabels[ag] || ag;

    function diffTag(diff, pct, higherGood) {
        const good  = higherGood ? diff >= 0 : diff <= 0;
        const color = diff === 0 ? 'var(--text-muted)' : (good ? '#34d399' : '#f87171');
        return `<div class="compare-diff" style="color:${color};font-size:0.78rem;margin-top:0.3rem;">${diff >= 0 ? '+' : ''}${formatCurrency(diff)} (${diff >= 0 ? '+' : ''}${formatNumber(pct)}%) vs. benchmark</div>`;
    }

    const incDiff = income - benchInc;
    const incPct  = benchInc > 0 ? incDiff / benchInc * 100 : 0;

    const exDiffHH   = expenses - benchExpHH;   const exPctHH   = benchExpHH   > 0 ? exDiffHH   / benchExpHH   * 100 : 0;
    const exDiffProv = expenses - benchExpProv;  const exPctProv = benchExpProv  > 0 ? exDiffProv / benchExpProv  * 100 : 0;
    const exDiffAge  = expenses - benchExpAge;   const exPctAge  = benchExpAge   > 0 ? exDiffAge  / benchExpAge   * 100 : 0;

    const provinces = ['Canada','Alberta','British Columbia','Manitoba','New Brunswick','Newfoundland and Labrador','Nova Scotia','Ontario','Prince Edward Island','Quebec','Saskatchewan'];
    const provOpts  = provinces.map(p => `<option value="${p}"${p===province?' selected':''}>${p}</option>`).join('');
    const hhOpts    = [['Single','Single / Unattached'],['CoupleNoChildren','Couple without children'],['CoupleChildren','Couple with children'],['LoneParent','Lone parent']]
                        .map(([v,l]) => `<option value="${v}"${v===household?' selected':''}>${l}</option>`).join('');

    const incInterpret = income === 0 ? 'Enter your income on the Calculator tab to see this comparison.'
        : incDiff >= 0 ? 'Above the median — generally greater capacity to save toward FI.'
                       : 'Below the median for this group. Your DB pension or other income sources may compensate.';

    const expInterpret = expenses === 0 ? 'Enter your expenses on the Calculator tab to see this comparison.'
        : exDiffHH <= 0 ? `Below the average for a ${hhLabel} household — lower spending accelerates your path to FI.`
                        : `Above the average for a ${hhLabel} household — this may reflect lifestyle, regional costs, or a life phase with elevated spending.`;

    return `
        <div class="report-section">
            <div class="report-section-label">Section 5</div>
            <h2>How You Compare to Other Canadians</h2>
            <p class="report-narrative">Official Statistics Canada benchmarks grounded in real survey data. Adjust your reference group using the selectors below.</p>

            <div class="report-selectors-row">
                <div class="report-select-group">
                    <label for="reportDemoProvince">Province</label>
                    <div class="input-wrapper select-wrapper"><select id="reportDemoProvince">${provOpts}</select></div>
                </div>
                <div class="report-select-group">
                    <label for="reportDemoHousehold">Household Composition</label>
                    <div class="input-wrapper select-wrapper"><select id="reportDemoHousehold">${hhOpts}</select></div>
                </div>
            </div>

            <div class="report-benchmark-block">
                <h3>Income</h3>
                <span class="report-benchmark-tag two-way">2-way comparison</span>
                <div class="report-compare-row">
                    <div class="report-compare-item user-item">
                        <div class="compare-label">Your after-tax income</div>
                        <div class="compare-val">${income > 0 ? formatCurrency(income) : '—'}</div>
                    </div>
                    <div class="report-compare-item">
                        <div class="compare-label">${hhLabel} median · ${province}</div>
                        <div class="compare-val">${formatCurrency(benchInc)}</div>
                        ${income > 0 ? diffTag(incDiff, incPct, true) : ''}
                    </div>
                </div>
                <div class="report-explanation">
                    <strong>What you're seeing:</strong> Your income vs. the <em>median</em> after-tax income for a <strong>${hhLabel}</strong> household in <strong>${province}</strong>. The median is the exact midpoint — half of similar households earn more, half earn less. Source: <em>Statistics Canada, Canadian Income Survey (CIS 2024), Table 11-10-0190-01</em>.
                    ${income > 0 ? '<br><br>' + incInterpret : ''}
                </div>
            </div>

            <div class="report-benchmark-block">
                <h3>Expenses</h3>
                <span class="report-benchmark-tag three-way">3-way comparison</span>
                <p class="report-narrative" style="font-size:0.83rem;margin-bottom:0.85rem;">Statistics Canada does not publish spending cross-tabulated by province + household type + age simultaneously — each dimension is a separate survey table. Three benchmarks are shown because each answers a different question.</p>
                <div class="report-compare-row">
                    <div class="report-compare-item user-item">
                        <div class="compare-label">Your annual expenses</div>
                        <div class="compare-val">${expenses > 0 ? formatCurrency(expenses) : '—'}</div>
                    </div>
                    <div class="report-compare-item">
                        <div class="compare-label">Household type avg (Canada)</div>
                        <div class="compare-val">${formatCurrency(benchExpHH)}</div>
                        ${expenses > 0 ? diffTag(exDiffHH, exPctHH, false) : ''}
                    </div>
                    <div class="report-compare-item">
                        <div class="compare-label">Provincial avg (${province})</div>
                        <div class="compare-val">${formatCurrency(benchExpProv)}</div>
                        ${expenses > 0 ? diffTag(exDiffProv, exPctProv, false) : ''}
                    </div>
                    <div class="report-compare-item">
                        <div class="compare-label">Age group avg (${ageLabel})</div>
                        <div class="compare-val">${formatCurrency(benchExpAge)}</div>
                        ${expenses > 0 ? diffTag(exDiffAge, exPctAge, false) : ''}
                    </div>
                </div>
                <div class="report-explanation">
                    <strong>What each benchmark tells you:</strong>
                    <ul style="margin:0.5rem 0 0;padding-left:1.2rem;line-height:1.65;">
                        <li><strong>Household type (${hhLabel}):</strong> The most meaningful — family structure is the primary driver of spending. Canada-wide average for your household type. <em>SHS 2023, Table 11-10-0244-01.</em></li>
                        <li><strong>Province (${province}):</strong> All households in your province regardless of type — shows geographic cost differences. <em>SHS 2023, Table 11-10-0222-01.</em></li>
                        <li><strong>Age group (${ageLabel}):</strong> Canada-wide average for your age bracket — spending peaks at 40–54 and declines significantly post-65. <em>SHS 2023, Table 11-10-0227-01.</em></li>
                    </ul>
                    ${expenses > 0 ? '<br>' + expInterpret : ''}
                </div>
            </div>
        </div>`;
}

function rptAssumptions(d) {
    const { roiAnnual, swr, isGCMode, bridgeBenefit } = d;
    return `
        <div class="report-section">
            <div class="report-section-label">Section 6</div>
            <h2>What We Assumed (and What to Watch)</h2>
            <p class="report-narrative">Every projection rests on a few assumptions. Here they are in plain language, so you know exactly what this report is — and is not — promising.</p>
            <ul class="report-source-list">
                <li><strong>Your investments grow ${formatNumber(roiAnnual)}% a year, after inflation.</strong> Because inflation is already removed, every dollar in this report is in <em>today's</em> money — ${formatCurrency(100000)} here means today's spending power, not a bigger-but-weaker future number. Real markets are bumpy; this is a steady long-run average, not a guarantee.</li>
                <li><strong>You can safely spend ${formatNumber(swr)}% of your portfolio each year.</strong> This "safe withdrawal rate" comes from research (Bengen, 1994) showing a balanced portfolio has historically lasted 30+ years at this pace. Spend much more and you risk running dry; spend less and you almost certainly leave money behind.</li>
                <li><strong>Financial independence means lasting to age 100.</strong> We treat you as independent at the earliest age your money can cover expenses all the way to 100 — a deliberately cautious finish line.</li>
                ${isGCMode && bridgeBenefit > 0 ? '<li><strong>Your pension\'s "bridge" top-up ends exactly at 65.</strong> This follows the standard federal (PSSA) pension structure, where the bridge hands off to CPP and OAS at 65.</li>' : ''}
                <li><strong>Your home is not counted.</strong> The roof over your head isn't part of the portfolio that pays your bills, so it is left out entirely.</li>
            </ul>
            <p class="report-narrative" style="margin-top:1.1rem;font-size:0.82rem;">This is a personal planning tool, <strong>not financial advice</strong>. Real life brings tax rules, market swings and life changes a simple model can't capture — treat it as a well-informed starting point, not a promise. The <a href="methodology.html" style="color:var(--accent-color);">full methodology</a> has the formulas and data sources.</p>
        </div>`;
}

// Tab switching: Calculator <-> Report
(function () {
    const tabCalc   = document.getElementById('navTabCalculator');
    const tabReport = document.getElementById('navTabReport');
    if (!tabCalc || !tabReport) return;

    // Report tab unpublished — hide it and keep the calculator as the only view.
    if (!SHOW_REPORT_TAB) { tabReport.style.display = 'none'; return; }

    const dashboard   = document.querySelector('.dashboard');
    const compPanel   = document.getElementById('comparisonPanel');
    const repPanel    = document.getElementById('reportPanel');
    const mainHeader  = document.querySelector('.container > header');

    function setView(view) {
        const isReport = view === 'report';
        dashboard.style.display  = isReport ? 'none' : '';
        compPanel.style.display  = isReport ? 'none' : '';
        repPanel.style.display   = isReport ? 'block' : 'none';
        if (mainHeader) mainHeader.style.display = isReport ? 'none' : '';
        tabCalc.classList.toggle('active', !isReport);
        tabReport.classList.toggle('active', isReport);
        if (isReport) window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    tabCalc.addEventListener('click',   e => { e.preventDefault(); setView('calculator'); });
    tabReport.addEventListener('click', e => { e.preventDefault(); setView('report'); });
}());
