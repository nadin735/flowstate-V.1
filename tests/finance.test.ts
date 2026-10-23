import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateScenario, processBaseline, safeDivide, safeNumber, stepMetrics, type FinanceInputs } from "../src/domain/finance";
import { createDemoProject, defaultScenarios } from "./fixtures/sample-project";
import type { Scenario } from "../src/domain/types";

const inputs: FinanceInputs = {
  monthlyVolume: 1000,
  minutesPerInvoice: 30,
  hourlyCost: 40,
  errorRate: 0,
  reworkMinutesPerError: 0,
  residualEffortOnAutomated: 0,
  automationErrorReduction: 0,
  cycleTimeDays: 5,
  roiHorizonMonths: 36,
};
const scen = (o: Partial<Scenario> = {}): Scenario => ({
  id: "automation", name: "t", summary: "", automationShare: 0.5, processEfficiencyGain: 0, processErrorGain: 0,
  waitTimeReduction: 0, initialInvestment: 60000, monthlyOperatingCost: 0, implementationMonths: 3, discountCaptureTarget: 0, ...o,
});
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("monthly labour cost = volume × hours per invoice × hourly cost", () => {
  const r = calculateScenario(inputs, scen());
  close(r.currentMonthlyCost, 1000 * 0.5 * 40); // 20,000
});

test("automation halves effort when residual effort is 0", () => {
  const r = calculateScenario(inputs, scen());
  close(r.futureMinutesPerInvoice, 15);
  close(r.futureMonthlyProcessCost, 10000);
  close(r.processingTimeReduction!, 0.5);
});

test("net savings subtract operating cost; payback = investment / net savings", () => {
  const r = calculateScenario(inputs, scen({ monthlyOperatingCost: 2000 }));
  close(r.monthlyNetSavings, 20000 - 10000 - 2000);
  close(r.annualNetSavings, 96000);
  close(r.firstYearNetBenefit, 36000);
  close(r.roiFirstYear!, 0.6);
  close(r.paybackMonths!, 7.5);
  close(r.roiHorizon!, (8000 * 36 - 60000) / 60000);
});

test("rework is included in current cost", () => {
  const r = calculateScenario({ ...inputs, errorRate: 0.1, reworkMinutesPerError: 60 }, scen({ automationShare: 0 }));
  close(r.currentMonthlyCost, 1000 * (0.5 + 0.1) * 40);
});

test("error reduction combines process and automation effects", () => {
  const r = calculateScenario({ ...inputs, errorRate: 0.1, automationErrorReduction: 0.5 }, scen({ processErrorGain: 0.2 }));
  close(r.futureErrorRate, 0.1 * 0.8 * (1 - 0.5 * 0.5));
  close(r.errorReduction!, 1 - 0.8 * 0.75);
});

test("zero investment: ROI is null (n/a), payback is 0 when savings positive", () => {
  const r = calculateScenario(inputs, scen({ initialInvestment: 0 }));
  assert.equal(r.roiFirstYear, null);
  assert.equal(r.roiHorizon, null);
  assert.equal(r.paybackMonths, 0);
  assert.ok(r.warnings.some((w) => w.includes("ROI is not defined")));
});

test("negative savings: payback is null and a warning is raised", () => {
  const r = calculateScenario(inputs, scen({ monthlyOperatingCost: 50000 }));
  assert.ok(r.monthlyNetSavings < 0);
  assert.equal(r.paybackMonths, null);
  assert.ok(r.roiFirstYear! < -1);
  assert.ok(r.warnings.some((w) => w.includes("loses money")));
});

test("zero volume / zero minutes do not produce NaN or Infinity", () => {
  const r = calculateScenario({ ...inputs, monthlyVolume: 0, minutesPerInvoice: 0 }, scen());
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === "number") assert.ok(Number.isFinite(v), `${k} is finite`);
  }
  assert.equal(r.currentCostPerInvoice, null);
  assert.equal(r.processingTimeReduction, null);
  assert.equal(r.errorReduction, null);
});

test("missing / invalid inputs are sanitised", () => {
  const bad = { ...inputs, monthlyVolume: Number.NaN, hourlyCost: undefined as unknown as number, errorRate: 5 };
  const r = calculateScenario(bad, scen({ automationShare: 7, initialInvestment: -100 }));
  assert.equal(r.currentMonthlyCost, 0);
  assert.equal(r.currentErrorRate, 1);
  assert.equal(r.roiFirstYear, null); // negative investment clamped to 0
  assert.equal(safeNumber("12.5"), 12.5);
  assert.equal(safeNumber("abc", 3), 3);
  assert.equal(safeDivide(1, 0), null);
});

test("cumulative cash flow crosses zero at the payback month", () => {
  const r = calculateScenario(inputs, scen({ monthlyOperatingCost: 2000 }));
  assert.equal(r.cumulativeCashFlow[0], -60000);
  assert.ok(r.cumulativeCashFlow[7] < 0 && r.cumulativeCashFlow[8] > 0);
  assert.equal(r.cumulativeCashFlow.length, 37);
});

test("process baseline: error rate is 1 − Π(1 − eᵢ)", () => {
  const p = createDemoProject("nordwerk", "2026-10-15");
  const b = processBaseline(p.process);
  const expected = 1 - p.process.steps.reduce((x, s) => x * (1 - s.errorRate), 1);
  close(b.errorRate, expected);
  close(b.minutesPerInvoice, 14);
  assert.ok(b.automationRate > 0 && b.automationRate < 1);
});

test("bottleneck detection flags the highest-scoring step", () => {
  const p = createDemoProject("nordwerk", "2026-10-15");
  const m = stepMetrics(p.process, p.assumptions.hourlyCost);
  const top = [...m].sort((a, b) => b.bottleneckScore - a.bottleneckScore)[0];
  assert.ok(top.isBottleneck);
  close(m.reduce((s, x) => s + x.costShare, 0), 1);
});

test("seeded scenarios produce a sensible, differentiated business case", () => {
  const p = createDemoProject("nordwerk", "2026-10-15");
  const base = processBaseline(p.process);
  const inp: FinanceInputs = { monthlyVolume: 4200, minutesPerInvoice: base.minutesPerInvoice, hourlyCost: 42, errorRate: base.errorRate, reworkMinutesPerError: base.reworkMinutesPerError, residualEffortOnAutomated: 0.1, automationErrorReduction: 0.7, cycleTimeDays: base.cycleTimeDays, roiHorizonMonths: 36 };
  const [opt, auto, e2e] = defaultScenarios().map((s) => calculateScenario(inp, s));
  assert.ok(opt.monthlyNetSavings > 0 && auto.monthlyNetSavings > opt.monthlyNetSavings);
  assert.ok(opt.paybackMonths! < auto.paybackMonths! && auto.paybackMonths! < e2e.paybackMonths!);
  assert.ok(e2e.futureMinutesPerInvoice < auto.futureMinutesPerInvoice);
});

import { sensitivity } from "../src/domain/finance";
import { benchmarkScenarios, createEmptyProject, scenariosAreEmpty, starterRoadmap } from "../src/domain/template";
import { calculateAll } from "../src/domain/finance";

test("early-payment discount benefit = volume × value × eligible × rate × capture gap", () => {
  const r = calculateScenario(
    { ...inputs, avgInvoiceValue: 2000, discountEligibleShare: 0.3, discountRate: 0.02, discountCapturedToday: 0.4 },
    scen({ automationShare: 0, discountCaptureTarget: 0.8 }),
  );
  close(r.discountBenefit, 1000 * 2000 * 0.3 * 0.02 * 0.4); // 4,800 €/month
  close(r.monthlyNetSavings, 4800);
});

test("discount benefit is netted of the financing cost of paying earlier", () => {
  const r = calculateScenario(
    { ...inputs, avgInvoiceValue: 2000, discountEligibleShare: 0.3, discountRate: 0.02, discountCapturedToday: 0.4, wacc: 0.0730, discountDaysEarlier: 20 },
    scen({ automationShare: 0, discountCaptureTarget: 0.8 }),
  );
  close(r.netDiscountRate, 0.02 - (0.073 * 20) / 365); // 1.6 %
  close(r.discountBenefit, 1000 * 2000 * 0.3 * (0.02 - (0.073 * 20) / 365) * 0.4);
  // Financing cost above the discount → no benefit, never negative.
  const r2 = calculateScenario({ ...inputs, avgInvoiceValue: 2000, discountEligibleShare: 0.3, discountRate: 0.005, discountCapturedToday: 0.4, wacc: 0.2, discountDaysEarlier: 60 }, scen({ discountCaptureTarget: 0.8 }));
  assert.equal(r2.discountBenefit, 0);
});

test("no discount benefit when target capture is below today's capture", () => {
  const r = calculateScenario({ ...inputs, avgInvoiceValue: 2000, discountEligibleShare: 0.3, discountRate: 0.02, discountCapturedToday: 0.9 }, scen({ discountCaptureTarget: 0.5 }));
  assert.equal(r.discountBenefit, 0);
});

test("capacity realisation scales labour savings, gross stays visible", () => {
  const r = calculateScenario({ ...inputs, capacityRealisation: 0.5 }, scen());
  close(r.labourSavingsGross, 10000);
  close(r.labourSavingsRealised, 5000);
  close(r.monthlyNetSavings, 5000);
  close(r.freedFte, (1000 * 0.25) / 140);
});

test("ramp-up delays payback and lowers first-year benefit", () => {
  const flat = calculateScenario(inputs, scen({ monthlyOperatingCost: 2000 }));
  const ramped = calculateScenario({ ...inputs, rampUpMonths: 4 }, scen({ monthlyOperatingCost: 2000 }));
  assert.ok(ramped.paybackMonths! > flat.paybackMonths!);
  assert.ok(ramped.firstYearNetBenefit < flat.firstYearNetBenefit);
  // cumulative cash flow at the payback month is ~0
  const m = Math.ceil(ramped.paybackMonths!);
  assert.ok(ramped.cumulativeCashFlow[m - 1] < 0 && ramped.cumulativeCashFlow[m] >= 0);
});

test("payback from project start adds implementation months", () => {
  const r = calculateScenario(inputs, scen({ monthlyOperatingCost: 2000, implementationMonths: 6 }));
  close(r.paybackFromStartMonths!, 7.5 + 6);
});

test("NPV: zero WACC equals undiscounted horizon sum; higher WACC lowers NPV", () => {
  const r0 = calculateScenario({ ...inputs, wacc: 0 }, scen({ monthlyOperatingCost: 2000 }));
  close(r0.npv, 8000 * 36 - 60000);
  const r8 = calculateScenario({ ...inputs, wacc: 0.08 }, scen({ monthlyOperatingCost: 2000 }));
  assert.ok(r8.npv < r0.npv && r8.npv > 0);
});

test("sensitivity cases are ordered pessimistic < base < optimistic", () => {
  const [pess, base, opt] = sensitivity({ ...inputs, capacityRealisation: 0.8, avgInvoiceValue: 1500, discountEligibleShare: 0.3, discountRate: 0.02, discountCapturedToday: 0.4 }, scen({ monthlyOperatingCost: 2000, discountCaptureTarget: 0.8 }));
  assert.equal(pess.label, "Pessimistic");
  assert.ok(pess.result.annualNetSavings < base.result.annualNetSavings && base.result.annualNetSavings < opt.result.annualNetSavings);
  assert.ok(pess.result.npv < base.result.npv && base.result.npv < opt.result.npv);
  assert.ok(pess.result.paybackMonths! > base.result.paybackMonths!);
});

test("benchmarks give a positive business case right after data entry", () => {
  const p = createEmptyProject("2026-10-16");
  assert.ok(scenariosAreEmpty(p.scenarios));
  p.process.monthlyVolume = p.assumptions.monthlyVolume = 3000;
  p.assumptions.hourlyCost = 42;
  p.process.steps.forEach((s, i) => { s.minutesPerInvoice = [2, 5, 4, 3, 1.5][i]; s.errorRate = 0.02; s.reworkMinutes = 20; s.waitDays = 1.5; });
  p.scenarios = benchmarkScenarios(3000);
  assert.equal(scenariosAreEmpty(p.scenarios), false);
  const results = calculateAll(p.process, p.assumptions, p.scenarios);
  for (const r of results) {
    assert.ok(r.monthlyNetSavings > 0, `${r.scenarioId} has positive savings`);
    assert.ok(r.paybackMonths !== null && r.paybackMonths < 60, `${r.scenarioId} pays back`);
  }
});

test("starter roadmap: 20 tasks inside their phases, valid dependencies, budget = investment", () => {
  const p = createEmptyProject("2026-10-16");
  p.scenarios = benchmarkScenarios(4000);
  const { tasks, risks } = starterRoadmap(p);
  assert.equal(tasks.length, 20);
  assert.equal(risks.length, 5);
  const ids = new Set(tasks.map((t) => t.id));
  for (const t of tasks) {
    const ph = p.phases.find((x) => x.id === t.phaseId)!;
    assert.ok(t.start >= ph.start && t.due <= ph.end && t.due >= t.start, t.title);
    assert.ok(t.dependsOn.every((d) => ids.has(d)));
  }
  const inv = p.scenarios.find((s) => s.id === p.selectedScenario)!.initialInvestment;
  assert.ok(Math.abs(tasks.reduce((s, t) => s + t.budget, 0) - inv) <= 2000);
});
