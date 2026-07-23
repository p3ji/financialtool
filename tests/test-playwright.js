const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const indexPath = 'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');
    await page.goto(indexPath);

    // Reproduce user screenshot exact state
    await page.fill('#currentAge', '38');
    await page.fill('#annualIncome', '0');
    await page.fill('#annualExpenses', '100000');

    await page.check('#chkCouple');
    await page.fill('#partnerAge', '39');
    await page.fill('#partnerIncome', '100000');

    await page.check('#chkIncludePortfolio');
    await page.fill('#currentBalance', '1000000');

    await page.check('#chkIncludePension');
    await page.fill('#pensionAge', '60');
    await page.fill('#pensionAmount', '30000');

    await page.fill('#partnerPensionAge', '60');
    await page.fill('#partnerPensionAmount', '60000');

    await page.waitForTimeout(300);

    const timelineText = await page.innerText('#timelinePanel');
    console.log('--- TIMELINE TEXT ---');
    console.log(timelineText);
    console.log('---------------------');

    const fiTargetText = await page.innerText('#resFIPortfolio');
    console.log(`FI Target: ${fiTargetText}`);

    const withPensionText = await page.innerText('#targetWithPensionVal');
    console.log(`With DB Pension Target: ${withPensionText}`);

    await browser.close();
})();
