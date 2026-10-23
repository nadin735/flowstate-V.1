import React, { useEffect, useMemo, useState } from "react";
import { LuSparkles, LuCpu, LuPlus, LuCheck, LuChevronDown, LuLoaderCircle, LuInfo, LuCircleAlert } from "react-icons/lu";
import { useStore } from "../state/store";
import { Badge, Button, Card, DataTag, Empty, Field, PageHeader, Segmented, cx } from "../components/ui";
import { fmt } from "../format";
import { CONSTRAINTS, PROBLEMS, generateRecommendations, type ConstraintId, type ProblemId } from "../../domain/recommendations";
import { RecommendationSchema, type Recommendation, type RecommendationRun } from "../../domain/types";
import { navigate } from "../app";
import { takeOnboardingSelection } from "../state/onboarding";
import { setupStatus } from "../../domain/template";
import { buildRecommendationPrompt, coerceRecommendations } from "../../domain/aiPrompt";
import { claudeSample, sampleErrorMessage } from "../ai/claude";

const DEFAULT_DESC = "";

type SortKey = "fit" | "savings" | "payback";

export function ConsultantPage() {
  const { project: p, dispatch, ai, toast } = useStore();
  const [preset] = useState<ProblemId[]>(() => takeOnboardingSelection());
  const [problem, setProblem] = useState<ProblemId>(preset[0] ?? "high-cost");
  const [description, setDescription] = useState(DEFAULT_DESC);
  const setup = setupStatus(p);
  const [constraints, setConstraints] = useState<ConstraintId[]>([]);
  const [budgetText, setBudgetText] = useState("");
  const [useLlm, setUseLlm] = useState(ai.available);
  useEffect(() => setUseLlm(ai.available), [ai.available]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(p.recommendationRuns[0]?.id ?? null);
  const [excluded, setExcluded] = useState<{ title: string; reason: string }[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("fit");

  const budgetCap = budgetText.trim() === "" ? null : Number(budgetText.replace(/[^\d.]/g, ""));
  const budgetError = budgetText.trim() !== "" && (!Number.isFinite(budgetCap) || (budgetCap ?? 0) <= 0) ? "Enter a positive amount or leave empty" : undefined;
  const [submitted, setSubmitted] = useState(false);
  // The description is optional: without one, a summary of the process data is used.
  const descError = undefined;

  const run: RecommendationRun | undefined = p.recommendationRuns.find((r) => r.id === runId) ?? p.recommendationRuns[0];
  const items = useMemo(() => {
    if (!run) return [];
    const payback = (r: Recommendation) => (r.monthlySavings > 0 ? r.investment / r.monthlySavings : Infinity);
    return [...run.items].sort((a, b) => (sort === "fit" ? b.fitScore - a.fitScore : sort === "savings" ? b.monthlySavings - a.monthlySavings : payback(a) - payback(b)));
  }, [run, sort]);

  const toggle = (c: ConstraintId) => setConstraints((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (budgetError) {
      setError("Please fix the highlighted fields.");
      return;
    }
    setError(null);
    const req = { problem, description: description.trim() || processSummary(p), constraints, budgetCap: budgetCap ?? null };
    const base = { id: `run-${Date.now().toString(36)}`, createdAt: new Date().toISOString(), problem: PROBLEMS.find((x) => x.id === problem)!.label, description: req.description.slice(0, 4000), constraints: constraints.map((c) => CONSTRAINTS.find((x) => x.id === c)!.label), budgetCap: req.budgetCap };

    if (useLlm && ai.available) {
      setLoading(true);
      try {
        let body: { items?: unknown; model?: string };
        if (ai.via === "claude") {
          const sample = await claudeSample();
          if (!sample) throw new Error("Claude is not available in this view.");
          const { system, user } = buildRecommendationPrompt(p, req);
          try {
            const out = await sample.json<{ items?: unknown }>(`${system}\n\n${user}`, { modelTier: "default", cache: false });
            const cap = req.budgetCap;
            const items = Array.isArray(out?.items) ? (out.items as { investment?: number }[]).filter((x) => cap === null || (x.investment ?? 0) <= cap) : out?.items;
            body = { items, model: "Claude" };
          } catch (err) {
            throw new Error(sampleErrorMessage(err));
          }
        } else {
          const res = await fetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project: p, request: req }) });
          body = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
          if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
        }
        const parsed = RecommendationSchema.array().max(10).safeParse(coerceRecommendations(body.items));
        if (!parsed.success) throw new Error("The AI response did not match the expected structure.");
        const r: RecommendationRun = { ...base, source: "llm", model: body.model ?? ai.model, items: parsed.data };
        dispatch({ type: "addRecommendationRun", run: r });
        setRunId(r.id);
        setExcluded([]);
        toast({ tone: "success", title: `${r.items.length} recommendations from ${r.model}`, body: "AI-generated estimates — review before use." });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(`AI request failed: ${msg}. You can retry or switch to the rule engine.`);
        toast({ tone: "error", title: "AI request failed", body: msg });
      } finally {
        setLoading(false);
      }
      return;
    }

    const out = generateRecommendations(p, req);
    const r: RecommendationRun = { ...base, source: "demo-rules", model: null, items: out.items };
    dispatch({ type: "addRecommendationRun", run: r });
    setRunId(r.id);
    setExcluded(out.excluded);
    setOpen(out.items[0]?.id ?? null);
    if (out.items.length === 0) toast({ tone: "warning", title: "No interventions fit the constraints", body: "Try raising the budget cap or relaxing constraints." });
    else toast({ tone: "success", title: `${out.items.length} recommendations generated`, body: "Rule engine — no AI model was called." });
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Transformation Consultant"
        title="Analyse the problem, compare interventions"
        description="Describe the situation and constraints. Recommendations are ranked by fit and include investment, savings, risks and success metrics — all estimates based on this project's process data."
      />

      {preset.length > 1 && (
        <div className="callout callout-info" role="note">
          <LuInfo aria-hidden />
          <div>You picked {preset.length} topics on the welcome screen. Each analysis focuses on one problem; switch between them here:{" "}
            {preset.map((id) => <button key={id} className={cx("chip chip-btn", problem === id && "chip-on")} onClick={() => setProblem(id)}>{PROBLEMS.find((x) => x.id === id)!.label}</button>)}
          </div>
        </div>
      )}

      <div className="grid-consult">
        <Card title="Brief">
          <form onSubmit={submit} noValidate>
            <fieldset className="fieldset">
              <legend className="field-label">Business problem</legend>
              <div className="radio-cards">
                {PROBLEMS.map((pr) => (
                  <label key={pr.id} className={cx("radio-card", problem === pr.id && "radio-card-on")}>
                    <input type="radio" name="problem" value={pr.id} checked={problem === pr.id} onChange={() => setProblem(pr.id)} />
                    <span>{pr.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Current process (optional)" htmlFor="desc" error={descError} hint={description.trim() ? `${description.length}/4000 · keywords influence the ranking` : "Leave empty to use a summary of your process data."}>
              <textarea id="desc" className="input" rows={6} maxLength={4000} placeholder="How do invoices arrive, who handles them, where do they wait, what goes wrong?" value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={!!descError} />
            </Field>
            <fieldset className="fieldset">
              <legend className="field-label">Constraints</legend>
              {CONSTRAINTS.map((c) => (
                <label key={c.id} className="check">
                  <input type="checkbox" checked={constraints.includes(c.id)} onChange={() => toggle(c.id)} />
                  <span>{c.label}</span>
                </label>
              ))}
            </fieldset>
            <Field label="Budget cap per intervention (optional)" htmlFor="budget" error={budgetError} hint="Interventions above the cap are excluded and listed.">
              <div className="num-input"><input id="budget" inputMode="numeric" placeholder="e.g. 50000" value={budgetText} onChange={(e) => setBudgetText(e.target.value)} aria-invalid={!!budgetError} /><span className="num-unit">EUR</span></div>
            </Field>
            {ai.available && (
              <Field label="Engine" hint={useLlm ? <>With AI, your process data and the description are sent to the AI provider{ai.via === "claude" ? " (Claude, via your claude.ai account)" : " (Anthropic)"} to generate recommendations. <a href="#/datenschutz">Privacy</a></> : "The rule engine runs entirely in your browser; nothing is sent to an AI provider."}>
                <Segmented label="Engine" value={useLlm ? "llm" : "demo"} onChange={(v) => setUseLlm(v === "llm")} options={[{ value: "demo", label: "Rule engine" }, { value: "llm", label: `AI (${ai.model})` }]} />
              </Field>
            )}
            {!setup.ready && <div className="callout callout-info" role="note"><LuInfo aria-hidden /><div>Recommendations are calculated from your process data. First enter {setup.items.filter((i) => (i.id === "volume" || i.id === "steps") && !i.done).map((i) => i.label.toLowerCase()).join(", ")} on the <button type="button" className="link-btn" onClick={() => navigate("process")}>Process</button> and <button type="button" className="link-btn" onClick={() => navigate("settings")}>Settings</button> pages.</div></div>}
            {error && <div className="callout callout-danger" role="alert"><LuCircleAlert aria-hidden /><div>{error}</div></div>}
            <Button variant="primary" type="submit" className="w-full" disabled={loading || !setup.ready} icon={loading ? <LuLoaderCircle className="spin" /> : <LuSparkles />}>
              {loading ? "Waiting for AI model…" : "Generate recommendations"}
            </Button>
          </form>
        </Card>

        <div className="stack">
          {!run ? (
            <Card><Empty icon={<LuSparkles />} title="No analysis yet" body="Fill in the brief and generate recommendations. Results are saved with the project." /></Card>
          ) : (
            <>
              <Card
                title="Compare interventions"
                subtitle={<>{run.problem} · {run.source === "llm" ? <>AI model <b>{run.model}</b></> : "rule engine"} · {fmt.relative(run.createdAt)}</>}
                actions={<>
                  {p.recommendationRuns.length > 1 && (
                    <select className="input select input-sm" aria-label="Previous analyses" value={run.id} onChange={(e) => setRunId(e.target.value)}>
                      {p.recommendationRuns.map((r, i) => <option key={r.id} value={r.id}>{i === 0 ? "Latest" : `#${p.recommendationRuns.length - i}`} · {r.problem}</option>)}
                    </select>
                  )}
                  <Segmented label="Sort by" value={sort} onChange={setSort} options={[{ value: "fit", label: "Fit" }, { value: "savings", label: "Savings" }, { value: "payback", label: "Payback" }]} />
                </>}
                pad={false}
              >
                {items.length === 0 ? (
                  <Empty title="Nothing fits these constraints" body="Raise the budget cap or relax constraints." />
                ) : (
                  <div className="table-wrap">
                    <table className="table rec-table">
                      <thead><tr><th>Intervention</th><th className="num">Fit</th><th className="num">Net / mo</th><th className="num">Invest</th><th className="num">Payback</th><th>Effort</th></tr></thead>
                      <tbody>
                        {items.map((r) => (
                          <tr key={r.id} className={cx("row-click", open === r.id && "row-on")} onClick={() => setOpen(r.id)}>
                            <td><button className="link-btn" onClick={(e) => { e.stopPropagation(); setOpen(r.id); }}>{r.title}</button>{p.adoptedRecommendationIds.includes(r.id) && <Badge tone="success">On roadmap</Badge>}</td>
                            <td className="num"><span className="fit"><span className="fit-bar"><span style={{ width: `${r.fitScore}%` }} /></span>{r.fitScore}</span></td>
                            <td className="num strong">{fmt.eur(r.monthlySavings)}</td>
                            <td className="num">{fmt.eur(r.investment)}</td>
                            <td className="num">{fmt.months(r.monthlySavings > 0 ? r.investment / r.monthlySavings : null)}</td>
                            <td className="nowrap"><Badge tone={r.complexity === "High" ? "danger" : r.complexity === "Medium" ? "warning" : "success"}>{r.complexity}</Badge> <span className="small muted">{r.implementationWeeks} wk</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="card-foot small muted"><LuInfo aria-hidden /> Savings are estimated net of running cost and are not additive — interventions overlap on the same steps. Use the Scenario Simulator for the combined business case.</div>
              </Card>

              {excluded.length > 0 && run.id === p.recommendationRuns[0]?.id && (
                <div className="callout callout-warning"><LuInfo aria-hidden /><div><b>Excluded by budget cap:</b> {excluded.map((e) => e.title).join("; ")}</div></div>
              )}

              {items.map((r) => (
                <RecCard key={r.id} rec={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} adopted={p.adoptedRecommendationIds.includes(r.id)} onAdopt={() => { dispatch({ type: "adoptRecommendation", rec: r }); toast({ tone: "success", title: "Added to roadmap", body: `“${r.title}” is now a task in Solution development.` }); }} stepName={p.process.steps.find((s) => s.id === r.targetStepId)?.name} source={run.source} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RecCard({ rec, open, onToggle, adopted, onAdopt, stepName, source }: { rec: Recommendation; open: boolean; onToggle: () => void; adopted: boolean; onAdopt: () => void; stepName?: string; source: RecommendationRun["source"] }) {
  return (
    <section className={cx("card rec-card", open && "rec-open")}>
      <button className="rec-head" onClick={onToggle} aria-expanded={open}>
        <div>
          <div className="rec-title">{rec.title}</div>
          <div className="rec-meta">{stepName ? `Targets: ${stepName}` : "Cross-process"} · {rec.complexity} complexity · {rec.implementationWeeks} weeks</div>
        </div>
        <div className="rec-head-right">
          <span className="rec-save">{fmt.eur(rec.monthlySavings)}<small>/mo</small></span>
          <LuChevronDown className="chev" aria-hidden />
        </div>
      </button>
      {open && (
        <div className="rec-body">
          <div className="rec-grid">
            <div><h4>Problem statement</h4><p>{rec.problemStatement}</p></div>
            <div><h4>Root-cause hypothesis</h4><p>{rec.rootCause}</p></div>
            <div className="span-2"><h4>Proposed solution</h4><p>{rec.solution}</p></div>
            <div><h4>Expected operational impact</h4><p>{rec.impact}</p></div>
            <div>
              <h4>Economics <DataTag kind="estimate" /></h4>
              <dl className="kv kv-tight">
                <div><dt>Estimated investment</dt><dd>{fmt.eur(rec.investment)}</dd></div>
                <div><dt>Net savings / month</dt><dd>{fmt.eur(rec.monthlySavings)}</dd></div>
                <div><dt>Complexity</dt><dd>{rec.complexity}</dd></div>
              </dl>
            </div>
            <div><h4>Key risks</h4><ul className="bullets">{rec.risks.map((x) => <li key={x}>{x}</li>)}</ul></div>
            <div><h4>Success metrics</h4><ul className="bullets">{rec.successMetrics.map((x) => <li key={x}>{x}</li>)}</ul></div>
          </div>
          {rec.notes.length > 0 && <div className="rec-notes">{rec.notes.map((n) => <span key={n} className="chip">{n}</span>)}</div>}
          <div className="rec-actions">
            <span className="small muted">{source === "llm" ? "AI-generated — verify before use." : `Fit score ${rec.fitScore}/100 from the rule engine.`}</span>
            <div className="row-gap">
              <Button size="sm" onClick={() => navigate("simulator")}>Model in simulator</Button>
              <Button size="sm" variant={adopted ? "secondary" : "primary"} disabled={adopted} icon={adopted ? <LuCheck /> : <LuPlus />} onClick={onAdopt}>{adopted ? "On roadmap" : "Add to roadmap"}</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Plain-language summary of the process data, used when no description is typed. */
function processSummary(p: import("../../domain/types").Project): string {
  const steps = p.process.steps;
  const slowest = [...steps].sort((a, b) => b.waitDays - a.waitDays)[0];
  const longest = [...steps].sort((a, b) => b.minutesPerInvoice - a.minutesPerInvoice)[0];
  const manual = steps.filter((s) => s.automatedShare < 0.2).map((s) => s.name.toLowerCase());
  const parts = [
    `${p.process.monthlyVolume} supplier invoices per month at ${p.assumptions.hourlyCost} EUR per hour.`,
    longest && longest.minutesPerInvoice > 0 ? `${longest.name} takes the most handling time (${longest.minutesPerInvoice} min per invoice).` : "",
    slowest && slowest.waitDays > 0 ? `Invoices wait longest in ${slowest.name.toLowerCase()} (${slowest.waitDays} days).` : "",
    manual.length ? `Mostly manual steps: ${manual.join(", ")}.` : "",
    p.assumptions.avgInvoiceValue > 0 && p.assumptions.discountCapturedToday < 0.8 ? `Only ${Math.round(p.assumptions.discountCapturedToday * 100)} % of early-payment discounts are captured.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}
