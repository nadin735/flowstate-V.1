import React, { useEffect, useRef, useState } from "react";
import { LuDownload, LuUpload, LuRotateCcw, LuSave, LuShieldCheck, LuLogOut } from "react-icons/lu";
import { useStore } from "../state/store";
import { Badge, Button, Card, Confirm, Field, NumberInput, PageHeader, Segmented, Switch, TextInput, cx } from "../components/ui";
import { isValidISO } from "../../domain/dates";
import { parseProject } from "../state/persistence";
import { canSaveFiles, saveFile } from "../ai/downloads";
import { fmt } from "../format";

export function SettingsPage() {
  const { project: p, dispatch, toast, resetProject, endSession, sessionTtl, saveNow, mode, saveState, saveError } = useStore();
  const [confirm, setConfirm] = useState<null | { kind: "reset" } | { kind: "end" } | { kind: "test" } | { kind: "import"; data: unknown; name: string }>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [goLiveText, setGoLiveText] = useState(p.targetGoLive);
  const [startText, setStartText] = useState(p.startDate);
  useEffect(() => setStartText(p.startDate), [p.startDate]);
  const [asOfText, setAsOfText] = useState(p.preferences.asOfDate ?? "");
  const a = p.assumptions;
  useEffect(() => setGoLiveText(p.targetGoLive), [p.targetGoLive]);

  const exportJson = async () => {
    const name = `flowstate-project-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      const ok = await saveFile(name, JSON.stringify(p, null, 2), "application/json");
      if (ok) toast({ tone: "success", title: "Project exported", body: name });
    } catch (e) {
      toast({ tone: "error", title: "Export failed", body: e instanceof Error ? e.message : undefined });
    }
  };
  const [canSave, setCanSave] = useState(!__RESTRICTED_HOST__);
  useEffect(() => {
    canSaveFiles().then(setCanSave);
  }, []);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 2_000_000) {
      toast({ tone: "error", title: "File too large", body: "Project files are limited to 2 MB." });
      return;
    }
    try {
      const data = JSON.parse(await f.text());
      const res = parseProject(data);
      if (!res.project) throw new Error(res.error ?? "Invalid file");
      setConfirm({ kind: "import", data: res.project, name: f.name });
    } catch (err) {
      toast({ tone: "error", title: "Import failed", body: err instanceof Error ? err.message : "Not a valid FLOWSTATE project file." });
    }
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Workspace" title="Settings & project" description="Company, project details, global assumptions, preferences and data management." />

      <Card title="Company" subtitle="Used in headers, the report and as context for recommendations.">
        <div className="form-grid">
          <TextInput label="Company name" value={p.company.name} maxLength={120} placeholder="e.g. Muster GmbH" onChange={(v) => dispatch({ type: "updateCompany", patch: { name: v } })} />
          <TextInput label="Industry" value={p.company.industry} maxLength={120} placeholder="e.g. Industrial manufacturing" onChange={(v) => dispatch({ type: "updateCompany", patch: { industry: v } })} />
          <TextInput label="Country" value={p.company.country} maxLength={60} placeholder="e.g. Germany" onChange={(v) => dispatch({ type: "updateCompany", patch: { country: v } })} />
          <TextInput label="ERP system" value={p.company.erp} maxLength={80} placeholder="e.g. SAP S/4HANA" onChange={(v) => dispatch({ type: "updateCompany", patch: { erp: v } })} />
          <NumberInput label="Employees" value={p.company.employees} min={0} max={1000000} step={1} onChange={(v) => dispatch({ type: "updateCompany", patch: { employees: Math.round(v) } })} />
        </div>
        <TextInput label="Short description" multiline value={p.company.description} maxLength={600} onChange={(v) => dispatch({ type: "updateCompany", patch: { description: v } })} />
      </Card>

      <div className="grid-2">
        <Card title="Project details">
          <TextInput label="Project name" value={p.name} maxLength={120} onChange={(v) => dispatch({ type: "updateDetails", patch: { name: v || "Untitled project" } })} />
          <TextInput label="Description" multiline value={p.description} maxLength={1000} onChange={(v) => dispatch({ type: "updateDetails", patch: { description: v } })} />
          <div className="form-grid">
            <TextInput label="Sponsor" value={p.sponsor} maxLength={80} onChange={(v) => dispatch({ type: "updateDetails", patch: { sponsor: v } })} />
            <TextInput label="Project lead" value={p.lead} maxLength={80} onChange={(v) => dispatch({ type: "updateDetails", patch: { lead: v } })} />
            <Field label="Target go-live" htmlFor="golive" error={!isValidISO(goLiveText) ? "Enter a valid date" : undefined} hint="Drives KPI projections.">
              <input id="golive" type="date" className="input" value={goLiveText} onChange={(e) => { setGoLiveText(e.target.value); if (isValidISO(e.target.value)) dispatch({ type: "updateDetails", patch: { targetGoLive: e.target.value } }); }} />
            </Field>
            <Field label="Project start" htmlFor="pstart" error={!isValidISO(startText) ? "Enter a valid date" : undefined}>
              <input id="pstart" type="date" className="input" value={startText} onChange={(e) => { setStartText(e.target.value); if (isValidISO(e.target.value)) dispatch({ type: "updateDetails", patch: { startDate: e.target.value } }); }} />
            </Field>
          </div>
        </Card>

        <Card title="Global assumptions" subtitle="Also editable in the Scenario Simulator.">
          <NumberInput label="Labour cost per hour (fully loaded)" unit="€" value={a.hourlyCost} min={0} max={500} step={1} onChange={(v) => dispatch({ type: "updateAssumptions", patch: { hourlyCost: v } })} />
          <NumberInput label="Monthly invoice volume" value={a.monthlyVolume} min={0} max={1000000} step={100} onChange={(v) => dispatch({ type: "setVolume", volume: v })} />
          <NumberInput label="Residual effort on automated work" unit="%" value={a.residualEffortOnAutomated} scale={100} min={0} max={1} step={0.01} onChange={(v) => dispatch({ type: "updateAssumptions", patch: { residualEffortOnAutomated: v } })} />
          <NumberInput label="Error reduction on automated work" unit="%" value={a.automationErrorReduction} scale={100} min={0} max={1} step={0.01} onChange={(v) => dispatch({ type: "updateAssumptions", patch: { automationErrorReduction: v } })} />
          <NumberInput label="Extended ROI horizon" unit="months" value={a.roiHorizonMonths} min={12} max={60} step={6} onChange={(v) => dispatch({ type: "updateAssumptions", patch: { roiHorizonMonths: Math.round(v) } })} />
          <div className="row-gap">
            {(a.processingMinutesOverride !== null || a.errorRateOverride !== null) && <Badge tone="warning">Simulator overrides active</Badge>}
            {(a.processingMinutesOverride !== null || a.errorRateOverride !== null) && <Button size="sm" onClick={() => dispatch({ type: "updateAssumptions", patch: { processingMinutesOverride: null, errorRateOverride: null } })}>Relink to process map</Button>}
          </div>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Preferences">
          <Field label="Number & date format">
            <Segmented label="Locale" value={p.preferences.locale} onChange={(v) => dispatch({ type: "updatePrefs", patch: { locale: v } })} options={[{ value: "en-GB", label: "English (€1,234.56)" }, { value: "de-DE", label: "German (1.234,56 €)" }]} />
          </Field>
          <Field label="Density">
            <Segmented label="Density" value={p.preferences.density} onChange={(v) => dispatch({ type: "updatePrefs", patch: { density: v } })} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} />
          </Field>
          <Field label="Appearance">
            <Segmented label="Appearance" value={p.preferences.colorMode} onChange={(v) => dispatch({ type: "updatePrefs", patch: { colorMode: v } })} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
          </Field>
          <Field label="Theme">
            <Segmented label="Theme" value={p.preferences.accent} onChange={(v) => dispatch({ type: "updatePrefs", patch: { accent: v } })} options={[{ value: "electric", label: "Electric blue" }, { value: "forest", label: "Forest" }, { value: "neon", label: "Neon yellow" }]} />
          </Field>
          <Switch label="Show formulas in simulator" checked={p.preferences.showFormulas} onChange={(v) => dispatch({ type: "updatePrefs", patch: { showFormulas: v } })} />
          <Field label="Reference date (“today”)" htmlFor="asof" hint="Leave empty to use the real date. Useful for what-if checks on overdue items." error={asOfText && !isValidISO(asOfText) ? "Enter a valid date" : undefined}>
            <div className="row-gap">
              <input id="asof" type="date" className="input" value={asOfText} onChange={(e) => { setAsOfText(e.target.value); if (e.target.value === "" || isValidISO(e.target.value)) dispatch({ type: "updatePrefs", patch: { asOfDate: e.target.value || null } }); }} />
              {asOfText && <Button size="sm" onClick={() => { setAsOfText(""); dispatch({ type: "updatePrefs", patch: { asOfDate: null } }); }}>Use real date</Button>}
            </div>
          </Field>
        </Card>

        <Card title="Data & storage">
          <dl className="kv">
            <div><dt>Storage</dt><dd>{mode === "server" ? `Server, this browser session only${sessionTtl ? ` (deleted after ${sessionTtl} min inactivity)` : ""}` : mode === "browser" ? "This browser tab (deleted when the tab closes)" : "Not stored"}</dd></div>
            <div><dt>Status</dt><dd className={cx(saveState === "error" && "text-danger")}>{saveState === "error" ? saveError : saveState === "saving" ? "Saving…" : "Up to date"}</dd></div>
            <div><dt>Last change</dt><dd>{fmt.relative(p.updatedAt)}</dd></div>
          </dl>
          <div className="btn-col">
            <Button icon={<LuSave />} onClick={async () => { await saveNow(); toast({ tone: "success", title: "Project saved" }); }} disabled={mode === "memory"}>Save now</Button>
            {canSave && <Button icon={<LuDownload />} onClick={exportJson}>Export project (JSON)</Button>}
            <Button icon={<LuUpload />} onClick={() => fileRef.current?.click()}>Import project…</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
            <Button onClick={() => { location.hash = "#/welcome"; }}>Show welcome screen</Button>
            <Button onClick={() => setConfirm({ kind: "test" })}>Load test data</Button>
            <Button variant="danger" icon={<LuRotateCcw />} onClick={() => setConfirm({ kind: "reset" })}>Clear project</Button>
            <Button variant="danger" icon={<LuLogOut />} onClick={() => setConfirm({ kind: "end" })}>End session & delete data</Button>
          </div>
        </Card>
      </div>

      <Confirm
        open={confirm !== null}
        danger={confirm?.kind === "reset" || confirm?.kind === "end"}
        title={confirm?.kind === "reset" ? "Clear project?" : confirm?.kind === "end" ? "End session and delete all data?" : confirm?.kind === "test" ? "Replace the project with test data?" : "Import project?"}
        confirmLabel={confirm?.kind === "reset" ? "Clear project" : confirm?.kind === "end" ? "Delete data" : confirm?.kind === "test" ? "Load test data" : "Import"}
        body={confirm?.kind === "test" ? <>Everything in the current project is replaced by a fictional test company with process data, scenarios, roadmap, KPIs and recommendations.</> : confirm?.kind === "import" ? <>Replace the current project with <b>{confirm.name}</b>?</> : confirm?.kind === "end" ? <>Everything entered in this session — company, process, scenarios, roadmap, KPIs and recommendations — is deleted{mode === "server" ? " from the server" : " from this browser"}. Export first if you want to keep a copy.</> : <>All inputs, tasks, risks, KPIs and recommendations are removed and an empty project is started. Preferences are kept.</>}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const c = confirm;
          setConfirm(null);
          if (!c) return;
          if (c.kind === "import") {
            dispatch({ type: "load", project: { ...(c.data as typeof p), updatedAt: new Date().toISOString() } });
            toast({ tone: "success", title: "Project imported", body: c.name });
          } else if (c.kind === "test") {
            dispatch({ type: "loadTestData" });
            toast({ tone: "success", title: "Test data loaded" });
          } else if (c.kind === "end") {
            await endSession();
          } else {
            await resetProject();
            toast({ tone: "success", title: "Project cleared", body: "An empty project was started." });
          }
        }}
      />
      <div className="small muted center"><LuShieldCheck aria-hidden /> Your data is kept only for this browser session{sessionTtl ? ` and deleted after ${sessionTtl} minutes of inactivity` : ""}. Nothing is shared with other browsers.</div>
    </div>
  );
}
