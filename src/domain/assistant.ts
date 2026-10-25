/**
 * Assistant answers. Pure functions: every sentence is composed from the project's own
 * numbers (process map, selected scenario, roadmap). Nothing is invented; when a value
 * cannot be computed the answer says what is missing.
 */
import type { Project } from "./types";
import { processBaseline, stepMetrics, type ScenarioResult } from "./finance";
import { projectHealth, milestoneDone } from "./roadmap";
import { setupStatus } from "./template";

export type QuestionId = "bottleneck" | "case" | "next" | "risks" | "status";

export const QUESTIONS: { id: QuestionId; label: string }[] = [
  { id: "bottleneck", label: "Where is the biggest bottleneck?" },
  { id: "case", label: "Is the business case worth it?" },
  { id: "next", label: "What should we do next?" },
  { id: "risks", label: "Which risks need attention?" },
  { id: "status", label: "Are we on track?" },
];

export interface Answer {
  /** One-sentence verdict. */
  headline: string;
  /** Supporting facts, each traceable to a number in the project. */
  points: string[];
  /** Where in the app to look (route id). */
  link?: { route: "process" | "simulator" | "roadmap" | "consultant" | "analytics"; label: string };
}

const eur = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${Math.round(n * 100)} %`;
const months = (n: number) => `${Math.round(n * 10) / 10} months`;

export function answer(id: QuestionId, p: Project, r: ScenarioResult, today: string): Answer {
  const setup = setupStatus(p);
  if (!setup.ready && id !== "status" && id !== "next") {
    return { headline: "I need your process data first.", points: ["Enter invoice volume, labour cost and the handling time of each step. Until then nothing can be calculated."], link: { route: "process", label: "Open Process" } };
  }
  switch (id) {
    case "bottleneck": {
      const m = stepMetrics(p.process, p.assumptions.hourlyCost);
      const ranked = m.map((x) => ({ x, step: p.process.steps.find((s) => s.id === x.stepId)! })).sort((a, b) => b.x.bottleneckScore - a.x.bottleneckScore);
      const top = ranked[0];
      if (!top || top.x.bottleneckScore === 0) return { headline: "No bottleneck stands out yet.", points: ["The steps carry no cost or waiting time so far."], link: { route: "process", label: "Open Process" } };
      const base = processBaseline(p.process);
      return {
        headline: `“${top.step.name}” is the biggest bottleneck.`,
        points: [
          `${pct(top.x.costShare)} of the monthly labour cost (${eur(top.x.monthlyCost)}) and ${pct(top.x.waitShare)} of the waiting time.`,
          `Error rate in this step: ${pct(top.step.errorRate)}; automated today: ${pct(top.step.automatedShare)}.`,
          ...(ranked[1] ? [`Next: “${ranked[1].step.name}” (score ${ranked[1].x.bottleneckScore} of 100).`] : []),
          `The whole process takes about ${Math.round(base.cycleTimeDays * 10) / 10} days from receipt to completion.`,
        ],
        link: { route: "consultant", label: "Compare interventions" },
      };
    }
    case "case": {
      const sc = p.scenarios.find((s) => s.id === r.scenarioId)!;
      const worth = r.monthlyNetSavings > 0 && r.paybackMonths !== null;
      return {
        headline: worth ? `Yes, on these inputs: “${sc.name}” pays back ${months(r.paybackMonths!)} after go-live.` : `Not on these inputs: “${sc.name}” does not recover its investment.`,
        points: [
          `Net savings at full effect: ${eur(r.monthlyNetSavings)} per month (${eur(r.annualNetSavings)} per year).`,
          `Investment: ${eur(sc.initialInvestment)}; net present value over ${r.roiHorizonMonths} months: ${eur(r.npv)}.`,
          ...(r.roiHorizon !== null ? [`Return over ${r.roiHorizonMonths} months: ${pct(r.roiHorizon)}.`] : []),
          ...r.warnings.slice(0, 2),
          "These are estimates calculated from your inputs, not measured results.",
        ],
        link: { route: "simulator", label: "Open Simulator" },
      };
    }
    case "next": {
      if (!setup.ready) {
        const missing = setup.items.filter((i) => !i.done).map((i) => i.label);
        return { headline: "Finish the setup first.", points: missing.map((m) => `Missing: ${m}`), link: { route: "process", label: "Open Process" } };
      }
      const open = p.tasks.filter((t) => t.status !== "done");
      const byId = new Map(p.tasks.map((t) => [t.id, t]));
      const ready = open.filter((t) => t.dependsOn.every((d) => byId.get(d)?.status === "done"));
      const rank = (t: (typeof open)[number]) => (t.status === "blocked" ? 0 : t.due < today ? 1 : t.status === "in_progress" ? 2 : 3);
      const next = [...ready].sort((a, b) => rank(a) - rank(b) || a.due.localeCompare(b.due)).slice(0, 3);
      if (p.tasks.length === 0) return { headline: "There is no roadmap yet.", points: ["Generate the starter roadmap or adopt a recommendation from the Consultant."], link: { route: "roadmap", label: "Open Roadmap" } };
      if (next.length === 0) return { headline: "All tasks are done or waiting for others.", points: [`${open.length} open task${open.length === 1 ? "" : "s"} wait for a dependency.`], link: { route: "roadmap", label: "Open Roadmap" } };
      return {
        headline: `Start with “${next[0].title}”.`,
        points: next.map((t) => `${t.title}: ${t.status === "blocked" ? "blocked" : t.due < today ? `overdue since ${t.due}` : t.status === "in_progress" ? `in progress, due ${t.due}` : `due ${t.due}`} (${t.owner}).`),
        link: { route: "roadmap", label: "Open Roadmap" },
      };
    }
    case "risks": {
      const lvl = { low: 1, medium: 2, high: 3 } as const;
      const open = p.risks.filter((x) => x.status !== "closed").sort((a, b) => lvl[b.probability] * lvl[b.impact] - lvl[a.probability] * lvl[a.impact]);
      if (open.length === 0) return { headline: "No open risks are recorded.", points: ["That can mean there are none, or that none have been entered yet."], link: { route: "roadmap", label: "Open Roadmap" } };
      return {
        headline: `${open.length} open risk${open.length === 1 ? "" : "s"}; start with “${open[0].title}”.`,
        points: open.slice(0, 3).map((x) => `${x.title}: probability ${x.probability}, impact ${x.impact}${x.mitigation ? `. Mitigation: ${x.mitigation}` : ". No mitigation noted."}`),
        link: { route: "roadmap", label: "Open Roadmap" },
      };
    }
    case "status": {
      const h = projectHealth(p, today);
      if (h.health === "no-plan") return { headline: "There is no delivery plan yet.", points: ["Add tasks to the roadmap to track progress."], link: { route: "roadmap", label: "Open Roadmap" } };
      const label = { "on-track": "on track", "at-risk": "at risk", "off-track": "off track" }[h.health];
      const nm = [...p.milestones].filter((m) => !milestoneDone(m, p.tasks)).sort((a, b) => a.due.localeCompare(b.due))[0];
      return {
        headline: `The project is ${label}.`,
        points: [
          `Progress ${pct(h.progress)} against ${pct(h.plannedProgress)} planned.`,
          ...(h.reasons.length ? h.reasons.map((x) => x[0].toUpperCase() + x.slice(1) + ".") : ["No overdue or blocked work."]),
          ...(nm ? [`Next milestone: ${nm.name}, due ${nm.due}.`] : []),
        ],
        link: { route: "roadmap", label: "Open Roadmap" },
      };
    }
  }
}
