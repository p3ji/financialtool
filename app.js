// Formatters
const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
const formatNumber = (val) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(val);

// DOM Elements
const inputs = {
    currentAge: document.getElementById('currentAge'),
    currentBalance: document.getElementById('currentBalance'),
    annualIncome: document.getElementById('annualIncome'),
    annualExpenses: document.getElementById('annualExpenses'),
    pensionAge: document.getElementById('pensionAge'),
    pensionAmount: document.getElementById('pensionAmount'),
    roi: document.getElementById('roi'),
    swr: document.getElementById('swr')
};

const gcInputs = {
    gcPensionAge: document.getElementById('gcPensionAge'),
    gcLifetimePension: document.getElementById('gcLifetimePension'),
    gcBridgeBenefit: document.getElementById('gcBridgeBenefit')
};

const toggles = {
    btnSimpleMode: document.getElementById('btnSimpleMode'),
    btnGCMode: document.getElementById('btnGCMode'),
    simpleDbInputs: document.getElementById('simpleDbInputs'),
    gcDbInputs: document.getElementById('gcDbInputs')
};

const results = {
    yearsToRetirement: document.getElementById('resYearsToRetirement'),
    retirementAge: document.getElementById('resRetirementAge'),
    targetPortfolio: document.getElementById('resTargetPortfolio'),
    annualSavings: document.getElementById('resAnnualSavings'),
    savingsRate: document.getElementById('resSavingsRate')
};

const timeline = {
    panel: document.getElementById('timelinePanel'),
    currentAge: document.getElementById('tlCurrentAge'),
    currentBalance: document.getElementById('tlCurrentBalance'),
    retirementItem: document.getElementById('tlRetirementItem'),
    retirementAge: document.getElementById('tlRetirementAge'),
    retirementBalance: document.getElementById('tlRetirementBalance'),
    expenses: document.getElementById('tlExpenses'),
    pensionItem: document.getElementById('tlPensionItem'),
    pensionAge: document.getElementById('tlPensionAge'),
    pensionAmount: document.getElementById('tlPensionAmount'),
    remainingExpenses: document.getElementById('tlRemainingExpenses')
};

const chartStatus = document.getElementById('chartStatus');
let retirementChartInstance = null;
let isGCMode = false;

// Event Listeners
Object.values(inputs).forEach(input => {
    input.addEventListener('input', calculateRetirement);
});
Object.values(gcInputs).forEach(input => {
    input.addEventListener('input', calculateRetirement);
});

toggles.btnSimpleMode.addEventListener('click', () => {
    isGCMode = false;
    toggles.btnSimpleMode.classList.add('active');
    toggles.btnGCMode.classList.remove('active');
    toggles.simpleDbInputs.style.display = 'block';
    toggles.gcDbInputs.style.display = 'none';
    calculateRetirement();
});

toggles.btnGCMode.addEventListener('click', () => {
    isGCMode = true;
    toggles.btnGCMode.classList.add('active');
    toggles.btnSimpleMode.classList.remove('active');
    toggles.gcDbInputs.style.display = 'block';
    toggles.simpleDbInputs.style.display = 'none';
    calculateRetirement();
});

// Initial Calculation
calculateRetirement();

function getRequiredBalanceAtAge(currentAge, pensionAge, expenses, lifetimePension, bridgeBenefit, swrDecimal, rMonthly) {
    let targetAt65 = Math.max(0, expenses - lifetimePension) / swrDecimal;
    let req = 0;
    
    if (currentAge >= 65) {
        req = targetAt65;
    } else if (currentAge >= pensionAge) {
        // In bridge phase (Pension started, but under 65)
        let monthsTo65 = Math.ceil((65 - currentAge) * 12);
        req = targetAt65;
        let monthlyGap = Math.max(0, expenses - lifetimePension - bridgeBenefit) / 12;
        for (let i = 0; i < monthsTo65; i++) {
            req = (req + monthlyGap) / (1 + rMonthly);
        }
    } else {
        // Gap phase (Pre-pension)
        let monthsToPension = Math.ceil((pensionAge - currentAge) * 12);
        
        // Calculate req at pension age
        let reqAtPensionAge = 0;
        if (pensionAge >= 65) {
            reqAtPensionAge = targetAt65;
        } else {
            let monthsTo65FromPension = Math.ceil((65 - pensionAge) * 12);
            let r = targetAt65;
            let monthlyGap = Math.max(0, expenses - lifetimePension - bridgeBenefit) / 12;
            for (let i = 0; i < monthsTo65FromPension; i++) {
                r = (r + monthlyGap) / (1 + rMonthly);
            }
            reqAtPensionAge = r;
        }

        req = reqAtPensionAge;
        let monthlyGap = expenses / 12; // Pre-pension gap is 100% expenses
        for (let i = 0; i < monthsToPension; i++) {
            req = (req + monthlyGap) / (1 + rMonthly);
        }
    }
    return req;
}

function calculateRetirement() {
    // Parse common inputs
    const age = parseFloat(inputs.currentAge.value) || 0;
    const balance = parseFloat(inputs.currentBalance.value) || 0;
    const income = parseFloat(inputs.annualIncome.value) || 0;
    const expenses = parseFloat(inputs.annualExpenses.value) || 0;
    const roiAnnual = parseFloat(inputs.roi.value) || 0;
    const swr = parseFloat(inputs.swr.value) || 0;

    // Parse Pension inputs based on mode
    let pensionAge, lifetimePension, bridgeBenefit;
    if (isGCMode) {
        pensionAge = parseFloat(gcInputs.gcPensionAge.value) || 0;
        lifetimePension = parseFloat(gcInputs.gcLifetimePension.value) || 0;
        bridgeBenefit = parseFloat(gcInputs.gcBridgeBenefit.value) || 0;
    } else {
        pensionAge = parseFloat(inputs.pensionAge.value) || 0;
        lifetimePension = parseFloat(inputs.pensionAmount.value) || 0;
        bridgeBenefit = 0;
    }

    const savings = income - expenses;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;
    const rMonthly = roiAnnual / 100 / 12;
    const swrDecimal = swr / 100;

    // Update basic savings stats
    results.annualSavings.innerText = formatCurrency(savings);
    results.savingsRate.innerText = formatNumber(savingsRate) + '%';
    
    // Target portfolio at post-65
    const post65Expenses = Math.max(0, expenses - lifetimePension);
    const targetPost65 = post65Expenses / swrDecimal;

    // Simulation variables
    let currentBal = balance;
    let monthsToRetirement = 0;
    let retired = false;
    let maxMonths = (100 - age) * 12; // Simulate up to age 100
    
    let simData = []; // To hold chart points

    for (let m = 0; m <= maxMonths; m++) {
        let currentAge = age + (m / 12);
        
        let requiredBalance = getRequiredBalanceAtAge(currentAge, pensionAge, expenses, lifetimePension, bridgeBenefit, swrDecimal, rMonthly);

        if (currentBal >= requiredBalance && !retired) {
            retired = true;
            monthsToRetirement = m;
            break;
        }

        currentBal = currentBal * (1 + rMonthly) + (savings / 12);
    }

    if (!retired) {
        results.yearsToRetirement.innerText = "N/A";
        results.retirementAge.innerText = "100+";
        results.targetPortfolio.innerText = "N/A";
        chartStatus.innerText = "Will not reach goal";
        chartStatus.style.color = "#ef4444";
        timeline.panel.style.display = "none";
        renderChart([], 0, 0, false);
        return;
    }

    // Found retirement date!
    const yearsToRetire = monthsToRetirement / 12;
    const retireAge = age + yearsToRetire;
    const requiredBalanceAtRetirement = getRequiredBalanceAtAge(retireAge, pensionAge, expenses, lifetimePension, bridgeBenefit, swrDecimal, rMonthly);

    // Update Results UI
    results.yearsToRetirement.innerText = formatNumber(yearsToRetire) + " yrs";
    results.retirementAge.innerText = formatNumber(retireAge);
    results.targetPortfolio.innerText = formatCurrency(requiredBalanceAtRetirement);
    chartStatus.innerText = "Goal Reachable!";
    chartStatus.style.color = "var(--success-color)";
    
    // Update Timeline UI
    timeline.panel.style.display = "block";
    timeline.currentAge.innerText = formatNumber(age);
    timeline.currentBalance.innerText = formatCurrency(balance);
    
    timeline.retirementAge.innerText = formatNumber(retireAge);
    timeline.retirementBalance.innerText = formatCurrency(requiredBalanceAtRetirement);
    timeline.expenses.innerText = formatCurrency(expenses);
    
    if (retireAge < pensionAge) {
        timeline.pensionItem.style.display = "block";
        timeline.pensionAge.innerText = formatNumber(pensionAge);
        let currentPensionStartAmt = lifetimePension + bridgeBenefit;
        timeline.pensionAmount.innerText = formatCurrency(currentPensionStartAmt);
        
        let remainingExp = Math.max(0, expenses - currentPensionStartAmt);
        timeline.remainingExpenses.innerText = formatCurrency(remainingExp);
        
        if (isGCMode && bridgeBenefit > 0) {
            document.querySelector('#tlPensionItem p').innerText = `Pension provides ${formatCurrency(currentPensionStartAmt)}/yr (${formatCurrency(lifetimePension)} lifetime + ${formatCurrency(bridgeBenefit)} bridge). Portfolio covers the remaining ${formatCurrency(remainingExp)}/yr. Bridge benefit ends at age 65.`;
        } else {
            document.querySelector('#tlPensionItem p').innerText = `Pension provides ${formatCurrency(currentPensionStartAmt)}/yr. Portfolio covers the remaining ${formatCurrency(remainingExp)}/yr.`;
        }
    } else {
        timeline.pensionItem.style.display = "none";
        let currentPensionStartAmt = lifetimePension + (retireAge < 65 ? bridgeBenefit : 0);
        let remainingExp = Math.max(0, expenses - currentPensionStartAmt);
        document.querySelector('#tlRetirementItem p').innerText = `Portfolio reaches ${formatCurrency(requiredBalanceAtRetirement)}. Pension provides ${formatCurrency(currentPensionStartAmt)}/yr. Portfolio covers the remaining ${formatCurrency(remainingExp)}/yr.`;
    }

    // Generate Full Chart Data
    let chartBal = balance;
    for (let m = 0; m <= maxMonths; m++) {
        let currentAge = age + (m / 12);
        
        if (m % 12 === 0 || m === monthsToRetirement || Math.abs(currentAge - pensionAge) < 0.05 || Math.abs(currentAge - 65) < 0.05) {
            simData.push({
                x: currentAge,
                y: chartBal
            });
        }

        if (m < monthsToRetirement) {
            // Accumulation
            chartBal = chartBal * (1 + rMonthly) + (savings / 12);
        } else {
            // Retirement
            if (currentAge < pensionAge) {
                // Gap
                chartBal = chartBal * (1 + rMonthly) - (expenses / 12);
            } else if (currentAge < 65) {
                // Bridge Phase
                let monthlyGap = Math.max(0, expenses - lifetimePension - bridgeBenefit) / 12;
                chartBal = chartBal * (1 + rMonthly) - monthlyGap;
            } else {
                // Post-65
                let monthlyGap = Math.max(0, expenses - lifetimePension) / 12;
                chartBal = chartBal * (1 + rMonthly) - monthlyGap;
            }
        }
    }

    renderChart(simData, retireAge, pensionAge, isGCMode && bridgeBenefit > 0);
}

function renderChart(data, retireAge, pensionAge, showAge65) {
    const ctx = document.getElementById('retirementChart').getContext('2d');
    
    if (retirementChartInstance) {
        retirementChartInstance.destroy();
    }

    // Prepare vertical annotations
    const verticalLinePlugin = {
        id: 'verticalLines',
        afterDraw: (chart) => {
            if (data.length === 0) return;
            const ctx = chart.ctx;
            const xAxis = chart.scales.x;
            const yAxis = chart.scales.y;
            
            ctx.save();
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);

            // Draw Retirement Line
            const xRetire = xAxis.getPixelForValue(retireAge);
            if (xRetire >= xAxis.left && xRetire <= xAxis.right) {
                ctx.beginPath();
                ctx.moveTo(xRetire, yAxis.top);
                ctx.lineTo(xRetire, yAxis.bottom);
                ctx.strokeStyle = '#10b981'; // success-color
                ctx.stroke();
                
                ctx.fillStyle = '#10b981';
                ctx.fillText('Retirement', xRetire + 5, yAxis.top + 15);
            }

            // Draw Pension Line (if applicable)
            if (retireAge < pensionAge) {
                const xPension = xAxis.getPixelForValue(pensionAge);
                if (xPension >= xAxis.left && xPension <= xAxis.right) {
                    ctx.beginPath();
                    ctx.moveTo(xPension, yAxis.top);
                    ctx.lineTo(xPension, yAxis.bottom);
                    ctx.strokeStyle = '#8b5cf6'; // purple accent
                    ctx.stroke();
                    
                    ctx.fillStyle = '#8b5cf6';
                    ctx.fillText('Pension Starts', xPension + 5, yAxis.top + 30);
                }
            }

            // Draw Age 65 Line (if applicable in GC Mode)
            if (showAge65 && retireAge < 65) {
                const x65 = xAxis.getPixelForValue(65);
                if (x65 >= xAxis.left && x65 <= xAxis.right) {
                    ctx.beginPath();
                    ctx.moveTo(x65, yAxis.top);
                    ctx.lineTo(x65, yAxis.bottom);
                    ctx.strokeStyle = '#f59e0b'; // amber accent
                    ctx.stroke();
                    
                    ctx.fillStyle = '#f59e0b';
                    ctx.fillText('Bridge Ends (65)', x65 + 5, yAxis.top + 45);
                }
            }

            ctx.restore();
        }
    };

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";

    retirementChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Portfolio Balance',
                data: data,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                pointRadius: 0,
                pointHitRadius: 10,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index',
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => `Age ${formatNumber(items[0].parsed.x)}`,
                        label: (item) => formatCurrency(item.parsed.y)
                    },
                    backgroundColor: 'rgba(20, 26, 41, 0.9)',
                    titleFont: { size: 14 },
                    bodyFont: { size: 14 },
                    padding: 12,
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Age' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                y: {
                    title: { display: true, text: 'Balance ($)' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        callback: (val) => '$' + (val / 1000) + 'k'
                    }
                }
            }
        },
        plugins: [verticalLinePlugin]
    });
}
