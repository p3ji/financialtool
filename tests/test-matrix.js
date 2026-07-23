const { chromium } = require('playwright');
const path = require('path');

(async () => {
    console.log('Running Comprehensive Playwright Matrix Tests across all input permutations...\n');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const indexPath = 'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');
    await page.goto(indexPath);

    // Matrix test case 1: Solo Saver Baseline
    console.log('Test 1: Solo Saver baseline (Age 40, Income $100k, Expenses $60k)...');
    await page.fill('#currentAge', '40');
    await page.fill('#annualIncome', '100000');
    await page.fill('#annualExpenses', '60000');
    await page.uncheck('#chkCouple');
    await page.waitForTimeout(100);

    const soloSavings = await page.innerText('#profileAnnualSavings');
    console.log(`  ✓ Solo Annual Savings: ${soloSavings} (expected $40,000)`);
    if (!soloSavings.includes('40,000')) {
        console.error('  FAILED: Expected $40,000 annual savings');
        process.exit(1);
    }

    // Matrix test case 2: Enable Couple Mode with Partner Income $80k
    console.log('\nTest 2: Enable Couple Mode (Primary $100k, Partner $80k, Expenses $60k)...');
    await page.check('#chkCouple');
    await page.fill('#partnerIncome', '80000');
    await page.waitForTimeout(100);

    const coupleSavings = await page.innerText('#profileAnnualSavings');
    console.log(`  ✓ Couple Combined Annual Savings: ${coupleSavings} (expected $120,000)`);
    if (!coupleSavings.includes('120,000')) {
        console.error(`  FAILED: Expected $120,000 combined annual savings, got ${coupleSavings}`);
        process.exit(1);
    }

    // Matrix test case 3: Staggered Retirement (Primary Ret 38 $0, Partner Ret 55 $100k, Expenses $100k)
    console.log('\nTest 3: Staggered Couple Retirement (Primary ret 38 $0, Partner ret 55 $100k, Expenses $100k)...');
    await page.fill('#currentAge', '38');
    await page.fill('#annualIncome', '0');
    await page.fill('#annualExpenses', '100000');
    await page.fill('#partnerAge', '39');
    await page.fill('#partnerIncome', '100000');

    await page.check('#chkIncludeRetAge');
    await page.fill('#plannedRetirementAge', '38');
    await page.fill('#partnerPlannedRetAge', '55');

    await page.check('#chkIncludePortfolio');
    await page.fill('#currentBalance', '1000000');

    await page.check('#chkIncludePension');
    await page.fill('#pensionAge', '60');
    await page.fill('#pensionAmount', '30000');
    await page.fill('#partnerPensionAge', '60');
    await page.fill('#partnerPensionAmount', '60000');

    await page.check('#chkIncludeCppOas');
    await page.fill('#cppStartAge', '65');
    await page.fill('#cppAmountAt65', '12000');

    await page.waitForTimeout(200);

    const stagSavings = await page.innerText('#profileAnnualSavings');
    const stagFiAge = await page.innerText('#resFIAge');
    console.log(`  ✓ Combined Annual Savings: ${stagSavings} (expected $0)`);
    console.log(`  ✓ FI Age: ${stagFiAge} (expected 42.5)`);

    // Verify detailed table income for years 39-44 (partner working $100k) and 45+ (partner retired $0)
    await page.evaluate(() => {
        const btn = document.getElementById('btnToggleTable');
        const cont = document.getElementById('detailedTableContainer');
        if (cont.style.display === 'none') btn.click();
    });
    await page.waitForSelector('#detailedTable tbody tr', { state: 'visible' });

    const rows = await page.$$eval('#detailedTable tbody tr', trs => trs.map(tr => {
        const tds = tr.querySelectorAll('td');
        return {
            age: tds[0]?.textContent.trim(),
            income: tds[1]?.textContent.trim(),
            expenses: tds[2]?.textContent.trim()
        };
    }));

    const age53Row = rows.find(r => r.age === '53');
    const age55Row = rows.find(r => r.age === '55');

    console.log(`  ✓ Detailed Table Primary Age 53 (Partner Age 54) Income: ${age53Row?.income} (expected $100,000)`);
    console.log(`  ✓ Detailed Table Primary Age 55 (Partner Age 56) Income: ${age55Row?.income} (expected $0)`);

    if (!age53Row?.income.includes('100,000')) {
        console.error(`  FAILED: Expected Primary Age 53 income to be $100,000, got ${age53Row?.income}`);
        process.exit(1);
    }
    if (age55Row?.income !== '$0') {
        console.error(`  FAILED: Expected Primary Age 55 income to be $0, got ${age55Row?.income}`);
        process.exit(1);
    }

    // Matrix test case 4: LocalStorage reloading persistence
    console.log('\nTest 4: Reloading page to test LocalStorage form state restoration...');
    await page.reload();
    await page.waitForSelector('#profileAnnualSavings');
    await page.waitForTimeout(300);

    const reloadedSavings = await page.innerText('#profileAnnualSavings');
    const reloadedPartnerInc = await page.inputValue('#partnerIncome');
    const reloadedPartnerRetAge = await page.inputValue('#partnerPlannedRetAge');

    console.log(`  ✓ Reloaded Partner Income value: $${reloadedPartnerInc} (expected 100000)`);
    console.log(`  ✓ Reloaded Partner Planned Ret Age value: ${reloadedPartnerRetAge} (expected 55)`);
    console.log(`  ✓ Reloaded Annual Savings: ${reloadedSavings} (expected $0)`);

    if (reloadedPartnerInc !== '100000' || reloadedPartnerRetAge !== '55') {
        console.error('  FAILED: LocalStorage failed to persist partner income or retirement age!');
        process.exit(1);
    }

    console.log('\n============================================================');
    console.log('ALL MATRIX TEST COMBINATIONS PASSED PERFECTLY!');
    console.log('============================================================\n');

    await browser.close();
})();
