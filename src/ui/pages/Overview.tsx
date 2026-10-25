import React from "react";
import { LuScanLine, LuArrowRight, LuCalculator, LuFileText, LuSparkles, LuTriangleAlert, LuCircleCheck, LuChevronDown } from "react-icons/lu";
import { useStore } from "../state/store";
import { Badge, Button, Card, DataTag, PageHeader, Progress, Stat, Empty } from "../components/ui";
import { HBars, Ring } from "../components/charts";
import { fmt } from "../format";
import { processBaseline, resolveInputs, sensitivity, stepMetrics } from "../../domain/finance";
import { projectHealth, milestoneDone } from "../../domain/roadmap";
import { navigate } from "../app";
import { setupStatus } from "../../domain/template";
import { PdfUploadHero } from "../components/PdfImport";
import { DataIntake } from "../components/DataIntake";
import { BenchmarkCard } from "../components/BenchmarkCard";
import { FocusCockpit } from "../components/FocusCockpit";
import { isIntakeSkipped, setIntakeSkipped } from "../state/onboarding";

export function HealthBadge({ health }: { health: "no-plan" | "on-track" | "at-risk" | "off-track" }) {
  const map = { "no-plan": ["No plan yet", "neutral"], "on-track": ["On track", "success"], "at-risk": ["At risk", "warning"], "off-track": ["Off track", "danger"] } as const;
  return <Badge tone={map[health][1]} dot>{map[health][0]}</Badge>;
}

/** Full width section bar: a header row with the headline figures, expandable to its content. */
function Band({ id, title, chips, openDefault, children }: { id: string; title: string; chips: string[]; openDefault?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(!!openDefault);
  return (
    <section className={`band${open ? " band-open" : ""}`} aria-labelledby={`band-${id}`}>
      <button type="button" className="band-head" aria-expanded={open} aria-controls={`band-body-${id}`} onClick={() => setOpen((o) => !o)}>
        <span className="band-title" id={`band-${id}`}>{title}</span>
        <span className="band-chips">{chips.map((c) => <span key={c} className="band-chip">{c}</span>)}</span>
        <LuChevronDown className="band-caret" aria-hidden />
      </button>
      {open && <div className="band-body" id={`band-body-${id}`}>{children}</div>}
    </section>
  );
}

export function OverviewPage() {
  const { project: p, results, selectedResult: r, today, dispatch } = useStore();
  const [skipped, setSkipped] = React.useState(isIntakeSkipped);
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
  const activeTasks = p.tasks.filter((t) => t.status === "in_progress").length;
  const activePhases = p.phases.filter((ph) => ph.start <= today && ph.end >= today);
  const lastRun = p.recommendationRuns[0];
  const nextMilestone = [...p.milestones].filter((m) => !milestoneDone(m, p.tasks)).sort((a, b) => a.due.localeCompare(b.due))[0];

  const compare = [
    { label: "Cost per invoice", now: fmt.eur(r.currentCostPerInvoice, 2), next: fmt.eur(r.futureCostPerInvoice, 2), delta: r.currentCostPerInvoice && r.futureCostPerInvoice ? 1 - r.futureCostPerInvoice / r.currentCostPerInvoice : null },
    { label: "Handling time / invoice", now: `${fmt.num(r.currentMinutesPerInvoice, 1)} min`, next: `${fmt.num(r.futureMinutesPerInvoice, 1)} min`, delta: r.processingTimeReduction },
    { label: "Cycle time", now: `${fmt.num(r.currentCycleTimeDays, 1)} days`, next: `${fmt.num(r.futureCycleTimeDays, 1)} days`, delta: r.currentCycleTimeDays ? 1 - r.futureCycleTimeDays / r.currentCycleTimeDays : null },
    { label: "Error rate", now: fmt.pct(r.currentErrorRate, 1), next: fmt.pct(r.futureErrorRate, 1), delta: r.errorReduction },
    { label: "Manual effort (FTE)", now: fmt.num(r.currentFte, 1), next: fmt.num(r.futureFte, 1), delta: r.currentFte ? 1 - r.futureFte / r.currentFte : null },
  ];

  return (
    <div className="page">
      {!setupStatus(p).ready && <><PdfUploadHero /><SetupCard /></>}
      <PageHeader
        eyebrow={[p.company.name, p.company.industry, p.company.country].filter(Boolean).join(" · ") || "Executive Overview"}
        title={p.name}
        description={<>Baseline, business case and delivery status for the invoice automation initiative. Figures marked <DataTag kind="estimate" /> are calculated from your inputs, not measured results.</>}
        actions={<>
          <Button icon={<LuFileText />} onClick={() => navigate("report")}>Export report</Button>
          <Button variant="primary" icon={<LuCalculator />} onClick={() => navigate("simulator")}>Open simulator</Button>
        </>}
      />

      <div className="stat-grid">
        <Stat label="Monthly process cost" value={fmt.eur(r.currentMonthlyCost)} tag={<DataTag kind="estimate" />} sub={`${fmt.num(p.process.monthlyVolume)} invoices · ${fmt.eur(p.assumptions.hourlyCost)}/h`} />
        <Stat label="Avg. processing time" value={`${fmt.num(r.currentMinutesPerInvoice, 1)} min`} tag={<DataTag kind="input" />} sub={`${fmt.num(base.cycleTimeDays, 1)} business days end-to-end`} />
        <Stat label="Automation potential" value={<span className="stat-pair">{fmt.pct(base.automationRate)} <LuArrowRight aria-label="to" /> {fmt.pct(targetAutomation)}</span>} tag={<DataTag kind="estimate" />} sub={`Today → ${scen.name}`} />
        <Stat tone="accent" label="Est. annual net savings" value={fmt.eur(r.annualNetSavings)} tag={<DataTag kind="estimate" />} sub={<>{r.discountBenefit > 0 && <>incl. {fmt.eurCompact(r.discountBenefit * 12)} early-payment discounts<br /></>}Range {fmt.eurCompact(range[0].result.annualNetSavings)} – {fmt.eurCompact(range[2].result.annualNetSavings)} · payback {fmt.months(r.paybackFromStartMonths)} from start</>} />
      </div>

      <Band id="case" title="Business case and project health" chips={[`${fmt.eurCompact(r.annualNetSavings)} net per year`, `Payback ${fmt.months(r.paybackFromStartMonths)}`, health.health === "no-plan" ? "No plan yet" : `Progress ${Math.round(health.progress * 100)} %`]} openDefault>
      <div className="grid-3-2">
        <Card title="Before vs. after" subtitle={`Baseline vs. “${scen.name}” target state`} actions={<DataTag kind="estimate" />}>
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
          <div className="scenario-switch">
            {results.map((res) => {
              const s = p.scenarios.find((x) => x.id === res.scenarioId)!;
              const on = s.id === p.selectedScenario;
              return (
                <button key={s.id} className={`scen-mini${on ? " scen-mini-on" : ""}`} onClick={() => dispatch({ type: "selectScenario", id: s.id })} aria-pressed={on}>
                  <span className="scen-mini-name">{s.name}</span>
                  <span className="scen-mini-val">{fmt.eurCompact(res.monthlyNetSavings)}<small>/mo net</small></span>
                  <span className="scen-mini-sub">Payback {fmt.months(res.paybackFromStartMonths)} from start</span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card title="Project health" actions={<HealthBadge health={health.health} />}>
          <div className="health-top">
            <Ring value={health.progress} size={76} label={`Progress ${Math.round(health.progress * 100)}%`} />
            <div className="health-meta">
              <div><span className="muted">Planned by today</span><b>{fmt.pct(health.plannedProgress)}</b></div>
              <div><span className="muted">Active phase</span><b>{activePhases.map((x) => x.name).join(", ") || "—"}</b></div>
              <div><span className="muted">Tasks in progress</span><b>{activeTasks}</b></div>
              <div><span className="muted">Target go-live</span><b>{fmt.date(p.targetGoLive)}</b></div>
            </div>
          </div>
          <Progress value={health.budgetCommitted / (health.budgetTotal || 1)} label="Budget committed" />
          <div className="small muted mt-4">{fmt.eur(health.budgetCommitted)} of {fmt.eur(health.budgetTotal)} implementation budget committed</div>
          <ul className="issue-list">
            {health.overdueMilestones.map((m) => <li key={m.id} className="issue-danger"><LuTriangleAlert aria-hidden /> Milestone overdue: {m.name} ({fmt.shortDate(m.due)})</li>)}
            {health.overdueTasks.map((t) => <li key={t.id} className="issue-warning"><LuTriangleAlert aria-hidden /> Overdue: {t.title}, due {fmt.shortDate(t.due)}</li>)}
            {health.blockedTasks.map((t) => <li key={t.id} className="issue-warning"><LuTriangleAlert aria-hidden /> Blocked: {t.title}</li>)}
            {health.reasons.filter((r) => /risk|behind plan/.test(r)).map((r) => <li key={r} className="issue-warning"><LuTriangleAlert aria-hidden /> {r[0].toUpperCase() + r.slice(1)}</li>)}
            {health.health === "no-plan" && <li className="issue-info">No roadmap tasks yet, progress and health appear once a plan exists. <button className="link-btn" onClick={() => dispatch({ type: "generateStarterRoadmap" })}>Generate starter roadmap</button></li>}
            {health.health !== "no-plan" && health.reasons.length === 0 && <li className="issue-ok"><LuCircleCheck aria-hidden /> No overdue items</li>}
            {nextMilestone && <li className="issue-info">Next milestone: <b>{nextMilestone.name}</b> · {fmt.shortDate(nextMilestone.due)}</li>}
          </ul>
          <Button size="sm" variant="ghost" onClick={() => navigate("roadmap")}>Open roadmap <LuArrowRight aria-hidden /></Button>
        </Card>
      </div>
      </Band>

      <Band id="cost" title="Cost drivers and benchmark" chips={[`${fmt.eur(r.currentMonthlyCost)} per month today`, `${metrics.filter((m) => m.isBottleneck).length} bottleneck${metrics.filter((m) => m.isBottleneck).length === 1 ? "" : "s"}`]}>
      <>
      <BenchmarkCard values={{
        targetName: scen.name,
        today: { costPerInvoice: r.currentCostPerInvoice ?? 0, cycleTimeDays: r.currentCycleTimeDays, automationRate: base.automationRate, exceptionRate: r.currentErrorRate },
        target: { costPerInvoice: r.futureCostPerInvoice ?? 0, cycleTimeDays: r.futureCycleTimeDays, automationRate: targetAutomation, exceptionRate: r.futureErrorRate },
      }} />

      <Card title="Where the cost sits" subtitle="Monthly labour cost per process step incl. rework" actions={<DataTag kind="estimate" />}>
          <HBars
            format={(n) => fmt.eur(n)}
            rows={metrics.map((m) => {
              const s = p.process.steps.find((x) => x.id === m.stepId)!;
              return { label: s.name, value: m.monthlyCost, color: m.isBottleneck ? "var(--danger)" : "var(--accent-line)", note: m.isBottleneck ? `Bottleneck score ${m.bottleneckScore}/100` : `${fmt.pct(m.costShare)} of process cost`, onClick: () => navigate("process") };
            })}
          />
        </Card>
      </>
      </Band>

      {setupStatus(p).ready && (
        <Band id="focus" title="Focus, data and setup" chips={["Today's focus", "PDF import"]}>
          <><FocusCockpit /><PdfUploadHero compact /><SetupCard /></>
        </Band>
      )}

      <Band id="next" title="Recommendations and activity" chips={[lastRun ? `${lastRun.items.length} recommendations` : "No recommendations yet", `${p.activity.length} changes logged`]}>
      <div className="grid-2">
        <Card title="Recent recommendations" actions={<Button size="sm" variant="ghost" icon={<LuSparkles />} onClick={() => navigate("consultant")}>Consultant</Button>}>
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
              <li className="small muted">Generated {fmt.relative(lastRun.createdAt)} · {lastRun.source === "llm" ? `AI model (${lastRun.model})` : "rule engine"}</li>
            </ul>
          ) : (
            <Empty icon={<LuSparkles />} title="No recommendations yet" body="Describe the problem and constraints to get ranked interventions with costs, risks and success metrics." action={<Button size="sm" variant="primary" onClick={() => navigate("consultant")}>Generate recommendations</Button>} />
          )}
          <h3 className="subhead">Activity</h3>
          {p.activity.length === 0 && <p className="small muted">Changes you make appear here.</p>}
          <ul className="activity">
            {p.activity.slice(0, 6).map((a) => (
              <li key={a.id}><span className={`act-dot act-${a.kind}`} /><span className="act-text">{a.text}</span><span className="act-time">{fmt.relative(a.at)}</span></li>
            ))}
          </ul>
        </Card>
      </div>
      </Band>
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
