import React from "react";
import { LuScanLine, LuArrowRight, LuCalculator, LuFileText, LuSparkles, LuTriangleAlert, LuCircleCheck } from "react-icons/lu";
import { useStore } from "../state/store";
import { Badge, Button, Card, DataTag, PageHeader, Progress, Segmented, Stat, Empty } from "../components/ui";
import { HBars, Ring } from "../components/charts";
import { fmt } from "../format";
import { processBaseline, resolveInputs, sensitivity, stepMetrics } from "../../domain/finance";
import { projectHealth, milestoneDone, isOverdue } from "../../domain/roadmap";
import type { Task } from "../../domain/types";
import { navigate } from "../app";
import { setupStatus } from "../../domain/template";
import { PdfUploadHero } from "../components/PdfImport";
import { DataIntake } from "../components/DataIntake";
import { BenchmarkCard } from "../components/BenchmarkCard";
import { isIntakeSkipped, setIntakeSkipped } from "../state/onboarding";

export function HealthBadge({ health }: { health: "no-plan" | "on-track" | "at-risk" | "off-track" }) {
  const map = { "no-plan": ["No plan yet", "neutral"], "on-track": ["On track", "success"], "at-risk": ["At risk", "warning"], "off-track": ["Off track", "danger"] } as const;
  return <Badge tone={map[health][1]} dot>{map[health][0]}</Badge>;
}

type View = "workspace" | "assistant" | "focus";
let lastView: View = "workspace";

const TASK_STATUS: Record<string, [string, "neutral" | "accent" | "warning" | "success"]> = { todo: ["To do", "neutral"], in_progress: ["In progress", "accent"], blocked: ["Blocked", "warning"], done: ["Done", "success"] };

export function OverviewPage() {
  const { project: p, results, selectedResult: r, today, dispatch } = useStore();
  const [skipped, setSkipped] = React.useState(isIntakeSkipped);
  const [view, setViewState] = React.useState<View>(lastView);
  const [asked, setAsked] = React.useState<string | null>(null);
  const setView = (v: View) => { lastView = v; setViewState(v); };
  if (!setupStatus(p).ready && !skipped) {
    return (
      <div className="page">
        <DataIntake onSkip={() => { setIntakeSkipped(true); setSkipped(true); }} />
      </div>
    );
  }
  const base = processBaseline(p.process);
  const scen = p.scenarios.find((s) => s.id === p.selectedScenario)!;
  const range = sensitivity(resolveInputs(p.process, p.assumptions), scen);
  const health = projectHealth(p, today);
  const metrics = stepMetrics(p.process, p.assumptions.hourlyCost);
  const targetAutomation = base.automationRate + (1 - base.automationRate) * scen.automationShare;
  const activePhases = p.phases.filter((ph) => ph.start <= today && ph.end >= today);
  const lastRun = p.recommendationRuns[0];
  const nextMilestone = [...p.milestones].filter((m) => !milestoneDone(m, p.tasks)).sort((a, b) => a.due.localeCompare(b.due))[0];
  const rank = (t: Task) => (t.status === "blocked" ? 0 : isOverdue(t, today) ? 1 : t.status === "in_progress" ? 2 : 3);
  const openTasks = p.tasks.filter((t) => t.status !== "done").sort((a, b) => rank(a) - rank(b) || a.due.localeCompare(b.due));
  const top = [...metrics].sort((a, b) => b.monthlyCost - a.monthlyCost)[0];
  const topStep = top ? p.process.steps.find((x) => x.id === top.stepId) : undefined;
  const fastest = [...results].sort((a, b) => (a.paybackFromStartMonths ?? 1e9) - (b.paybackFromStartMonths ?? 1e9))[0];
  const fastestScen = fastest ? p.scenarios.find((x) => x.id === fastest.scenarioId) : undefined;
  const hasSteps = p.process.steps.length > 0 && p.process.monthlyVolume > 0;
  const hasPlan = p.tasks.length > 0;

  const compare = [
    { label: "Cost per invoice", now: fmt.eur(r.currentCostPerInvoice, 2), next: fmt.eur(r.futureCostPerInvoice, 2), delta: r.currentCostPerInvoice && r.futureCostPerInvoice ? 1 - r.futureCostPerInvoice / r.currentCostPerInvoice : null },
    { label: "Time per invoice", now: `${fmt.num(r.currentMinutesPerInvoice, 1)} min`, next: `${fmt.num(r.futureMinutesPerInvoice, 1)} min`, delta: r.processingTimeReduction },
    { label: "Cycle time", now: `${fmt.num(r.currentCycleTimeDays, 1)} days`, next: `${fmt.num(r.futureCycleTimeDays, 1)} days`, delta: r.currentCycleTimeDays ? 1 - r.futureCycleTimeDays / r.currentCycleTimeDays : null },
    { label: "Error rate", now: fmt.pct(r.currentErrorRate, 1), next: fmt.pct(r.futureErrorRate, 1), delta: r.errorReduction },
    { label: "Manual effort (FTE)", now: fmt.num(r.currentFte, 1), next: fmt.num(r.futureFte, 1), delta: r.currentFte ? 1 - r.futureFte / r.currentFte : null },
  ];

  const path: { n: number; title: string; sub: string; done: boolean; route: "process" | "simulator" | "roadmap" }[] = [
    { n: 1, title: "Know today", sub: "Map the process and its cost", done: hasSteps, route: "process" },
    { n: 2, title: "Compare options", sub: "Pick the best of three", done: p.scenarios.length > 0 && hasSteps, route: "simulator" },
    { n: 3, title: "Plan and track", sub: "Deliver with a roadmap", done: hasPlan, route: "roadmap" },
  ];

  const questions: { id: string; q: string; answer: React.ReactNode; to: "simulator" | "roadmap" | "process" | "consultant"; cta: string }[] = [
    { id: "pay", q: "Does automation pay off?", answer: <>Yes, in the “{scen.name}” case: about <b>{fmt.eur(r.annualNetSavings)}</b> net per year, payback in <b>{fmt.months(r.paybackFromStartMonths)}</b>. <DataTag kind="estimate" /></>, to: "simulator", cta: "Open simulator" },
    { id: "fast", q: "Which option pays back fastest?", answer: fastestScen && fastest ? <><b>{fastestScen.name}</b> pays back in {fmt.months(fastest.paybackFromStartMonths)} and saves {fmt.eurCompact(fastest.monthlyNetSavings)} a month net.</> : <>Add process data to compare the options.</>, to: "simulator", cta: "Compare options" },
    { id: "cost", q: "Where does the money go?", answer: topStep && top ? <><b>{topStep.name}</b> is the biggest cost block: {fmt.eur(top.monthlyCost)} per month ({fmt.pct(top.costShare)} of the process).</> : <>Add process steps to see the cost split.</>, to: "process", cta: "Open process" },
    { id: "next", q: "What should we do next?", answer: openTasks[0] ? <><b>{openTasks[0].title}</b>, due {fmt.shortDate(openTasks[0].due)}. {nextMilestone && <>Next milestone: {nextMilestone.name}.</>}</> : hasPlan ? <>All tasks are done.</> : <>There is no plan yet. Generate a starter roadmap.</>, to: "roadmap", cta: "Open roadmap" },
  ];
  const chosen = questions.find((q) => q.id === asked);

  const setup = setupStatus(p);

  return (
    <div className="page ov">
      {!setup.ready && <><PdfUploadHero /><SetupCard /></>}
      <PageHeader
        eyebrow={[p.company.name, p.company.industry].filter(Boolean).join(" · ") || "Overview"}
        title={p.name}
        description="Goal: decide whether automating invoice handling pays off, then deliver it."
        actions={<>
          <Button icon={<LuFileText />} onClick={() => navigate("report")}>Export report</Button>
          <Button variant="primary" icon={<LuCalculator />} onClick={() => navigate("simulator")}>Open simulator</Button>
        </>}
      />

      <ol className="ov-path" aria-label="Three steps from data to delivery">
        {path.map((s) => (
          <li key={s.n} className={s.done ? "ov-step ov-step-done" : "ov-step"}>
            <button type="button" onClick={() => navigate(s.route)}>
              <span className="ov-step-n" aria-hidden>{s.done ? <LuCircleCheck /> : s.n}</span>
              <span className="ov-step-t"><b>{s.title}</b><small>{s.sub}</small></span>
              <LuArrowRight aria-hidden className="ov-step-go" />
            </button>
          </li>
        ))}
      </ol>

      <div className="ov-switch">
        <Segmented<View> label="Dashboard view" value={view} onChange={setView} options={[{ value: "workspace", label: "Workspace" }, { value: "assistant", label: "Assistant" }, { value: "focus", label: "Focus" }]} />
        <span className="ov-switch-hint small muted">{view === "workspace" ? "All answers on one page" : view === "assistant" ? "Ask, get one answer" : "Only what needs you today"}</span>
      </div>

      {view === "workspace" && (
        <>
          <section className="ov-board" aria-labelledby="ov-b1">
            <header className="ov-board-h"><h2 id="ov-b1">Does it pay off?</h2><DataTag kind="estimate" /></header>
            <div className="stat-grid">
              <Stat label="Process cost per month" value={fmt.eur(r.currentMonthlyCost)} sub={`${fmt.num(p.process.monthlyVolume)} invoices at ${fmt.eur(p.assumptions.hourlyCost)}/h`} />
              <Stat label="Time per invoice" value={`${fmt.num(r.currentMinutesPerInvoice, 1)} min`} sub={`${fmt.num(base.cycleTimeDays, 1)} days end to end`} />
              <Stat label="Automated share" value={<span className="stat-pair">{fmt.pct(base.automationRate)} <LuArrowRight aria-label="to" /> {fmt.pct(targetAutomation)}</span>} sub={`Today to ${scen.name}`} />
              <Stat tone="accent" label="Net savings per year" value={fmt.eur(r.annualNetSavings)} sub={`Range ${fmt.eurCompact(range[0].result.annualNetSavings)} to ${fmt.eurCompact(range[2].result.annualNetSavings)}`} />
            </div>
            <div className="scenario-switch">
              {results.map((res) => {
                const sc = p.scenarios.find((x) => x.id === res.scenarioId)!;
                const on = sc.id === p.selectedScenario;
                return (
                  <button key={sc.id} className={`scen-mini${on ? " scen-mini-on" : ""}`} onClick={() => dispatch({ type: "selectScenario", id: sc.id })} aria-pressed={on}>
                    <span className="scen-mini-name">{sc.name}</span>
                    <span className="scen-mini-val">{fmt.eurCompact(res.monthlyNetSavings)}<small>/mo net</small></span>
                    <span className="scen-mini-sub">Payback {fmt.months(res.paybackFromStartMonths)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="grid-2">
            <section className="ov-board" aria-labelledby="ov-b2">
              <header className="ov-board-h"><h2 id="ov-b2">What changes?</h2><DataTag kind="estimate" /></header>
              <table className="table compare-table">
                <thead><tr><th>Metric</th><th className="num">Today</th><th className="num">Target</th><th className="num">Change</th></tr></thead>
                <tbody>
                  {compare.map((c) => (
                    <tr key={c.label}>
                      <td>{c.label}</td>
                      <td className="num muted">{c.now}</td>
                      <td className="num strong">{c.next}</td>
                      <td className="num">{c.delta === null ? <span className="muted">n/a</span> : Math.abs(c.delta) < 0.005 ? <span className="muted">±0 %</span> : c.delta > 0 ? <span className="delta-good">−{fmt.pct(c.delta)}</span> : <span className="text-danger">+{fmt.pct(-c.delta)}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="ov-board" aria-labelledby="ov-b3">
              <header className="ov-board-h"><h2 id="ov-b3">Is the project on track?</h2><HealthBadge health={health.health} /></header>
              <div className="health-top">
                <Ring value={health.progress} size={76} label={`Progress ${Math.round(health.progress * 100)}%`} />
                <div className="health-meta">
                  <div><span className="muted">Planned by today</span><b>{fmt.pct(health.plannedProgress)}</b></div>
                  <div><span className="muted">Phase now</span><b>{activePhases.map((x) => x.name).join(", ") || "n/a"}</b></div>
                  <div><span className="muted">Go-live</span><b>{fmt.date(p.targetGoLive)}</b></div>
                </div>
              </div>
              <Progress value={health.budgetCommitted / (health.budgetTotal || 1)} label="Budget committed" />
              <ul className="issue-list">
                {health.overdueMilestones.slice(0, 2).map((m) => <li key={m.id} className="issue-danger"><LuTriangleAlert aria-hidden /> Overdue milestone: {m.name}</li>)}
                {health.overdueTasks.slice(0, 2).map((t) => <li key={t.id} className="issue-warning"><LuTriangleAlert aria-hidden /> Overdue: {t.title}</li>)}
                {health.blockedTasks.slice(0, 2).map((t) => <li key={t.id} className="issue-warning"><LuTriangleAlert aria-hidden /> Blocked: {t.title}</li>)}
                {health.reasons.filter((x) => /risk|behind plan/.test(x)).slice(0, 2).map((x) => <li key={x} className="issue-warning"><LuTriangleAlert aria-hidden /> {x[0].toUpperCase() + x.slice(1)}</li>)}
                {health.health === "no-plan" && <li className="issue-info">No plan yet. <button className="link-btn" onClick={() => dispatch({ type: "generateStarterRoadmap" })}>Generate starter roadmap</button></li>}
                {health.health !== "no-plan" && health.overdueMilestones.length + health.overdueTasks.length + health.blockedTasks.length === 0 && <li className="issue-ok"><LuCircleCheck aria-hidden /> Nothing overdue</li>}
                {nextMilestone && <li className="issue-info">Next milestone: <b>{nextMilestone.name}</b>, {fmt.shortDate(nextMilestone.due)}</li>}
              </ul>
              <Button size="sm" variant="ghost" onClick={() => navigate("roadmap")}>Open roadmap <LuArrowRight aria-hidden /></Button>
            </section>
          </div>

          <div className="grid-2">
            <section className="ov-board" aria-labelledby="ov-b4">
              <header className="ov-board-h"><h2 id="ov-b4">Where does the money go?</h2><DataTag kind="estimate" /></header>
              <HBars
                format={(n) => fmt.eur(n)}
                rows={metrics.map((m) => {
                  const st = p.process.steps.find((x) => x.id === m.stepId)!;
                  return { label: st.name, value: m.monthlyCost, color: m.isBottleneck ? "var(--danger)" : "var(--accent-line)", note: m.isBottleneck ? "Bottleneck" : `${fmt.pct(m.costShare)} of cost`, onClick: () => navigate("process") };
                })}
              />
            </section>
            <section className="ov-board" aria-labelledby="ov-b6">
              <header className="ov-board-h"><h2 id="ov-b6">Next ideas</h2><Button size="sm" variant="ghost" icon={<LuSparkles />} onClick={() => navigate("consultant")}>Consultant</Button></header>
              {lastRun ? (
                <ul className="rec-mini-list">
                  {lastRun.items.slice(0, 3).map((rec) => (
                    <li key={rec.id}>
                      <div className="rec-mini-title">{rec.title}</div>
                      <div className="rec-mini-meta">
                        <span>{fmt.eur(rec.monthlySavings)}/mo est.</span>
                        <span>{fmt.eur(rec.investment)} invest</span>
                        <Badge tone={p.adoptedRecommendationIds.includes(rec.id) ? "success" : "neutral"}>{p.adoptedRecommendationIds.includes(rec.id) ? "On roadmap" : `Fit ${rec.fitScore}`}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty icon={<LuSparkles />} title="No recommendations yet" body="Describe the problem to get ranked ideas with cost and risk." action={<Button size="sm" variant="primary" onClick={() => navigate("consultant")}>Get recommendations</Button>} />
              )}
            </section>
          </div>

          <section className="ov-board" aria-labelledby="ov-b5">
            <header className="ov-board-h"><h2 id="ov-b5">How do we compare?</h2></header>
            <BenchmarkCard values={{
              targetName: scen.name,
              today: { costPerInvoice: r.currentCostPerInvoice ?? 0, cycleTimeDays: r.currentCycleTimeDays, automationRate: base.automationRate, exceptionRate: r.currentErrorRate },
              target: { costPerInvoice: r.futureCostPerInvoice ?? 0, cycleTimeDays: r.futureCycleTimeDays, automationRate: targetAutomation, exceptionRate: r.futureErrorRate },
            }} />
          </section>

          {setup.ready && <section className="ov-board" aria-labelledby="ov-b7"><header className="ov-board-h"><h2 id="ov-b7">Data and setup</h2></header><PdfUploadHero compact /><SetupCard /></section>}
        </>
      )}

      {view === "assistant" && (
        <section className="ov-assist" aria-labelledby="ov-a1">
          <h2 id="ov-a1">What do you want to know today?</h2>
          <p>Pick a question. You get one answer from your own figures.</p>
          <div className="ov-asks" role="group" aria-label="Questions">
            {questions.map((q) => <button key={q.id} type="button" className={`ov-ask${asked === q.id ? " ov-ask-on" : ""}`} aria-pressed={asked === q.id} onClick={() => setAsked(q.id)}>{q.q}</button>)}
          </div>
          {chosen ? (
            <div className="ov-answer" role="status">
              <div>{chosen.answer}</div>
              <Button size="sm" variant="primary" onClick={() => navigate(chosen.to)}>{chosen.cta} <LuArrowRight aria-hidden /></Button>
            </div>
          ) : <div className="ov-answer ov-answer-empty">No question picked yet.</div>}
          <dl className="ov-chips">
            <div><dt>Net savings a year</dt><dd>{fmt.eurCompact(r.annualNetSavings)}</dd></div>
            <div><dt>Payback</dt><dd>{fmt.months(r.paybackFromStartMonths)}</dd></div>
            <div><dt>Progress</dt><dd>{Math.round(health.progress * 100)} %</dd></div>
            <div><dt>Open tasks</dt><dd>{openTasks.length}</dd></div>
          </dl>
        </section>
      )}

      {view === "focus" && (
        <section className="ov-focus" aria-labelledby="ov-f1">
          <div className="ov-focus-top">
            <Ring value={health.progress} size={96} label={`Progress ${Math.round(health.progress * 100)}%`} />
            <div>
              <h2 id="ov-f1">Today</h2>
              <p className="muted">{hasPlan ? `${openTasks.length} open tasks. Here are the ${Math.min(3, openTasks.length)} that need you first.` : "There is no plan yet, so there is nothing to focus on."}</p>
              <HealthBadge health={health.health} />
            </div>
          </div>
          {hasPlan ? (
            <ul className="ov-focus-list">
              {openTasks.slice(0, 3).map((t) => {
                const late = isOverdue(t, today);
                const [label, tone] = TASK_STATUS[t.status];
                return (
                  <li key={t.id}>
                    <button type="button" onClick={() => navigate("roadmap")}>
                      <span className="ov-focus-title">{t.title}</span>
                      <span className="ov-focus-meta"><span>{t.owner}</span><span className={late ? "text-danger" : undefined}>due {fmt.shortDate(t.due)}</span><Badge tone={late && t.status !== "blocked" ? "danger" : tone}>{late && t.status !== "blocked" ? "Overdue" : label}</Badge></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <Button variant="primary" onClick={() => dispatch({ type: "generateStarterRoadmap" })}>Generate starter roadmap</Button>}
          {nextMilestone && <p className="ov-focus-ms">Next milestone: <b>{nextMilestone.name}</b>, {fmt.shortDate(nextMilestone.due)}</p>}
          <Button size="sm" variant="ghost" onClick={() => navigate("roadmap")}>All tasks <LuArrowRight aria-hidden /></Button>
        </section>
      )}
    </div>
  );
}

export function SetupCard() {
  const { project: p } = useStore();
  const st = setupStatus(p);
  if (st.complete === st.total) return null;
  return (
    <Card title={st.ready ? "Complete your project" : "Or enter the data manually"} subtitle={st.ready ? "The business case is ready. Add the remaining pieces for the full picture." : "Work through these steps by hand. Figures on this page stay at zero until volume, labour cost and step times are entered."} actions={<Badge tone={st.ready ? "success" : "accent"}>{st.complete} / {st.total} done</Badge>}>
      <ol className="setup-list">
        {st.items.map((it, i) => (
          <li key={it.id} className={it.done ? "setup-done" : ""}>
            <span className="setup-num" aria-hidden>{it.done ? <LuCircleCheck /> : i + 1}</span>
            <span className="setup-label">{it.label}</span>
            {!it.done && <Button size="sm" variant="ghost" onClick={() => navigate(it.route)}>Open <LuArrowRight aria-hidden /></Button>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
