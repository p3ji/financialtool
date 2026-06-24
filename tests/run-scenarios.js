#!/usr/bin/env node
// ============================================================
// Automated ordinal-scenario test harness for the FI engine.
//
//   node tests/run-scenarios.js
//
// The quantitative values matter less than the ORDINAL relationships
// between inputs (income vs expenses, retirement-date vs FI-date, pension
// before/after FI, already-FI, zero income, …). For every combination we
// assert the engine's invariants and that the generated wording is
// semantically coherent. Exits non-zero on any failure.
// ============================================================
const C = require('../calc.js');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
    if (cond) { pass++; }
    else { fail++; failures.push(`✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// Build a complete params object from a compact scenario spec.
function buildParams(s) {
    const roiAnnual = s.roi ?? 5;
    const swr       = s.swr ?? 4;
    const benefits = {
        pensionAge:      s.pensionAge      ?? 999,
        lifetimePension: s.lifetimePension ?? 0,
        bridgeBenefit:   s.bridgeBenefit   ?? 0,
        cppAge:          s.cppAge          ?? 999,
        cppAmount:       s.cppAmount       ?? 0,
        oasAge:          s.oasAge          ?? 999,
        oasAmount:       s.oasAmount       ?? 0,
        rentalIncome:    s.rentalIncome    ?? 0
    };
    const includePension = benefits.pensionAge < 999;
    return {
        age: s.age ?? 35,
        plannedRetAge: s.includeRetAge ? s.plannedRetAge : 100,
        includeRetAge: !!s.includeRetAge,
        balance: s.balance ?? 0,
        income: s.income ?? 0,
        expenses: s.expenses ?? 0,
        roiAnnual, swr,
        rMonthly: roiAnnual / 100 / 12,
        swrDecimal: swr / 100,
        benefits,
        includePension,
        benefitsNoPension: { ...benefits, pensionAge: 999, lifetimePension: 0, bridgeBenefit: 0 }
    };
}

function finite(x) { return typeof x === 'number' && Number.isFinite(x); }

// Generic invariants applied to every scenario.
function assertInvariants(label, s) {
    const base = buildParams(s);
    const r = C.analyze(base);

    // INV3 — no NaN / Infinity anywhere
    let clean = (r.fiAge === null || finite(r.fiAge)) &&
                (r.fiPortfolio === null || finite(r.fiPortfolio)) &&
                (r.fiPortfolioNoPension === null || finite(r.fiPortfolioNoPension));
    for (const p of r.simData) if (!finite(p.x) || !finite(p.y)) clean = false;
    for (const row of r.yearlyData) if (!finite(row.networth) || !finite(row.income)) clean = false;
    check(`[${label}] no NaN/Infinity`, clean);

    // INV1 — FI age is independent of the planned retirement date.
    // Recompute FI with several retirement dates and with none; all equal.
    const fiAges = new Set();
    const variants = [
        { ...s, includeRetAge: false },
        { ...s, includeRetAge: true, plannedRetAge: (s.age ?? 35) + 1 },   // retire almost immediately
        { ...s, includeRetAge: true, plannedRetAge: 55 },
        { ...s, includeRetAge: true, plannedRetAge: 65 },
        { ...s, includeRetAge: true, plannedRetAge: 99 }
    ];
    for (const v of variants) {
        const rr = C.analyze(buildParams(v));
        fiAges.add(rr.fiAge === null ? 'N/A' : rr.fiAge.toFixed(4));
    }
    check(`[${label}] FI age independent of retirement date`, fiAges.size === 1,
        `got {${[...fiAges].join(', ')}}`);

    // INV4 — already-FI consistency
    if (r.fiMonth === 0) {
        check(`[${label}] already-FI ⇒ fiAge==age & yearsToFI==0`,
            Math.abs(r.fiAge - base.age) < 1e-9 && Math.abs(r.yearsToFI) < 1e-9);
    }

    return r;
}

// ------------------------------------------------------------
// 1. Broad ordinal matrix
// ------------------------------------------------------------
const incomeVsExpense = [
    { tag: 'saver',     income: 120000, expenses: 60000 },
    { tag: 'breakeven', income: 90000,  expenses: 90000 },
    { tag: 'dissaver',  income: 90000,  expenses: 95000 },
    { tag: 'noincome',  income: 0,      expenses: 50000 }
];
const balances = [
    { tag: 'nobal',     balance: 0 },
    { tag: 'smallbal',  balance: 100000 },
    { tag: 'bigbal',    balance: 2500000 }
];
const incomeSources = [
    { tag: 'portfolioOnly' },
    { tag: 'pensionAfterFI',  pensionAge: 60, lifetimePension: 100000 },
    { tag: 'pensionEarly',    pensionAge: 55, lifetimePension: 40000 },
    { tag: 'cppOas',          cppAge: 65, cppAmount: 12000, oasAge: 65, oasAmount: 8000 },
    { tag: 'gcBridge',        pensionAge: 58, lifetimePension: 45000, bridgeBenefit: 12000,
                              cppAge: 65, cppAmount: 14000, oasAge: 65, oasAmount: 8500 },
    { tag: 'rental',          rentalIncome: 30000 }
];

for (const iv of incomeVsExpense)
    for (const b of balances)
        for (const src of incomeSources) {
            const label = `${iv.tag}/${b.tag}/${src.tag}`;
            assertInvariants(label, { age: 38, ...iv, ...b, ...src });
        }

// ------------------------------------------------------------
// 2. Retirement-date vs FI-date ordering (explicit)
// ------------------------------------------------------------
for (const ret of [40, 45, 50, 55, 60, 65]) {
    assertInvariants(`retOrder@${ret}`,
        { age: 38, income: 150000, expenses: 95000, balance: 1000000,
          pensionAge: 60, lifetimePension: 100000, includeRetAge: true, plannedRetAge: ret });
}

// ------------------------------------------------------------
// 3. User-reported Case 1
//    age=35, income=90k, exp=95k, bal=100k, pension@60=100k, no ret date
// ------------------------------------------------------------
(function case1() {
    const noRet  = buildParams({ age: 35, income: 90000, expenses: 95000, balance: 100000,
                                 pensionAge: 60, lifetimePension: 100000 });
    const r = C.analyze(noRet);
    check('[case1] FI is achievable', r.fiAge !== null, `fiAge=${r.fiAge}`);

    // Pension must show up in the projection income stream at age 60.
    const before = r.yearlyData.find(y => y.age === 59);
    const after  = r.yearlyData.find(y => y.age === 61);
    if (before && after) {
        const jump = after.income - before.income;
        check('[case1] pension (~100k) credited to income stream at 60',
            jump > 90000, `income jump 59→61 = ${jump.toFixed(0)}`);
    } else {
        check('[case1] yearly rows around pension exist', false);
    }

    // Adding an early retirement date must NOT make FI unachievable.
    const ret55 = C.analyze(buildParams({ age: 35, income: 90000, expenses: 95000, balance: 100000,
                                          pensionAge: 60, lifetimePension: 100000,
                                          includeRetAge: true, plannedRetAge: 55 }));
    check('[case1] FI still achievable with retirement date 55',
        ret55.fiAge !== null, `fiAge=${ret55.fiAge}`);
    check('[case1] FI age identical with/without retirement date',
        r.fiAge !== null && ret55.fiAge !== null && Math.abs(r.fiAge - ret55.fiAge) < 1e-9,
        `noRet=${r.fiAge} ret55=${ret55.fiAge}`);
})();

// ------------------------------------------------------------
// 4. User-reported Case 2 wording
//    age=38, income=150k, exp=95k, bal=1M, pension@60=100k, ret=45
// ------------------------------------------------------------
(function case2() {
    const p = buildParams({ age: 38, income: 150000, expenses: 95000, balance: 1000000,
                            pensionAge: 60, lifetimePension: 100000,
                            includeRetAge: true, plannedRetAge: 45 });
    const r = C.analyze(p);
    check('[case2] FI before retirement (fiAge < 45)', r.fiAge !== null && r.fiAge < 45,
        `fiAge=${r.fiAge}`);

    // Section-2 "what does this mean" wording must be coherent.
    const fiDesc = C.describeFiPortfolio(r.fiAge, 95000, p.benefits, r.fiPortfolio, p.swr, p.swrDecimal);
    // FI is reached before the pension (age 60) starts → bridge wording,
    // NOT the steady-SWR "covering the $95,000" phrasing.
    check('[case2] FI desc uses bridge wording (not bogus SWR-covers-all)',
        /bridge/i.test(fiDesc) && !/safe withdrawal rate.*covering the \$95,000/i.test(fiDesc),
        fiDesc);

    // Employment-retirement narrative at 45: no pension/CPP/OAS yet.
    const incDesc = C.describeIncomeAt(45, 95000, p.benefits, false);
    check('[case2] no-source wording avoids "No passive income active"',
        !/No passive income active/i.test(incDesc), incDesc);
    check('[case2] no-source wording mentions portfolio funding expenses',
        /portfolio funds/i.test(incDesc), incDesc);
})();

// ------------------------------------------------------------
// 5. Wording coherence across all FI scenarios:
//    whenever the SWR branch is used, generated income must equal the gap.
// ------------------------------------------------------------
(function swrCoherence() {
    let checkedAny = false;
    for (const src of incomeSources) {
        const p = buildParams({ age: 40, income: 130000, expenses: 70000, balance: 300000, ...src });
        const r = C.analyze(p);
        if (r.fiAge === null) continue;
        checkedAny = true;
        const desc = C.describeFiPortfolio(r.fiAge, 70000, p.benefits, r.fiPortfolio, p.swr, p.swrDecimal);
        const m = desc.match(/generates \$([\d,]+)\/yr.*covering the \$([\d,]+)\/yr/);
        if (m) {
            const gen = +m[1].replace(/,/g, '');
            const gap = +m[2].replace(/,/g, '');
            check(`[swr/${src.tag}] generated ≈ gap in SWR wording`,
                Math.abs(gen - gap) <= 1, `generates ${gen} vs gap ${gap}`);
        }
    }
    check('[swr] exercised at least one SWR scenario', checkedAny);
})();

// ------------------------------------------------------------
// 6. Zero-income drawdown sanity: with passive income covering expenses,
//    a zero-income retiree's portfolio must not be wrongly depleted.
// ------------------------------------------------------------
(function zeroIncome() {
    // No employment, pension already covers all expenses from today.
    const p = buildParams({ age: 62, income: 0, expenses: 50000, balance: 100000,
                            pensionAge: 62, lifetimePension: 60000 });
    const r = C.analyze(p);
    check('[zeroIncome] already FI when pension covers expenses', r.fiMonth === 0,
        `fiMonth=${r.fiMonth}`);
    // Portfolio should GROW (pension surplus reinvested), never crash negative.
    const minBal = Math.min(...r.simData.map(d => d.y));
    check('[zeroIncome] portfolio never goes negative when pension > expenses',
        minBal >= 0, `min balance ${minBal.toFixed(0)}`);
})();

// ------------------------------------------------------------
// 7. CPP / OAS start-age adjustment unit tests (exact factors)
//    CPP: -0.6%/mo before 65, +0.7%/mo after (clamped 60–70)
//    OAS: no early option (clamped 65), +0.6%/mo after (to 70)
// ------------------------------------------------------------
(function adjustments() {
    const approx = (a, b) => Math.abs(a - b) < 0.5;
    check('[adj] CPP at 65 = base',           approx(C.calcCppAdjusted(1000, 65), 1000));
    check('[adj] CPP early at 60 = -36%',      approx(C.calcCppAdjusted(1000, 60), 640), C.calcCppAdjusted(1000, 60));
    check('[adj] CPP deferred to 70 = +42%',   approx(C.calcCppAdjusted(1000, 70), 1420), C.calcCppAdjusted(1000, 70));
    check('[adj] CPP clamped below 60',        approx(C.calcCppAdjusted(1000, 55), 640));
    check('[adj] CPP clamped above 70',        approx(C.calcCppAdjusted(1000, 75), 1420));
    check('[adj] OAS at 65 = base',            approx(C.calcOasAdjusted(1000, 65), 1000));
    check('[adj] OAS has no early reduction',  approx(C.calcOasAdjusted(1000, 60), 1000));
    check('[adj] OAS deferred to 70 = +36%',   approx(C.calcOasAdjusted(1000, 70), 1360), C.calcOasAdjusted(1000, 70));
})();

// ------------------------------------------------------------
// 8. Deferred / early CPP+OAS run through the full engine
// ------------------------------------------------------------
for (const cppAge of [60, 65, 70]) {
    for (const oasAge of [65, 70]) {
        const cppAmount = C.calcCppAdjusted(14000, cppAge);
        const oasAmount = C.calcOasAdjusted(8500, oasAge);
        const r = assertInvariants(`cpp${cppAge}/oas${oasAge}`,
            { age: 50, income: 110000, expenses: 60000, balance: 200000,
              cppAge, cppAmount, oasAge, oasAmount });
        // Deferred amounts must exceed the age-65 baseline.
        if (cppAge === 70) check(`[cpp70] deferred CPP > base`, cppAmount > 14000);
        if (cppAge === 60) check(`[cpp60] early CPP < base`,    cppAmount < 14000);
    }
}

// ------------------------------------------------------------
// 9. GC bridge-benefit edge ages
// ------------------------------------------------------------
for (const pensionAge of [55, 58, 60, 64, 65]) {
    const p = { age: 45, income: 120000, expenses: 70000, balance: 300000,
                pensionAge, lifetimePension: 45000, bridgeBenefit: 12000,
                cppAge: 65, cppAmount: 14000, oasAge: 65, oasAmount: 8500 };
    assertInvariants(`gcBridge@${pensionAge}`, p);
    const bp = buildParams(p);
    // Before 65 (and on/after pension start) the bridge tops up income; at 65+ it is gone.
    if (pensionAge < 65) {
        const incBefore = C.getRetirementIncome(Math.max(pensionAge, 60), bp.benefits);
        const incAt65   = C.getRetirementIncome(65, bp.benefits);
        check(`[gcBridge@${pensionAge}] bridge included before 65`,
            incBefore >= 45000 + 12000, incBefore);
        check(`[gcBridge@${pensionAge}] bridge dropped at 65 (pension+CPP+OAS only)`,
            Math.abs(incAt65 - (45000 + 14000 + 8500)) < 1, incAt65);
        // Wording must name the bridge in GC mode before 65.
        const w = C.describeIncomeAt(Math.max(pensionAge, 60.5), 70000, bp.benefits, true);
        check(`[gcBridge@${pensionAge}] wording mentions bridge before 65`, /bridge/i.test(w), w);
    }
}

// ------------------------------------------------------------
// 10. ROI / SWR extremes
// ------------------------------------------------------------
for (const roi of [0, 2, 8]) {
    for (const swr of [1, 4, 10]) {
        assertInvariants(`roi${roi}/swr${swr}`,
            { age: 35, income: 120000, expenses: 55000, balance: 150000, roi, swr,
              pensionAge: 60, lifetimePension: 40000 });
    }
}
// Zero ROI, pure portfolio: target is exactly expenses/SWR and reachable by saving.
(function zeroRoi() {
    const p = buildParams({ age: 40, income: 100000, expenses: 40000, balance: 0, roi: 0, swr: 4 });
    const r = C.analyze(p);
    check('[zeroRoi] portfolio-only target = expenses/SWR',
        r.fiAge !== null && Math.abs(r.fiPortfolio - 40000 / 0.04) < 1,
        `fiPortfolio=${r.fiPortfolio}`);
})();

// ------------------------------------------------------------
// 11. Degenerate orderings: expenses=0 and retirement-date == FI-date
// ------------------------------------------------------------
(function degenerate() {
    // Expenses of 0 → already FI immediately, no NaN.
    const z = C.analyze(buildParams({ age: 30, income: 80000, expenses: 0, balance: 0 }));
    check('[deg] expenses=0 ⇒ already FI', z.fiMonth === 0, `fiMonth=${z.fiMonth}`);
    check('[deg] expenses=0 ⇒ finite target', finite(z.fiPortfolio) && z.fiPortfolio === 0);

    // Retirement date exactly at the FI date: still consistent, no double-counting.
    const base = { age: 35, income: 130000, expenses: 60000, balance: 100000 };
    const noRet = C.analyze(buildParams(base));
    if (noRet.fiAge !== null) {
        const atFi = C.analyze(buildParams({ ...base, includeRetAge: true, plannedRetAge: Math.round(noRet.fiAge) }));
        check('[deg] ret date == FI date keeps same FI age',
            atFi.fiAge !== null && Math.abs(atFi.fiAge - noRet.fiAge) < 1e-9,
            `noRet=${noRet.fiAge} atFi=${atFi.fiAge}`);
    }
})();

// ------------------------------------------------------------
// 12. Wording sanity sweep: no "NaN"/"undefined" leaks into any string,
//     and combined CPP+OAS / rental phrasing is well-formed.
// ------------------------------------------------------------
(function wordingSweep() {
    const bad = s => /NaN|undefined|\$NaN|\bnull\b/.test(s);
    let strings = 0;
    for (const iv of incomeVsExpense) {
        for (const src of incomeSources) {
            const p = buildParams({ age: 45, ...iv, balance: 250000, ...src });
            const r = C.analyze(p);
            for (const age of [45, 55, 60, 65, 67, 70, 90]) {
                const w = C.describeIncomeAt(age, p.expenses, p.benefits, true);
                strings++;
                check(`[word] clean describeIncomeAt (${src.tag}@${age})`, !bad(w), w);
            }
            if (r.fiAge !== null) {
                const f = C.describeFiPortfolio(r.fiAge, p.expenses, p.benefits, r.fiPortfolio, p.swr, p.swrDecimal);
                strings++;
                check(`[word] clean describeFiPortfolio (${iv.tag}/${src.tag})`, !bad(f), f);
            }
        }
    }
    // Combined CPP & OAS at the same age should read as one "= $total/yr" clause.
    const cp = buildParams({ age: 66, income: 0, expenses: 40000, balance: 0,
                             cppAge: 65, cppAmount: 12000, oasAge: 65, oasAmount: 8000 });
    const cw = C.describeIncomeAt(66, 40000, cp.benefits, false);
    check('[word] CPP+OAS combined shows total', /CPP.*OAS.*=\s*\$20,000\/yr/.test(cw), cw);
    check('[word] exercised many strings', strings > 100, `count=${strings}`);
})();

// ------------------------------------------------------------
console.log(`\n${'='.repeat(60)}`);
console.log(`Scenario tests: ${pass} passed, ${fail} failed`);
if (failures.length) {
    console.log(`${'='.repeat(60)}`);
    failures.forEach(f => console.log(f));
    console.log('');
    process.exit(1);
}
console.log('All invariants hold.\n');
