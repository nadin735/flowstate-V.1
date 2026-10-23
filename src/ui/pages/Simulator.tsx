import React, { useState } from "react";
import { LuRotateCcw, LuStar, LuTriangleAlert, LuLink, LuUnlink, LuWandSparkles, LuInfo } from "react-icons/lu";
import { useStore } from "../state/store";
import { Badge, Button, Card, DataTag, NumberInput, PageHeader, Segmented, cx } from "../components/ui";
import { GroupedBars, LineChart } from "../components/charts";
import { fmt } from "../format";
import { FORMULAS, SENSITIVITY_FACTORS, processBaseline, resolveInputs, sensitivity, type ScenarioResult } from "../../domain/finance";
import { scenariosAreEmpty } from "../../domain/template";
import type { Scenario } from "../../domain/types";

const COLORS: Record<Scenario["id"], string> = { optimization: "var(--c3)", automation: "var(--c1)", transformation: "var(--c2)" };

export function SimulatorPage() {
  const { project: p, dispatch, results, toast } = useStore();
  const [active, setActive] = useState<Scenario["id"]>(p.selectedScenario);
  const base = processBaseline(p.process);
  const a = p.assumptions;
  const inputs = resolveInputs(p.process, a);
  const scen = p.scenarios.find((s) => s.id === active)!;
  const res = results.find((r) => r.scenarioId === active)!;
  const upd = (patch: Partial<Scenario>) => dispatch({ type: "updateScenario", id: active, patch });
  const ua = (patch: Partial<typeof a>) => dispatch({ type: "updateAssumptions", patch });

  type Row = { label: string; get: (r: ScenarioResult) => number | null; f: (n: number | null) => string; better: "high" | "low"; hint?: string };
  const rows: Row[] = [
    { label: "Current monthly cost", get: (r) => r.currentMonthlyCost, f: (n) => fmt.eur(n), better: "low" },
    { label: "Future monthly cost (incl. operating)", get: (r) => r.futureMonthlyTotalCost, f: (n) => fmt.eur(n), better: "low" },
    { label: "Labour savings (realised)", get: (r) => r.labourSavingsRealised, f: (n) => fmt.eur(n), better: "high" },
    { label: "Early-payment discount benefit", get: (r) => r.discountBenefit, f: (n) => fmt.eur(n), better: "high" },
    { label: "Monthly net savings", get: (r) => r.monthlyNetSavings, f: (n) => fmt.eur(n), better: "high" },
    { label: "Annualised net savings", get: (r) => r.annualNetSavings, f: (n) => fmt.eur(n), better: "high" },
    { label: "Initial investment", get: (r) => -(p.scenarios.find((s) => s.id === r.scenarioId)!.initialInvestment), f: (n) => fmt.eur(n === null ? null : -n), better: "high" },
    { label: "First-year net benefit", get: (r) => r.firstYearNetBenefit, f: (n) => fmt.eur(n), better: "high" },
    { label: "ROI · 12 months from go-live", get: (r) => r.roiFirstYear, f: (n) => fmt.pct(n), better: "high" },
    { label: `ROI · ${a.roiHorizonMonths} months from go-live`, get: (r) => r.roiHorizon, f: (n) => fmt.pct(n), better: "high" },
    { label: `NPV · ${a.roiHorizonMonths} months @ ${fmt.pct(a.wacc)} WACC`, get: (r) => r.npv, f: (n) => fmt.eur(n), better: "high" },
    { label: "Payback after go-live", get: (r) => r.paybackMonths, f: (n) => fmt.months(n), better: "low" },
    { label: "Payback from project start", get: (r) => r.paybackFromStartMonths, f: (n) => fmt.months(n), better: "low" },
    { label: "Freed capacity (FTE)", get: (r) => r.freedFte, f: (n) => fmt.num(n, 1), better: "high" },
    { label: "Processing-time reduction", get: (r) => r.processingTimeReduction, f: (n) => fmt.pct(n), better: "high" },
    { label: "Estimated error reduction", get: (r) => r.errorReduction, f: (n) => fmt.pct(n), better: "high" },
    { label: "Cycle time (days)", get: (r) => r.futureCycleTimeDays, f: (n) => fmt.num(n, 1), better: "low" },
  ];
  const best = (row: Row) => {
    const vals = results.map((r) => row.get(r)).map((v) => (v === null ? (row.better === "low" ? Infinity : -Infinity) : v));
    const target = row.better === "high" ? Math.max(...vals) : Math.min(...vals);
    const allEqual = vals.every((v) => v === vals[0]);
    return allEqual || !Number.isFinite(target) ? null : vals.indexOf(target);
  };

  const horizon = a.roiHorizonMonths;
  const labels = Array.from({ length: horizon + 1 }, (_, i) => (i === 0 ? "Go-live" : `M${i}`));
  const allWarnings = Array.from(new Set(results.flatMap((r) => r.warnings.map((w) => `${p.scenarios.find((s) => s.id === r.scenarioId)!.name}: ${w}`))));

  const plug = [
    `${fmt.num(inputs.monthlyVolume)} × (${fmt.num(inputs.minutesPerInvoice, 1)} ÷ 60 + ${fmt.pct(inputs.errorRate, 1)} × ${fmt.num(inputs.reworkMinutesPerError, 0)} ÷ 60) × ${fmt.eur(inputs.hourlyCost)} = ${fmt.eur(res.currentMonthlyCost)}`,
    `${fmt.num(inputs.minutesPerInvoice, 1)} × (1 − ${fmt.pct(scen.processEfficiencyGain)}) × (1 − ${fmt.pct(scen.automationShare)} × (1 − ${fmt.pct(a.residualEffortOnAutomated)})) = ${fmt.num(res.futureMinutesPerInvoice, 2)} min`,
    `${fmt.pct(inputs.errorRate, 1)} × (1 − ${fmt.pct(scen.processErrorGain)}) × (1 − ${fmt.pct(scen.automationShare)} × ${fmt.pct(a.automationErrorReduction)}) = ${fmt.pct(res.futureErrorRate, 2)}`,
    `(${fmt.eur(res.currentMonthlyCost)} − ${fmt.eur(res.futureMonthlyProcessCost)}) × ${fmt.pct(a.capacityRealisation)} = ${fmt.eur(res.labourSavingsRealised)}`,
    a.avgInvoiceValue > 0 ? `${fmt.num(inputs.monthlyVolume)} × ${fmt.eur(a.avgInvoiceValue)} × ${fmt.pct(a.discountEligibleShare)} × (${fmt.pct(a.discountRate, 1)} − ${fmt.pct(a.wacc, 1)} × ${a.discountDaysEarlier} ÷ 365 = ${fmt.pct(res.netDiscountRate, 2)}) × (${fmt.pct(scen.discountCaptureTarget)} − ${fmt.pct(a.discountCapturedToday)}) = ${fmt.eur(res.discountBenefit)}` : "Average invoice value not entered → discount benefit 0",
    `${fmt.eur(res.labourSavingsRealised)} + ${fmt.eur(res.discountBenefit)} − ${fmt.eur(scen.monthlyOperatingCost)} = ${fmt.eur(res.monthlyNetSavings)}`,
    `${fmt.eur(res.monthlyNetSavings)} × 12 = ${fmt.eur(res.annualNetSavings)}`,
    `${fmt.eur(res.firstYearNetBenefit + scen.initialInvestment)} (12 months, ${a.rampUpMonths}-month ramp-up) − ${fmt.eur(scen.initialInvestment)} = ${fmt.eur(res.firstYearNetBenefit)}`,
    res.roiFirstYear === null ? "Investment is 0 → ROI not defined" : `${fmt.eur(res.firstYearNetBenefit)} ÷ ${fmt.eur(scen.initialInvestment)} = ${fmt.pct(res.roiFirstYear)}`,
    res.paybackMonths === null ? "Monthly net savings ≤ 0 → investment is never recovered" : `${fmt.months(res.paybackMonths)} after go-live + ${res.implementationMonths} months implementation = ${fmt.months(res.paybackFromStartMonths)} from start`,
    `−${fmt.eur(scen.initialInvestment)} + discounted cash flows over ${a.roiHorizonMonths} months @ ${fmt.pct(a.wacc)} = ${fmt.eur(res.npv)}`,
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Scenario Simulator"
        title="Compare 3 transformation options"
        description={<>Every number recalculates instantly. ROI counts from go-live with a {a.rampUpMonths}-month ramp-up; payback is also shown from project start. All outputs are <DataTag kind="estimate" />.</>}
        actions={<>
          <Button icon={<LuWandSparkles />} onClick={() => { dispatch({ type: "applyBenchmarks" }); toast({ tone: "info", title: "Benchmark values loaded", body: "Typical levers and costs scaled to your invoice volume — replace with vendor quotes." }); }}>Load benchmark values</Button>
          <Button icon={<LuRotateCcw />} onClick={() => { dispatch({ type: "resetScenarios" }); toast({ tone: "info", title: "Scenario levers cleared" }); }}>Clear levers</Button>
        </>}
      />

      {scenariosAreEmpty(p.scenarios) && (
        <div className="callout callout-info" role="status"><LuInfo aria-hidden /><div>All scenario levers are empty, so there are no savings yet. <button className="link-btn" onClick={() => dispatch({ type: "applyBenchmarks" })}>Load benchmark values</button> as a starting point, or set the levers yourself.</div></div>
      )}
      {allWarnings.length > 0 && (
        <div className="callout callout-warning" role="status"><LuTriangleAlert aria-hidden /><div>{allWarnings.map((w) => <div key={w}>{w}</div>)}</div></div>
      )}

      <div className="grid-sim">
        <Card title="Baseline inputs" subtitle="Shared by all scenarios">
          <NumberInput label="Monthly invoice volume" value={a.monthlyVolume} min={0} max={1000000} step={100} sliderMax={20000} slider onChange={(v) => dispatch({ type: "setVolume", volume: v })} />
          <NumberInput
            label="Processing time per invoice" unit="min" value={inputs.minutesPerInvoice} min={0.5} max={480} step={0.5} sliderMax={45} slider
            onChange={(v) => ua({ processingMinutesOverride: v })}
            aside={a.processingMinutesOverride === null ? <span className="link-tag"><LuLink aria-hidden /> from process map</span> : <button className="link-tag link-tag-btn" onClick={() => ua({ processingMinutesOverride: null })}><LuUnlink aria-hidden /> override · relink</button>}
          />
          <NumberInput label="Labour cost per hour (fully loaded)" unit="€" value={a.hourlyCost} min={0} max={500} step={1} sliderMax={120} slider onChange={(v) => ua({ hourlyCost: v })} />
          <NumberInput label="Average invoice value" unit="€" value={a.avgInvoiceValue} min={0} max={10000000} step={50} sliderMax={20000} slider onChange={(v) => ua({ avgInvoiceValue: v })} hint="Needed for the early-payment discount benefit." />
          <NumberInput
            label="Current error rate" unit="%" value={inputs.errorRate} scale={100} min={0} max={0.6} step={0.001} digits={1} slider
            onChange={(v) => ua({ errorRateOverride: v })}
            aside={a.errorRateOverride === null ? <span className="link-tag"><LuLink aria-hidden /> from process map</span> : <button className="link-tag link-tag-btn" onClick={() => ua({ errorRateOverride: null })}><LuUnlink aria-hidden /> override · relink</button>}
          />
          <details className="adv">
            <summary>Model assumptions</summary>
            <NumberInput label="Residual effort on automated work" unit="%" value={a.residualEffortOnAutomated} scale={100} min={0} max={1} step={0.01} onChange={(v) => ua({ residualEffortOnAutomated: v })} hint="Exception handling and monitoring that remains." />
            <NumberInput label="Error reduction on automated work" unit="%" value={a.automationErrorReduction} scale={100} min={0} max={1} step={0.01} onChange={(v) => ua({ automationErrorReduction: v })} />
            <NumberInput label="Capacity realisation" unit="%" value={a.capacityRealisation} scale={100} min={0} max={1} step={0.01} onChange={(v) => ua({ capacityRealisation: v })} hint="Share of freed hours that becomes real cost savings (redeployment, attrition, fewer temps)." />
            <NumberInput label="Invoices with discount terms" unit="%" value={a.discountEligibleShare} scale={100} min={0} max={1} step={0.01} onChange={(v) => ua({ discountEligibleShare: v })} />
            <NumberInput label="Early-payment discount rate" unit="%" value={a.discountRate} scale={100} min={0} max={0.1} step={0.001} digits={1} onChange={(v) => ua({ discountRate: v })} />
            <NumberInput label="Discounts captured today" unit="%" value={a.discountCapturedToday} scale={100} min={0} max={1} step={0.01} onChange={(v) => ua({ discountCapturedToday: v })} />
            <NumberInput label="Benefit ramp-up after go-live" unit="months" value={a.rampUpMonths} min={0} max={12} step={1} onChange={(v) => ua({ rampUpMonths: Math.round(v) })} />
            <NumberInput label="Days paid earlier for the discount" unit="days" value={a.discountDaysEarlier} min={0} max={120} step={1} digits={0} onChange={(v) => ua({ discountDaysEarlier: v })} hint="Paying earlier ties up cash; financed at WACC and netted off the discount." />
            <NumberInput label="WACC for NPV" unit="%" value={a.wacc} scale={100} min={0} max={0.3} step={0.005} digits={1} onChange={(v) => ua({ wacc: v })} />
            <NumberInput label="Extended ROI horizon" unit="months" value={a.roiHorizonMonths} min={12} max={60} step={6} onChange={(v) => ua({ roiHorizonMonths: Math.round(v) })} />
            <div className="small muted">Rework per error ({fmt.num(base.reworkMinutesPerError, 0)} min) is derived from the process map.</div>
          </details>
        </Card>

        <div className="stack">
          <Card title="Scenario levers" pad={false} actions={<Segmented label="Scenario" value={active} onChange={setActive} options={p.scenarios.map((s) => ({ value: s.id, label: s.name }))} />}>
            <div className="card-body">
              <div className="scen-head">
                <span className="scen-dot" style={{ background: COLORS[active] }} />
                <p className="small muted">{scen.summary}</p>
                {p.selectedScenario === active ? <Badge tone="accent">Preferred</Badge> : <Button size="sm" icon={<LuStar />} onClick={() => dispatch({ type: "selectScenario", id: active })}>Set as preferred</Button>}
              </div>
              <div className="form-grid">
                <NumberInput label="Automation of manual work" unit="%" value={scen.automationShare} scale={100} min={0} max={1} step={0.01} slider onChange={(v) => upd({ automationShare: v })} />
                <NumberInput label="Initial investment" unit="€" value={scen.initialInvestment} min={0} max={5000000} step={1000} sliderMax={1000000} slider onChange={(v) => upd({ initialInvestment: v })} />
                <NumberInput label="Monthly operating cost" unit="€" value={scen.monthlyOperatingCost} min={0} max={200000} step={100} sliderMax={30000} slider onChange={(v) => upd({ monthlyOperatingCost: v })} />
                <NumberInput label="Efficiency gain from redesign" unit="%" value={scen.processEfficiencyGain} scale={100} min={0} max={0.9} step={0.01} slider onChange={(v) => upd({ processEfficiencyGain: v })} />
                <NumberInput label="Error reduction from redesign" unit="%" value={scen.processErrorGain} scale={100} min={0} max={1} step={0.01} slider onChange={(v) => upd({ processErrorGain: v })} />
                <NumberInput label="Waiting-time reduction" unit="%" value={scen.waitTimeReduction} scale={100} min={0} max={1} step={0.01} slider onChange={(v) => upd({ waitTimeReduction: v })} />
                <NumberInput label="Discount capture after change" unit="%" value={scen.discountCaptureTarget} scale={100} min={0} max={1} step={0.01} slider onChange={(v) => upd({ discountCaptureTarget: v })} hint={a.avgInvoiceValue > 0 ? `Today: ${fmt.pct(a.discountCapturedToday)}` : "Enter the average invoice value to value this lever"} />
              </div>
            </div>
          </Card>

        </div>
      </div>

      <SensitivityCard />

      <Card title="Side-by-side results" pad={false} actions={<DataTag kind="estimate" />}>
        <div className="table-wrap">
          <table className="table sim-table">
            <thead>
              <tr>
                <th>Metric</th>
                {p.scenarios.map((s) => (
                  <th key={s.id} className={cx("num", s.id === active && "col-on")}>
                    <button className="th-btn" onClick={() => setActive(s.id)}><span className="scen-dot" style={{ background: COLORS[s.id] }} />{s.name}{p.selectedScenario === s.id && <LuStar className="star" aria-label="preferred" />}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const b = best(row);
                return (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    {results.map((r, i) => {
                      const v = row.get(r);
                      const neg = v !== null && v < 0 && row.better === "high" && row.label !== "Initial investment";
                      return <td key={r.scenarioId} className={cx("num", r.scenarioId === active && "col-on", b === i && "cell-best", neg && "cell-neg")}>{row.f(v)}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card-foot small muted">Highlighted cells mark the best value per row. Negative values are shown in red.</div>
      </Card>

      <div className="grid-2">
        <Card title="Monthly cost: today vs. after change" actions={<DataTag kind="estimate" />}>
          <GroupedBars
            ariaLabel="Monthly cost per scenario"
            format={(n) => fmt.eurCompact(n)}
            keys={[{ label: "Today", color: "var(--muted-bar)" }, { label: "Labour after change", color: "var(--c1)" }, { label: "Operating cost", color: "var(--c2)" }]}
            groups={results.map((r) => ({ label: p.scenarios.find((s) => s.id === r.scenarioId)!.name.split(" ")[0], values: [r.currentMonthlyCost, r.futureMonthlyProcessCost, r.monthlyOperatingCost] }))}
          />
        </Card>
        <Card title="Cumulative net cash flow from go-live" actions={<DataTag kind="estimate" />}>
          <LineChart
            ariaLabel="Cumulative cash flow per scenario"
            labels={labels}
            format={(n) => fmt.eurCompact(n)}
            series={results.map((r) => ({ key: r.scenarioId, label: p.scenarios.find((s) => s.id === r.scenarioId)!.name, color: COLORS[r.scenarioId], values: r.cumulativeCashFlow }))}
            refLines={[{ value: 0, label: "Break-even", color: "var(--text-3)" }]}
          />
        </Card>
      </div>

      {p.preferences.showFormulas && (
        <Card title="Formulas with current values" subtitle={`Scenario: ${scen.name}`}>
          <ol className="formulas">
            {FORMULAS.map((f, i) => (
              <li key={f.label}>
                <div className="f-label">{f.label}</div>
                <code className="f-formula">{f.formula}</code>
                <code className="f-plug">{plug[i]}</code>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

function SensitivityCard() {
  const { project: p } = useStore();
  const scen = p.scenarios.find((s) => s.id === p.selectedScenario)!;
  const cases = sensitivity(resolveInputs(p.process, p.assumptions), scen);
  const f = SENSITIVITY_FACTORS;
  const metric: { label: string; get: (r: ScenarioResult) => number | null; fmt: (n: number | null) => string }[] = [
    { label: "Annualised net savings", get: (r) => r.annualNetSavings, fmt: (n) => fmt.eur(n) },
    { label: "First-year net benefit", get: (r) => r.firstYearNetBenefit, fmt: (n) => fmt.eur(n) },
    { label: `NPV · ${p.assumptions.roiHorizonMonths} months`, get: (r) => r.npv, fmt: (n) => fmt.eur(n) },
    { label: "Payback from project start", get: (r) => r.paybackFromStartMonths, fmt: (n) => fmt.months(n) },
  ];
  return (
    <Card title="Sensitivity" subtitle={`Preferred scenario: ${scen.name}. How robust is the business case if assumptions miss?`} pad={false} actions={<DataTag kind="estimate" />}>
      <div className="table-wrap">
        <table className="table sens-table">
          <thead><tr><th>Metric</th>{cases.map((c) => <th key={c.label} className={cx("num", c.label === "Base" && "col-on")}>{c.label}</th>)}</tr></thead>
          <tbody>
            {metric.map((m) => (
              <tr key={m.label}>
                <td>{m.label}</td>
                {cases.map((c) => { const v = m.get(c.result); return <td key={c.label} className={cx("num", c.label === "Base" && "col-on strong", v !== null && v < 0 && m.label !== "Payback from project start" && "cell-neg")}>{m.fmt(v)}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-foot small muted"><LuInfo aria-hidden /> Pessimistic: levers ×{f.pessimistic.levers}, investment ×{f.pessimistic.investment}, running cost ×{f.pessimistic.opex}, capacity realisation ×{f.pessimistic.realisation}, discount gain ×{f.pessimistic.discountGap}. Optimistic: levers ×{f.optimistic.levers}, investment ×{f.optimistic.investment}, running cost ×{f.optimistic.opex}, realisation ×{f.optimistic.realisation} (max 100 %).</div>
    </Card>
  );
}
