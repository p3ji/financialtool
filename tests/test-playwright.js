const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const indexPath = 'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');
    await page.goto(indexPath);

    // Exact inputs from 3rd screenshot
    await page.fill('#currentAge', '38');
    await page.fill('#annualIncome', '0');
    await page.fill('#annualExpenses', '100000');

    await page.check('#chkCouple');
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

    await page.waitForTimeout(300);

    const annualSavings = await page.innerText('#profileAnnualSavings');
    const savingsRate   = await page.innerText('#profileSavingsRate');
    const fiAgeText     = await page.innerText('#resFIAge');
    const badgeText     = await page.innerText('#chartStatus');

    console.log(`Annual Savings: ${annualSavings}`);
    console.log(`Savings Rate: ${savingsRate}`);
    console.log(`FI Age: ${fiAgeText}`);
    console.log(`Badge Text: ${badgeText}`);

    // Toggle detailed table
    await page.evaluate(() => document.getElementById('btnToggleTable').click());
    await page.waitForSelector('#detailedTable tbody tr', { state: 'visible' });

    const rows = await page.$$eval('#detailedTable tbody tr', trs => trs.map(tr => {
        const tds = tr.querySelectorAll('td');
        return {
            age: tds[0]?.textContent.trim(),
            income: tds[1]?.textContent.trim(),
            expenses: tds[2]?.textContent.trim(),
            networth: tds[6]?.textContent.trim()
        };
    }));

    console.log('--- DETAILED TABLE (Ages 38 to 44) ---');
    rows.filter(r => parseInt(r.age) >= 38 && parseInt(r.age) <= 44).forEach(r => {
        console.log(`Age ${r.age}: Income = ${r.income}, Expenses = ${r.expenses}, Networth = ${r.networth}`);
    });
    console.log('---------------------------------------');

    await browser.close();
})();
