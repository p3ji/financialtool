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

    // Nobody is assumed to work forever. The FI-detection (accumulation)
    // pass stops employment at this age, so someone whose income never
    // covers expenses can't "reach FI" by being modelled as working into
    // their 90s — they correctly come back as "not achievable" instead.
    const MAX_WORK_AGE = 75;

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
    //
    // COUPLES: a `benefits.partner` sub-object (same shape, minus rental) adds
    // a second person's DB pension / CPP / OAS. The partner's start ages are
    // pre-translated by app.js onto the PRIMARY person's age axis, so the whole
    // engine keeps simulating on one timeline. `bridgeEndAge` (default 65) lets
    // a partner's bridge — which ends at *their* 65 — land at the right point
    // on that shared axis. For a single person there is no `partner` key and
    // every result is byte-identical to before.
    function incomeOf(age, b) {
        if (!b) return 0;
        const { pensionAge = 999, lifetimePension = 0, bridgeBenefit = 0, bridgeEndAge = 65,
                cppAge = 999, cppAmount = 0, oasAge = 999, oasAmount = 0,
                rentalIncome = 0 } = b;
        let income = 0;
        if (pensionAge < 999 && age >= pensionAge) {
            income += lifetimePension;
            if (age < bridgeEndAge) income += bridgeBenefit;
        }
        if (cppAge < 999 && age >= cppAge) income += cppAmount;
        if (oasAge < 999 && age >= oasAge) income += oasAmount;
        income += rentalIncome;
        return income;
    }

    function getRetirementIncome(age, benefits) {
        return incomeOf(age, benefits) +
               (benefits && benefits.partner ? incomeOf(age, benefits.partner) : 0);
    }

    // Income-transition ages for one person (pension start, bridge end, CPP, OAS).
    function transitionAgesOf(b) {
        if (!b) return [];
        const { pensionAge = 999, bridgeBenefit = 0, bridgeEndAge = 65,
                cppAge = 999, oasAge = 999 } = b;
        const ages = [];
        if (pensionAge < 999) {
            ages.push(pensionAge);
            if (bridgeBenefit > 0 && pensionAge < bridgeEndAge) ages.push(bridgeEndAge);
        }
        if (cppAge < 999) ages.push(cppAge);
        if (oasAge < 999) ages.push(oasAge);
        return ages;
    }

    // Steady-state income for one person once all sources are active (post-bridge).
    function terminalIncomeOf(b) {
        if (!b) return 0;
        const { pensionAge = 999, lifetimePension = 0, cppAge = 999, cppAmount = 0,
                oasAge = 999, oasAmount = 0, rentalIncome = 0 } = b;
        return (pensionAge < 999 ? lifetimePension : 0) +
               (cppAge   < 999 ? cppAmount         : 0) +
               (oasAge   < 999 ? oasAmount         : 0) +
               rentalIncome;
    }

    // Combined income-transition ages for the household (self + partner).
    function allTransitionAges(benefits) {
        return [
            ...transitionAgesOf(benefits),
            ...transitionAgesOf(benefits && benefits.partner)
        ];
    }

    // ---- Required portfolio to be FI at `currentAge` ---------------
    // Works backward via present-value from the terminal age (last income
    // transition). Returns the minimum balance needed so the portfolio can
    // bridge every expense gap on the way to the terminal age and still
    // hold the SWR target (terminal gap ÷ SWR) when it gets there.
    //
    // Months where passive income EXCEEDS expenses (e.g. pension + bridge
    // above spending) are credited: the forward simulation reinvests those
    // surpluses (invariant #2), so the requirement must recognise them too,
    // or FI lands later than the simulation itself proves necessary. The
    // requirement is floored at $0 each month — a portfolio can never go
    // negative, so future surpluses can't be borrowed against today's gaps.
    function getRequiredBalanceAtAge(currentAge, expenses, swrDecimal, rMonthly, benefits) {
        const partner = benefits && benefits.partner;
        const terminalIncome = terminalIncomeOf(benefits) + terminalIncomeOf(partner);
        const terminalPortfolio = Math.max(0, expenses - terminalIncome) / swrDecimal;

        const transitionAges = allTransitionAges(benefits);
        if (transitionAges.length === 0) return terminalPortfolio;

        const terminalAge = Math.max(...transitionAges);
        if (currentAge >= terminalAge) return terminalPortfolio;

        const monthsToTerminal = Math.ceil((terminalAge - currentAge) * 12);
        let req = terminalPortfolio;

        for (let i = 1; i <= monthsToTerminal; i++) {
            const ageAtStep = terminalAge - (i / 12);
            // Credit surpluses (income may exceed expenses), then floor the
            // running requirement at $0 — a portfolio can never go negative,
            // so future surpluses can't offset today's gaps.
            const income = getRetirementIncome(ageAtStep, benefits);
            req = Math.max(0, (req + (expenses - income) / 12) / (1 + rMonthly));
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
            fiMonthForMarking = undefined,
            partnerIncome = 0,
            partnerPlannedRetAge = 100
        } = params;

        const maxMonths = (100 - age) * 12;
        const monthsToEmpStop = stopEmploymentAtRet
            ? Math.max(0, Math.round((plannedRetAge - age) * 12))
            : maxMonths + 1; // never stops within the horizon
        const monthsToPartnerEmpStop = stopEmploymentAtRet
            ? Math.max(0, Math.round((partnerPlannedRetAge - age) * 12))
            : maxMonths + 1;
        const monthsToAllEmpStop = Math.max(monthsToEmpStop, monthsToPartnerEmpStop);

        let bal = balance;
        let fiMonth = null;
        let depletionMonth = null;   // first month the portfolio hits $0
        const simData = [];
        const yearlyData = [];

        // Sample the chart at every income kink (self + partner) so the line
        // bends cleanly where a source starts or a bridge ends.
        const transitionAges = allTransitionAges(benefits);

        let sumIncome = 0, sumExpenses = 0, sumROI = 0;
        let startBalOfYear = balance;
        let currentYearAge = Math.floor(age);
        let isFIYear = false, isEmpRetYear = false, isPrimaryRetYear = false, isPartnerRetYear = false;
        let isPensionYear = false, isCppYear = false, isOasYear = false;

        const isPrimaryRetAtStart = stopEmploymentAtRet && (monthsToEmpStop === 0);
        const isPartnerRetAtStart = stopEmploymentAtRet && (partnerPlannedRetAge < 100) && (monthsToPartnerEmpStop === 0);

        // Year 0 row (opening snapshot)
        yearlyData.push({
            age: currentYearAge, income: 0, expenses: 0, roi: 0,
            percentCovered: 0, changeInNetworth: 0, networth: balance,
            isFIYear: false,
            isEmpRetYear: isPrimaryRetAtStart || isPartnerRetAtStart,
            isPrimaryRetYear: isPrimaryRetAtStart,
            isPartnerRetYear: isPartnerRetAtStart,
            isPensionYear: false, isCppYear: false, isOasYear: false
        });

        for (let m = 0; m <= maxMonths; m++) {
            const currentAge = age + m / 12;
            const isPrimaryWorking = m < monthsToEmpStop;
            const isPartnerWorking = m < monthsToPartnerEmpStop;

            // Key chart points: yearly + income transitions (self + partner)
            if (m % 12 === 0 ||
                m === monthsToEmpStop ||
                m === monthsToPartnerEmpStop ||
                transitionAges.some(a => Math.abs(currentAge - a) < 0.05) ||
                Math.abs(currentAge - 65) < 0.05) {
                simData.push({ x: currentAge, y: bal });
            }

            // FI check — portfolio can sustain withdrawals from here. A
            // crossing only counts while employment is still running
            // (m <= monthsToAllEmpStop): FI age means "earliest you could
            // afford to STOP working". A portfolio that merely coasts
            // across the SWR threshold years after work already ended
            // (high ROI outpacing the drawdown) is a phantom late-life
            // "FI at 95" (invariant #6), not an achievable stop-work age.
            const required = getRequiredBalanceAtAge(currentAge, expenses, swrDecimal, rMonthly, benefits);
            if (fiMonth === null && m <= monthsToAllEmpStop && bal >= required) {
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
            if (stopEmploymentAtRet) {
                if (m === monthsToEmpStop && monthsToEmpStop > 0) {
                    isPrimaryRetYear = true;
                    isEmpRetYear = true;
                }
                if (m === monthsToPartnerEmpStop && monthsToPartnerEmpStop > 0 && partnerPlannedRetAge < 100) {
                    isPartnerRetYear = true;
                    isEmpRetYear = true;
                }
            }

            if (benefits.pensionAge < 999 && currentAge >= benefits.pensionAge && currentAge - 1/12 < benefits.pensionAge) isPensionYear = true;
            if (benefits.cppAge     < 999 && currentAge >= benefits.cppAge     && currentAge - 1/12 < benefits.cppAge)     isCppYear    = true;
            if (benefits.oasAge     < 999 && currentAge >= benefits.oasAge     && currentAge - 1/12 < benefits.oasAge)     isOasYear    = true;

            // Cashflow this month
            const empIncome      = (isPrimaryWorking ? income : 0) + (isPartnerWorking ? partnerIncome : 0);
            const passiveIncome  = getRetirementIncome(currentAge, benefits);
            const monthlyIncome  = (empIncome + passiveIncome) / 12;
            const monthlyROI     = bal * rMonthly;
            sumROI      += monthlyROI;
            sumIncome   += monthlyIncome;
            sumExpenses += expenses / 12;

            // Balance step — passive income always counts; surplus reinvests,
            // deficit draws down.
            bal = bal * (1 + rMonthly) + (empIncome + passiveIncome - expenses) / 12;
            if (depletionMonth === null && bal < 0) depletionMonth = m;

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
                    isFIYear, isEmpRetYear, isPrimaryRetYear, isPartnerRetYear,
                    isPensionYear, isCppYear, isOasYear
                });
                currentYearAge++;
                sumIncome = sumExpenses = sumROI = 0;
                startBalOfYear = bal;
                isFIYear = isEmpRetYear = isPrimaryRetYear = isPartnerRetYear = isPensionYear = isCppYear = isOasYear = false;
            }
        }

        return { fiMonth, depletionMonth, simData, yearlyData };
    }

    // ---- Balance at the employment-retirement date -----------------
    // Mirrors the simulation's monthly step (passive income credited).
    function balanceAtAge(targetAge, params) {
        const { age, balance, income, expenses, rMonthly, benefits,
                partnerIncome = 0, partnerPlannedRetAge = 100 } = params;
        const months = Math.max(0, Math.round((targetAge - age) * 12));
        const monthsToEmpStop = Math.max(0, Math.round((params.plannedRetAge - age) * 12));
        const monthsToPartnerEmpStop = Math.max(0, Math.round((partnerPlannedRetAge - age) * 12));
        let b = balance;
        for (let m = 0; m < months; m++) {
            const currentAge = age + m / 12;
            const isPrimaryWorking = m < monthsToEmpStop;
            const isPartnerWorking = m < monthsToPartnerEmpStop;
            const empIncome = (isPrimaryWorking ? income : 0) + (isPartnerWorking ? partnerIncome : 0);
            const passiveIncome = getRetirementIncome(currentAge, benefits);
            b = b * (1 + rMonthly) + (empIncome + passiveIncome - expenses) / 12;
        }
        return b;
    }

    // ---- High-level orchestration ----------------------------------
    // Runs the retirement-date-independent FI detection pass plus the
    // projection pass (chart/table), and returns everything the UI needs.
    function analyze(params) {
        const { age, plannedRetAge, includeRetAge, expenses, swrDecimal, rMonthly,
                benefits, includePension, benefitsNoPension } = params;

        // FI detection: employment runs to a realistic maximum working age
        // (not forever), independent of the chosen retirement date. If FI is
        // only "reachable" by working past MAX_WORK_AGE, it isn't reachable —
        // fiMonth stays null and the UI reports "not achievable".
        const accum = runSimulation({
            ...params,
            stopEmploymentAtRet: true,
            plannedRetAge: MAX_WORK_AGE,
            partnerPlannedRetAge: MAX_WORK_AGE
        });
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

        // Age at which the *planned* projection runs the portfolio dry (if it
        // does). Only meaningful when FI is not achievable — it lets the UI say
        // "savings exhausted around age X" instead of implying a phantom FI.
        const depletionAge = proj.depletionMonth !== null
            ? age + proj.depletionMonth / 12
            : null;

        return {
            fiMonth, fiAge, yearsToFI, fiPortfolio, fiPortfolioNoPension,
            depletionAge,
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
    // Active-source phrases for one person. `label` prefixes couple sources
    // ("Your " / "Partner's "); empty for a single person.
    function sourcePartsOf(age, b, label, gcMode) {
        if (!b) return [];
        const { pensionAge = 999, lifetimePension = 0, bridgeBenefit = 0, bridgeEndAge = 65,
                cppAge = 999, cppAmount = 0, oasAge = 999, oasAmount = 0,
                rentalIncome = 0 } = b;
        const parts = [];
        if (pensionAge < 999 && age >= pensionAge) {
            if (gcMode && bridgeBenefit > 0) {
                if (age < bridgeEndAge) {
                    parts.push(`${label}DB Pension: ${formatCurrency(lifetimePension + bridgeBenefit)}/yr (${formatCurrency(lifetimePension)} lifetime + ${formatCurrency(bridgeBenefit)} bridge, ends at 65)`);
                } else {
                    parts.push(`${label}DB Pension: ${formatCurrency(lifetimePension)}/yr (lifetime only — bridge ended at 65)`);
                }
            } else {
                parts.push(`${label}DB Pension: ${formatCurrency(lifetimePension)}/yr`);
            }
        }
        if (cppAge < 999 && age >= cppAge) parts.push(`${label}CPP: ${formatCurrency(cppAmount)}/yr`);
        if (oasAge < 999 && age >= oasAge) parts.push(`${label}OAS: ${formatCurrency(oasAmount)}/yr`);
        if (rentalIncome > 0)              parts.push(`Rental: ${formatCurrency(rentalIncome)}/yr`);
        return parts;
    }

    function describeIncomeAt(age, expenses, benefits, gcMode) {
        const partner = benefits && benefits.partner;
        // With a partner, distinguish whose source is whose; solo stays unlabelled.
        const parts = partner
            ? [...sourcePartsOf(age, benefits, 'Your ', gcMode),
               ...sourcePartsOf(age, partner, "Partner's ", gcMode)]
            : sourcePartsOf(age, benefits, '', gcMode);

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
        const partner = benefits && benefits.partner;

        const netExpAtFI = Math.max(0, expenses - getRetirementIncome(fiAge, benefits));

        const transitionAges = allTransitionAges(benefits);
        const terminalAge = transitionAges.length ? Math.max(...transitionAges) : 0;
        const allSourcesActiveAtFI = terminalAge === 0 || fiAge >= terminalAge;

        const terminalIncome = terminalIncomeOf(benefits) + terminalIncomeOf(partner);
        const terminalGap = Math.max(0, expenses - terminalIncome);

        // Are there any guaranteed (non-portfolio) income sources at all?
        const hasAnySource = transitionAges.length > 0 ||
                             (benefits && benefits.rentalIncome > 0);

        if (netExpAtFI === 0 && allSourcesActiveAtFI) {
            return `Income sources fully cover all expenses at this age — no portfolio drawdown needed.`;
        }
        if (allSourcesActiveAtFI) {
            return hasAnySource
                ? `Portfolio generates ${formatCurrency(fiPortfolio * swrDecimal)}/yr at a ${formatNumber(swr)}% safe withdrawal rate — covering the ${formatCurrency(netExpAtFI)}/yr gap left after your income sources.`
                : `Portfolio generates ${formatCurrency(fiPortfolio * swrDecimal)}/yr at a ${formatNumber(swr)}% safe withdrawal rate — enough to cover your ${formatCurrency(netExpAtFI)}/yr of expenses on its own.`;
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
