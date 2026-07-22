const { chromium } = require('playwright');
const path = require('path');

(async () => {
    console.log('Starting Playwright End-to-End Browser Tests...\n');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const indexPath = 'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');
    console.log(`Loading page: ${indexPath}`);
    await page.goto(indexPath);

    // 1. Initial state check
    const isSpousePanelVisibleInitial = await page.isVisible('#spouseProfilePanel');
    console.log(`✓ Initial state: Spouse Profile Panel visible = ${isSpousePanelVisibleInitial} (expected false)`);
    if (isSpousePanelVisibleInitial !== false) {
        console.error('FAILED: Spouse panel should be hidden initially.');
        process.exit(1);
    }

    // 2. Click "Planning as a couple"
    console.log('Clicking "Planning as a couple" (#chkCouple)...');
    await page.check('#chkCouple');
    const isSpousePanelVisibleAfterCheck = await page.isVisible('#spouseProfilePanel');
    console.log(`✓ After clicking #chkCouple: Spouse Profile Panel visible = ${isSpousePanelVisibleAfterCheck} (expected true)`);
    if (isSpousePanelVisibleAfterCheck !== true) {
        console.error('FAILED: Spouse panel should be visible after checking #chkCouple.');
        process.exit(1);
    }

    // 3. Enable Planned Retirement Date
    console.log('Clicking "Add Planned Retirement Date" (#chkIncludeRetAge)...');
    await page.check('#chkIncludeRetAge');
    const isPartnerRetAgeVisible = await page.isVisible('#partnerRetAgeSection');
    console.log(`✓ Partner Planned Retirement Age input visible = ${isPartnerRetAgeVisible} (expected true)`);

    // 4. Fill in Staggered Couple Retirement Inputs
    // Primary: Age 38, Income $50,000, Planned Retirement Age 38
    // Partner: Age 39, Income $50,000, Planned Retirement Age 55
    // Expenses: $100,000, Portfolio: $200,000
    console.log('Filling in couple inputs: Primary Ret Age 38 ($50k), Partner Ret Age 55 ($50k)...');
    await page.fill('#currentAge', '38');
    await page.fill('#annualIncome', '50000');
    await page.fill('#plannedRetirementAge', '38');
    await page.fill('#annualExpenses', '100000');
    await page.fill('#partnerAge', '39');
    await page.fill('#partnerIncome', '50000');
    await page.fill('#partnerPlannedRetAge', '55');

    // Enable portfolio with sufficient balance so plan does not deplete before partner retirement
    await page.check('#chkIncludePortfolio');
    await page.fill('#currentBalance', '1500000');

    // Wait for calculation to update UI
    await page.waitForTimeout(300);

    // 5. Assert UI Metrics & Table
    const annualSavingsText = await page.innerText('#profileAnnualSavings');
    const savingsRateText = await page.innerText('#profileSavingsRate');
    console.log(`✓ Savings metrics: Annual Savings = ${annualSavingsText}, Savings Rate = ${savingsRateText}`);

    // Toggle detailed table
    await page.evaluate(() => document.getElementById('btnToggleTable').click());
    await page.waitForSelector('#detailedTableContainer table', { state: 'visible' });

    // Check Year 1 row (primary retired, partner working $50k)
    const year1IncomeText = await page.innerText('#detailedTable tbody tr:nth-child(2) td:nth-child(2)');
    console.log(`✓ Year 1 Detailed Table Income: ${year1IncomeText} (expected $50,000 for partner working)`);
    if (!year1IncomeText.includes('50,000')) {
        console.error(`FAILED: Expected Year 1 income to contain 50,000, got ${year1IncomeText}`);
        process.exit(1);
    }

    // Check timeline items
    const timelineText = await page.innerText('#timelinePanel');
    const hasPartnerRet = timelineText.includes("Partner's Employment Retirement");
    console.log(`✓ Timeline includes Partner's Employment Retirement milestone: ${hasPartnerRet}`);
    if (!hasPartnerRet) {
        console.error('FAILED: Timeline should include Partner Employment Retirement milestone.');
        process.exit(1);
    }

    // 6. Test unchecking "Planning as a couple"
    console.log('Unchecking "Planning as a couple"...');
    await page.uncheck('#chkCouple');
    const isSpousePanelVisibleAfterUncheck = await page.isVisible('#spouseProfilePanel');
    console.log(`✓ After unchecking #chkCouple: Spouse Profile Panel visible = ${isSpousePanelVisibleAfterUncheck} (expected false)`);
    if (isSpousePanelVisibleAfterUncheck !== false) {
        console.error('FAILED: Spouse panel should be hidden after unchecking #chkCouple.');
        process.exit(1);
    }

    console.log('\n============================================================');
    console.log('ALL PLAYWRIGHT BROWSER E2E TESTS PASSED SUCCESSFULLY!');
    console.log('============================================================\n');

    await browser.close();
})();
