#!/usr/bin/env node
// ============================================================
// End-to-end DOM smoke test.
//
//   npm install        # one-time, installs jsdom (devDependency)
//   npm run test:dom
//
// Loads the REAL index.html + calc.js + app.js under jsdom (Chart.js
// stubbed), drives the inputs the way a user would, and asserts the UI
// updates without runtime errors. Cross-checks that app.js (browser) and
// calc.js (pure engine) agree on the headline FI age.
//
// The dependency-free `npm test` (tests/run-scenarios.js) covers the math;
// this covers the DOM wiring.
// ============================================================
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch {
    console.error('jsdom not installed. Run `npm install` first (it is a devDependency).');
    process.exit(2);
}

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const errors = [];
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;

// Stub Chart.js (loaded from CDN in the page, absent under jsdom).
function FakeChart() { this.destroy = () => {}; }
FakeChart.defaults = { color: '', font: {} };
window.Chart = FakeChart;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.scrollTo = () => {};
window.addEventListener('error', e => errors.push(e.error && e.error.stack || e.message));

function run(file) {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    new window.Function(code).call(window);
}
try { run('calc.js'); run('app.js'); }
catch (e) { console.error('FATAL during script load:', e.stack); process.exit(1); }

const doc = window.document;
const read = id => { const el = doc.getElementById(id); return el.innerText || el.textContent; };
function setVal(id, val) { const el = doc.getElementById(id); el.value = String(val); el.dispatchEvent(new window.Event('input', { bubbles: true })); }
function setChk(id, on) { const el = doc.getElementById(id); el.checked = on; el.dispatchEvent(new window.Event('change', { bubbles: true })); }

const scenarios = [
    { name: 'Case 1: dissaver + pension, no ret date', expectFiAbout: 58.9, steps: () => {
        setVal('currentAge', 35); setVal('annualIncome', 90000); setVal('annualExpenses', 95000);
        setChk('chkIncludePortfolio', true); setVal('currentBalance', 100000);
        setChk('chkIncludePension', true); setVal('pensionAge', 60); setVal('pensionAmount', 100000);
    }},
    { name: 'Case 1 + early retirement date 55 (FI must NOT change)', expectFiAbout: 58.9, steps: () => {
        setChk('chkIncludeRetAge', true); setVal('plannedRetirementAge', 55);
    }},
    { name: 'Case 2: saver + pension, ret 45 (FI before retirement)', expectFiAbout: 39.9, steps: () => {
        setVal('currentAge', 38); setVal('annualIncome', 150000); setVal('annualExpenses', 95000);
        setVal('currentBalance', 1000000); setVal('plannedRetirementAge', 45);
    }},
    { name: 'Zero-income retiree (pension covers expenses)', expectFiAbout: 62, steps: () => {
        setChk('chkIncludeRetAge', false);
        setVal('currentAge', 62); setVal('annualIncome', 0); setVal('annualExpenses', 50000);
        setChk('chkIncludePortfolio', true); setVal('currentBalance', 100000);
        setChk('chkIncludePension', true); setVal('pensionAge', 62); setVal('pensionAmount', 60000);
    }},
];

let ok = true;
for (const sc of scenarios) {
    errors.length = 0;
    try { sc.steps(); } catch (e) { console.log('✗', sc.name, '— threw:', e.message); ok = false; continue; }
    if (errors.length) { console.log('✗', sc.name, '— runtime errors:', errors.join('; ')); ok = false; continue; }
    const fiAge = parseFloat(read('resFIAge'));
    const status = read('chartStatus');
    const within = sc.expectFiAbout == null || Math.abs(fiAge - sc.expectFiAbout) < 0.2;
    if (!within) { console.log(`✗ ${sc.name} — FI age ${fiAge}, expected ~${sc.expectFiAbout}`); ok = false; continue; }
    console.log(`✓ ${sc.name} — FI age ${fiAge}, status "${status}"`);
}

const reportHtml = doc.getElementById('reportPanel').innerHTML;
if (/No passive income active/.test(reportHtml)) { console.log('✗ report still says "No passive income active"'); ok = false; }
else console.log('✓ report free of stale "No passive income active" wording');

console.log(ok ? '\nDOM SMOKE TEST PASSED' : '\nDOM SMOKE TEST FAILED');
process.exit(ok ? 0 : 1);
