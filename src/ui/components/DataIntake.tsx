import React, { useRef, useState } from "react";
import { LuScanLine, LuFileUp, LuFileText, LuKeyboard, LuCheck, LuArrowLeft, LuFlaskConical } from "react-icons/lu";
import { useStore } from "../state/store";
import { Button, NumberInput, TextInput, cx } from "./ui";
import { PdfImport, type PdfStart } from "./PdfImport";
import { takeManualIntake } from "../state/onboarding";

const CELL_LABEL = { minutesPerInvoice: "minutes per invoice", automatedShare: "automated %", errorRate: "error rate %", reworkMinutes: "rework minutes per error", waitDays: "waiting days" } as const;

type Row = { minutesPerInvoice: number; automatedShare: number; errorRate: number; reworkMinutes: number; waitDays: number };

/**
 * First thing a new session sees: "How do you want to provide your data?"
 * Either upload a PDF (read and reviewed in the browser) or type the essentials here.
 */
export function DataIntake({ onSkip }: { onSkip: () => void }) {
  const { project: p, dispatch, toast } = useStore();
  const [mode, setMode] = useState<"choose" | "manual">(() => (takeManualIntake() ? "manual" : "choose"));
  const [pdfStart, setPdfStart] = useState<PdfStart>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [company, setCompany] = useState(p.company.name);
  const [volume, setVolume] = useState(p.process.monthlyVolume);
  const [rate, setRate] = useState(p.assumptions.hourlyCost);
  const [avgValue, setAvgValue] = useState(p.assumptions.avgInvoiceValue);
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(p.process.steps.map((s) => [s.id, { minutesPerInvoice: s.minutesPerInvoice, automatedShare: s.automatedShare, errorRate: s.errorRate, reworkMinutes: s.reworkMinutes, waitDays: s.waitDays }])),
  );
  const [tried, setTried] = useState(false);

  const begin = async (f: File | null | undefined) => {
    if (!f) return;
    setPdfStart({ bytes: new Uint8Array(await f.arrayBuffer()), name: f.name });
    setPdfOpen(true);
  };

  const missing: string[] = [];
  if (!(volume > 0)) missing.push("invoices per month");
  if (!(rate > 0)) missing.push("labour cost per hour");
  const noMinutes = p.process.steps.filter((s) => !(rows[s.id].minutesPerInvoice > 0)).map((s) => s.name);
  if (noMinutes.length) missing.push(`minutes for ${noMinutes.join(", ")}`);

  const save = () => {
    setTried(true);
    if (missing.length) {
      toast({ tone: "error", title: "Some required values are missing", body: `Please enter ${missing.join("; ")}.` });
      return;
    }
    if (company.trim()) dispatch({ type: "updateCompany", patch: { name: company.trim().slice(0, 120) } });
    dispatch({ type: "setVolume", volume });
    dispatch({ type: "updateAssumptions", patch: { hourlyCost: rate } });
    for (const s of p.process.steps) dispatch({ type: "updateStep", id: s.id, patch: rows[s.id] });
    if (avgValue > 0) dispatch({ type: "updateAssumptions", patch: { avgInvoiceValue: avgValue } });
    dispatch({ type: "applyBenchmarks", onlyIfEmpty: true });
    dispatch({ type: "log", text: "Process data entered manually", kind: "process" });
    toast({ tone: "success", title: "Data saved", body: "Business case calculated with benchmark scenario values — refine them in the Scenario Simulator." });
  };

  const setRow = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  return (
    <div className="intake">
      <div className="intake-head">
        <div className="eyebrow">Step 1 · Your data</div>
        <h1>How do you want to provide your process data?</h1>
        <p className="page-desc">FLOWSTATE needs your invoice volume, labour cost and the handling time of each process step. Upload a PDF or type the values in. Everything stays in this browser session.</p>
      </div>

      {mode === "choose" ? (
        <div className="intake-choices">
          <section
            className={cx("intake-card intake-card-primary", drag && "intake-card-drag")}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
            onDrop={(e) => { e.preventDefault(); setDrag(false); begin(e.dataTransfer.files?.[0]); }}
            aria-label="Upload a PDF"
          >
            <div className="intake-icon" aria-hidden><LuScanLine /></div>
            <h2>Upload a PDF</h2>
            <p>A scanned or digital process sheet. FLOWSTATE reads company data, volume, labour cost and every step — you check the values before they are used.</p>
            <div className="intake-actions">
              <Button variant="primary" icon={<LuFileUp />} onClick={() => fileRef.current?.click()}>Upload PDF</Button>
              <Button icon={<LuFileText />} onClick={() => { setPdfStart("demo"); setPdfOpen(true); }}>Try the demo scan</Button>
            </div>
            <span className="intake-hint">or drop the file here</span>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden aria-label="Upload PDF file" onChange={(e) => { begin(e.target.files?.[0]); e.target.value = ""; }} />
          </section>
          <section className="intake-card" aria-label="Enter manually">
            <div className="intake-icon intake-icon-muted" aria-hidden><LuKeyboard /></div>
            <h2>Enter manually</h2>
            <p>One short form: invoices per month, labour cost and the minutes for each of the 5 process steps are required — everything else is optional.</p>
            <div className="intake-actions">
              <Button variant="secondary" icon={<LuKeyboard />} onClick={() => setMode("manual")}>Enter data manually</Button>
            </div>
          </section>
        </div>
      ) : (
        <section className="intake-form card">
          <div className="card-body">
            <button className="link-btn small intake-back" onClick={() => setMode("choose")}><LuArrowLeft aria-hidden /> Back to the choice</button>
            <div className="form-grid intake-grid-4">
              <TextInput id="in-company" label="Company name (optional)" value={company} maxLength={120} placeholder="e.g. Muster GmbH" onChange={setCompany} />
              <NumberInput id="in-volume" label="Invoices per month *" value={volume} min={0} max={1000000} step={1} onChange={(v) => setVolume(Math.round(v))} hint={tried && !(volume > 0) ? undefined : "Average incoming supplier invoices"} />
              <NumberInput id="in-rate" label="Labour cost per hour *" unit="€" value={rate} min={0} max={500} step={0.5} onChange={setRate} hint="Fully loaded cost of an AP clerk" />
              <NumberInput id="in-avg" label="Average invoice value (optional)" unit="€" value={avgValue} min={0} max={10000000} step={10} onChange={setAvgValue} hint="Enables the early-payment discount benefit (assumes 30 % of invoices with 2 % terms, 40 % captured today — adjust in the Simulator)" />
            </div>
            <div className="table-wrap">
              <table className="table intake-table">
                <thead>
                  <tr><th>Process step</th><th className="num">Minutes per invoice *</th><th className="num">Automated %</th><th className="num">Error rate %</th><th className="num">Rework min per error</th><th className="num">Waiting days</th></tr>
                </thead>
                <tbody>
                  {p.process.steps.map((s) => {
                    const r = rows[s.id];
                    const bad = tried && !(r.minutesPerInvoice > 0);
                    const cell = (key: keyof Row, scale: number, max: number, digits: number) => (
                      <input
                        className={cx("input input-sm pdf-num", key === "minutesPerInvoice" && bad && "input-bad")}
                        inputMode="decimal"
                        aria-label={`${s.name}: ${CELL_LABEL[key]}`}
                        defaultValue={r[key] ? String(+(r[key] * scale).toFixed(digits)) : ""}
                        placeholder="0"
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(",", "."));
                          if (Number.isFinite(n)) setRow(s.id, { [key]: Math.min(max, Math.max(0, n)) / scale } as Partial<Row>);
                        }}
                      />
                    );
                    return (
                      <tr key={s.id}>
                        <td>{s.name}<div className="small muted">{s.description}</div></td>
                        <td className="num">{cell("minutesPerInvoice", 1, 240, 1)}</td>
                        <td className="num">{cell("automatedShare", 100, 95, 0)}</td>
                        <td className="num">{cell("errorRate", 100, 60, 1)}</td>
                        <td className="num">{cell("reworkMinutes", 1, 480, 0)}</td>
                        <td className="num">{cell("waitDays", 1, 60, 1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {tried && missing.length > 0 && <p className="field-msg" role="alert">Please enter {missing.join("; ")}.</p>}
            <div className="row-gap intake-save">
              <Button variant="primary" icon={<LuCheck />} onClick={save}>Save and show business case</Button>
              <span className="small muted">* required. Everything else can be refined later on the Process page.</span>
            </div>
          </div>
        </section>
      )}

      <div className="intake-foot">
        <Button icon={<LuFlaskConical />} onClick={() => { dispatch({ type: "loadTestData" }); toast({ tone: "success", title: "Test data loaded", body: "Fictional company with process, scenarios, roadmap, KPIs and recommendations. Replace it with your own data any time." }); }}>Try with test data</Button>
        <span className="small muted">Fills every page with a fictional company in one click.</span>
        <button className="link-btn small intake-skip" onClick={onSkip}>Skip for now and look around</button>
      </div>
      <PdfImport open={pdfOpen} start={pdfStart} onClose={() => { setPdfOpen(false); setPdfStart(null); }} />
    </div>
  );
}
