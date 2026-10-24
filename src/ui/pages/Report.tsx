import React, { useRef } from "react";
import { LuPrinter, LuDownload } from "react-icons/lu";
import { useStore } from "../state/store";
import { Button, PageHeader } from "../components/ui";
import { fmt } from "../format";
import { BenchmarkCard } from "../components/BenchmarkCard";
import { FORMULAS, processBaseline, resolveInputs, sensitivity, stepMetrics } from "../../domain/finance";
import { milestoneDone, phaseProgress, projectHealth } from "../../domain/roadmap";
import { kpiSummaries } from "../../domain/kpi";
import { formatKpi } from "./Analytics";
import { setupStatus } from "../../domain/template";
import { canSaveFiles, saveFile } from "../ai/downloads";

export function ReportPage() {
  const { project: p, results, selectedResult: r, today, toast } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const base = processBaseline(p.process);
  const metrics = stepMetrics(p.process, p.assumptions.hourlyCost);
  const scen = p.scenarios.find((s) => s.id === p.selectedScenario)!;
  const range = sensitivity(resolveInputs(p.process, p.assumptions), scen);
  const health = projectHealth(p, today);
  const kpis = kpiSummaries(p);
  const run = p.recommendationRuns[0];
  const bottleneck = [...metrics].sort((a, b) => b.bottleneckScore - a.bottleneckScore)[0];
  const bnStep = p.process.steps.find((s) => s.id === bottleneck.stepId)!;
  const longestWait = [...p.process.steps].sort((a, b) => b.waitDays - a.waitDays)[0];
  const healthText = { "no-plan": "not yet planned", "on-track": "on track", "at-risk": "at risk", "off-track": "off track" }[health.health];

  const [busy, setBusy] = React.useState(false);
  const downloadPdf = async () => {
    if (!ref.current || busy) return;
    setBusy(true);
    const name = `flowstate-report-${today}.pdf`;
    try {
      const { reportToPdf } = await import("../report/pdf");
      const bytes = await reportToPdf(ref.current, { title: `${p.name || "Transformation report"} — FLOWSTATE`, subtitle: p.company.name || undefined });
      const ok = await saveFile(name, bytes, "application/pdf");
      if (ok) toast({ tone: "success", title: "PDF saved", body: `${name} — opens in any PDF viewer, also on your phone.` });
    } catch (e) {
      toast({ tone: "error", title: "PDF could not be created", body: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };
  const [canSave, setCanSave] = React.useState(!__RESTRICTED_HOST__);
  React.useEffect(() => {
    canSaveFiles().then(setCanSave);
  }, []);

  return (
    <div className="page">
      <div className="no-print">
        <PageHeader
          eyebrow="Report"
          title="Transformation report"
          description="A complete summary of the current project. Download it as a PDF to read, share or print — it opens in any PDF viewer, also on your phone."
          actions={__RESTRICTED_HOST__ ? (
            canSave ? <Button variant="primary" icon={<LuDownload />} onClick={downloadPdf} disabled={busy}>{busy ? "Creating PDF…" : "Download PDF"}</Button> : <span className="small muted export-note">Saving files is not available in this view. Run the full app (<code>npm start</code>) to export.</span>
          ) : <>
            <Button variant="primary" icon={<LuDownload />} onClick={downloadPdf} disabled={busy}>{busy ? "Creating PDF…" : "Download PDF"}</Button>
            <Button icon={<LuPrinter />} onClick={() => window.print()}>Print</Button>
          </>}
        />
      </div>

      <div className="report" ref={ref}>
        <header className="rp-cover">
          <div className="rp-brand">FLOWSTATE · Transformation report</div>
          <h1>{p.name}</h1>
          <div className="rp-sub">{[p.company.name, p.company.industry, p.company.country].filter(Boolean).join(" · ") || "Company details not entered"}</div>
          <div className="rp-meta">
            <span>Prepared {fmt.date(today)}</span>{p.sponsor && <span>Sponsor: {p.sponsor}</span>}{p.lead && <span>Lead: {p.lead}</span>}<span>Target go-live: {fmt.date(p.targetGoLive)}</span>
          </div>
          <div className="rp-disclaimer">Savings and ROI are model estimates based on the stated assumptions, not measured outcomes.</div>
        </header>

        {!setupStatus(p).ready && <div className="rp-disclaimer">Process inputs are incomplete, so most figures in this report are still zero. Complete the setup on the Overview page first.</div>}
        <section>
          <h2>1. Executive summary</h2>
          <p>
            {p.company.name || "The company"} processes about <b>{fmt.num(p.process.monthlyVolume)}</b> supplier invoices per month with an average handling time of <b>{fmt.num(base.minutesPerInvoice, 1)} minutes</b> and an end-to-end cycle time of <b>{fmt.num(base.cycleTimeDays, 1)} business days</b>.
            The estimated labour cost of the process is <b>{fmt.eur(r.currentMonthlyCost)} per month</b> ({fmt.eur(r.currentCostPerInvoice, 2)} per invoice, ≈{fmt.num(r.currentFte, 1)} FTE).
            The largest cost driver is <b>{bnStep.name}</b> ({fmt.pct(bottleneck.costShare)} of cost); the longest wait occurs in <b>{longestWait.name}</b> ({fmt.num(longestWait.waitDays, 1)} days).
          </p>
          <p>
            The preferred option, <b>{scen.name}</b>, requires an estimated investment of <b>{fmt.eur(scen.initialInvestment)}</b> and {fmt.eur(scen.monthlyOperatingCost)} per month in operating cost.
            At full benefit level it is estimated to deliver <b>{fmt.eur(r.monthlyNetSavings)} net savings per month</b> ({fmt.eur(r.annualNetSavings)} annualised; range {fmt.eur(range[0].result.annualNetSavings)} – {fmt.eur(range[2].result.annualNetSavings)}): {fmt.eur(r.labourSavingsRealised)} realised labour savings ({fmt.pct(p.assumptions.capacityRealisation)} of {fmt.eur(r.labourSavingsGross)} freed, ≈{fmt.num(r.freedFte, 1)} FTE) plus {fmt.eur(r.discountBenefit)} additional early-payment discounts, minus operating cost.
            The investment pays back <b>{fmt.months(r.paybackFromStartMonths)}</b> after project start ({fmt.months(r.paybackMonths)} after go-live, with a {p.assumptions.rampUpMonths}-month ramp-up). NPV over {r.roiHorizonMonths} months at {fmt.pct(p.assumptions.wacc)} WACC: <b>{fmt.eur(r.npv)}</b>; ROI {fmt.pct(r.roiFirstYear)} in the first 12 months after go-live.
            Handling time per invoice falls by an estimated {fmt.pct(r.processingTimeReduction)} and errors by {fmt.pct(r.errorReduction)}.
          </p>
          <p>The project is <b>{healthText}</b> at {fmt.pct(health.progress)} completion (planned: {fmt.pct(health.plannedProgress)}){health.reasons.length ? ` — ${health.reasons.join(", ")}` : ""}.</p>
        </section>

        <section>
          <h2>2. Current process baseline</h2>
          <table className="table rp-table">
            <thead><tr><th>Step</th><th className="num">Minutes</th><th className="num">Automated</th><th className="num">Error rate</th><th className="num">Wait (days)</th><th className="num">Cost / month*</th><th className="num">Bottleneck</th></tr></thead>
            <tbody>
              {p.process.steps.map((s) => {
                const m = metrics.find((x) => x.stepId === s.id)!;
                return <tr key={s.id}><td>{s.name}</td><td className="num">{fmt.num(s.minutesPerInvoice, 1)}</td><td className="num">{fmt.pct(s.automatedShare)}</td><td className="num">{fmt.pct(s.errorRate, 1)}</td><td className="num">{fmt.num(s.waitDays, 1)}</td><td className="num">{fmt.eur(m.monthlyCost)}</td><td className="num">{m.bottleneckScore}{m.isBottleneck ? " ●" : ""}</td></tr>;
              })}
              <tr className="rp-total"><td>Total</td><td className="num">{fmt.num(base.minutesPerInvoice, 1)}</td><td className="num">{fmt.pct(base.automationRate)}</td><td className="num">{fmt.pct(base.errorRate, 1)}</td><td className="num">{fmt.num(base.cycleTimeDays, 1)}**</td><td className="num">{fmt.eur(r.currentMonthlyCost)}</td><td /></tr>
            </tbody>
          </table>
          <p className="rp-note">* Estimate incl. rework at {fmt.eur(p.assumptions.hourlyCost)}/h. ** End-to-end cycle time incl. handling. Error rate total = probability of at least one error.</p>
          <h3>Industry benchmarks</h3>
          <BenchmarkCard print values={{
            targetName: scen.name,
            today: { costPerInvoice: r.currentCostPerInvoice ?? 0, cycleTimeDays: r.currentCycleTimeDays, automationRate: base.automationRate, exceptionRate: r.currentErrorRate },
            target: { costPerInvoice: r.futureCostPerInvoice ?? 0, cycleTimeDays: r.futureCycleTimeDays, automationRate: base.automationRate + (1 - base.automationRate) * scen.automationShare, exceptionRate: r.futureErrorRate },
          }} />
        </section>

        <section>
          <h2>3. Scenario comparison</h2>
          <table className="table rp-table">
            <thead><tr><th>Metric</th>{p.scenarios.map((s) => <th key={s.id} className="num">{s.name}{s.id === p.selectedScenario ? " ★" : ""}</th>)}</tr></thead>
            <tbody>
              <tr><td>Automation of manual work</td>{p.scenarios.map((s) => <td key={s.id} className="num">{fmt.pct(s.automationShare)}</td>)}</tr>
              <tr><td>Initial investment</td>{p.scenarios.map((s) => <td key={s.id} className="num">{fmt.eur(s.initialInvestment)}</td>)}</tr>
              <tr><td>Monthly operating cost</td>{p.scenarios.map((s) => <td key={s.id} className="num">{fmt.eur(s.monthlyOperatingCost)}</td>)}</tr>
              <tr><td>Future monthly cost (total)</td>{results.map((x) => <td key={x.scenarioId} className="num">{fmt.eur(x.futureMonthlyTotalCost)}</td>)}</tr>
              <tr><td>Labour savings (realised)</td>{results.map((x) => <td key={x.scenarioId} className="num">{fmt.eur(x.labourSavingsRealised)}</td>)}</tr>
              <tr><td>Early-payment discount benefit</td>{results.map((x) => <td key={x.scenarioId} className="num">{fmt.eur(x.discountBenefit)}</td>)}</tr>
              <tr><td>Monthly net savings</td>{results.map((x) => <td key={x.scenarioId} className="num">{fmt.eur(x.monthlyNetSavings)}</td>)}</tr>
              <tr><td>NPV ({p.assumptions.roiHorizonMonths} months @ {fmt.pct(p.assumptions.wacc)})</td>{results.map((x) => <td key={x.scenarioId} className="num">{fmt.eur(x.npv)}</td>)}</tr>
              <tr><td>First-year net benefit</td>{results.map((x) => <td key={x.scenarioId} className="num">{fmt.eur(x.firstYearNetBenefit)}</td>)}</tr>
              <tr><td>ROI (12 months)</td>{results.map((x) => <td key={x.scenarioId} className="num">{fmt.pct(x.roiFirstYear)}</td>)}</tr>
              <tr><td>ROI ({p.assumptions.roiHorizonMonths} months)</td>{results.map((x) => <td key={x.scenarioId} className="num">{fmt.pct(x.roiHorizon)}</td>)}</tr>
              <tr><td>Payback after go-live</td>{results.map((x) => <td key={x.scenarioId} className="num">{fmt.months(x.paybackMonths)}</td>)}</tr>
              <tr><td>Payback from project start</td>{results.map((x) => <td key={x.scenarioId} className="num">{fmt.months(x.paybackFromStartMonths)}</td>)}</tr>
              <tr><td>Freed capacity (FTE)</td>{results.map((x) => <td key={x.scenarioId} className="num">{fmt.num(x.freedFte, 1)}</td>)}</tr>
              <tr><td>Processing-time reduction</td>{results.map((x) => <td key={x.scenarioId} className="num">{fmt.pct(x.processingTimeReduction)}</td>)}</tr>
              <tr><td>Error reduction</td>{results.map((x) => <td key={x.scenarioId} className="num">{fmt.pct(x.errorReduction)}</td>)}</tr>
            </tbody>
          </table>
          <h3>Sensitivity — {scen.name}</h3>
          <table className="table rp-table">
            <thead><tr><th>Metric</th>{range.map((c) => <th key={c.label} className="num">{c.label}</th>)}</tr></thead>
            <tbody>
              <tr><td>Annualised net savings</td>{range.map((c) => <td key={c.label} className="num">{fmt.eur(c.result.annualNetSavings)}</td>)}</tr>
              <tr><td>NPV</td>{range.map((c) => <td key={c.label} className="num">{fmt.eur(c.result.npv)}</td>)}</tr>
              <tr><td>Payback from project start</td>{range.map((c) => <td key={c.label} className="num">{fmt.months(c.result.paybackFromStartMonths)}</td>)}</tr>
            </tbody>
          </table>
          <h3>Formulas and assumptions</h3>
          <ul className="rp-list">
            {FORMULAS.map((f) => <li key={f.label}><b>{f.label}:</b> {f.formula}</li>)}
            <li><b>Assumptions:</b> {fmt.eur(p.assumptions.hourlyCost)}/h fully loaded; capacity realisation {fmt.pct(p.assumptions.capacityRealisation)}; residual effort on automated work {fmt.pct(p.assumptions.residualEffortOnAutomated)}; error reduction on automated work {fmt.pct(p.assumptions.automationErrorReduction)}; rework {fmt.num(base.reworkMinutesPerError, 0)} min per error; average invoice value {fmt.eur(p.assumptions.avgInvoiceValue)}, {fmt.pct(p.assumptions.discountEligibleShare)} with {fmt.pct(p.assumptions.discountRate, 1)} discount terms for paying {p.assumptions.discountDaysEarlier} days earlier (net of financing at WACC), {fmt.pct(p.assumptions.discountCapturedToday)} captured today; {p.assumptions.rampUpMonths}-month benefit ramp-up; WACC {fmt.pct(p.assumptions.wacc)}. ROI periods start at go-live.</li>
          </ul>
        </section>

        <section className="rp-break">
          <h2>4. Recommended interventions</h2>
          {run ? (
            <>
              <p className="rp-note">Source: {run.source === "llm" ? `AI model ${run.model}` : "rule engine (no AI model)"} · Problem: {run.problem} · Constraints: {run.constraints.join(", ") || "none"}</p>
              {run.items.map((rec) => (
                <div key={rec.id} className="rp-rec">
                  <h3>{rec.title} {p.adoptedRecommendationIds.includes(rec.id) && <span className="rp-tag">On roadmap</span>}</h3>
                  <p><b>Problem:</b> {rec.problemStatement} <b>Root cause:</b> {rec.rootCause}</p>
                  <p><b>Solution:</b> {rec.solution}</p>
                  <p><b>Impact (estimate):</b> {rec.impact} · {fmt.eur(rec.monthlySavings)}/month net · investment {fmt.eur(rec.investment)} · {rec.complexity} complexity · {rec.implementationWeeks} weeks</p>
                  <p><b>Risks:</b> {rec.risks.join("; ")}. <b>Success metrics:</b> {rec.successMetrics.join("; ")}.</p>
                </div>
              ))}
            </>
          ) : <p>No recommendations generated yet.</p>}
        </section>

        <section>
          <h2>5. Roadmap & delivery status</h2>
          <table className="table rp-table">
            <thead><tr><th>Phase</th><th>Period</th><th className="num">Progress</th><th>Milestone</th><th>Status</th></tr></thead>
            <tbody>
              {p.phases.map((ph) => {
                const ms = p.milestones.find((m) => m.phaseId === ph.id);
                const done = ms ? milestoneDone(ms, p.tasks) : false;
                return <tr key={ph.id}><td>{ph.order}. {ph.name}</td><td>{fmt.shortDate(ph.start)} – {fmt.shortDate(ph.end)}</td><td className="num">{fmt.pct(phaseProgress(ph, p.tasks))}</td><td>{ms?.name ?? "—"} ({ms ? fmt.shortDate(ms.due) : ""})</td><td>{done ? "Reached" : ms && ms.due < today ? "Overdue" : "Open"}</td></tr>;
              })}
            </tbody>
          </table>
          <p>Tasks: {p.tasks.filter((t) => t.status === "done").length} done, {p.tasks.filter((t) => t.status === "in_progress").length} in progress, {health.blockedTasks.length} blocked, {health.overdueTasks.length} overdue of {p.tasks.length}. Implementation budget {fmt.eur(health.budgetTotal)}.</p>
          {health.overdueTasks.length > 0 && <ul className="rp-list">{health.overdueTasks.map((t) => <li key={t.id}>Overdue: {t.title} (due {fmt.date(t.due)}, {t.owner})</li>)}</ul>}
          <h3>Top risks</h3>
          <ul className="rp-list">{p.risks.filter((x) => x.status !== "closed").map((x) => <li key={x.id}><b>{x.title}</b> (P: {x.probability}, I: {x.impact}) — {x.mitigation}</li>)}</ul>
        </section>

        <section>
          <h2>6. KPI targets</h2>
          <table className="table rp-table">
            <thead><tr><th>KPI</th><th className="num">Baseline</th><th className="num">Latest (measured)</th><th className="num">Target (simulated)</th></tr></thead>
            <tbody>{kpis.map((k) => <tr key={k.def.key}><td>{k.def.label}</td><td className="num">{k.def.key === "monthlySavings" ? "—" : formatKpi(k.def, k.baseline)}</td><td className="num">{formatKpi(k.def, k.latest)}</td><td className="num">{formatKpi(k.def, k.target)}</td></tr>)}</tbody>
          </table>
        </section>
        <footer className="rp-foot">Generated by FLOWSTATE · {new Date().toLocaleString(p.preferences.locale)} · Estimates based on the stated assumptions</footer>
      </div>
    </div>
  );
}
