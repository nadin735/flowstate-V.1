import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoProject } from "./fixtures/sample-project";
import { createEmptyProject } from "../src/domain/template";
import { calculateAll } from "../src/domain/finance";
import { coach, detectGoal, GOALS } from "../src/domain/coach";

const TODAY = "2026-10-15";

test("detectGoal understands plain language in German and English", () => {
  assert.equal(detectGoal("Wir wollen Kosten sparen"), "cost");
  assert.equal(detectGoal("We want fewer errors and less rework"), "quality");
  assert.equal(detectGoal("be faster, shorter cycle time"), "speed");
  assert.equal(detectGoal("keep the go-live date"), "golive");
  assert.equal(detectGoal("payback of the investment"), "payback");
  assert.equal(detectGoal("hello"), null);
  assert.equal(detectGoal("   "), null);
});

test("every goal gives a headline, recommendations and steps from project numbers", () => {
  for (const id of ["nordwerk", "alpenlog"] as const) {
    const p = createDemoProject(id, TODAY);
    const results = calculateAll(p.process, p.assumptions, p.scenarios);
    const sel = results.find((x) => x.scenarioId === p.selectedScenario)!;
    for (const g of GOALS) {
      const c = coach(g.id, p, results, sel, TODAY);
      assert.ok(c.headline.length > 0, `${id}/${g.id} headline`);
      assert.ok(c.recs.length > 0, `${id}/${g.id} recs`);
      assert.ok(c.steps.length > 0, `${id}/${g.id} steps`);
      assert.ok(!/NaN|undefined/.test(JSON.stringify(c)), `${id}/${g.id} has no NaN or undefined`);
    }
  }
});

test("cost goal names the step with the highest labour cost", () => {
  const p = createDemoProject("nordwerk", TODAY);
  const results = calculateAll(p.process, p.assumptions, p.scenarios);
  const sel = results.find((x) => x.scenarioId === p.selectedScenario)!;
  const c = coach("cost", p, results, sel, TODAY);
  assert.ok(c.recs.some((r) => r.cta.kind === "idea"));
});

test("an empty project asks for setup instead of inventing advice", () => {
  const p = createEmptyProject(TODAY);
  const results = calculateAll(p.process, p.assumptions, p.scenarios);
  const c = coach("cost", p, results, results[0], TODAY);
  assert.match(c.headline, /need your process data/i);
  assert.equal(c.recs[0].cta.kind, "route");
});
