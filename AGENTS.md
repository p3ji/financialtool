# AGENTS.md — DB Early Retirement Calculator

Working notes for AI agents (and humans) on this repo. Keep this current as
the architecture evolves — it is the fastest way to get back up to speed.

## What this is

A single-page, **static** financial-independence (FI) / early-retirement
calculator aimed at Canadian public servants who have a defined-benefit (DB)
pension. No backend, no build step. Deployed to GitHub Pages from `main` via
`.github/workflows/pages.yml` (uploads the whole repo directory as-is).

All math runs locally in the browser; nothing the user types leaves the page.

## File map

| File | Role |
|------|------|
| `index.html` | Markup + inputs. Two tabs: **Calculator** and **Report**. `#reportPanel` lives inside `.container`. Loads `calc.js` then `app.js` (order matters). |
| `calc.js` | **Pure calculation engine.** No DOM. UMD shim: browser global `window.FinCalc`, and `require()`-able in Node for tests. This is the single source of truth for the math AND the FI/income wording. |
| `app.js` | DOM glue: reads inputs, calls `FinCalc`, renders results, chart, detailed table, timeline, and the Report tab. Tab-switch IIFE at the bottom. |
| `style.css` | Styling. Mobile nav is responsive at `@media (max-width: 480px)`. |
| `methodology.html` | The technical / data-source deep dive. |
| `tests/run-scenarios.js` | Dependency-free ordinal-scenario harness over `calc.js`. `npm test`. |
| `tests/smoke-dom.js` | jsdom end-to-end test of `index.html`+`calc.js`+`app.js`. `npm run test:dom` (needs `npm install`). |

## The engine (`calc.js`)

Key exports:

- `getRetirementIncome(age, benefits)` — passive (non-employment) income
  active at an age: DB pension (+ GC bridge benefit before 65), CPP, OAS,
  rental. `999` is the sentinel for a disabled source.
- `getRequiredBalanceAtAge(age, expenses, swrDecimal, rMonthly, benefits)` —
  portfolio needed to be FI at `age`, via backward present-value from the last
  income transition ("terminal age"). It only needs to cover expense **gaps**.
- `runSimulation(params)` — one month-by-month pass. **Passive income is
  credited every month it is active**; surplus reinvests into the portfolio,
  deficits draw it down. Employment income is added only while working.
- `analyze(params)` — orchestration. Runs **two passes**:
  1. an **accumulation pass** (employment continues to `MAX_WORK_AGE`, **not**
     forever) used purely to find the FI month → makes the **FI age independent
     of the chosen retirement date**. Stopping at a realistic maximum working
     age means someone whose income never covers expenses can't be reported as
     "reaching FI" in their 80s/90s (an artifact of modelling work-to-100) —
     they correctly come back **not achievable** (`fiMonth === null`);
  2. a **projection pass** using the actual planned retirement date for the
     chart/table. It also reports `depletionAge` — the age the *planned*
     portfolio hits $0 — so the "not achievable" UI can say "savings exhausted
     around age X" instead of implying a phantom FI milestone.

  `MAX_WORK_AGE` (currently **75**) is the single knob for "nobody works
  forever." Anyone who reaches FI *before* it is completely unaffected (their
  crossover month is identical); only the income-≤-expenses grinders change.
- `describeIncomeAt(...)` / `describeFiPortfolio(...)` — shared narrative
  strings so the calculator timeline and the Report tab never contradict.

### Invariants the math must uphold (enforced by `tests/run-scenarios.js`)

1. **FI age does not depend on the planned retirement date.** The FI age is the
   stable "earliest you could afford to stop *if you keep working until then*"
   target. Entering a retirement date does not change it. **But** when the
   planned retirement is earlier than the FI age, the *projection* may run the
   portfolio dry — `analyze()` returns `depletionAge` (else `null`). The UI then
   warns loudly (badge "Savings run out at age X", a "Savings Exhausted"
   timeline milestone, a §2 report callout) and **hides every milestone past the
   depletion age** (later pension/CPP/OAS milestones can't help a dead
   portfolio). Caveat honoured: retiring a little early can still *survive* when
   ROI > the withdrawal rate — `depletionAge` is `null` in that case, so **no
   false warning**. Trigger off real depletion, never off "retire < FI".
2. **Passive income is real income.** Pension/CPP/OAS/rental must show up in
   the projected income stream (graph + detailed table) at their start age;
   surplus adds to the portfolio.
3. No `NaN`/`Infinity` in any output.
4. Already-FI (`fiMonth === 0`) ⇒ `fiAge === age`, `yearsToFI === 0`.
5. **Wording is coherent.** In the steady-SWR regime the generated income must
   equal the stated gap. When FI is reached *before* an income source starts,
   use **bridge** wording — never claim an SWR draw "covers" the full expenses.
6. **No phantom FI for grinders.** If income never covers expenses (and no
   income source closes the gap), FI must be **not achievable**, never a
   late-life "FI at 92/97" produced by pretending the user works to 100. The
   accumulation pass stops employment at `MAX_WORK_AGE` to enforce this, and
   the classification stays retirement-date independent (see #1). The headline
   and the detailed table must never contradict (no "FI at 92" sitting on a
   table that shows the portfolio millions in the red).

## Report tab philosophy

The Report tab is **not** a restatement of the calculator. It is a written,
narrative explanation for a reader with little financial background: define the
concepts (FI, safe withdrawal rate, bridging), explain what the numbers mean
for *them*, and tell the story age-by-age. Technical depth and data sources
belong in `methodology.html`, not here.

### Report publication gate

The Report tab is gated behind `SHOW_REPORT_TAB` near the top of `app.js`
(default **off** — unpublished, pending review). While off, the nav tab is
hidden and `renderReport` produces nothing (so it can't leak via the print
stylesheet either). To **publish**, flip the default to `true`. To **preview
without publishing**, set `window.__PUBLISH_REPORT_TAB__ = true` before
`app.js` loads — this is exactly what `tests/smoke-dom.js` does so the report
stays testable while hidden in production.

## Running the tests

```bash
npm test          # pure math invariants — no dependencies
npm install       # one-time, for the DOM test (jsdom)
npm run test:dom  # end-to-end DOM wiring + browser/engine agreement
```

Always run `npm test` after touching `calc.js` or any calculation/wording in
`app.js`. Add a scenario whenever a new edge case is found.

## Gotchas

- Input sections are gated by checkboxes (`chkIncludePortfolio`,
  `chkIncludeRetAge`, `chkIncludePension`, `chkIncludeCppOas`). A value typed in
  a hidden section is ignored until its checkbox is on — keep this in mind when
  reproducing user scenarios.
- `app.js` uses `.innerText` to write results; tests read `.innerText` too.
- When no retirement date is set, `plannedRetAge` defaults to 100 (i.e. "work
  to the horizon"), so the projection equals the accumulation pass.
