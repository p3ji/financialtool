// Formatters
const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
const formatNumber = (val) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(val);

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

// CPP & OAS adjustment helpers
function calcCppAdjusted(baseAmount, startAge) {
    const clampedAge = Math.min(Math.max(startAge, 60), 70);
    const monthsFromStd = (clampedAge - 65) * 12;
    if (monthsFromStd < 0) return baseAmount * (1 + 0.006 * monthsFromStd);
    if (monthsFromStd > 0) return baseAmount * (1 + 0.007 * monthsFromStd);
    return baseAmount;
}

function calcOasAdjusted(baseAmount, startAge) {
    const clampedAge = Math.min(Math.max(startAge, 65), 70);
    const monthsFromStd = (clampedAge - 65) * 12;
    if (monthsFromStd <= 0) return baseAmount;
    return baseAmount * (1 + 0.006 * monthsFromStd);
}

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

/**
 * Returns the portfolio balance required to be financially independent at `currentAge`.
 * Works backward via present-value from the "terminal age" (last income transition).
 *
 * benefits = { pensionAge, lifetimePension, bridgeBenefit, cppAge, cppAmount, oasAge, oasAmount }
 * Use 999 as sentinel for disabled income sources.
 */
function getRequiredBalanceAtAge(currentAge, expenses, swrDecimal, rMonthly, benefits) {
    const {
        pensionAge = 999, lifetimePension = 0, bridgeBenefit = 0,
        cppAge = 999, cppAmount = 0,
        oasAge = 999, oasAmount = 0,
        rentalIncome = 0
    } = benefits || {};

    const terminalIncome = (pensionAge < 999 ? lifetimePension : 0) +
                           (cppAge   < 999 ? cppAmount         : 0) +
                           (oasAge   < 999 ? oasAmount         : 0) +
                           rentalIncome;
    const terminalPortfolio = Math.max(0, expenses - terminalIncome) / swrDecimal;

    const transitionAges = [];
    if (pensionAge < 999) {
        transitionAges.push(pensionAge);
        if (bridgeBenefit > 0 && pensionAge < 65) transitionAges.push(65);
    }
    if (cppAge < 999) transitionAges.push(cppAge);
    if (oasAge < 999) transitionAges.push(oasAge);

    if (transitionAges.length === 0) return terminalPortfolio;

    const terminalAge = Math.max(...transitionAges);
    if (currentAge >= terminalAge) return terminalPortfolio;

    const monthsToTerminal = Math.ceil((terminalAge - currentAge) * 12);
    let req = terminalPortfolio;

    for (let i = 1; i <= monthsToTerminal; i++) {
        const ageAtStep = terminalAge - (i / 12);
        let income = 0;
        if (pensionAge < 999 && ageAtStep >= pensionAge) {
            income += lifetimePension;
            if (ageAtStep < 65) income += bridgeBenefit;
        }
        if (cppAge < 999 && ageAtStep >= cppAge) income += cppAmount;
        if (oasAge < 999 && ageAtStep >= oasAge) income += oasAmount;
        income += rentalIncome;
        req = (req + Math.max(0, expenses - income) / 12) / (1 + rMonthly);
    }

    return req;
}

// Returns all passive retirement income active at a given age (pension + CPP + OAS + rental)
function getRetirementIncome(age, benefits) {
    const { pensionAge = 999, lifetimePension = 0, bridgeBenefit = 0,
            cppAge = 999, cppAmount = 0, oasAge = 999, oasAmount = 0, rentalIncome = 0 } = benefits;
    let income = 0;
    if (pensionAge < 999 && age >= pensionAge) {
        income += lifetimePension;
        if (age < 65) income += bridgeBenefit;
    }
    if (cppAge < 999 && age >= cppAge) income += cppAmount;
    if (oasAge < 999 && age >= oasAge) income += oasAmount;
    income += rentalIncome;
    return income;
}

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

// Returns a complete description of all active income sources at a given age
// and how much the portfolio must cover. Used by all timeline milestones.
function describeIncomeAt(age, expenses, benefits, gcMode) {
    const { pensionAge = 999, lifetimePension = 0, bridgeBenefit = 0,
            cppAge = 999, cppAmount = 0, oasAge = 999, oasAmount = 0, rentalIncome = 0 } = benefits;

    const parts = [];
    if (pensionAge < 999 && age >= pensionAge) {
        if (gcMode && bridgeBenefit > 0) {
            if (age < 65) {
                parts.push(`DB Pension: ${formatCurrency(lifetimePension + bridgeBenefit)}/yr (${formatCurrency(lifetimePension)} lifetime + ${formatCurrency(bridgeBenefit)} bridge, ends at 65)`);
            } else {
                parts.push(`DB Pension: ${formatCurrency(lifetimePension)}/yr (lifetime only — bridge ended at 65)`);
            }
        } else {
            parts.push(`DB Pension: ${formatCurrency(lifetimePension)}/yr`);
        }
    }
    if (cppAge < 999 && age >= cppAge) parts.push(`CPP: ${formatCurrency(cppAmount)}/yr`);
    if (oasAge < 999 && age >= oasAge) parts.push(`OAS: ${formatCurrency(oasAmount)}/yr`);
    if (rentalIncome > 0)              parts.push(`Rental: ${formatCurrency(rentalIncome)}/yr`);

    const totalIncome = getRetirementIncome(age, benefits);
    const gap = Math.max(0, expenses - totalIncome);

    if (parts.length === 0) {
        return `No passive income active — portfolio covers all ${formatCurrency(expenses)}/yr in expenses.`;
    }

    const joined   = parts.join(' + ');
    const totalStr = parts.length > 1 ? ` = ${formatCurrency(totalIncome)}/yr` : '';

    return gap === 0
        ? `${joined}${totalStr} — fully covers ${formatCurrency(expenses)}/yr in expenses.`
        : `${joined}${totalStr}. Portfolio draws the remaining ${formatCurrency(gap)}/yr.`;
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

    const maxMonths = (100 - age) * 12;
    // Month at which employment income stops
    const monthsToEmpStop = Math.max(0, Math.round((plannedRetAge - age) * 12));

    // -------------------------------------------------------------------
    // Single combined simulation pass: FI detection + chart/table data
    // Both "with pension" and "no pension" use the SAME employment retirement
    // age, so they accumulate identically and only diverge after that date.
    // -------------------------------------------------------------------

    function runSimulation(benfts) {
        let bal = balance;
        let fiMonth = null;
        const simData = [];
        const yearlyData = [];

        let sumIncome = 0, sumExpenses = 0, sumROI = 0;
        let startBalOfYear = balance;
        let currentYearAge = Math.floor(age);
        let isFIYear = false, isEmpRetYear = false;
        let isPensionYear = false, isCppYear = false, isOasYear = false;

        // Year 0 row (opening snapshot)
        yearlyData.push({
            age: currentYearAge, income: 0, expenses: 0, roi: 0,
            percentCovered: 0, changeInNetworth: 0, networth: balance,
            isFIYear: false, isEmpRetYear: false,
            isPensionYear: false, isCppYear: false, isOasYear: false
        });
        currentYearAge++;

        for (let m = 0; m <= maxMonths; m++) {
            const currentAge = age + m / 12;
            const isWorking  = m < monthsToEmpStop;

            // Key chart points: yearly + transitions
            if (m % 12 === 0 ||
                m === monthsToEmpStop ||
                (benfts.pensionAge < 999 && Math.abs(currentAge - benfts.pensionAge) < 0.05) ||
                (benfts.cppAge     < 999 && Math.abs(currentAge - benfts.cppAge)     < 0.05) ||
                (benfts.oasAge     < 999 && Math.abs(currentAge - benfts.oasAge)     < 0.05) ||
                Math.abs(currentAge - 65) < 0.05) {
                simData.push({ x: currentAge, y: bal });
            }

            // FI check
            const required = getRequiredBalanceAtAge(currentAge, expenses, swrDecimal, rMonthly, benfts);
            if (fiMonth === null && bal >= required) {
                fiMonth = m;
                isFIYear = true;
                simData.push({ x: currentAge, y: bal }); // ensure FI point is on chart
            }

            // Transition markers for table
            if (m === monthsToEmpStop) isEmpRetYear = true;
            if (benfts.pensionAge < 999 && currentAge >= benfts.pensionAge && currentAge - 1/12 < benfts.pensionAge) isPensionYear = true;
            if (benfts.cppAge     < 999 && currentAge >= benfts.cppAge     && currentAge - 1/12 < benfts.cppAge)     isCppYear    = true;
            if (benfts.oasAge     < 999 && currentAge >= benfts.oasAge     && currentAge - 1/12 < benfts.oasAge)     isOasYear    = true;

            // Monthly income for table (all amounts are monthly)
            const monthlyPassiveIncome = isWorking ? 0 : (getRetirementIncome(currentAge, benfts) / 12);
            const monthlyEmpIncome     = isWorking ? (income / 12) : 0;
            const monthlyIncome        = monthlyEmpIncome + monthlyPassiveIncome;
            const monthlyROI           = bal * rMonthly;
            sumROI      += monthlyROI;
            sumIncome   += monthlyIncome;
            sumExpenses += expenses / 12;

            // Balance step
            if (isWorking) {
                bal = bal * (1 + rMonthly) + savings / 12;
            } else {
                const passiveIncome = getRetirementIncome(currentAge, benfts);
                bal = bal * (1 + rMonthly) - Math.max(0, expenses - passiveIncome) / 12;
            }

            // End-of-year aggregation
            const isEndOfYear = (m + 1) % 12 === 0;
            if (isEndOfYear || m === maxMonths) {
                yearlyData.push({
                    age: currentYearAge,
                    income: sumIncome,
                    expenses: sumExpenses,
                    roi: sumROI,
                    percentCovered: sumExpenses > 0 ? (sumROI / sumExpenses) * 100 : 0,
                    changeInNetworth: bal - startBalOfYear,
                    networth: bal,
                    isFIYear, isEmpRetYear, isPensionYear, isCppYear, isOasYear
                });
                currentYearAge++;
                sumIncome = sumExpenses = sumROI = 0;
                startBalOfYear = bal;
                isFIYear = isEmpRetYear = isPensionYear = isCppYear = isOasYear = false;
            }
        }

        return { fiMonth, simData, yearlyData };
    }

    const main   = runSimulation(benefits);
    const noPen  = includePension ? runSimulation(benefitsNoPension) : null;

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
        const balAtEmpRetPartial = (() => {
            let b = balance;
            for (let m = 0; m < monthsToEmpStop; m++) b = b * (1 + rMonthly) + savings / 12;
            return b;
        })();
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
            const cppTitle = (oasAge === cppAge) ? `CPP &amp; OAS Start (Age ${formatNumber(cppAge)})` : `CPP Starts (Age ${formatNumber(cppAge)})`;
            partialEvents.push({ age: cppAge, html: `
        <li class="timeline-item timeline-cpp">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>${cppTitle}</h4>
                <p>${describeIncomeAt(cppAge, expenses, benefits, isGCMode)}</p>
            </div>
        </li>` });
        }
        if (includeCppOas && oasAmount > 0 && oasAge !== cppAge && oasAge > age) {
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
        renderReport({ age, income, expenses, savings, savingsRate, balance, rentalIncome,
            roiAnnual, swr, swrDecimal, includeRetAge, plannedRetAge,
            includePension, isGCMode, pensionAge, lifetimePension, bridgeBenefit,
            includeCppOas, cppAmount, cppAge, oasAmount, oasAge,
            fiAge: null, yearsToFI: null, fiPortfolio: null, fiPortfolioNoPension: null,
            balAtEmpRet: 0, benefits });
        return;
    }

    const yearsToFI  = main.fiMonth / 12;
    const fiAge      = age + yearsToFI;
    const fiPortfolio = getRequiredBalanceAtAge(fiAge, expenses, swrDecimal, rMonthly, benefits);

    // "No pension" FI portfolio (for split row comparison)
    const fiPortfolioNoPension = noPen
        ? getRequiredBalanceAtAge(fiAge, expenses, swrDecimal, rMonthly, benefitsNoPension)
        : null;

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

    chartStatus.innerText   = fiAge <= plannedRetAge ? "FI before retirement" : "FI after retirement";
    chartStatus.style.color = "";
    chartStatus.className   = "badge " + (fiAge <= plannedRetAge ? "badge-success" : "badge-info");
    if (btnToggleTable) btnToggleTable.style.display = 'inline-block';

    // Portfolio balance at the employment retirement date (for timeline)
    const balAtEmpRet = (() => {
        let b = balance;
        for (let m = 0; m < monthsToEmpStop; m++) b = b * (1 + rMonthly) + savings / 12;
        return b;
    })();

    // -------------------------------------------------------------------
    // Timeline — built dynamically and sorted chronologically
    // -------------------------------------------------------------------
    timelinePanel.style.display = "block";

    const netExpAtFI = Math.max(0, expenses - getRetirementIncome(fiAge, benefits));

    // Determine whether all income sources are active by FI age (needed to pick correct wording)
    const fiTransitionAges = [];
    if (pensionAge < 999) {
        fiTransitionAges.push(pensionAge);
        if (bridgeBenefit > 0 && pensionAge < 65) fiTransitionAges.push(65);
    }
    if (cppAge < 999) fiTransitionAges.push(cppAge);
    if (oasAge < 999) fiTransitionAges.push(oasAge);
    const fiTerminalAge = fiTransitionAges.length > 0 ? Math.max(...fiTransitionAges) : 0;
    const allSourcesActiveAtFI = fiTerminalAge === 0 || fiAge >= fiTerminalAge;

    const terminalIncome = (pensionAge < 999 ? lifetimePension : 0) +
                           (cppAge    < 999 ? cppAmount        : 0) +
                           (oasAge    < 999 ? oasAmount        : 0) +
                           rentalIncome;
    const terminalGap = Math.max(0, expenses - terminalIncome);

    let fiDesc;
    if (netExpAtFI === 0) {
        fiDesc = `Income sources fully cover all expenses at this age — no portfolio drawdown needed.`;
    } else if (allSourcesActiveAtFI) {
        fiDesc = `Portfolio generates ${formatCurrency(fiPortfolio * swrDecimal)}/yr at ${swr}% SWR to cover the ${formatCurrency(netExpAtFI)}/yr gap after income sources.`;
    } else {
        fiDesc = terminalGap <= 0
            ? `Portfolio of ${formatCurrency(fiPortfolio)} bridges all expenses until income sources take over completely.`
            : `Portfolio of ${formatCurrency(fiPortfolio)} bridges expenses to your income sources, then sustains a ${formatCurrency(terminalGap)}/yr drawdown at ${swr}% SWR.`;
    }

    // Collect events — each has a sort key (age) and an HTML string
    const events = [];

    // Today (always first)
    events.push({ age: age, html: `
        <li class="timeline-item">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>Today (Age ${formatNumber(age)})</h4>
                <p>Starting with ${formatCurrency(balance)} in investment portfolio</p>
            </div>
        </li>` });

    // Employment Retirement (only if user added it and it differs meaningfully from FI)
    if (includeRetAge && Math.abs(plannedRetAge - fiAge) > 0.1) {
        const isAlreadyFI   = plannedRetAge > fiAge;
        const passiveAtRet  = getRetirementIncome(plannedRetAge, benefits);
        const gapAtRet      = Math.max(0, expenses - passiveAtRet);
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

    // Financial Independence
    events.push({ age: fiAge, html: `
        <li class="timeline-item highlight">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>Financial Independence (Age ${formatNumber(fiAge)})</h4>
                <p>Portfolio reaches ${formatCurrency(fiPortfolio)}. ${fiDesc}</p>
            </div>
        </li>` });

    // DB Pension (only if starts in the future)
    if (includePension && pensionAge < 999 && pensionAge > age) {
        const pBody = describeIncomeAt(pensionAge, expenses, benefits, isGCMode);
        events.push({ age: pensionAge, html: `
        <li class="timeline-item">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>DB Pension Starts (Age ${formatNumber(pensionAge)})</h4>
                <p>${pBody}</p>
            </div>
        </li>` });
    }

    // CPP (only if starts in the future)
    if (includeCppOas && cppAmount > 0 && cppAge > age) {
        const cppTitle = (oasAge === cppAge) ? `CPP &amp; OAS Start (Age ${formatNumber(cppAge)})` : `CPP Starts (Age ${formatNumber(cppAge)})`;
        const cppBody = describeIncomeAt(cppAge, expenses, benefits, isGCMode);
        events.push({ age: cppAge, html: `
        <li class="timeline-item timeline-cpp">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>${cppTitle}</h4>
                <p>${cppBody}</p>
            </div>
        </li>` });
    }

    // OAS (only if different age from CPP and starts in the future)
    if (includeCppOas && oasAmount > 0 && oasAge !== cppAge && oasAge > age) {
        const oasBody = describeIncomeAt(oasAge, expenses, benefits, isGCMode);
        events.push({ age: oasAge, html: `
        <li class="timeline-item timeline-oas">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>OAS Starts (Age ${formatNumber(oasAge)})</h4>
                <p>${oasBody}</p>
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
            // DB Pension
            if (pensionAge < 999 && (!fiAge || pensionAge > fiAge)) drawLine(pensionAge, '#8b5cf6', 'DB Pension', 45);
            // Bridge end
            if (showBridgeEnd) drawLine(65, '#f59e0b', 'Bridge Ends', 60);
            // CPP
            if (cppAge < 999 && (!fiAge || cppAge > fiAge)) {
                const offset = showBridgeEnd ? 75 : 60;
                drawLine(cppAge, '#06b6d4', 'CPP', offset);
            }
            // OAS (only if different from CPP)
            if (oasAge < 999 && oasAge !== cppAge && (!fiAge || oasAge > fiAge)) {
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
    if (incomeDiff >= 0) {
        incomeBadge.textContent = `+${formatNumber(Math.abs(incomePercent))}% vs benchmark`;
        incomeBadge.className   = "badge badge-success";
    } else {
        incomeBadge.textContent = `-${formatNumber(Math.abs(incomePercent))}% vs benchmark`;
        incomeBadge.className   = "badge badge-danger";
    }

    const incomeNarrative = document.getElementById('incomeNarrative');
    incomeNarrative.innerHTML = `Your annual post-tax income (${formatCurrency(userIncome)}) is <strong>${formatCurrency(Math.abs(incomeDiff))} ${incomeDiff >= 0 ? 'higher' : 'lower'}</strong> than the median after-tax income for a <strong>${householdLabelMap[household]} in ${province}</strong> (${formatCurrency(benchIncome)}) (source: Canadian Income Survey).`;

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

let lastReportData = null;

function renderReport(data) {
    lastReportData = data;
    const panel = document.getElementById('reportPanel');
    if (!panel) return;
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

    const incText = income > 0
        ? `earning <strong>${formatCurrency(income)}/yr</strong> after tax`
        : 'no employment income entered';
    const savText = income > 0 && expenses > 0
        ? ` Savings rate: <strong>${formatNumber(savingsRate)}%</strong> (${formatCurrency(savings)}/yr).`
        : '';
    const balText = balance > 0
        ? `Current portfolio: <strong>${formatCurrency(balance)}</strong>.`
        : 'No current portfolio balance entered.';

    const sources = [];
    if (includePension) {
        const total = lifetimePension + bridgeBenefit;
        const label = isGCMode ? 'MyGCPension' : 'DB Pension';
        sources.push(`${label}: <strong>${formatCurrency(total)}/yr</strong> at age ${formatNumber(pensionAge)}`
            + (isGCMode && bridgeBenefit > 0 ? ` (${formatCurrency(bridgeBenefit)} bridge ends at 65)` : ''));
    }
    if (includeCppOas && cppAmount > 0) sources.push(`CPP: <strong>${formatCurrency(cppAmount)}/yr</strong> at age ${cppAge}`);
    if (includeCppOas && oasAmount > 0) sources.push(`OAS: <strong>${formatCurrency(oasAmount)}/yr</strong> at age ${oasAge}`);
    if (rentalIncome > 0) sources.push(`Rental income: <strong>${formatCurrency(rentalIncome)}/yr</strong>`);

    return `
        <div class="report-section">
            <div class="report-section-label">Section 1</div>
            <h2>Your Financial Snapshot</h2>
            <p class="report-narrative">Age <strong>${formatNumber(age)}</strong> — ${incText}, with <strong>${formatCurrency(expenses)}/yr</strong> in annual expenses.${savText}</p>
            <p class="report-narrative">${balText}</p>
            ${sources.length ? `<p class="report-narrative">Retirement income sources: ${sources.join(' &nbsp;·&nbsp; ')}.</p>` : ''}
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
    const portDesc = netExp === 0
        ? `Your passive income sources fully cover your <strong>${formatCurrency(expenses)}/yr</strong> in expenses — no portfolio drawdown is needed.`
        : `Your portfolio needs to reach <strong>${formatCurrency(fiPortfolio)}</strong>, which at a <strong>${formatNumber(swr)}% safe withdrawal rate</strong> generates <strong>${formatCurrency(fiPortfolio * swrDecimal)}/yr</strong> — covering the ${formatCurrency(netExp)}/yr not met by other income sources.`;

    const pensionBlock = includePension && fiPortfolioNoPension !== null && fiPortfolioNoPension > fiPortfolio
        ? `<div class="report-pension-callout">
                <strong>Your DB pension reduces the portfolio you need by ${formatCurrency(fiPortfolioNoPension - fiPortfolio)}</strong> — from ${formatCurrency(fiPortfolioNoPension)} (without pension) down to ${formatCurrency(fiPortfolio)} (with pension). That difference is built into your compensation as a public servant.
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
            <p class="report-narrative"><strong>What does this mean?</strong> Financial independence means your investment portfolio — combined with any pension, CPP, OAS, or other passive income — generates enough to cover your living expenses indefinitely without needing employment income.</p>
            <p class="report-narrative">${portDesc}</p>
            ${pensionBlock}
        </div>`;
}

function rptIncome(d) {
    const { fiAge, expenses, includePension, isGCMode, pensionAge, lifetimePension,
            bridgeBenefit, includeCppOas, cppAmount, cppAge, oasAmount, oasAge,
            rentalIncome, swr, fiPortfolio } = d;

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

    const rowsHTML = rows.map(r => `
        <tr${r.pending ? ' class="pending-row"' : ''}>
            <td>${r.label}</td>
            <td style="color:var(--text-muted);font-size:0.83rem;">${r.when}</td>
            <td>${r.pending ? '<em style="font-size:0.8rem;color:var(--text-muted);">not yet active</em>' : formatCurrency(r.amount) + '/yr'}</td>
        </tr>`).join('');

    const portRow = draw > 0
        ? `<tr class="portfolio-row"><td>Portfolio withdrawal (${formatNumber(swr)}% SWR)</td><td style="color:var(--text-muted);font-size:0.83rem;">From ${formatCurrency(fiPortfolio)} portfolio at FI</td><td>${formatCurrency(draw)}/yr</td></tr>`
        : `<tr class="portfolio-row"><td colspan="2" style="color:var(--text-muted);">Portfolio — no drawdown needed</td><td>$0/yr</td></tr>`;

    const coverNote = draw === 0
        ? `At age ${formatNumber(fiAge)}, your passive income fully covers your ${formatCurrency(expenses)}/yr in expenses — no portfolio withdrawals required.`
        : `At age ${formatNumber(fiAge)}, the portfolio covers the ${formatCurrency(draw)}/yr gap between your expenses and your active income sources.`;

    return `
        <div class="report-section">
            <div class="report-section-label">Section 3</div>
            <h2>Retirement Income at FI (Age ${formatNumber(fiAge)})</h2>
            <table class="report-income-table">
                <thead><tr><th>Income Source</th><th>Timing</th><th style="text-align:right;">Annual Amount</th></tr></thead>
                <tbody>
                    ${rowsHTML}
                    ${portRow}
                    <tr class="income-total"><td colspan="2">Your Annual Expenses</td><td>${formatCurrency(expenses)}/yr</td></tr>
                </tbody>
            </table>
            <p class="report-narrative">${coverNote}</p>
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
    events.push({ age, isFI: false, title: 'Today', body: `Age ${formatNumber(age)}.${balNote} Working — ${formatCurrency(income)}/yr income, ${formatCurrency(expenses)}/yr expenses.` });

    if (includeRetAge && Math.abs(plannedRetAge - fiAge) > 0.1) {
        const isAfterFI = plannedRetAge > fiAge;
        const incDesc   = describeIncomeAt(plannedRetAge, expenses, benefits, isGCMode);
        const prefix    = isAfterFI
            ? `Already financially independent — stopping work is optional. Portfolio at ${formatCurrency(balAtEmpRet)}.`
            : `Stop working. Portfolio at ${formatCurrency(balAtEmpRet)}.`;
        events.push({ age: plannedRetAge, isFI: false, title: 'Employment Retirement', body: `${prefix} ${incDesc}` });
    }

    const netExpAtFI = Math.max(0, expenses - getRetirementIncome(fiAge, benefits));
    events.push({ age: fiAge, isFI: true, title: 'Financial Independence',
        body: netExpAtFI === 0
            ? `Income sources fully cover all ${formatCurrency(expenses)}/yr in expenses — no portfolio drawdown needed.`
            : `Portfolio reaches ${formatCurrency(fiPortfolio)} — generating ${formatCurrency(fiPortfolio * swrDecimal)}/yr at ${formatNumber(swr)}% SWR to cover the ${formatCurrency(netExpAtFI)}/yr gap.` });

    if (includePension && pensionAge < 999) {
        events.push({ age: pensionAge, isFI: false, title: 'DB Pension Starts',
            body: describeIncomeAt(pensionAge, expenses, benefits, isGCMode) });
    }

    if (includeCppOas && cppAmount > 0) {
        const combined = oasAge === cppAge && oasAmount > 0;
        events.push({ age: cppAge, isFI: false, title: combined ? 'CPP & OAS Start' : 'CPP Starts',
            body: describeIncomeAt(cppAge, expenses, benefits, isGCMode) });
    }

    if (includeCppOas && oasAmount > 0 && oasAge !== cppAge) {
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
            <h2>Your Financial Journey</h2>
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
            <h2>Key Assumptions</h2>
            <ul style="color:var(--text-muted);line-height:1.75;padding-left:1.25rem;font-size:0.88rem;">
                <li><strong>Annual Return (${formatNumber(roiAnnual)}%):</strong> Post-tax and inflation-adjusted. All figures are in today's dollars.</li>
                <li><strong>Safe Withdrawal Rate (${formatNumber(swr)}%):</strong> Determines the portfolio target. Based on Bengen (1994) — a balanced portfolio can sustain this withdrawal rate over 30+ years.</li>
                <li><strong>Compounding:</strong> Simulated monthly for precision.</li>
                <li><strong>Terminal age:</strong> 100. FI is the earliest point your portfolio can sustain withdrawals to age 100.</li>
                ${isGCMode && bridgeBenefit > 0 ? '<li><strong>Bridge Benefit:</strong> Assumed to end at precisely age 65, per standard PSSA structure.</li>' : ''}
                <li><strong>Primary residence:</strong> Excluded from portfolio calculations.</li>
            </ul>
            <p class="report-narrative" style="margin-top:1rem;font-size:0.82rem;">For personal scenario planning only — not financial advice. See <a href="methodology.html" style="color:var(--accent-color);">the full methodology</a> for complete details and data sources.</p>
        </div>`;
}

// Tab switching: Calculator <-> Report
(function () {
    const tabCalc   = document.getElementById('navTabCalculator');
    const tabReport = document.getElementById('navTabReport');
    if (!tabCalc || !tabReport) return;

    const dashboard = document.querySelector('.dashboard');
    const compPanel = document.getElementById('comparisonPanel');
    const repPanel  = document.getElementById('reportPanel');

    function setView(view) {
        const isReport = view === 'report';
        dashboard.style.display = isReport ? 'none' : '';
        compPanel.style.display = isReport ? 'none' : '';
        repPanel.style.display  = isReport ? 'block' : 'none';
        tabCalc.classList.toggle('active', !isReport);
        tabReport.classList.toggle('active', isReport);
    }

    tabCalc.addEventListener('click',   e => { e.preventDefault(); setView('calculator'); });
    tabReport.addEventListener('click', e => { e.preventDefault(); setView('report'); });
}());
