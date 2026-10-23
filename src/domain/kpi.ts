/**
 * KPI analytics: baseline vs. latest measurement vs. scenario target, and a projected
 * trajectory after go-live. "Actual" values are measurements the user recorded;
 * "projected" values are SIMULATED from the selected scenario. Without recorded
 * measurements the baseline is derived from the process inputs.
 */
import { addMonths, monthKey, todayISO } from "./dates";
import { calculateAll, processBaseline, resolveInputs } from "./finance";
import type { KpiKey, KpiMeasurement, Project } from "./types";

export interface KpiDef {
  key: KpiKey;
  label: string;
  unit: "eur" | "days" | "hours" | "pct";
  lowerIsBetter: boolean;
  description: string;
}

export const KPI_DEFS: KpiDef[] = [
  { key: "costPerInvoice", label: "Processing cost / invoice", unit: "eur", lowerIsBetter: true, description: "Labour cost of handling and rework divided by monthly volume (plus operating cost for projections)." },
  { key: "cycleTimeDays", label: "Average cycle time", unit: "days", lowerIsBetter: true, description: "Business days from receipt to payment release, incl. waiting time." },
  { key: "manualHours", label: "Manual effort", unit: "hours", lowerIsBetter: true, description: "Hours of manual handling and rework per month." },
  { key: "errorRate", label: "Error rate", unit: "pct", lowerIsBetter: true, description: "Share of invoices with at least one error requiring rework." },
  { key: "automationRate", label: "Automation rate", unit: "pct", lowerIsBetter: false, description: "Effort-weighted share of work performed without manual handling." },
  { key: "monthlySavings", label: "Monthly savings", unit: "eur", lowerIsBetter: false, description: "Baseline monthly cost minus the month's cost. Realized = measured months since project start; projected = simulation." },
];

export interface KpiPoint {
  month: string;
  actual: number | null;
  projected: number | null;
}

export interface KpiSummary {
  def: KpiDef;
  baseline: number;
  latest: number | null;
  target: number;
  /** Progress from baseline to target achieved by the latest measurement (0..1+). */
  progressToTarget: number | null;
  series: KpiPoint[];
}

function valueOf(m: KpiMeasurement, key: KpiKey, baselineMonthlyCost: number, startMonth = ""): number {
  // Savings only count once the project has started, earlier differences are normal month-to-month noise.
  if (key === "monthlySavings") return m.month < startMonth ? 0 : Math.max(0, baselineMonthlyCost - m.costPerInvoice * m.volume);
  return m[key];
}

export function kpiSummaries(p: Project, horizonAfterGoLive = 9, today: string = todayISO()): KpiSummary[] {
  const results = calculateAll(p.process, p.assumptions, p.scenarios);
  const sel = results.find((r) => r.scenarioId === p.selectedScenario)!;
  const scen = p.scenarios.find((s) => s.id === p.selectedScenario)!;
  const base = processBaseline(p.process);
  const inputs = resolveInputs(p.process, p.assumptions);
  const kpis = [...p.kpis].sort((a, b) => a.month.localeCompare(b.month));
  // Baseline = the months measured before the project started; without such months the first few measurements.
  const startMonth = monthKey(p.startDate);
  const preStart = kpis.filter((k) => k.month < startMonth);
  const baselineWindow = preStart.length ? preStart.slice(-6) : kpis.slice(0, Math.max(1, Math.min(6, kpis.length - 3)));
  const avg = (f: (m: KpiMeasurement) => number) => (baselineWindow.length ? baselineWindow.reduce((s, m) => s + f(m), 0) / baselineWindow.length : 0);
  const baselineCpi = avg((m) => m.costPerInvoice);
  const measured = kpis.length > 0;
  const baselineMonthlyCost = measured ? baselineCpi * inputs.monthlyVolume : sel.currentMonthlyCost;
  /** Baseline derived from the process inputs when nothing has been measured yet. */
  const derived: Record<KpiKey, number> = {
    costPerInvoice: sel.currentCostPerInvoice ?? 0,
    cycleTimeDays: sel.currentCycleTimeDays,
    manualHours: (inputs.monthlyVolume * (sel.currentMinutesPerInvoice + sel.currentErrorRate * inputs.reworkMinutesPerError)) / 60,
    errorRate: sel.currentErrorRate,
    automationRate: base.automationRate,
    monthlySavings: 0,
  };

  const futureAutomation = base.automationRate + (1 - base.automationRate) * scen.automationShare;
  const targets: Record<KpiKey, number> = {
    costPerInvoice: sel.futureCostPerInvoice ?? 0,
    cycleTimeDays: sel.futureCycleTimeDays,
    manualHours: (inputs.monthlyVolume * sel.futureMinutesPerInvoice) / 60 + (inputs.monthlyVolume * sel.futureErrorRate * inputs.reworkMinutesPerError) / 60,
    errorRate: sel.futureErrorRate,
    automationRate: futureAutomation,
    monthlySavings: Math.max(0, sel.monthlyNetSavings),
  };

  const goLiveMonth = monthKey(p.targetGoLive);
  const lastActual = kpis.length ? kpis[kpis.length - 1].month : addMonths(monthKey(today), -1);
  const months: string[] = kpis.map((k) => k.month);
  let cursor = addMonths(lastActual, 1);
  const end = addMonths(goLiveMonth, horizonAfterGoLive);
  while (cursor <= end && months.length < 60) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }

  return KPI_DEFS.map((def) => {
    const baseline = def.key === "monthlySavings" ? 0 : measured ? avg((m) => valueOf(m, def.key, baselineMonthlyCost, startMonth)) : derived[def.key];
    const latestM = kpis[kpis.length - 1];
    const latest = latestM ? valueOf(latestM, def.key, baselineMonthlyCost, startMonth) : null;
    const target = targets[def.key];
    const start = latest ?? baseline;
    const series: KpiPoint[] = months.map((month) => {
      const m = kpis.find((k) => k.month === month);
      if (m) return { month, actual: valueOf(m, def.key, baselineMonthlyCost, startMonth), projected: month === lastActual ? valueOf(m, def.key, baselineMonthlyCost, startMonth) : null };
      // Projection: flat until go-live, then linear ramp to target over 4 months.
      let projected = start;
      if (month > goLiveMonth || month === goLiveMonth) {
        const [gy, gm] = goLiveMonth.split("-").map(Number);
        const [y, mm] = month.split("-").map(Number);
        const k = Math.min(1, ((y - gy) * 12 + (mm - gm) + 1) / 4);
        projected = start + (target - start) * k;
      }
      return { month, actual: null, projected };
    });
    const denom = target - baseline;
    const progressToTarget = latest !== null && denom !== 0 ? (latest - baseline) / denom : null;
    return { def, baseline, latest, target, progressToTarget, series };
  });
}
