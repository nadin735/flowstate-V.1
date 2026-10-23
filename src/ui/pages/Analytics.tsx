import React, { useMemo, useState } from "react";
import { LuInfo, LuPlus, LuTrash2 } from "react-icons/lu";
import { useStore } from "../state/store";
import { Button, Card, DataTag, Field, NumberInput, PageHeader, Segmented, cx } from "../components/ui";
import { LineChart, Sparkline } from "../components/charts";
import { fmt } from "../format";
import { kpiSummaries, type KpiDef } from "../../domain/kpi";
import { KpiMeasurementSchema, type KpiKey, type KpiMeasurement } from "../../domain/types";
import { addMonths, monthKey } from "../../domain/dates";
import { calculateAll, processBaseline } from "../../domain/finance";

export function formatKpi(def: KpiDef, n: number | null, compact = false): string {
  if (n === null) return "n/a";
  switch (def.unit) {
    case "eur": return compact && def.key !== "costPerInvoice" ? fmt.eurCompact(n) : fmt.eur(n, def.key === "costPerInvoice" ? 2 : 0);
    case "days": return `${fmt.num(n, 1)} d`;
    case "hours": return `${fmt.num(n)} h`;
    case "pct": return fmt.pct(n, 1);
  }
}

export function AnalyticsPage() {
  const { project: p, today } = useStore();
  const [key, setKey] = useState<KpiKey>("costPerInvoice");
  const [range, setRange] = useState<"all" | "actuals" | "projection">("all");
  const summaries = useMemo(() => kpiSummaries(p, 9, today), [p, today]);
  const s = summaries.find((x) => x.def.key === key)!;
  const scen = p.scenarios.find((x) => x.id === p.selectedScenario)!;

  const firstProj = s.series.findIndex((x) => x.actual === null);
  let series = s.series;
  if (range === "actuals") series = s.series.filter((x) => x.actual !== null);
  if (range === "projection") series = s.series.slice(Math.max(0, firstProj - 1));
  const hl = series.findIndex((x) => x.actual === null);

  const savings = summaries.find((x) => x.def.key === "monthlySavings")!;
  const realized = savings.series.filter((x) => x.actual !== null).reduce((t, x) => t + (x.actual ?? 0), 0);
  const realizedMonths = savings.series.filter((x) => x.actual !== null && (x.actual ?? 0) > 0).length;
  const projected12 = savings.target * 12;

  return (
    <div className="page">
      <PageHeader
        eyebrow="KPI & Impact Analytics"
        title="Baseline, actuals and targets"
        description={<>Targets and projections come from the preferred scenario (<b>{scen.name}</b>). Change it in the simulator to update this page.</>}
      />
      <div className="callout callout-info" role="note"><LuInfo aria-hidden /><div>{p.kpis.length ? <><b>Solid lines</b> are the measurements you recorded.</> : <>No measurements recorded yet, so the <b>baseline</b> is derived from your process inputs.</>} <b>Dashed lines</b> are simulated projections: flat until go-live ({fmt.date(p.targetGoLive)}), then a linear 4-month ramp to target.</div></div>

      <div className="kpi-grid" role="tablist" aria-label="Select KPI">
        {summaries.map((k) => {
          const good = k.def.lowerIsBetter ? k.target < k.baseline : k.target > k.baseline;
          return (
            <button key={k.def.key} role="tab" aria-selected={key === k.def.key} className={cx("kpi-card", key === k.def.key && "kpi-on")} onClick={() => setKey(k.def.key)}>
              <div className="kpi-label">{k.def.label}</div>
              <div className="kpi-val">{formatKpi(k.def, k.latest, true)}</div>
              <div className="kpi-row">
                <span className="small muted">Target {formatKpi(k.def, k.target, true)}</span>
                <Sparkline values={k.series.filter((x) => x.actual !== null).map((x) => x.actual as number)} color={good ? "var(--accent-line)" : "var(--warning)"} />
              </div>
            </button>
          );
        })}
      </div>

      <Card title={s.def.label} subtitle={s.def.description} actions={<Segmented label="Range" value={range} onChange={setRange} options={[{ value: "all", label: "All" }, { value: "actuals", label: "Actuals" }, { value: "projection", label: "Projection" }]} />}>
        <LineChart
          ariaLabel={`${s.def.label} over time`}
          labels={series.map((x) => fmt.month(x.month))}
          format={(n) => formatKpi(s.def, n, true)}
          highlightFrom={hl >= 0 ? hl : undefined}
          series={[
            { key: "actual", label: "Actual (measured)", color: "var(--c1)", values: series.map((x) => x.actual) },
            ...(range !== "actuals" ? [{ key: "proj", label: "Projected (simulated)", color: "var(--c2)", dashed: true, values: series.map((x) => x.projected) }] : []),
          ]}
          refLines={[
            ...(s.def.key !== "monthlySavings" ? [{ value: s.baseline, label: "Baseline", color: "var(--text-3)" }] : []),
            { value: s.target, label: "Target", color: "var(--success)" },
          ]}
          height={280}
        />
      </Card>

      <div className="grid-3-2">
        <Card title="Baseline vs. target" pad={false}>
          <div className="table-wrap">
            <table className="table kpi-table">
              <thead><tr><th>KPI</th><th className="num">Baseline</th><th className="num">Latest <DataTag kind="measured" /></th><th className="num">Target <DataTag kind="simulated" /></th><th className="num">Progress</th></tr></thead>
              <tbody>
                {summaries.map((k) => (
                  <tr key={k.def.key} className={cx("row-click", key === k.def.key && "row-on")} onClick={() => setKey(k.def.key)}>
                    <td>{k.def.label}</td>
                    <td className="num muted">{k.def.key === "monthlySavings" ? "—" : formatKpi(k.def, k.baseline)}</td>
                    <td className="num">{formatKpi(k.def, k.latest)}</td>
                    <td className="num strong">{formatKpi(k.def, k.target)}</td>
                    <td className="num">{k.progressToTarget === null ? "—" : <span className="prog-cell"><span className="mini-track"><span style={{ width: `${Math.max(0, Math.min(1, k.progressToTarget)) * 100}%` }} /></span>{fmt.pct(Math.max(0, k.progressToTarget))}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-foot small muted">Baseline = average of the months measured before project start (or the first months if none). Savings count from project start. Progress = share of the baseline-to-target gap closed by the latest measurement.</div>
        </Card>
        <Card title="Realized vs. projected savings">
          <div className="rv">
            <div className="rv-item">
              <span className="rv-label">Realized so far <DataTag kind="measured" /></span>
              <span className="rv-val">{fmt.eur(realized)}</span>
              <span className="small muted">{p.kpis.length ? `Against the measured baseline, ${realizedMonths} month${realizedMonths === 1 ? "" : "s"} with savings` : "Record monthly measurements below to track realized savings"}</span>
            </div>
            <div className="rv-item">
              <span className="rv-label">Projected first 12 months after go-live <DataTag kind="simulated" /></span>
              <span className="rv-val accent">{fmt.eur(projected12)}</span>
              <span className="small muted">{scen.name}, net of operating cost, excl. investment</span>
            </div>
            <div className="rv-bar" aria-hidden>
              <div className="rv-real" style={{ width: `${Math.min(100, (realized / Math.max(1, projected12)) * 100)}%` }} />
            </div>
            <p className="small muted">Realized savings are compared against the measured baseline cost per invoice. Projected values become realized only once post-go-live measurements exist.</p>
          </div>
        </Card>
      </div>
      <KpiRecorder />
    </div>
  );
}

function KpiRecorder() {
  const { project: p, dispatch, toast, today } = useStore();
  const base = processBaseline(p.process);
  const lastMonth = addMonths(monthKey(today), -1);
  // Pre-fill with the latest measurement, or with the values derived from the process inputs,
  // so a measurement is never saved with accidental zeros.
  const blank = (): KpiMeasurement => {
    const latest = [...p.kpis].sort((a, b) => b.month.localeCompare(a.month))[0];
    if (latest) return { ...latest, month: lastMonth };
    const cur = calculateAll(p.process, p.assumptions, p.scenarios)[0];
    const r2 = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
    return {
      month: lastMonth,
      volume: p.process.monthlyVolume,
      costPerInvoice: r2(cur.currentCostPerInvoice ?? 0),
      cycleTimeDays: r2(base.cycleTimeDays, 1),
      manualHours: Math.round((p.process.monthlyVolume * (base.minutesPerInvoice + base.errorRate * base.reworkMinutesPerError)) / 60),
      errorRate: r2(base.errorRate, 4),
      automationRate: r2(base.automationRate, 4),
    };
  };
  const [m, setM] = useState<KpiMeasurement>(blank);
  const [err, setErr] = useState<string | null>(null);
  const set = (patch: Partial<KpiMeasurement>) => setM((x) => ({ ...x, ...patch }));
  const save = () => {
    const parsed = KpiMeasurementSchema.safeParse(m);
    if (!parsed.success) {
      setErr(parsed.error.issues[0].path.join(".") === "month" ? "Pick a month." : "Check the values: all must be zero or positive; rates between 0 and 100 %.");
      return;
    }
    if (parsed.data.month > monthKey(today)) {
      setErr("Measurements can only be recorded for the current or past months.");
      return;
    }
    setErr(null);
    const replaced = p.kpis.some((k) => k.month === parsed.data.month);
    dispatch({ type: "upsertKpi", kpi: parsed.data });
    toast({ tone: "success", title: replaced ? "Measurement updated" : "Measurement recorded", body: fmt.month(parsed.data.month) });
  };
  const sorted = [...p.kpis].sort((a, b) => b.month.localeCompare(a.month));
  return (
    <Card title="Record a monthly measurement" subtitle="Actual values from your operations. They replace the derived baseline and drive realized savings." pad={false}>
      <div className="card-body">
        <div className="kpi-form">
          <Field label="Month" htmlFor="kpi-month"><input id="kpi-month" type="month" className="input" value={m.month} max={monthKey(today)} onChange={(e) => set({ month: e.target.value })} /></Field>
          <NumberInput id="kpi-volume" label="Invoices processed" value={m.volume} min={0} max={1000000} step={1} onChange={(v) => set({ volume: Math.round(v) })} />
          <NumberInput id="kpi-cpi" label="Cost per invoice" unit="€" value={m.costPerInvoice} min={0} max={10000} step={0.01} digits={2} onChange={(v) => set({ costPerInvoice: v })} />
          <NumberInput id="kpi-cycle" label="Avg. cycle time" unit="days" value={m.cycleTimeDays} min={0} max={365} step={0.1} onChange={(v) => set({ cycleTimeDays: v })} />
          <NumberInput id="kpi-hours" label="Manual effort" unit="h" value={m.manualHours} min={0} max={1000000} step={1} onChange={(v) => set({ manualHours: v })} />
          <NumberInput id="kpi-error" label="Error rate" unit="%" value={m.errorRate} scale={100} min={0} max={1} step={0.001} digits={1} onChange={(v) => set({ errorRate: v })} />
          <NumberInput id="kpi-auto" label="Automation rate" unit="%" value={m.automationRate} scale={100} min={0} max={1} step={0.001} digits={1} onChange={(v) => set({ automationRate: v })} />
        </div>
        {err && <p className="field-msg" role="alert">{err}</p>}
        <div className="row-gap"><Button variant="primary" icon={<LuPlus />} onClick={save}>Save measurement</Button><span className="small muted">Saving a month that already exists replaces it.</span></div>
      </div>
      {sorted.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Month</th><th className="num">Invoices</th><th className="num">Cost / invoice</th><th className="num">Cycle time</th><th className="num">Manual h</th><th className="num">Error rate</th><th className="num">Automation</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {sorted.map((k) => (
                <tr key={k.month} className="row-click" onClick={() => setM(k)}>
                  <td>{fmt.month(k.month)}</td>
                  <td className="num">{fmt.num(k.volume)}</td>
                  <td className="num">{fmt.eur(k.costPerInvoice, 2)}</td>
                  <td className="num">{fmt.num(k.cycleTimeDays, 1)} d</td>
                  <td className="num">{fmt.num(k.manualHours)}</td>
                  <td className="num">{fmt.pct(k.errorRate, 1)}</td>
                  <td className="num">{fmt.pct(k.automationRate, 1)}</td>
                  <td><button className="icon-btn" aria-label={`Delete measurement ${k.month}`} onClick={(e) => { e.stopPropagation(); dispatch({ type: "deleteKpi", month: k.month }); toast({ tone: "info", title: "Measurement deleted" }); }}><LuTrash2 /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
