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

// Event Listeners
Object.values(inputs).forEach(input => {
    input.addEventListener('input', calculateRetirement);
});

// Initial Calculation
calculateRetirement();

function calculateRetirement() {
    // Parse inputs
    const age = parseFloat(inputs.currentAge.value) || 0;
    const balance = parseFloat(inputs.currentBalance.value) || 0;
    const income = parseFloat(inputs.annualIncome.value) || 0;
    const expenses = parseFloat(inputs.annualExpenses.value) || 0;
    const pensionAge = parseFloat(inputs.pensionAge.value) || 0;
    const pensionAmount = parseFloat(inputs.pensionAmount.value) || 0;
    const roiAnnual = parseFloat(inputs.roi.value) || 0;
    const swr = parseFloat(inputs.swr.value) || 0;

    const savings = income - expenses;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;
    const rMonthly = roiAnnual / 100 / 12;
    const swrDecimal = swr / 100;

    // Update basic savings stats
    results.annualSavings.innerText = formatCurrency(savings);
    results.savingsRate.innerText = formatNumber(savingsRate) + '%';
    
    if (savings <= 0 && expenses > 0) {
        // Special case: Not saving anything. Check if current balance is already enough.
    }

    // Target portfolio at pension age
    const postPensionExpenses = Math.max(0, expenses - pensionAmount);
    const targetPostPension = postPensionExpenses / swrDecimal;

    // Simulation variables
    let currentBal = balance;
    let monthsToRetirement = 0;
    let retired = false;
    let maxMonths = (100 - age) * 12; // Simulate up to age 100
    
    let simData = []; // To hold chart points

    for (let m = 0; m <= maxMonths; m++) {
        let currentAge = age + (m / 12);
        
        // Calculate REQUIRED balance to retire at currentAge
        let requiredBalance = 0;
        if (currentAge >= pensionAge) {
            requiredBalance = targetPostPension;
        } else {
            // Gap phase calculation: work backwards from pension age
            let monthsToPension = Math.ceil((pensionAge - currentAge) * 12);
            let req = targetPostPension;
            for (let i = 0; i < monthsToPension; i++) {
                req = (req + expenses / 12) / (1 + rMonthly);
            }
            requiredBalance = req;
        }

        if (currentBal >= requiredBalance && !retired) {
            retired = true;
            monthsToRetirement = m;
            break;
        }

        currentBal = currentBal * (1 + rMonthly) + (savings / 12);
    }

    if (!retired) {
        // Never retired by age 100
        results.yearsToRetirement.innerText = "N/A";
        results.retirementAge.innerText = "100+";
        results.targetPortfolio.innerText = "N/A";
        chartStatus.innerText = "Will not reach goal";
        chartStatus.style.color = "#ef4444";
        timeline.panel.style.display = "none";
        renderChart([], 0, 0);
        return;
    }

    // Found retirement date!
    const yearsToRetire = monthsToRetirement / 12;
    const retireAge = age + yearsToRetire;
    
    // Exact target at retirement
    let requiredBalanceAtRetirement = 0;
    if (retireAge >= pensionAge) {
        requiredBalanceAtRetirement = targetPostPension;
    } else {
        let monthsToPension = Math.ceil((pensionAge - retireAge) * 12);
        let req = targetPostPension;
        for (let i = 0; i < monthsToPension; i++) {
            req = (req + expenses / 12) / (1 + rMonthly);
        }
        requiredBalanceAtRetirement = req;
    }

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
        timeline.pensionAmount.innerText = formatCurrency(pensionAmount);
        timeline.remainingExpenses.innerText = formatCurrency(postPensionExpenses);
    } else {
        timeline.pensionItem.style.display = "none";
        // If they retire after pension age, gap phase text doesn't apply
        document.querySelector('#tlRetirementItem p').innerText = `Portfolio reaches ${formatCurrency(requiredBalanceAtRetirement)}. Pension provides ${formatCurrency(pensionAmount)}/yr. Portfolio covers the remaining ${formatCurrency(postPensionExpenses)}/yr.`;
    }

    // Generate Full Chart Data
    let chartBal = balance;
    for (let m = 0; m <= maxMonths; m++) {
        let currentAge = age + (m / 12);
        
        if (m % 12 === 0 || m === monthsToRetirement || Math.abs(currentAge - pensionAge) < 0.05) {
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
            } else {
                // Post-pension
                chartBal = chartBal * (1 + rMonthly) - (postPensionExpenses / 12);
            }
        }
    }

    renderChart(simData, retireAge, pensionAge);
}

function renderChart(data, retireAge, pensionAge) {
    const ctx = document.getElementById('retirementChart').getContext('2d');
    
    if (retirementChartInstance) {
        retirementChartInstance.destroy();
    }

    // Prepare vertical annotations (we'll just draw them using a plugin)
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
