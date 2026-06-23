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
                bal = Math.max(0, bal * (1 + rMonthly) - Math.max(0, expenses - passiveIncome) / 12);
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
        results.fiPortfolio.innerText = "N/A";
        chartStatus.innerText    = "FI not achievable";
        chartStatus.style.color  = "#ef4444";
        chartStatus.className    = "badge badge-danger";
        timelinePanel.style.display = "none";
        if (btnToggleTable) btnToggleTable.style.display = 'none';
        if (detailedTableContainer) detailedTableContainer.style.display = 'none';
        if (targetSplitRow) targetSplitRow.style.display = 'none';
        renderChart(main.simData, plannedRetAge, null, benefits, isGCMode && bridgeBenefit > 0, noPen ? noPen.simData : []);
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
    const fiDesc = netExpAtFI === 0
        ? `Portfolio + income sources fully cover all expenses. No drawdown needed.`
        : `Portfolio generates ${formatCurrency(fiPortfolio * swrDecimal)}/yr at ${swr}% SWR — covers the ${formatCurrency(netExpAtFI)}/yr not met by other income.`;

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
        events.push({ age: plannedRetAge, html: `
        <li class="timeline-item timeline-emp-ret">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>Employment Retirement (Age ${formatNumber(plannedRetAge)})</h4>
                <p>Stop working. Portfolio at ${formatCurrency(balAtEmpRet)}. Drawing down until FI or income sources cover expenses.</p>
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

    // DB Pension
    if (includePension && pensionAge < 999) {
        const pensionStart  = lifetimePension + bridgeBenefit;
        const remainingExp  = Math.max(0, expenses - pensionStart);
        const pBody = (isGCMode && bridgeBenefit > 0)
            ? `Pension provides ${formatCurrency(pensionStart)}/yr (${formatCurrency(lifetimePension)} lifetime + ${formatCurrency(bridgeBenefit)} bridge). Portfolio covers ${formatCurrency(remainingExp)}/yr. Bridge ends at 65.`
            : `Pension provides ${formatCurrency(pensionStart)}/yr. Portfolio covers ${formatCurrency(remainingExp)}/yr.`;
        events.push({ age: pensionAge, html: `
        <li class="timeline-item">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>DB Pension Starts (Age ${formatNumber(pensionAge)})</h4>
                <p>${pBody}</p>
            </div>
        </li>` });
    }

    // CPP
    if (includeCppOas && cppAmount > 0) {
        const incomeAtCpp = getRetirementIncome(cppAge, benefits);
        const gapAtCpp    = Math.max(0, expenses - incomeAtCpp);
        const cppBody = (oasAge === cppAge)
            ? `CPP (${formatCurrency(cppAmount)}/yr) &amp; OAS (${formatCurrency(oasAmount)}/yr) start. Portfolio covers ${formatCurrency(gapAtCpp)}/yr shortfall.`
            : `CPP starts (${formatCurrency(cppAmount)}/yr). Portfolio covers ${formatCurrency(gapAtCpp)}/yr shortfall.`;
        events.push({ age: cppAge, html: `
        <li class="timeline-item timeline-cpp">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>CPP Starts (Age ${formatNumber(cppAge)})</h4>
                <p>${cppBody}</p>
            </div>
        </li>` });
    }

    // OAS (only if different age from CPP)
    if (includeCppOas && oasAmount > 0 && oasAge !== cppAge) {
        const incomeAtOas = getRetirementIncome(oasAge, benefits);
        const gapAtOas    = Math.max(0, expenses - incomeAtOas);
        events.push({ age: oasAge, html: `
        <li class="timeline-item timeline-oas">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4>OAS Starts (Age ${formatNumber(oasAge)})</h4>
                <p>OAS starts (${formatCurrency(oasAmount)}/yr). Portfolio covers ${formatCurrency(gapAtOas)}/yr shortfall.</p>
            </div>
        </li>` });
    }

    // Sort by age and render
    events.sort((a, b) => a.age - b.age);
    timelineList.innerHTML = events.map(e => e.html).join('');

    renderChart(main.simData, plannedRetAge, fiAge, benefits, isGCMode && bridgeBenefit > 0, noPen ? noPen.simData : []);
    renderDetailedTable(main.yearlyData, roiAnnual);

    if (typeof updateDemographicBenchmarks === 'function') updateDemographicBenchmarks();
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

            // Employment retirement line (only if different from FI)
            if (empRetAge && fiAge && Math.abs(empRetAge - fiAge) > 0.1) {
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
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { callback: (val) => '$' + (val / 1000) + 'k' }
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
