/**
 * Goal coach. Pure functions: turns a goal (chosen or typed) into recommendations and next
 * steps that are computed from the project's own numbers. No model is involved; the goal
 * text is matched by keywords. Nothing is invented: when data is missing the coach says so.
 */
import type { Project } from "./types";
import { stepMetrics, type ScenarioResult } from "./finance";
import { projectHealth } from "./roadmap";
import { setupStatus } from "./template";

export type GoalId = "cost" | "speed" | "quality" | "golive" | "payback";

export const GOALS: { id: GoalId; label: string; hint: string; words: RegExp }[] = [
  { id: "cost", label: "Reduce cost", hint: "Cut the monthly labour cost of the process", words: /cost|kosten|sparen|save|saving|cheap|budget|labou?r/i },
  { id: "speed", label: "Be faster", hint: "Shorten the time from receipt to completion", words: /fast|speed|quick|schnell|cycle|time|durchlauf|wait|warte|sooner/i },
  { id: "quality", label: "Fewer errors", hint: "Reduce mistakes and rework", words: /error|fehler|quality|qualit|rework|mistake|accura/i },
  { id: "golive", label: "Hit the go-live", hint: "Keep the delivery plan on schedule", words: /go.?live|deadline|schedule|termin|launch|deliver|on track|roadmap|plan/i },
  { id: "payback", label: "Pay back sooner", hint: "Recover the investment as early as possible", words: /payback|roi|invest|return|amortis|rechn|discount|skonto|cash/i },
];

/** Picks the goal that best matches free text, or null when nothing matches. */
export function detectGoal(text: string): GoalId | null {
  const t = text.trim();
  if (!t) return null;
  let best: { id: GoalId; hits: number } | null = null;
  for (const g of GOALS) {
    const hits = (t.match(new RegExp(g.words.source, "gi")) ?? []).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { id: g.id, hits };
  }
  return best?.id ?? null;
}

export type Cta =
  | { kind: "scenario"; id: "conservative" | "balanced" | "ambitious" | string }
  | { kind: "idea"; title: string; note: string; stepId: string | null }
  | { kind: "route"; route: "process" | "simulator" | "roadmap" | "consultant" | "analytics" | "workspace"; label: string };

export interface CoachRec { id: string; title: string; why: string; impact?: string; cta: Cta }
export interface Coaching {
  goal: GoalId;
  headline: string;
  facts: { label: string; value: string }[];
  recs: CoachRec[];
  steps: string[];
}

const eur = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${Math.round(n * 100)} %`;
const mo = (n: number) => `${Math.round(n * 10) / 10} months`;

export function coach(goal: GoalId, p: Project, results: ScenarioResult[], selected: ScenarioResult, today: string): Coaching {
  const g = GOALS.find((x) => x.id === goal)!;
  const setup = setupStatus(p);
  if (!setup.ready) {
    return {
      goal,
      headline: "I need your process data before I can coach you.",
      facts: [],
      recs: [{ id: "setup", title: "Finish the setup", why: setup.items.filter((i) => !i.done).map((i) => i.label).join(", ") || "Process data is missing.", cta: { kind: "route", route: "process", label: "Open Process" } }],
      steps: ["Enter invoice volume, labour cost and the handling time of each step.", "Come back here and pick your goal again."],
    };
  }
  const metrics = stepMetrics(p.process, p.assumptions.hourlyCost);
  const steps = metrics.map((m) => ({ m, s: p.process.steps.find((s) => s.id === m.stepId)! })).filter((x) => x.s);
  const scName = (id: string) => p.scenarios.find((s) => s.id === id)?.name ?? id;
  const health = projectHealth(p, today);
  const recs: CoachRec[] = [];
  const next: string[] = [];
  let headline = "";
  let facts: Coaching["facts"] = [];

  const scenarioRec = (by: (r: ScenarioResult) => number, why: (r: ScenarioResult) => string, impact: (r: ScenarioResult) => string, lowerIsBetter = false) => {
    const ranked = [...results].sort((a, b) => (lowerIsBetter ? by(a) - by(b) : by(b) - by(a)));
    const top = ranked[0];
    if (!top) return;
    const already = top.scenarioId === selected.scenarioId;
    recs.push({
      id: `sc-${top.scenarioId}`,
      title: already ? `Stay with “${scName(top.scenarioId)}”` : `Switch to “${scName(top.scenarioId)}”`,
      why: why(top),
      impact: impact(top),
      cta: { kind: "scenario", id: top.scenarioId },
    });
  };

  switch (goal) {
    case "cost": {
      const top = [...steps].sort((a, b) => b.m.monthlyCost - a.m.monthlyCost).slice(0, 2);
      headline = top[0] ? `${pct(top[0].m.costShare)} of your labour cost sits in “${top[0].s.name}”.` : "No cost data yet.";
      facts = [
        { label: "Monthly process cost", value: eur(selected.currentMonthlyCost) },
        { label: "Net savings per month", value: eur(selected.monthlyNetSavings) },
        { label: "Freed capacity", value: `${Math.round(selected.freedFte * 10) / 10} FTE` },
      ];
      for (const x of top) {
        if (x.m.monthlyCost <= 0) continue;
        recs.push({
          id: `cost-${x.s.id}`,
          title: `Automate or simplify “${x.s.name}”`,
          why: `${eur(x.m.monthlyCost)} per month, ${pct(x.s.automatedShare)} automated today, ${pct(x.s.errorRate)} error rate.`,
          impact: `Up to ${eur(x.m.monthlyCost)} per month of labour in scope`,
          cta: { kind: "idea", title: `Reduce cost in “${x.s.name}”`.slice(0, 120), note: `Largest cost block: ${eur(x.m.monthlyCost)} per month (${pct(x.m.costShare)} of the process).`, stepId: x.s.id },
        });
      }
      scenarioRec((r) => r.monthlyNetSavings, (r) => `Highest net savings of the three scenarios: ${eur(r.monthlyNetSavings)} per month.`, (r) => `${eur(r.annualNetSavings)} per year, estimate`);
      next.push(top[0] ? `Walk through “${top[0].s.name}” with the people who do it and write down the manual steps.` : "Enter step times to see where the cost sits.");
      next.push("Compare the interventions for that step in the Consultant.");
      next.push("Adopt the best one to your roadmap and set an owner.");
      break;
    }
    case "speed": {
      const top = [...steps].sort((a, b) => b.m.waitShare - a.m.waitShare).slice(0, 2);
      const days = steps.reduce((s, x) => s + (x.s.waitDays ?? 0), 0);
      headline = top[0] ? `${pct(top[0].m.waitShare)} of the waiting time is “${top[0].s.name}”.` : "No waiting time recorded yet.";
      facts = [
        { label: "Cycle time today", value: `${Math.round(selected.currentCycleTimeDays * 10) / 10} days` },
        { label: "Cycle time after", value: `${Math.round(selected.futureCycleTimeDays * 10) / 10} days` },
        { label: "Waiting time in steps", value: `${Math.round(days * 10) / 10} days` },
      ];
      for (const x of top) {
        if (!(x.s.waitDays > 0)) continue;
        recs.push({
          id: `speed-${x.s.id}`,
          title: `Remove the wait before or in “${x.s.name}”`,
          why: `${Math.round(x.s.waitDays * 10) / 10} days of waiting, ${pct(x.m.waitShare)} of the total.`,
          impact: "Shorter cycle time, earlier payment decisions",
          cta: { kind: "idea", title: `Cut waiting time in “${x.s.name}”`.slice(0, 120), note: `${Math.round(x.s.waitDays * 10) / 10} days of waiting (${pct(x.m.waitShare)} of all waiting).`, stepId: x.s.id },
        });
      }
      scenarioRec((r) => r.futureCycleTimeDays, (r) => `Shortest cycle time: ${Math.round(r.futureCycleTimeDays * 10) / 10} days instead of ${Math.round(r.currentCycleTimeDays * 10) / 10}.`, (r) => `${Math.round((r.currentCycleTimeDays - r.futureCycleTimeDays) * 10) / 10} days saved per invoice`, true);
      next.push("Mark where invoices wait for a person (approval, missing data).");
      next.push("Set rules for the usual approvals so they do not wait for one person.");
      next.push("Measure the cycle time again after four weeks (Analytics).");
      break;
    }
    case "quality": {
      const top = [...steps].sort((a, b) => b.m.reworkHours - a.m.reworkHours).slice(0, 2);
      headline = top[0] && top[0].m.reworkHours > 0 ? `“${top[0].s.name}” causes the most rework: ${Math.round(top[0].m.reworkHours)} hours per month.` : "No rework recorded yet.";
      facts = [
        { label: "Error rate today", value: pct(selected.currentErrorRate) },
        { label: "Error rate after", value: pct(selected.futureErrorRate) },
        { label: "Rework hours per month", value: `${Math.round(steps.reduce((s, x) => s + x.m.reworkHours, 0))}` },
      ];
      for (const x of top) {
        if (x.m.reworkHours <= 0) continue;
        recs.push({
          id: `q-${x.s.id}`,
          title: `Add a check at “${x.s.name}”`,
          why: `${pct(x.s.errorRate)} error rate and ${Math.round(x.m.reworkHours)} rework hours per month.`,
          impact: `${eur(x.m.reworkHours * p.assumptions.hourlyCost)} per month in rework`,
          cta: { kind: "idea", title: `Reduce errors in “${x.s.name}”`.slice(0, 120), note: `${pct(x.s.errorRate)} error rate, ${Math.round(x.m.reworkHours)} rework hours per month.`, stepId: x.s.id },
        });
      }
      scenarioRec((r) => -r.futureErrorRate, (r) => `Lowest error rate: ${pct(r.futureErrorRate)} after the change.`, (r) => `From ${pct(r.currentErrorRate)} to ${pct(r.futureErrorRate)}`);
      next.push("Collect the five most frequent errors of the step and their causes.");
      next.push("Add a validation check before the step, then measure again.");
      break;
    }
    case "golive": {
      const open = p.tasks.filter((t) => t.status !== "done");
      const overdue = open.filter((t) => t.due < today);
      const blocked = open.filter((t) => t.status === "blocked");
      headline = health.health === "no-plan" ? "There is no delivery plan yet." : `The project is ${({ "on-track": "on track", "at-risk": "at risk", "off-track": "off track" } as Record<string, string>)[health.health]}: ${pct(health.progress)} done, ${pct(health.plannedProgress)} planned.`;
      facts = [
        { label: "Target go-live", value: p.targetGoLive },
        { label: "Overdue tasks", value: `${overdue.length}` },
        { label: "Blocked tasks", value: `${blocked.length}` },
      ];
      if (p.tasks.length === 0) recs.push({ id: "g-plan", title: "Create the roadmap", why: "Without tasks there is nothing to track.", cta: { kind: "route", route: "roadmap", label: "Open Roadmap" } });
      for (const t of blocked.slice(0, 2)) recs.push({ id: `g-b-${t.id}`, title: `Unblock “${t.title}”`, why: `Blocked task, owner ${t.owner}, due ${t.due}.`, cta: { kind: "route", route: "roadmap", label: "Open Roadmap" } });
      for (const t of overdue.filter((x) => x.status !== "blocked").slice(0, 2)) recs.push({ id: `g-o-${t.id}`, title: `Finish or re-plan “${t.title}”`, why: `Overdue since ${t.due}, owner ${t.owner}.`, cta: { kind: "route", route: "roadmap", label: "Open Roadmap" } });
      const risk = [...p.risks].filter((r) => r.status !== "closed" && r.impact === "high")[0];
      if (risk) recs.push({ id: `g-r-${risk.id}`, title: `Reduce the risk “${risk.title}”`, why: risk.mitigation ? `Mitigation noted: ${risk.mitigation}` : "High impact and no mitigation noted.", cta: { kind: "idea", title: `Mitigate: ${risk.title}`.slice(0, 120), note: risk.mitigation || "Define a mitigation and an owner.", stepId: null } });
      next.push(overdue[0] ? `Talk to ${overdue[0].owner} about “${overdue[0].title}”.` : "Review the next milestone with the team.");
      next.push("Update task status once a week so the health indicator stays true.");
      break;
    }
    case "payback": {
      headline = selected.paybackFromStartMonths !== null ? `“${scName(selected.scenarioId)}” pays back ${mo(selected.paybackFromStartMonths)} after the start.` : `“${scName(selected.scenarioId)}” does not recover its investment on these inputs.`;
      facts = [
        { label: "Investment", value: eur(p.scenarios.find((s) => s.id === selected.scenarioId)?.initialInvestment ?? 0) },
        { label: "Net savings per month", value: eur(selected.monthlyNetSavings) },
        { label: "Early payment discounts", value: `${eur(selected.discountBenefit)} per month` },
      ];
      scenarioRec((r) => r.paybackFromStartMonths ?? 9999, (r) => (r.paybackFromStartMonths !== null ? `Fastest payback: ${mo(r.paybackFromStartMonths)} from the start.` : "None of the scenarios pays back yet."), (r) => `NPV ${eur(r.npv)} over ${r.roiHorizonMonths} months`, true);
      if (selected.discountBenefit > 0) recs.push({ id: "pb-disc", title: "Capture early payment discounts", why: `Worth ${eur(selected.discountBenefit)} per month in this scenario.`, cta: { kind: "route", route: "simulator", label: "Open Simulator" } });
      recs.push({ id: "pb-impl", title: "Shorten the implementation", why: `Implementation takes ${selected.implementationMonths} months; savings start only after it.`, cta: { kind: "route", route: "roadmap", label: "Open Roadmap" } });
      next.push("Check the investment and operating cost in the Simulator.");
      next.push("Pick the scenario with the best payback and adopt its tasks.");
      break;
    }
  }
  return { goal, headline: `${g.label}: ${headline}`, facts, recs: recs.slice(0, 4), steps: next };
}
