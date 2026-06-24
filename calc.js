// ============================================================
// calc.js — pure retirement-calculation engine
//
// No DOM dependencies. Loaded as a plain <script> in the browser
// (attaches to window.FinCalc) AND require()-able in Node for the
// automated scenario test harness (tests/run-scenarios.mjs).
//
// Keeping the math here — shared by app.js and the tests — guarantees
// the dashboard and the test suite exercise the exact same logic.
// ============================================================
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;            // Node / test harness
    } else {
        root.FinCalc = api;              // browser global
    }
})(typeof self !== 'undefined' ? self : this, function () {

    // ---- Formatters ------------------------------------------------
    const formatCurrency = (val) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
    const formatNumber = (val) =>
        new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(val);

    // ---- CPP & OAS start-age adjustments ---------------------------
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

    // ---- Passive (non-employment) income at a given age ------------
    // pension + CPP + OAS + rental. 999 is the sentinel for a disabled source.
    function getRetirementIncome(age, benefits) {
        const { pensionAge = 999, lifetimePension = 0, bridgeBenefit = 0,
                cppAge = 999, cppAmount = 0, oasAge = 999, oasAmount = 0,
                rentalIncome = 0 } = benefits || {};
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

    // ---- Required portfolio to be FI at `currentAge` ---------------
    // Works backward via present-value from the terminal age (last income
    // transition). Returns the balance needed so the portfolio can bridge
    // every expense gap from currentAge through age 100.
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

    // ---- Core month-by-month simulation ----------------------------
    // Single pass. Credits passive income every month it is active —
    // surplus (passive income above expenses) is reinvested into the
    // portfolio, deficits are drawn down. Employment income is added
    // only while `isWorking`.
    //
    // params: {
    //   age, plannedRetAge, balance, income, expenses,
    //   rMonthly, swrDecimal, benefits,
    //   stopEmploymentAtRet  (true → employment stops at plannedRetAge;
    //                         false → employment continues to 100, used
    //                         for retirement-date-independent FI detection),
    //   fiMonthForMarking    (optional: force which month is flagged as the
    //                         FI year in the yearly table)
    // }
    function runSimulation(params) {
        const {
            age, plannedRetAge, balance, income, expenses,
            rMonthly, swrDecimal, benefits,
            stopEmploymentAtRet = true,
            fiMonthForMarking = undefined
        } = params;

        const maxMonths = (100 - age) * 12;
        const monthsToEmpStop = stopEmploymentAtRet
            ? Math.max(0, Math.round((plannedRetAge - age) * 12))
            : maxMonths + 1; // never stops within the horizon

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
                (benefits.pensionAge < 999 && Math.abs(currentAge - benefits.pensionAge) < 0.05) ||
                (benefits.cppAge     < 999 && Math.abs(currentAge - benefits.cppAge)     < 0.05) ||
                (benefits.oasAge     < 999 && Math.abs(currentAge - benefits.oasAge)     < 0.05) ||
                Math.abs(currentAge - 65) < 0.05) {
                simData.push({ x: currentAge, y: bal });
            }

            // FI check — portfolio can sustain withdrawals to 100 from here
            const required = getRequiredBalanceAtAge(currentAge, expenses, swrDecimal, rMonthly, benefits);
            if (fiMonth === null && bal >= required) {
                fiMonth = m;
                simData.push({ x: currentAge, y: bal });
            }
            // FI-year flag: use the externally supplied month when provided
            // (projection pass marks the retirement-date-independent FI age),
            // otherwise self-detect.
            if (fiMonthForMarking !== undefined) {
                if (m === fiMonthForMarking) isFIYear = true;
            } else if (fiMonth === m && fiMonth !== null) {
                isFIYear = true;
            }

            // Transition markers for the table
            if (m === monthsToEmpStop) isEmpRetYear = true;
            if (benefits.pensionAge < 999 && currentAge >= benefits.pensionAge && currentAge - 1/12 < benefits.pensionAge) isPensionYear = true;
            if (benefits.cppAge     < 999 && currentAge >= benefits.cppAge     && currentAge - 1/12 < benefits.cppAge)     isCppYear    = true;
            if (benefits.oasAge     < 999 && currentAge >= benefits.oasAge     && currentAge - 1/12 < benefits.oasAge)     isOasYear    = true;

            // Cashflow this month
            const empIncome      = isWorking ? income : 0;
            const passiveIncome  = getRetirementIncome(currentAge, benefits);
            const monthlyIncome  = (empIncome + passiveIncome) / 12;
            const monthlyROI     = bal * rMonthly;
            sumROI      += monthlyROI;
            sumIncome   += monthlyIncome;
            sumExpenses += expenses / 12;

            // Balance step — passive income always counts; surplus reinvests,
            // deficit draws down.
            bal = bal * (1 + rMonthly) + (empIncome + passiveIncome - expenses) / 12;

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

    // ---- Balance at the employment-retirement date -----------------
    // Mirrors the simulation's monthly step (passive income credited).
    function balanceAtAge(targetAge, params) {
        const { age, balance, income, expenses, rMonthly, benefits } = params;
        const months = Math.max(0, Math.round((targetAge - age) * 12));
        let b = balance;
        for (let m = 0; m < months; m++) {
            const currentAge = age + m / 12;
            const passiveIncome = getRetirementIncome(currentAge, benefits);
            b = b * (1 + rMonthly) + (income + passiveIncome - expenses) / 12;
        }
        return b;
    }

    // ---- High-level orchestration ----------------------------------
    // Runs the retirement-date-independent FI detection pass plus the
    // projection pass (chart/table), and returns everything the UI needs.
    function analyze(params) {
        const { age, plannedRetAge, includeRetAge, expenses, swrDecimal, rMonthly,
                benefits, includePension, benefitsNoPension } = params;

        // FI detection: employment continues until FI (independent of the
        // chosen retirement date).
        const accum = runSimulation({ ...params, stopEmploymentAtRet: false });
        const fiMonth = accum.fiMonth;

        // Projection: uses the actual planned retirement date for chart/table.
        const proj = runSimulation({
            ...params,
            stopEmploymentAtRet: includeRetAge,
            fiMonthForMarking: fiMonth === null ? -1 : fiMonth
        });

        const noPen = includePension
            ? runSimulation({
                ...params,
                benefits: benefitsNoPension,
                stopEmploymentAtRet: includeRetAge,
                fiMonthForMarking: -1
              })
            : null;

        let fiAge = null, yearsToFI = null, fiPortfolio = null, fiPortfolioNoPension = null;
        if (fiMonth !== null) {
            yearsToFI   = fiMonth / 12;
            fiAge       = age + yearsToFI;
            fiPortfolio = getRequiredBalanceAtAge(fiAge, expenses, swrDecimal, rMonthly, benefits);
            if (includePension) {
                fiPortfolioNoPension = getRequiredBalanceAtAge(fiAge, expenses, swrDecimal, rMonthly, benefitsNoPension);
            }
        }

        return {
            fiMonth, fiAge, yearsToFI, fiPortfolio, fiPortfolioNoPension,
            simData: proj.simData, yearlyData: proj.yearlyData,
            noPenSimData: noPen ? noPen.simData : [],
            balAtEmpRet: includeRetAge ? balanceAtAge(plannedRetAge, params) : params.balance
        };
    }

    // ============================================================
    // Narrative helpers — shared by the calculator timeline AND the
    // report tab so wording never drifts between the two views.
    // ============================================================

    // Describes the active income sources at a given age and how much the
    // portfolio must cover. `gcMode` toggles the GC bridge-benefit wording.
    function describeIncomeAt(age, expenses, benefits, gcMode) {
        const { pensionAge = 999, lifetimePension = 0, bridgeBenefit = 0,
                cppAge = 999, cppAmount = 0, oasAge = 999, oasAmount = 0,
                rentalIncome = 0 } = benefits;

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
            // No pension/CPP/OAS/rental yet — the portfolio itself funds
            // everything. (Portfolio withdrawals are income too, but in this
            // app "passive income" means guaranteed external sources.)
            return `No pension, CPP, OAS or rental income yet — the portfolio funds the full ${formatCurrency(expenses)}/yr of expenses through withdrawals.`;
        }

        const joined   = parts.join(' + ');
        const totalStr = parts.length > 1 ? ` = ${formatCurrency(totalIncome)}/yr` : '';

        return gap === 0
            ? `${joined}${totalStr} — fully covers ${formatCurrency(expenses)}/yr in expenses.`
            : `${joined}${totalStr}. Portfolio covers the remaining ${formatCurrency(gap)}/yr through withdrawals.`;
    }

    // Single source of truth for "what the portfolio does at FI age".
    // Handles three regimes:
    //   1. income sources already cover everything → no drawdown
    //   2. all income sources active at FI → steady SWR withdrawal on the gap
    //   3. FI reached BEFORE some income sources start → portfolio BRIDGES
    //      expenses until those sources kick in (NOT a steady-SWR situation)
    function describeFiPortfolio(fiAge, expenses, benefits, fiPortfolio, swr, swrDecimal) {
        const { pensionAge = 999, lifetimePension = 0, bridgeBenefit = 0,
                cppAge = 999, cppAmount = 0, oasAge = 999, oasAmount = 0,
                rentalIncome = 0 } = benefits;

        const netExpAtFI = Math.max(0, expenses - getRetirementIncome(fiAge, benefits));

        const transitionAges = [];
        if (pensionAge < 999) { transitionAges.push(pensionAge); if (bridgeBenefit > 0 && pensionAge < 65) transitionAges.push(65); }
        if (cppAge < 999) transitionAges.push(cppAge);
        if (oasAge < 999) transitionAges.push(oasAge);
        const terminalAge = transitionAges.length ? Math.max(...transitionAges) : 0;
        const allSourcesActiveAtFI = terminalAge === 0 || fiAge >= terminalAge;

        const terminalIncome = (pensionAge < 999 ? lifetimePension : 0) +
                               (cppAge    < 999 ? cppAmount        : 0) +
                               (oasAge    < 999 ? oasAmount        : 0) + rentalIncome;
        const terminalGap = Math.max(0, expenses - terminalIncome);

        if (netExpAtFI === 0 && allSourcesActiveAtFI) {
            return `Income sources fully cover all expenses at this age — no portfolio drawdown needed.`;
        }
        if (allSourcesActiveAtFI) {
            return `Portfolio generates ${formatCurrency(fiPortfolio * swrDecimal)}/yr at a ${formatNumber(swr)}% safe withdrawal rate — covering the ${formatCurrency(netExpAtFI)}/yr gap left after your income sources.`;
        }
        // Bridge case: FI reached before all income sources are active.
        return terminalGap <= 0
            ? `Portfolio of ${formatCurrency(fiPortfolio)} bridges your expenses until your income sources fully take over — then no further drawdown is needed.`
            : `Portfolio of ${formatCurrency(fiPortfolio)} first bridges your expenses until your income sources begin, then settles into a ${formatCurrency(terminalGap)}/yr withdrawal (about ${formatNumber(swr)}% a year) to cover what they don't.`;
    }

    return {
        formatCurrency, formatNumber,
        calcCppAdjusted, calcOasAdjusted,
        getRetirementIncome, getRequiredBalanceAtAge,
        runSimulation, balanceAtAge, analyze,
        describeIncomeAt, describeFiPortfolio
    };
});
