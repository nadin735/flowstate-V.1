import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoProject } from "./fixtures/sample-project";
import { createEmptyProject } from "../src/domain/template";
import { calculateAll, stepMetrics } from "../src/domain/finance";
import { answer, QUESTIONS } from "../src/domain/assistant";
import { ProjectSchema } from "../src/domain/types";

const TODAY = "2026-10-15";

test("assistant names the highest scoring step as bottleneck", () => {
  const p = createDemoProject("nordwerk", TODAY);
  const r = calculateAll(p.process, p.assumptions, p.scenarios).find((x) => x.scenarioId === p.selectedScenario)!;
  const top = [...stepMetrics(p.process, p.assumptions.hourlyCost)].sort((a, b) => b.bottleneckScore - a.bottleneckScore)[0];
  const name = p.process.steps.find((s) => s.id === top.stepId)!.name;
  assert.ok(answer("bottleneck", p, r, TODAY).headline.includes(name));
});

test("assistant quotes the calculated net savings and never throws", () => {
  const p = createDemoProject("alpenlog", TODAY);
  const r = calculateAll(p.process, p.assumptions, p.scenarios).find((x) => x.scenarioId === p.selectedScenario)!;
  for (const q of QUESTIONS) {
    const a = answer(q.id, p, r, TODAY);
    assert.ok(a.headline.length > 0 && a.points.length > 0);
  }
  const fmt = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(r.monthlyNetSavings);
  assert.ok(answer("case", p, r, TODAY).points.some((x) => x.includes(fmt)));
});

test("assistant asks for data instead of inventing numbers on an empty project", () => {
  const p = createEmptyProject(TODAY);
  const r = calculateAll(p.process, p.assumptions, p.scenarios)[0];
  const a = answer("bottleneck", p, r, TODAY);
  assert.match(a.headline, /need your process data/);
  assert.equal(answer("status", p, r, TODAY).headline, "There is no delivery plan yet.");
});

test("projects without ideas still load and ideas validate", () => {
  const p = createDemoProject("nordwerk", TODAY);
  const { ideas: _omit, ...legacy } = p;
  const res = ProjectSchema.safeParse(legacy);
  assert.ok(res.success && res.data.ideas.length === 0);
  assert.equal(ProjectSchema.safeParse({ ...p, ideas: [{ id: "i1", title: "x", note: "", stepId: null, stage: "inbox", createdAt: "" }] }).success, false);
});
