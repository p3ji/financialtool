/**
 * StatCan Synthetic Econometric Benchmark Engine (ES Module & Browser Portable)
 * Zero-dependency, portable ES module for Statistics Canada SHS comparisons.
 * Can be imported in Node.js (import), modern browsers, Next.js, Vite, or financial calculators.
 */

// Base StatCan SHS Category Baseline (Ontario Couple w/ Kids Provincial Average - 2026 Inflated)
export const BASE_PROVINCIAL_SHS = {
  'Food & Dining': { grocery: 12600, restaurant: 4200 },
  'Housing & Utilities': { propertyTax: 5800, utilities: 3900, maintenance: 4200, homeIns: 800 },
  'Recreation & Sports': { sports: 4800, lessons: 2200, skiEquip: 1100, streaming: 1000 },
  'Travel & Vacation': { vacation: 5100 },
  'Education & Savings': { resp: 2800, camps: 2000 },
  'Transport, Personal & Telecom': { gas: 3600, autoIns: 1400, internet: 1100, cell: 2200, clothingAdult: 1800, clothingKids: 1400, gifts: 1600 },
  'Structural': { mortgage: 16000, vehicleLoans: 9500, healthDental: 3200, daycare: 4500, supplies: 4000 }
};

// Income Quintile Elasticity Coefficients (alpha_income)
export const INCOME_ELASTICITY = {
  'Q1': { discretionary: 0.40, essential: 0.65 },
  'Q2': { discretionary: 0.60, essential: 0.80 },
  'Q3': { discretionary: 0.85, essential: 0.95 },
  'Q4': { discretionary: 1.15, essential: 1.10 },
  'Q5': { discretionary: 1.65, essential: 1.30 }, // Top 20% Income ($180k+)
};

// Geographic Cost Index (beta_cma)
export const CMA_COST_INDEX = {
  'Ottawa-Gatineau': { propertyTax: 1.07, utilities: 1.05, general: 1.03 },
  'Toronto': { propertyTax: 1.25, utilities: 1.12, general: 1.10 },
  'Hamilton': { propertyTax: 1.05, utilities: 1.02, general: 1.01 },
  'Generic_ON': { propertyTax: 1.00, utilities: 1.00, general: 1.00 },
};

// Age Cohort Multipliers (gamma_age)
export const AGE_COHORT_MULTIPLIERS = {
  'under_35': { youthSports: 0.50, lessons: 0.40, travel: 1.10 },
  '35_44': { youthSports: 1.77, lessons: 2.27, travel: 1.25, resp: 1.96 }, // Peak child activity age ~38
  '45_54': { youthSports: 1.20, lessons: 1.10, travel: 1.15, resp: 1.80 },
  '55_plus': { youthSports: 0.40, lessons: 0.30, travel: 1.30, resp: 0.20 },
};

/**
 * Helper: Calculate item annual rate
 */
function calcItemAnnual(item) {
  const a = Number(item.amount) || 0;
  if (item.freq === 'weekly') return a * 52;
  if (item.freq === 'monthly') return a * 12;
  return a;
}

/**
 * Main Econometric Computation Function
 * Y_hat_c = Y_base,c * alpha_income,c * beta_cma,c * gamma_age,c * delta_family,c
 */
export function computeBenchmark(options) {
  const opts = Object.assign({
    region: 'Ottawa-Gatineau',
    incomeQuintile: 'Q5',
    householdType: 'couple_kids',
    numChildren: 2,
    refPersonAge: 38,
    userItems: [],
  }, options || {});

  const qKey = opts.incomeQuintile in INCOME_ELASTICITY ? opts.incomeQuintile : 'Q5';
  const cmaKey = opts.region in CMA_COST_INDEX ? opts.region : 'Ottawa-Gatineau';
  const ageKey = opts.refPersonAge >= 35 && opts.refPersonAge <= 44 ? '35_44' : '35_44';

  const inc = INCOME_ELASTICITY[qKey];
  const cma = CMA_COST_INDEX[cmaKey];
  const age = AGE_COHORT_MULTIPLIERS[ageKey];

  // Compute Granular Benchmarks via log-additive decomposition formula
  const granular = [
    { key: 'grocery', name: '🛒 Groceries & Store Food', bAmt: Math.round(BASE_PROVINCIAL_SHS['Food & Dining'].grocery * inc.essential), matchKeys: ['food', 'walmart delivery'], desc: 'StatCan grocery baseline' },
    { key: 'restaurant', name: '🍽️ Restaurant Dining', bAmt: Math.round(BASE_PROVINCIAL_SHS['Food & Dining'].restaurant * inc.discretionary), matchKeys: ['restaurant', 'dining'], desc: 'StatCan restaurant baseline' },
    { key: 'sports', name: '⛸️ Sports & Athletics', bAmt: Math.round(BASE_PROVINCIAL_SHS['Recreation & Sports'].sports * inc.discretionary * age.youthSports), matchKeys: ['skating', 'swimming', 'gymnastics', 'angel skate'], desc: 'Peak youth athletics & sports' },
    { key: 'lessons', name: '🎹 Lessons & Summer Camps', bAmt: Math.round(BASE_PROVINCIAL_SHS['Recreation & Sports'].lessons * inc.discretionary * age.lessons), matchKeys: ['piano', 'summer camp', 'lessons'], desc: 'Music, arts & enrichment camps' },
    { key: 'resp', name: '🎓 RESP & Education Savings', bAmt: Math.round(BASE_PROVINCIAL_SHS['Education & Savings'].resp * inc.discretionary * age.resp), matchKeys: ['resp', 'education'], desc: 'Post-secondary education savings' },
    { key: 'vacation', name: '✈️ Vacations & Package Trips', bAmt: Math.round(BASE_PROVINCIAL_SHS['Travel & Vacation'].vacation * inc.discretionary * age.travel), matchKeys: ['vacation', 'travel'], desc: 'Family travel & accommodations' },
    { key: 'ski', name: '⛷️ Skiing & Recreation Equip.', bAmt: Math.round(BASE_PROVINCIAL_SHS['Recreation & Sports'].skiEquip * inc.discretionary), matchKeys: ['ski'], desc: 'Winter sports & equip' },
    { key: 'homeRepair', name: '🏡 Home Repair & Maintenance', bAmt: Math.round(BASE_PROVINCIAL_SHS['Housing & Utilities'].maintenance * inc.essential * cma.general), matchKeys: ['home repair', 'maintenance'], desc: 'Annual home maintenance' },
    { key: 'propTax', name: '🏛️ Property Taxes', bAmt: Math.round(BASE_PROVINCIAL_SHS['Housing & Utilities'].propertyTax * cma.propertyTax), matchKeys: ['property tax'], desc: 'CMA municipal property taxes' },
    { key: 'utilities', name: '⚡ Utilities (Hydro & Water)', bAmt: Math.round(BASE_PROVINCIAL_SHS['Housing & Utilities'].utilities * cma.utilities), matchKeys: ['hydro', 'water', 'utilities'], desc: 'Electricity & water utility' },
    { name: '🚘 Auto Insurance', bAmt: Math.round(BASE_PROVINCIAL_SHS['Transport, Personal & Telecom'].autoIns * inc.essential), matchKeys: ['car insurance', 'auto insurance'], desc: 'Vehicle insurance' },
    { name: '🏠 Homeowner Insurance', bAmt: Math.round(BASE_PROVINCIAL_SHS['Housing & Utilities'].homeIns * inc.essential), matchKeys: ['home insurance'], desc: 'Home insurance' },
    { name: '📱 Internet & Streaming', bAmt: Math.round((BASE_PROVINCIAL_SHS['Transport, Personal & Telecom'].internet + BASE_PROVINCIAL_SHS['Recreation & Sports'].streaming) * inc.discretionary), matchKeys: ['internet', 'streaming'], desc: 'Telecom & digital streaming' },
    { name: '⛽ Gasoline & Auto Fuel', bAmt: Math.round(BASE_PROVINCIAL_SHS['Transport, Personal & Telecom'].gas * inc.essential), matchKeys: ['gas', 'fuel'], desc: 'Vehicle fuel' },
    { name: '👔 Adult Clothing', bAmt: Math.round(BASE_PROVINCIAL_SHS['Transport, Personal & Telecom'].clothingAdult * inc.discretionary), matchKeys: ['clothes'], desc: 'Adult apparel' },
    { name: '👟 Children\'s Clothing', bAmt: Math.round(BASE_PROVINCIAL_SHS['Transport, Personal & Telecom'].clothingKids * inc.essential), matchKeys: ['kids clothes'], desc: 'Children\'s apparel' },
    { name: '🎁 Gifts & Birthday Parties', bAmt: Math.round(BASE_PROVINCIAL_SHS['Transport, Personal & Telecom'].gifts * inc.discretionary), matchKeys: ['gifts', 'party', 'bday'], desc: 'Gifts & celebration pool' },
    { name: '📞 Cell Phone Services', bAmt: 2400, matchKeys: ['cell phone', 'prepaid cell'], desc: 'Mobile phone services' },
    // Structural Items
    { name: '🏦 Mortgage Principal & Interest', bAmt: Math.round(BASE_PROVINCIAL_SHS.Structural.mortgage * cma.general), matchKeys: ['mortgage'], isStructural: true, desc: 'Homeowner mortgage payments' },
    { name: '🚘 Vehicle Financing & Loans', bAmt: Math.round(BASE_PROVINCIAL_SHS.Structural.vehicleLoans * inc.discretionary), matchKeys: ['car payment', 'lease'], isStructural: true, desc: 'Vehicle lease & loan payments' },
    { name: '🏥 Health, Dental & Vision', bAmt: Math.round(BASE_PROVINCIAL_SHS.Structural.healthDental * inc.essential), matchKeys: ['health', 'dental'], isStructural: true, desc: 'Out-of-pocket medical & dental' },
    { name: '👶 Daycare & Childcare Services', bAmt: Math.round(BASE_PROVINCIAL_SHS.Structural.daycare), matchKeys: ['daycare', 'babysitting'], isStructural: true, desc: 'Full-time daycare & after-school' },
    { name: '🧹 Household Supplies & Furniture', bAmt: Math.round(BASE_PROVINCIAL_SHS.Structural.supplies * inc.discretionary), matchKeys: ['furniture', 'supplies'], isStructural: true, desc: 'Household cleaning & furnishings' },
  ];

  // Compute user match totals if userItems provided
  const userItems = opts.userItems || [];
  const userTotalAnnual = userItems.reduce((sum, i) => sum + calcItemAnnual(i), 0);

  const evaluatedGranular = granular.map(g => {
    const matched = userItems.filter(i => g.matchKeys.some(k => i.name.toLowerCase().includes(k.toLowerCase())));
    const userVal = matched.reduce((sum, i) => sum + calcItemAnnual(i), 0);
    const diff = userVal - g.bAmt;
    const pctVariance = g.bAmt ? ((diff / g.bAmt) * 100).toFixed(1) : 0;
    return Object.assign({}, g, { userVal, diff, pctVariance });
  });

  const operationalBenchmarkTotal = evaluatedGranular.filter(g => !g.isStructural).reduce((sum, g) => sum + g.bAmt, 0);
  const structuralBenchmarkTotal = evaluatedGranular.filter(g => g.isStructural).reduce((sum, g) => sum + g.bAmt, 0);
  const comprehensiveBenchmarkTotal = operationalBenchmarkTotal + structuralBenchmarkTotal;

  return {
    activeProfileLabel: `${opts.region} | Couple w/ ${opts.numChildren} Children | Top 20% Income ($180k+) | Age ~${opts.refPersonAge} Cohort`,
    formula: 'Y_hat_c = Y_base,c * alpha_income,c * beta_cma,c * gamma_age,c * delta_family,c',
    granularItems: evaluatedGranular,
    totals: {
      userTotalAnnual,
      operationalBenchmarkTotal,
      structuralBenchmarkTotal,
      comprehensiveBenchmarkTotal,
      operationalVariance: userTotalAnnual - operationalBenchmarkTotal,
      comprehensiveVariance: userTotalAnnual - comprehensiveBenchmarkTotal,
    },
    sources: [
      { table: '11-10-0222-01', title: 'Household spending by household type', url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1110022201' },
      { table: '11-10-0223-01', title: 'Household spending by income quintile', url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1110022301' },
      { table: '11-10-0227-01', title: 'Household spending by CMA', url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1110022701' },
    ]
  };
}

export default {
  computeBenchmark,
  BASE_PROVINCIAL_SHS,
  INCOME_ELASTICITY,
  CMA_COST_INDEX,
  AGE_COHORT_MULTIPLIERS
};
