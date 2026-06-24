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
console.log(`\n${'='.repeat(60)}`);
console.log(`Scenario tests: ${pass} passed, ${fail} failed`);
if (failures.length) {
    console.log(`${'='.repeat(60)}`);
    failures.forEach(f => console.log(f));
    console.log('');
    process.exit(1);
}
console.log('All invariants hold.\n');
