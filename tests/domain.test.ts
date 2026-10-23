import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoProject } from "./fixtures/sample-project";
import { ProjectSchema } from "../src/domain/types";
import { generateRecommendations } from "../src/domain/recommendations";
import { createsCycle, isOverdue, milestoneDone, progress, projectHealth, validateStatusChange, validateTask } from "../src/domain/roadmap";
import { kpiSummaries } from "../src/domain/kpi";

const TODAY = "2026-10-15";

test("seeded projects validate against the schema", () => {
  for (const id of ["nordwerk", "alpenlog"] as const) {
    const res = ProjectSchema.safeParse(createDemoProject(id, TODAY));
    assert.ok(res.success, res.success ? "" : JSON.stringify(res.error.issues.slice(0, 3)));
  }
});

test("schema rejects invalid input", () => {
  const p = createDemoProject("nordwerk", TODAY);
  const bad = { ...p, assumptions: { ...p.assumptions, hourlyCost: -5 } };
  assert.equal(ProjectSchema.safeParse(bad).success, false);
});

test("recommendations are deterministic and respect the budget cap", () => {
  const p = createDemoProject("nordwerk", TODAY);
  const req = { problem: "high-cost" as const, description: "Manual keying of PDF invoices", constraints: [], budgetCap: 40000 };
  const a = generateRecommendations(p, req);
  const b = generateRecommendations(p, req);
  assert.deepEqual(a, b);
  assert.ok(a.items.length > 0);
  assert.ok(a.items.every((r) => r.investment <= 40000));
  assert.ok(a.excluded.some((e) => e.title.includes("document capture")));
  for (const r of a.items) {
    assert.ok(r.problemStatement && r.rootCause && r.solution && r.impact);
    assert.ok(r.risks.length > 0 && r.successMetrics.length > 0);
    assert.ok(Number.isFinite(r.monthlySavings) && r.monthlySavings >= 0);
  }
});

test("problem choice changes the ranking", () => {
  const p = createDemoProject("nordwerk", TODAY);
  const slow = generateRecommendations(p, { problem: "slow-cycle", description: "", constraints: [], budgetCap: null });
  const comp = generateRecommendations(p, { problem: "compliance", description: "", constraints: [], budgetCap: null });
  assert.equal(slow.items[0].targetStepId, "approve");
  assert.equal(comp.items[0].id, "rec-einvoice");
});

test("roadmap seed has one overdue task and a completed discovery milestone", () => {
  const p = createDemoProject("nordwerk", TODAY);
  const overdue = p.tasks.filter((t) => isOverdue(t, TODAY));
  assert.equal(overdue.length, 1);
  assert.ok(milestoneDone(p.milestones[0], p.tasks));
  const h = projectHealth(p, TODAY);
  assert.equal(h.health, "at-risk");
  assert.ok(h.progress > 0 && h.progress < 1);
});

test("status changes respect dependencies", () => {
  const p = createDemoProject("nordwerk", TODAY);
  const t8 = p.tasks.find((t) => t.id === "t8")!;
  assert.ok(validateStatusChange(t8, "done", p.tasks)?.includes("Blocked by"));
  const t5 = p.tasks.find((t) => t.id === "t5")!;
  assert.equal(validateStatusChange(t5, "done", p.tasks), null);
});

test("cycle detection and task validation", () => {
  const p = createDemoProject("nordwerk", TODAY);
  assert.ok(createsCycle("t1", ["t8"], p.tasks)); // t8 → t4 → t3 → t1
  assert.equal(createsCycle("t20", ["t1"], p.tasks), false);
  const t1 = p.tasks[0];
  const errs = validateTask({ ...t1, title: "x", due: "2000-01-01", dependsOn: ["t8"] }, p.tasks);
  assert.ok(errs.title && errs.due && errs.dependsOn);
});

test("progress is effort weighted", () => {
  const base = createDemoProject("nordwerk", TODAY).tasks.slice(0, 2);
  const tasks = [{ ...base[0], status: "done" as const, effortDays: 3 }, { ...base[1], status: "todo" as const, effortDays: 1 }];
  assert.equal(progress(tasks), 0.75);
});

test("KPI summaries project toward scenario targets", () => {
  const p = createDemoProject("nordwerk", TODAY);
  const s = kpiSummaries(p);
  const cost = s.find((k) => k.def.key === "costPerInvoice")!;
  assert.ok(cost.target < cost.baseline);
  const last = cost.series[cost.series.length - 1];
  assert.ok(last.projected !== null && Math.abs(last.projected - cost.target) < 1e-6);
  assert.ok(cost.series.some((x) => x.actual !== null));
});

import { createEmptyProject, setupStatus } from "../src/domain/template";
import { calculateAll } from "../src/domain/finance";

test("empty project: valid, no company data, no figures, structure only", () => {
  const p = createEmptyProject(TODAY);
  assert.ok(ProjectSchema.safeParse(p).success);
  assert.equal(p.company.name, "");
  assert.equal(p.process.monthlyVolume, 0);
  assert.equal(p.assumptions.hourlyCost, 0);
  assert.equal(p.process.steps.length, 5);
  assert.ok(p.process.steps.every((s) => s.minutesPerInvoice === 0 && s.errorRate === 0 && s.waitDays === 0));
  assert.ok(p.scenarios.every((s) => s.initialInvestment === 0 && s.automationShare === 0));
  assert.equal(p.phases.length, 5);
  assert.deepEqual([p.tasks.length, p.risks.length, p.kpis.length, p.team.length, p.activity.length], [0, 0, 0, 0, 0]);
  const st = setupStatus(p);
  assert.equal(st.complete, 0);
  assert.equal(st.ready, false);
});

test("empty project calculates without NaN and KPIs fall back to derived baseline", () => {
  const p = createEmptyProject(TODAY);
  for (const r of calculateAll(p.process, p.assumptions, p.scenarios)) {
    for (const [k, v] of Object.entries(r)) if (typeof v === "number") assert.ok(Number.isFinite(v), k);
    assert.equal(r.paybackMonths, null);
  }
  const k = kpiSummaries(p, 9, TODAY);
  assert.ok(k.every((x) => x.latest === null && Number.isFinite(x.baseline)));
});

// --- Test data, KPI baseline and benchmarks -------------------------------------------
import { createTestDataProject } from "../src/domain/testdata";
import { BENCHMARKS, position } from "../src/domain/benchmarks";

test("test data is a valid, running project with a positive business case", () => {
  const today = "2026-10-19";
  const p = createTestDataProject({}, today);
  assert.ok(ProjectSchema.safeParse(p).success);
  const h = projectHealth(p, today);
  assert.ok(h.progress > 0 && h.progress < 1, "some tasks done, not all");
  assert.ok(Math.abs(h.plannedProgress - h.progress) <= 0.05, "progress matches the plan");
  const r = calculateAll(p.process, p.assumptions, p.scenarios).find((x) => x.scenarioId === p.selectedScenario)!;
  assert.ok(r.monthlyNetSavings > 0 && r.paybackMonths !== null);
});

test("realized savings only count from project start; baseline = pre-start months", () => {
  const today = "2026-10-19";
  const p = createTestDataProject({}, today);
  const savings = kpiSummaries(p, 9, today).find((k) => k.def.key === "monthlySavings")!;
  const actual = savings.series.filter((s) => s.actual !== null);
  const startMonth = p.startDate.slice(0, 7);
  for (const s of actual) if (s.month < startMonth) assert.equal(s.actual, 0, `no savings before start (${s.month})`);
});

test("benchmark position handles lower- and higher-is-better metrics", () => {
  const cycle = BENCHMARKS.find((b) => b.key === "cycleTimeDays")!;
  assert.equal(position(cycle, 5), "better");
  assert.equal(position(cycle, 12), "worse");
  const stp = BENCHMARKS.find((b) => b.key === "automationRate")!;
  assert.equal(position(stp, 0.6), "better");
  assert.equal(position(stp, 0.4), "within");
  assert.equal(position(stp, 0.1), "worse");
});
