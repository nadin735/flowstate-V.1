import React, { useState } from "react";
import { LuScanLine, LuRotateCcw, LuClock, LuTriangleAlert, LuUser, LuCpu, LuHand, LuArrowRight, LuSparkles } from "react-icons/lu";
import { useStore } from "../state/store";
import { Badge, Button, Card, DataTag, NumberInput, PageHeader, TextInput, cx } from "../components/ui";
import { fmt } from "../format";
import { processBaseline, stepMetrics } from "../../domain/finance";
import { navigate } from "../app";
import { PdfImport } from "../components/PdfImport";
import type { ProcessStep } from "../../domain/types";

export function ProcessPage() {
  const { project: p, dispatch, toast } = useStore();
  const [pdfOpen, setPdfOpen] = useState(false);
  const [selected, setSelected] = useState<string>(p.process.steps[1]?.id ?? p.process.steps[0].id);
  const metrics = stepMetrics(p.process, p.assumptions.hourlyCost);
  const base = processBaseline(p.process);
  const step = p.process.steps.find((s) => s.id === selected) ?? p.process.steps[0];
  const m = metrics.find((x) => x.stepId === step.id)!;
  const maxWait = Math.max(...p.process.steps.map((s) => s.waitDays));
  const totalMonthly = metrics.reduce((s, x) => s + x.monthlyCost, 0);
  const upd = (patch: Partial<ProcessStep>) => dispatch({ type: "updateStep", id: step.id, patch });
  const effortDays = base.minutesPerInvoice / 60 / 8;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Process Intelligence"
        title={p.process.name}
        description="Select a step to inspect and edit it. Enter the values for each step. Costs, bottleneck scores and cycle times are derived estimates and update everywhere instantly."
        actions={<><Button icon={<LuScanLine />} onClick={() => setPdfOpen(true)}>Import from PDF</Button><Button variant="primary" icon={<LuSparkles />} onClick={() => navigate("consultant")}>Get recommendations</Button></>}
      />

      <Card title="Process volume & cost" subtitle="Needed for every cost, savings and ROI figure.">
        <div className="form-grid">
          <NumberInput id="vol" label="Monthly invoice volume" value={p.process.monthlyVolume} min={0} max={1000000} step={50} onChange={(v) => dispatch({ type: "setVolume", volume: v })} aside={<DataTag kind="input" />} />
          <NumberInput id="rate" label="Labour cost per hour (fully loaded)" unit="€" value={p.assumptions.hourlyCost} min={0} max={500} step={1} onChange={(v) => dispatch({ type: "updateAssumptions", patch: { hourlyCost: v } })} aside={<DataTag kind="input" />} />
        </div>
      </Card>

      <div className="stat-grid stat-grid-5">
        <div className="mini-stat"><span>Monthly volume</span><b>{fmt.num(p.process.monthlyVolume)}</b><DataTag kind="input" /></div>
        <div className="mini-stat"><span>Handling time</span><b>{fmt.num(base.minutesPerInvoice, 1)} min</b><DataTag kind="input" /></div>
        <div className="mini-stat"><span>First-pass error rate</span><b>{fmt.pct(base.errorRate, 1)}</b><DataTag kind="estimate" /></div>
        <div className="mini-stat"><span>Cycle time</span><b>{fmt.num(base.cycleTimeDays, 1)} days</b><DataTag kind="estimate" /></div>
        <div className="mini-stat"><span>Automation today</span><b>{fmt.pct(base.automationRate)}</b><DataTag kind="estimate" /></div>
      </div>

      <Card title="Process map" subtitle="Invoice received → Data extraction → Validation → Approval → Payment" pad={false}
        actions={<div className="map-legend"><span><i className="lg-bn" /> Bottleneck</span><span><i className="lg-wait" /> Longest wait</span><span><i className="lg-auto" /> Automated share</span></div>}>
        <div className="pmap" role="list">
          {p.process.steps.map((s, i) => {
            const sm = metrics.find((x) => x.stepId === s.id)!;
            const longestWait = s.waitDays === maxWait && maxWait > 0;
            return (
              <React.Fragment key={s.id}>
                <div role="listitem" className="pmap-cell">
                  <button
                    className={cx("pnode", selected === s.id && "pnode-on", sm.isBottleneck && "pnode-bn")}
                    onClick={() => setSelected(s.id)}
                    aria-pressed={selected === s.id}
                    aria-label={`${s.name}: ${fmt.num(s.minutesPerInvoice, 1)} minutes, ${fmt.eur(sm.monthlyCost)} per month${sm.isBottleneck ? ", bottleneck" : ""}`}
                  >
                    <div className="pnode-top">
                      <span className="pnode-idx">{i + 1}</span>
                      <span className="pnode-name">{s.name}</span>
                    </div>
                    <div className="pnode-flags">
                      {sm.isBottleneck && <Badge tone="danger">Bottleneck</Badge>}
                      {longestWait && <Badge tone="warning">Longest wait</Badge>}
                    </div>
                    <div className="pnode-kpis">
                      <div><span>Time</span><b>{fmt.num(s.minutesPerInvoice, 1)}m</b></div>
                      <div><span>Cost/mo</span><b>{fmt.eurCompact(sm.monthlyCost)}</b></div>
                      <div><span>Errors</span><b>{fmt.pct(s.errorRate, 1)}</b></div>
                    </div>
                    <div className="auto-bar" title={`${fmt.pct(s.automatedShare)} automated`}>
                      <div className="auto-fill" style={{ width: `${s.automatedShare * 100}%` }} />
                    </div>
                    <div className="pnode-foot">
                      <span><LuCpu aria-hidden /> {fmt.pct(s.automatedShare)} auto</span>
                      <span><LuHand aria-hidden /> {fmt.pct(1 - s.automatedShare)} manual</span>
                    </div>
                    <div className="pnode-score" aria-hidden><div style={{ width: `${sm.bottleneckScore}%` }} /></div>
                  </button>
                  <div className={cx("pwait", longestWait && "pwait-hot")}><LuClock aria-hidden /> {fmt.num(s.waitDays, 1)} d queue</div>
                </div>
                {i < p.process.steps.length - 1 && <div className="pedge" aria-hidden><LuArrowRight /></div>}
              </React.Fragment>
            );
          })}
        </div>
        <div className="timeline-strip">
          <div className="ts-label">Where the {fmt.num(base.cycleTimeDays, 1)} days go</div>
          <div className="ts-bar" role="img" aria-label="Cycle time split by step: waiting vs. handling">
            {p.process.steps.map((s) => (
              <div key={s.id} className={cx("ts-seg", s.id === selected && "ts-seg-on")} style={{ flexGrow: Math.max(0.05, s.waitDays) }} title={`${s.name}: ${fmt.num(s.waitDays, 1)} days waiting`}>
                <span>{s.name}</span>
              </div>
            ))}
            <div className="ts-seg ts-work" style={{ flexGrow: Math.max(0.05, effortDays) }} title={`Active handling: ${fmt.num(effortDays, 2)} days`}><span>Work</span></div>
          </div>
          {base.cycleTimeDays > 0 ? <div className="small muted">Active handling is only {fmt.pct(effortDays / (base.cycleTimeDays || 1), 1)} of the cycle time; the rest is waiting in queues.</div> : <div className="small muted">Enter handling and waiting times per step to see where the time goes.</div>}
        </div>
      </Card>

      <div className="grid-3-2">
        <Card title={step.name} subtitle={step.description} actions={<Button size="sm" variant="ghost" icon={<LuRotateCcw />} onClick={() => { dispatch({ type: "resetStep", id: step.id }); toast({ tone: "info", title: `“${step.name}” cleared` }); }}>Clear step</Button>}>
          <div className="form-grid" key={step.id}>
            <NumberInput label="Handling time per invoice" unit="min" value={step.minutesPerInvoice} min={0} max={240} step={0.5} sliderMax={20} slider onChange={(v) => upd({ minutesPerInvoice: v })} aside={<DataTag kind="input" />} />
            <NumberInput label="Already automated" unit="%" value={step.automatedShare} scale={100} min={0} max={0.95} step={0.01} slider onChange={(v) => upd({ automatedShare: v })} aside={<DataTag kind="input" />} />
            <NumberInput label="Error rate" unit="%" value={step.errorRate} scale={100} min={0} max={0.6} step={0.005} digits={1} slider onChange={(v) => upd({ errorRate: v })} aside={<DataTag kind="input" />} />
            <NumberInput label="Rework per error" unit="min" value={step.reworkMinutes} min={0} max={480} step={1} sliderMax={120} slider onChange={(v) => upd({ reworkMinutes: v })} aside={<DataTag kind="input" />} />
            <NumberInput label="Queue / waiting time" unit="days" value={step.waitDays} min={0} max={60} step={0.1} sliderMax={10} slider onChange={(v) => upd({ waitDays: v })} aside={<DataTag kind="input" />} />
            <TextInput label="Owner" value={step.owner} maxLength={60} onChange={(v) => upd({ owner: v })} />
          </div>
          <TextInput label="Description" multiline value={step.description} maxLength={400} onChange={(v) => upd({ description: v })} />
          <div className="chips">{step.systems.map((s) => <span key={s} className="chip">{s}</span>)}</div>
        </Card>

        <Card title="Step analysis" actions={<DataTag kind="estimate" />}>
          <dl className="kv">
            <div><dt>Monthly hours (incl. rework)</dt><dd>{fmt.num(m.monthlyHours)} h</dd></div>
            <div><dt>Monthly labour cost</dt><dd>{fmt.eur(m.monthlyCost)}</dd></div>
            <div><dt>Share of process cost</dt><dd>{fmt.pct(m.costShare, 1)}</dd></div>
            <div><dt>Rework hours / month</dt><dd>{fmt.num(m.reworkHours)} h</dd></div>
            <div><dt>Share of waiting time</dt><dd>{fmt.pct(m.waitShare, 1)}</dd></div>
            <div><dt>FTE equivalent</dt><dd>{fmt.num(m.monthlyHours / 140, 1)}</dd></div>
          </dl>
          <div className="score-block">
            <div className="score-head"><span>Bottleneck score</span><b>{m.bottleneckScore}/100</b></div>
            <div className="score-track"><div className={cx("score-fill", m.isBottleneck && "score-hot")} style={{ width: `${m.bottleneckScore}%` }} /></div>
            <p className="small muted">Weighted: 45% cost share · 30% waiting-time share · 15% relative error rate · 10% manual share. Steps within 85% of the top score are flagged.</p>
          </div>
          {m.isBottleneck && (
            <div className="callout callout-danger"><LuTriangleAlert aria-hidden /><div><b>Bottleneck.</b> This step drives {fmt.pct(m.costShare)} of the {fmt.eur(totalMonthly)} monthly process cost.</div></div>
          )}
          <div className="small muted mt-8"><LuUser aria-hidden /> Owner: {step.owner}</div>

        </Card>
      </div>
      <PdfImport open={pdfOpen} onClose={() => setPdfOpen(false)} />
    </div>
  );
}
