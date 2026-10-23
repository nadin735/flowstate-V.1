/**
 * One-click test data: a complete, FICTIONAL project (the same company as the demo
 * scan) so every page can be tried without entering anything. Values are
 * illustrative; the project is labelled as test data in its description.
 */
import { addDays, addMonths, monthKey, todayISO } from "./dates";
import { calculateAll, processBaseline } from "./finance";
import { generateRecommendations } from "./recommendations";
import { benchmarkScenarios, createEmptyProject, starterRoadmap } from "./template";
import type { KpiMeasurement, Preferences, Project } from "./types";

const STEPS: Record<string, { minutesPerInvoice: number; automatedShare: number; errorRate: number; reworkMinutes: number; waitDays: number; owner: string; systems: string[] }> = {
  receive: { minutesPerInvoice: 2.5, automatedShare: 0.1, errorRate: 0.015, reworkMinutes: 12, waitDays: 1.0, owner: "Mailroom", systems: ["Outlook", "Scanner"] },
  extract: { minutesPerInvoice: 5.0, automatedShare: 0.05, errorRate: 0.05, reworkMinutes: 20, waitDays: 1.8, owner: "Accounts payable", systems: ["SAP MIRO"] },
  validate: { minutesPerInvoice: 4.0, automatedShare: 0.15, errorRate: 0.035, reworkMinutes: 30, waitDays: 2.2, owner: "Accounts payable", systems: ["SAP MM", "E-mail"] },
  approve: { minutesPerInvoice: 3.0, automatedShare: 0, errorRate: 0.01, reworkMinutes: 15, waitDays: 4.5, owner: "Cost-centre owners", systems: ["E-mail", "Excel tracker"] },
  pay: { minutesPerInvoice: 1.5, automatedShare: 0.55, errorRate: 0.005, reworkMinutes: 25, waitDays: 2.0, owner: "Treasury", systems: ["SAP F110"] },
};

export function createTestDataProject(prefs?: Partial<Preferences>, today: string = todayISO()): Project {
  // The project started six weeks ago, so the roadmap shows real progress instead of an untouched plan.
  const p = createEmptyProject(addDays(today, -42));
  p.name = "Invoice processing automation";
  p.description = "TEST DATA, fictional company and illustrative figures for trying FLOWSTATE. Replace with your own data via PDF upload or manual entry.";
  p.sponsor = "Dr. Jens Hoffmann";
  p.lead = "Katrin Albers";
  p.company = {
    ...p.company,
    name: "Hanse Präzisionsteile GmbH",
    industry: "Mechanical engineering",
    country: "Germany",
    employees: 640,
    erp: "SAP S/4HANA",
    description: "Fictional mid-sized manufacturer used as test data. Supplier invoices arrive mostly as PDF by e-mail and on paper; approvals run by e-mail.",
  };
  p.process.monthlyVolume = 3600;
  p.process.steps = p.process.steps.map((s) => ({ ...s, ...STEPS[s.id] }));
  p.assumptions = {
    ...p.assumptions,
    monthlyVolume: 3600,
    hourlyCost: 44,
    avgInvoiceValue: 2150,
    discountEligibleShare: 0.35,
    discountRate: 0.02,
    discountCapturedToday: 0.3,
  };
  p.scenarios = benchmarkScenarios(3600);
  p.selectedScenario = "automation";

  const { tasks, risks } = starterRoadmap(p);
  // Status follows the calendar: finished tasks are done, running ones in progress.
  p.tasks = tasks.map((t) => ({ ...t, status: t.due < today ? "done" : t.start <= today ? "in_progress" : "todo" } as const));
  p.risks = risks;

  // Six months of measurements around the calculated baseline (deterministic small variation).
  const base = processBaseline(p.process);
  const current = calculateAll(p.process, p.assumptions, p.scenarios)[0];
  // Pre-project months vary by ±3 %; the last month includes the first quick wins (-3 %).
  const wobble = [1.02, 0.98, 1.01, 1.03, 0.99, 0.97];
  const kpis: KpiMeasurement[] = wobble.map((w, i) => {
    const month = addMonths(monthKey(today), i - 6);
    const volume = Math.round(3600 * (0.96 + 0.015 * i));
    return {
      month,
      volume,
      costPerInvoice: Math.round((current.currentCostPerInvoice ?? 0) * w * 100) / 100,
      cycleTimeDays: Math.round(base.cycleTimeDays * w * 10) / 10,
      manualHours: Math.round((volume * (base.minutesPerInvoice + base.errorRate * base.reworkMinutesPerError)) / 60 * w),
      errorRate: Math.round(base.errorRate * w * 10000) / 10000,
      automationRate: Math.round(base.automationRate * 10000) / 10000,
    };
  });
  p.kpis = kpis;

  const rec = generateRecommendations(p, {
    problem: "high-cost",
    description: "Supplier invoices arrive mostly as PDF by e-mail and on paper. Clerks key data manually into SAP, match against purchase orders and chase approvers by e-mail. Early-payment discounts (Skonto) are regularly missed.",
    constraints: ["eu-data"],
    budgetCap: null,
  });
  p.recommendationRuns = [{
    id: `run-test-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    source: "demo-rules",
    model: null,
    problem: "High processing cost per invoice",
    description: "Test data brief",
    constraints: ["Data must stay in the EU (GDPR)"],
    budgetCap: null,
    items: rec.items,
  }];

  p.activity = [{ id: `a-test-${Date.now().toString(36)}`, at: new Date().toISOString(), text: "Test data loaded (fictional company)", kind: "system" }];
  p.preferences = { ...p.preferences, ...prefs, onboarded: true };
  p.updatedAt = new Date().toISOString();
  return p;
}
