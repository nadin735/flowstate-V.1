/**
 * FLOWSTATE financial calculation engine.
 *
 * Pure, side-effect free functions. Every number shown in the UI that relates to
 * cost, savings or ROI comes from here. Results are ESTIMATES based on the demo
 * assumptions — never measured outcomes.
 *
 * Measurement periods: ROI and "payback after go-live" count from go-live
 * (month 1 = first month after go-live); "payback from project start" adds the
 * implementation period. Benefits ramp up linearly over `rampUpMonths`.
 * Implementation-period costs other than the initial investment are not modelled.
 */
import type { Assumptions, BusinessProcess, Scenario } from "./types";

/** Productive hours per FTE per month used for FTE-equivalent conversion. */
export const PRODUCTIVE_HOURS_PER_FTE_MONTH = 140;
export const WORKDAY_HOURS = 8;

/** Coerce anything to a finite number, falling back to `fallback`. */
export function safeNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  const v = safeNumber(value, min);
  return Math.min(max, Math.max(min, v));
}

/** Division that returns null instead of Infinity/NaN. */
export function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

// ---------------------------------------------------------------------------
// Process-derived baseline
// ---------------------------------------------------------------------------

export interface ProcessBaseline {
  /** Sum of active handling minutes per invoice across all steps. */
  minutesPerInvoice: number;
  /** Probability an invoice hits at least one error: 1 − Π(1 − eᵢ). */
  errorRate: number;
  /** Error-weighted average rework minutes per error. */
  reworkMinutesPerError: number;
  /** Effort-weighted share of work already automated today. */
  automationRate: number;
  /** Sum of waiting days plus handling time expressed in workdays. */
  cycleTimeDays: number;
}

export function processBaseline(process: BusinessProcess): ProcessBaseline {
  const steps = process.steps;
  const minutes = steps.reduce((s, x) => s + safeNumber(x.minutesPerInvoice), 0);
  const noError = steps.reduce((p, x) => p * (1 - clamp(x.errorRate, 0, 1)), 1);
  const errorWeight = steps.reduce((s, x) => s + clamp(x.errorRate, 0, 1), 0);
  const rework = errorWeight > 0 ? steps.reduce((s, x) => s + clamp(x.errorRate, 0, 1) * safeNumber(x.reworkMinutes), 0) / errorWeight : 0;
  // Automation rate: automated share weighted by the step's total (manual + automated) workload.
  // minutesPerInvoice is the remaining MANUAL time; the automated-equivalent time is m·a/(1−a).
  let totalWork = 0;
  let automatedWork = 0;
  for (const s of steps) {
    const a = clamp(s.automatedShare, 0, 0.95);
    const m = safeNumber(s.minutesPerInvoice);
    const total = a < 1 ? m / (1 - a) : m;
    totalWork += total;
    automatedWork += total * a;
  }
  const waits = steps.reduce((s, x) => s + safeNumber(x.waitDays), 0);
  return {
    minutesPerInvoice: minutes,
    errorRate: 1 - noError,
    reworkMinutesPerError: rework,
    automationRate: totalWork > 0 ? automatedWork / totalWork : 0,
    cycleTimeDays: waits + minutes / 60 / WORKDAY_HOURS,
  };
}

// ---------------------------------------------------------------------------
// Per-step analysis
// ---------------------------------------------------------------------------

export interface StepMetrics {
  stepId: string;
  monthlyHours: number;
  monthlyCost: number;
  reworkHours: number;
  costShare: number;
  waitShare: number;
  /** 0..100 composite score: cost share, wait share, error rate, manual share. */
  bottleneckScore: number;
  isBottleneck: boolean;
}

export function stepMetrics(process: BusinessProcess, hourlyCost: number): StepMetrics[] {
  const volume = Math.max(0, safeNumber(process.monthlyVolume));
  const rate = Math.max(0, safeNumber(hourlyCost));
  const raw = process.steps.map((s) => {
    const handling = (volume * safeNumber(s.minutesPerInvoice)) / 60;
    const rework = (volume * clamp(s.errorRate, 0, 1) * safeNumber(s.reworkMinutes)) / 60;
    return { s, handling, rework, cost: (handling + rework) * rate };
  });
  const totalCost = raw.reduce((t, r) => t + r.cost, 0);
  const totalWait = process.steps.reduce((t, s) => t + safeNumber(s.waitDays), 0);
  const maxError = Math.max(0.0001, ...process.steps.map((s) => s.errorRate));
  const scored = raw.map(({ s, handling, rework, cost }) => {
    const costShare = totalCost > 0 ? cost / totalCost : 0;
    const waitShare = totalWait > 0 ? safeNumber(s.waitDays) / totalWait : 0;
    const score = 100 * (0.45 * costShare + 0.3 * waitShare + 0.15 * (s.errorRate / maxError) + 0.1 * (1 - s.automatedShare));
    return {
      stepId: s.id,
      monthlyHours: handling + rework,
      monthlyCost: cost,
      reworkHours: rework,
      costShare,
      waitShare,
      bottleneckScore: Math.round(clamp(score, 0, 100)),
      isBottleneck: false,
    };
  });
  // A step is a bottleneck if it is the top scorer, or scores within 85% of the top score.
  const top = Math.max(0, ...scored.map((s) => s.bottleneckScore));
  const hasData = totalCost > 0 || totalWait > 0;
  return scored.map((s) => ({ ...s, isBottleneck: hasData && top > 0 && s.bottleneckScore >= top * 0.85 }));
}

// ---------------------------------------------------------------------------
// Scenario calculation
// ---------------------------------------------------------------------------

export interface FinanceInputs {
  monthlyVolume: number;
  minutesPerInvoice: number;
  hourlyCost: number;
  errorRate: number;
  reworkMinutesPerError: number;
  residualEffortOnAutomated: number;
  automationErrorReduction: number;
  cycleTimeDays: number;
  roiHorizonMonths: number;
  /** Optional extensions — omitted values reproduce the plain labour-cost model. */
  avgInvoiceValue?: number;
  discountEligibleShare?: number;
  discountRate?: number;
  discountCapturedToday?: number;
  discountDaysEarlier?: number;
  capacityRealisation?: number;
  rampUpMonths?: number;
  wacc?: number;
}

export function resolveInputs(process: BusinessProcess, a: Assumptions): FinanceInputs {
  const base = processBaseline(process);
  return {
    monthlyVolume: a.monthlyVolume,
    minutesPerInvoice: a.processingMinutesOverride ?? base.minutesPerInvoice,
    hourlyCost: a.hourlyCost,
    errorRate: a.errorRateOverride ?? base.errorRate,
    reworkMinutesPerError: base.reworkMinutesPerError,
    residualEffortOnAutomated: a.residualEffortOnAutomated,
    automationErrorReduction: a.automationErrorReduction,
    cycleTimeDays: base.cycleTimeDays,
    roiHorizonMonths: a.roiHorizonMonths,
    avgInvoiceValue: a.avgInvoiceValue,
    discountEligibleShare: a.discountEligibleShare,
    discountRate: a.discountRate,
    discountCapturedToday: a.discountCapturedToday,
    discountDaysEarlier: a.discountDaysEarlier,
    capacityRealisation: a.capacityRealisation,
    rampUpMonths: a.rampUpMonths,
    wacc: a.wacc,
  };
}

export interface ScenarioResult {
  scenarioId: Scenario["id"];
  /** Monthly labour cost of the process today (handling + rework). */
  currentMonthlyCost: number;
  /** Monthly labour cost of the process after the change (excl. operating cost). */
  futureMonthlyProcessCost: number;
  /** futureMonthlyProcessCost + monthlyOperatingCost. */
  futureMonthlyTotalCost: number;
  monthlyOperatingCost: number;
  /** Labour cost freed per month: current − future process cost. */
  labourSavingsGross: number;
  /** Part of the freed labour cost that becomes real savings (× capacity realisation). */
  labourSavingsRealised: number;
  /** Additional early-payment discounts captured per month. */
  discountBenefit: number;
  /** Discount rate after the cost of paying earlier (WACC × days ÷ 365). */
  netDiscountRate: number;
  /** realised labour savings + discount benefit − operating cost, at full benefit level. May be negative. */
  monthlyNetSavings: number;
  annualNetSavings: number;
  /** annualNetSavings − initialInvestment. */
  firstYearNetBenefit: number;
  /** (firstYearNetBenefit / investment). null when investment is 0. */
  roiFirstYear: number | null;
  /** ROI over roiHorizonMonths. null when investment is 0. */
  roiHorizon: number | null;
  roiHorizonMonths: number;
  /** Months after go-live until the investment is recovered (with ramp-up). null when never recovered. */
  paybackMonths: number | null;
  /** paybackMonths + implementation months. */
  paybackFromStartMonths: number | null;
  implementationMonths: number;
  /** Net present value over the horizon at `wacc`, incl. the investment at go-live. */
  npv: number;
  /** Freed capacity in full-time equivalents (currentFte − futureFte). */
  freedFte: number;
  currentMinutesPerInvoice: number;
  futureMinutesPerInvoice: number;
  processingTimeReduction: number | null;
  currentErrorRate: number;
  futureErrorRate: number;
  errorReduction: number | null;
  currentCycleTimeDays: number;
  futureCycleTimeDays: number;
  currentCostPerInvoice: number | null;
  futureCostPerInvoice: number | null;
  currentFte: number;
  futureFte: number;
  /** Month-by-month cumulative net cash flow from go-live (index 0 = investment). */
  cumulativeCashFlow: number[];
  warnings: string[];
}

export function calculateScenario(inputs: FinanceInputs, scenario: Scenario): ScenarioResult {
  const warnings: string[] = [];
  const volume = Math.max(0, Math.round(safeNumber(inputs.monthlyVolume)));
  const minutes = Math.max(0, safeNumber(inputs.minutesPerInvoice));
  const rate = Math.max(0, safeNumber(inputs.hourlyCost));
  const err = clamp(inputs.errorRate, 0, 1);
  const rework = Math.max(0, safeNumber(inputs.reworkMinutesPerError));
  const residual = clamp(inputs.residualEffortOnAutomated, 0, 1);
  const autoErr = clamp(inputs.automationErrorReduction, 0, 1);
  const auto = clamp(scenario.automationShare, 0, 1);
  const eff = clamp(scenario.processEfficiencyGain, 0, 0.95);
  const errGain = clamp(scenario.processErrorGain, 0, 1);
  const investment = Math.max(0, safeNumber(scenario.initialInvestment));
  const opex = Math.max(0, safeNumber(scenario.monthlyOperatingCost));
  const horizon = Math.round(clamp(inputs.roiHorizonMonths, 12, 60));

  if (volume === 0) warnings.push("Monthly invoice volume is 0 — no savings can be calculated.");
  if (minutes === 0) warnings.push("Processing time is 0 — processing-time reduction is undefined.");
  if (rate === 0) warnings.push("Hourly labour cost is 0 — labour savings will be 0.");

  // Monthly labour cost = volume × hours per invoice × hourly cost (handling + expected rework).
  const currentHoursPerInvoice = minutes / 60 + (err * rework) / 60;
  const currentMonthlyCost = volume * currentHoursPerInvoice * rate;

  const futureMinutes = minutes * (1 - eff) * (1 - auto * (1 - residual));
  const futureErr = err * (1 - errGain) * (1 - auto * autoErr);
  const futureHoursPerInvoice = futureMinutes / 60 + (futureErr * rework) / 60;
  const futureMonthlyProcessCost = volume * futureHoursPerInvoice * rate;

  // Labour savings = current − future process cost; only the realised share counts as cash.
  const realisation = inputs.capacityRealisation === undefined ? 1 : clamp(inputs.capacityRealisation, 0, 1);
  const labourSavingsGross = currentMonthlyCost - futureMonthlyProcessCost;
  const labourSavingsRealised = labourSavingsGross * realisation;

  // Early-payment discount benefit = volume × avg invoice value × eligible share × net discount rate × (target − today capture).
  // Net discount rate = discount rate − cost of paying earlier (WACC × days earlier ÷ 365), never below 0.
  const avgValue = Math.max(0, safeNumber(inputs.avgInvoiceValue));
  const eligible = clamp(inputs.discountEligibleShare ?? 0, 0, 1);
  const dRate = clamp(inputs.discountRate ?? 0, 0, 0.1);
  const capturedToday = clamp(inputs.discountCapturedToday ?? 0, 0, 1);
  const captureTarget = clamp(scenario.discountCaptureTarget ?? 0, 0, 1);
  const financingCost = clamp(inputs.wacc ?? 0, 0, 0.3) * Math.max(0, safeNumber(inputs.discountDaysEarlier)) / 365;
  const netDiscountRate = Math.max(0, dRate - financingCost);
  const discountBenefit = volume * avgValue * eligible * netDiscountRate * Math.max(0, captureTarget - capturedToday);

  // Monthly net savings (full benefit level) = realised labour savings + discount benefit − monthly operating cost.
  // With 100 % realisation and no discount data this is exactly: current − future process cost − operating cost.
  const monthlyNetSavings = labourSavingsRealised + discountBenefit - opex;
  const annualNetSavings = monthlyNetSavings * 12;

  // Month-by-month cash flow after go-live, benefits ramping up linearly.
  const ramp = Math.round(clamp(inputs.rampUpMonths ?? 0, 0, 12));
  const benefit = labourSavingsRealised + discountBenefit;
  const monthFlow = (m: number) => (ramp > 0 ? Math.min(1, m / ramp) : 1) * benefit - opex;
  const cumulativeCashFlow: number[] = [-investment];
  for (let m = 1; m <= horizon; m++) cumulativeCashFlow.push(cumulativeCashFlow[m - 1] + monthFlow(m));
  const sumFirst = (n: number) => cumulativeCashFlow[Math.min(n, horizon)] + investment;

  const firstYearNetBenefit = sumFirst(12) - investment;
  const roiFirstYear = safeDivide(firstYearNetBenefit, investment);
  const roiHorizon = safeDivide(sumFirst(horizon) - investment, investment);

  let paybackMonths: number | null = null;
  if (monthlyNetSavings <= 0) {
    if (monthlyNetSavings < 0) warnings.push("Operating cost exceeds the benefits — this scenario loses money every month.");
  } else if (ramp === 0) {
    // Payback = initial investment ÷ monthly net savings.
    paybackMonths = investment / monthlyNetSavings;
  } else {
    // With ramp-up: first month in which the cumulative cash flow turns positive (interpolated), searched up to 20 years.
    let cum = -investment;
    for (let m = 1; m <= 240; m++) {
      const next = cum + monthFlow(m);
      if (next >= 0) {
        const f = monthFlow(m);
        paybackMonths = m - 1 + (f > 0 ? -cum / f : 1);
        break;
      }
      cum = next;
    }
    if (investment === 0) paybackMonths = 0;
  }
  if (investment === 0) warnings.push("Initial investment is 0 — ROI is not defined (shown as n/a).");
  const implementationMonths = Math.max(0, Math.round(safeNumber(scenario.implementationMonths)));
  const paybackFromStartMonths = paybackMonths === null ? null : paybackMonths + implementationMonths;

  // NPV at go-live: −investment + Σ cash flow_m ÷ (1 + wacc)^(m/12).
  const wacc = clamp(inputs.wacc ?? 0, 0, 0.3);
  let npv = -investment;
  for (let m = 1; m <= horizon; m++) npv += monthFlow(m) / Math.pow(1 + wacc, m / 12);

  const wait = Math.max(0, safeNumber(inputs.cycleTimeDays) - minutes / 60 / WORKDAY_HOURS);
  const currentCycle = wait + minutes / 60 / WORKDAY_HOURS;
  const futureCycle = wait * (1 - clamp(scenario.waitTimeReduction, 0, 1)) + futureMinutes / 60 / WORKDAY_HOURS;

  return {
    scenarioId: scenario.id,
    currentMonthlyCost,
    futureMonthlyProcessCost,
    futureMonthlyTotalCost: futureMonthlyProcessCost + opex,
    monthlyOperatingCost: opex,
    labourSavingsGross,
    labourSavingsRealised,
    discountBenefit,
    netDiscountRate,
    monthlyNetSavings,
    annualNetSavings,
    firstYearNetBenefit,
    roiFirstYear,
    roiHorizon,
    roiHorizonMonths: horizon,
    paybackMonths,
    paybackFromStartMonths,
    implementationMonths,
    npv,
    freedFte: (volume * (currentHoursPerInvoice - futureHoursPerInvoice)) / PRODUCTIVE_HOURS_PER_FTE_MONTH,
    currentMinutesPerInvoice: minutes,
    futureMinutesPerInvoice: futureMinutes,
    processingTimeReduction: minutes > 0 ? 1 - futureMinutes / minutes : null,
    currentErrorRate: err,
    futureErrorRate: futureErr,
    errorReduction: err > 0 ? 1 - futureErr / err : null,
    currentCycleTimeDays: currentCycle,
    futureCycleTimeDays: futureCycle,
    currentCostPerInvoice: safeDivide(currentMonthlyCost, volume),
    futureCostPerInvoice: safeDivide(futureMonthlyProcessCost + opex, volume),
    currentFte: (volume * currentHoursPerInvoice) / PRODUCTIVE_HOURS_PER_FTE_MONTH,
    futureFte: (volume * futureHoursPerInvoice) / PRODUCTIVE_HOURS_PER_FTE_MONTH,
    cumulativeCashFlow,
    warnings,
  };
}

export function calculateAll(process: BusinessProcess, assumptions: Assumptions, scenarios: Scenario[]): ScenarioResult[] {
  const inputs = resolveInputs(process, assumptions);
  return scenarios.map((s) => calculateScenario(inputs, s));
}

// ---------------------------------------------------------------------------
// Sensitivity: pessimistic / base / optimistic
// ---------------------------------------------------------------------------

export interface SensitivityCase {
  label: "Pessimistic" | "Base" | "Optimistic";
  result: ScenarioResult;
}

/** Fixed, documented stress factors applied to the scenario levers and benefit assumptions. */
export const SENSITIVITY_FACTORS = {
  pessimistic: { levers: 0.7, investment: 1.25, opex: 1.15, realisation: 0.85, discountGap: 0.6 },
  optimistic: { levers: 1.15, investment: 0.9, opex: 0.95, realisation: 1.1, discountGap: 1.15 },
} as const;

export function sensitivity(inputs: FinanceInputs, scenario: Scenario): SensitivityCase[] {
  const stress = (f: (typeof SENSITIVITY_FACTORS)["pessimistic" | "optimistic"]): ScenarioResult => {
    const today = clamp(inputs.discountCapturedToday ?? 0, 0, 1);
    const target = clamp(scenario.discountCaptureTarget ?? 0, 0, 1);
    const s: Scenario = {
      ...scenario,
      automationShare: clamp(scenario.automationShare * f.levers, 0, 0.95),
      processEfficiencyGain: clamp(scenario.processEfficiencyGain * f.levers, 0, 0.9),
      processErrorGain: clamp(scenario.processErrorGain * f.levers, 0, 1),
      waitTimeReduction: clamp(scenario.waitTimeReduction * f.levers, 0, 1),
      initialInvestment: scenario.initialInvestment * f.investment,
      monthlyOperatingCost: scenario.monthlyOperatingCost * f.opex,
      discountCaptureTarget: clamp(today + Math.max(0, target - today) * f.discountGap, 0, 1),
    };
    const realisation = inputs.capacityRealisation === undefined ? 1 : inputs.capacityRealisation;
    return calculateScenario({ ...inputs, capacityRealisation: clamp(realisation * f.realisation, 0, 1) }, s);
  };
  return [
    { label: "Pessimistic", result: stress(SENSITIVITY_FACTORS.pessimistic) },
    { label: "Base", result: calculateScenario(inputs, scenario) },
    { label: "Optimistic", result: stress(SENSITIVITY_FACTORS.optimistic) },
  ];
}

/** Human-readable formula sheet, rendered in the UI and the report. */
export const FORMULAS: { label: string; formula: string }[] = [
  { label: "Current monthly cost", formula: "volume × (minutes ÷ 60 + error rate × rework minutes ÷ 60) × hourly cost" },
  { label: "Future minutes / invoice", formula: "minutes × (1 − efficiency gain) × (1 − automation × (1 − residual effort))" },
  { label: "Future error rate", formula: "error rate × (1 − process error gain) × (1 − automation × automation error reduction)" },
  { label: "Realised labour savings", formula: "(current monthly cost − future monthly process cost) × capacity realisation" },
  { label: "Early-payment discount benefit", formula: "volume × avg. invoice value × eligible share × (discount rate − WACC × days paid earlier ÷ 365) × (target capture − capture today)" },
  { label: "Monthly net savings", formula: "realised labour savings + discount benefit − monthly operating cost" },
  { label: "Annualised net savings", formula: "monthly net savings × 12 (full benefit level)" },
  { label: "First-year net benefit", formula: "Σ first 12 months after go-live (with ramp-up) − initial investment" },
  { label: "ROI (12 months from go-live)", formula: "first-year net benefit ÷ initial investment" },
  { label: "Payback period", formula: "months after go-live until cumulative cash flow ≥ 0; + implementation months = from project start" },
  { label: "Net present value", formula: "−investment + Σ monthly cash flow ÷ (1 + WACC)^(month ÷ 12) over the horizon" },
];
