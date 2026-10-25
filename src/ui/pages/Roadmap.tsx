import React, { useEffect, useMemo, useRef, useState } from "react";
import { LuPlus, LuTrash2, LuDiamond, LuLink2, LuTriangleAlert, LuCheck, LuPencil, LuListTodo, LuShieldAlert } from "react-icons/lu";
import { useStore } from "../state/store";
import { Badge, Button, Card, Confirm, Field, LevelBadge, Modal, PageHeader, Progress, Segmented, Select, TextInput, cx, Empty } from "../components/ui";
import { fmt } from "../format";
import { isOverdue, milestoneDone, phaseProgress, projectHealth, validateStatusChange, validateTask, openDependencies } from "../../domain/roadmap";
import { addDays, diffDays, startOfWeek, isValidISO } from "../../domain/dates";
import { RiskSchema, TaskSchema, type Phase, type Risk, type Task } from "../../domain/types";
import { HealthBadge } from "./Overview";

const STATUS: { value: Task["status"]; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];
const statusLabel = (s: Task["status"]) => STATUS.find((x) => x.value === s)!.label;
const statusTone = (s: Task["status"]) => (s === "done" ? "success" : s === "in_progress" ? "accent" : s === "blocked" ? "danger" : "neutral") as "success" | "accent" | "danger" | "neutral";

export function RoadmapPage() {
  const { project: p, dispatch, today, toast } = useStore();
  const [view, setView] = useState<"timeline" | "list">("timeline");
  const [phaseF, setPhaseF] = useState("all");
  const [ownerF, setOwnerF] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [editing, setEditing] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [phaseEdit, setPhaseEdit] = useState<Phase | null>(null);
  const [riskOpen, setRiskOpen] = useState(false);

  const health = projectHealth(p, today);
  const owners = Array.from(new Set([...p.team.map((t) => t.name), ...p.tasks.map((t) => t.owner)])).sort();
  const filtered = p.tasks.filter((t) => (phaseF === "all" || t.phaseId === phaseF) && (ownerF === "all" || t.owner === ownerF) && (statusF === "all" || t.status === statusF) && (!onlyOverdue || isOverdue(t, today)));

  const setStatus = (t: Task, status: Task["status"]) => {
    const reason = validateStatusChange(t, status, p.tasks);
    if (reason) {
      toast({ tone: "warning", title: "Status not changed", body: reason });
      return;
    }
    dispatch({ type: "setTaskStatus", id: t.id, status });
    if (status === "done") {
      const phaseTasks = p.tasks.filter((x) => x.phaseId === t.phaseId && x.id !== t.id);
      if (phaseTasks.every((x) => x.status === "done")) toast({ tone: "success", title: "Phase complete", body: `${p.phases.find((ph) => ph.id === t.phaseId)?.name} milestone reached.` });
      else toast({ tone: "success", title: "Task completed", body: t.title });
    }
  };

  const newTask = () => {
    const phase = p.phases.find((ph) => ph.start <= today && ph.end >= today) ?? p.phases[0];
    setEditing({
      isNew: true,
      task: { id: `t${Date.now().toString(36)}`, phaseId: phase.id, title: "", owner: p.lead.trim() || p.tasks[0]?.owner || "Project lead", status: "todo", priority: "medium", risk: "low", start: today > phase.start ? today : phase.start, due: addDays(today > phase.start ? today : phase.start, 13), dependsOn: [], budget: 0, effortDays: 5 },
    });
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Transformation Roadmap"
        title="Implementation plan"
        description="5 phases from discovery to benefits tracking. Progress is effort-weighted; tasks cannot start or complete before their dependencies are done."
        actions={<>
          {p.tasks.length > 0 && p.tasks.length < 5 && <Button icon={<LuListTodo />} onClick={() => { dispatch({ type: "generateStarterRoadmap" }); toast({ tone: "success", title: "Starter tasks added", body: "20 standard tasks across the 5 phases were added next to your own." }); }}>Add starter tasks</Button>}
          <Button variant="primary" icon={<LuPlus />} onClick={newTask}>Add task</Button>
        </>}
      />

      <div className="stat-grid">
        <div className="stat"><div className="stat-top"><span className="stat-label">Overall progress</span><HealthBadge health={health.health} /></div><div className="stat-value">{fmt.pct(health.progress)}</div><Progress value={health.progress} label="Overall progress" /><div className="stat-foot"><span className="stat-sub">Planned by today: {fmt.pct(health.plannedProgress)}</span></div></div>
        <div className="stat"><div className="stat-top"><span className="stat-label">Tasks</span></div><div className="stat-value">{p.tasks.filter((t) => t.status === "done").length}<small> / {p.tasks.length} done</small></div><div className="stat-foot"><span className="stat-sub">{p.tasks.filter((t) => t.status === "in_progress").length} in progress · {health.blockedTasks.length} blocked</span></div></div>
        <div className="stat"><div className="stat-top"><span className="stat-label">Overdue</span></div><div className={cx("stat-value", (health.overdueTasks.length + health.overdueMilestones.length) > 0 && "text-danger")}>{health.overdueTasks.length}<small> tasks · {health.overdueMilestones.length} milestones</small></div><div className="stat-foot"><button className="link-btn small" onClick={() => { setOnlyOverdue(true); setView("list"); }}>Show overdue</button></div></div>
        <div className="stat"><div className="stat-top"><span className="stat-label">Implementation budget</span></div><div className="stat-value">{fmt.eurCompact(health.budgetTotal)}</div><div className="stat-foot"><span className="stat-sub">{fmt.eurCompact(health.budgetCommitted)} committed (started tasks)</span></div></div>
      </div>

      <Card pad={false}
        title="Tasks"
        actions={<Segmented label="View" value={view} onChange={setView} options={[{ value: "timeline", label: "Timeline" }, { value: "list", label: "List" }]} />}>
        <div className="filters">
          <select className="input select input-sm" aria-label="Filter by phase" value={phaseF} onChange={(e) => setPhaseF(e.target.value)}>
            <option value="all">All phases</option>
            {p.phases.map((ph) => <option key={ph.id} value={ph.id}>{ph.order}. {ph.name}</option>)}
          </select>
          <select className="input select input-sm" aria-label="Filter by owner" value={ownerF} onChange={(e) => setOwnerF(e.target.value)}>
            <option value="all">All owners</option>
            {owners.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select className="input select input-sm" aria-label="Filter by status" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
            <option value="all">All statuses</option>
            {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <label className="check check-inline"><input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} /> Overdue only</label>
          <span className="small muted">{filtered.length} of {p.tasks.length} tasks</span>
          {(phaseF !== "all" || ownerF !== "all" || statusF !== "all" || onlyOverdue) && <button className="link-btn small" onClick={() => { setPhaseF("all"); setOwnerF("all"); setStatusF("all"); setOnlyOverdue(false); }}>Clear filters</button>}
        </div>
        {p.tasks.length === 0 ? (
          <Empty icon={<LuListTodo />} title="No tasks yet" body="Start from a proven 20-task plan for invoice automation across the 5 phases, budgets follow the preferred scenario’s investment, or add your own tasks." action={<div className="row-gap center-row"><Button size="sm" variant="primary" icon={<LuListTodo />} onClick={() => { dispatch({ type: "generateStarterRoadmap" }); toast({ tone: "success", title: "Starter roadmap generated", body: "20 tasks and 5 standard risks added. Adjust owners and dates." }); }}>Generate starter roadmap</Button><Button size="sm" icon={<LuPlus />} onClick={newTask}>Add task</Button></div>} />
        ) : filtered.length === 0 ? (
          <Empty title="No tasks match these filters" action={<Button size="sm" onClick={() => { setPhaseF("all"); setOwnerF("all"); setStatusF("all"); setOnlyOverdue(false); }}>Clear filters</Button>} />
        ) : view === "timeline" ? (
          <Gantt tasks={filtered} onOpen={(t) => setEditing({ task: t, isNew: false })} />
        ) : (
          <TaskList tasks={filtered} onOpen={(t) => setEditing({ task: t, isNew: false })} onStatus={setStatus} />
        )}
      </Card>

      <div className="grid-2">
        <Card title="Phases & milestones">
          <ul className="phase-list">
            {p.phases.map((ph) => {
              const ms = p.milestones.filter((m) => m.phaseId === ph.id);
              const prog = phaseProgress(ph, p.tasks);
              return (
                <li key={ph.id}>
                  <div className="phase-row">
                    <span className="phase-num">{ph.order}</span>
                    <div className="phase-main">
                      <div className="phase-name">{ph.name}<span className="small muted"> · {fmt.shortDate(ph.start)} – {fmt.shortDate(ph.end)}</span></div>
                      <Progress value={prog} tone={prog >= 1 ? "success" : "accent"} label={`${ph.name} progress`} />
                    </div>
                    <span className="phase-pct">{fmt.pct(prog)}</span>
                    <button className="icon-btn" aria-label={`Edit phase ${ph.name}`} onClick={() => setPhaseEdit(ph)}><LuPencil /></button>
                  </div>
                  {ms.map((m) => {
                    const done = milestoneDone(m, p.tasks);
                    const late = !done && m.due < today;
                    return (
                      <div key={m.id} className={cx("ms-row", done && "ms-done", late && "ms-late")}>
                        <LuDiamond aria-hidden />
                        <span>{m.name}</span>
                        <span className="small muted">{fmt.shortDate(m.due)}</span>
                        {done ? <Badge tone="success">Reached</Badge> : late ? <Badge tone="danger">Overdue</Badge> : <Badge>Open</Badge>}
                        <button className="link-btn small" onClick={() => dispatch({ type: "toggleMilestone", id: m.id })} title="Manually mark as reached (e.g. formal sign-off)">{m.manuallyCompleted ? "Undo sign-off" : done ? "" : "Sign off"}</button>
                      </div>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Risk register" pad={false} actions={<Button size="sm" icon={<LuPlus />} onClick={() => setRiskOpen(true)}>Add risk</Button>}>
          {p.risks.length === 0 ? <Empty icon={<LuShieldAlert />} title="No risks recorded" body="Capture what could delay or devalue the project, with a mitigation and an owner." /> : <div className="table-wrap">
            <table className="table risk-table">
              <thead><tr><th>Risk</th><th title="Probability">Prob.</th><th title="Impact">Impact</th><th>Status</th><th aria-label="Delete" /></tr></thead>
              <tbody>
                {p.risks.map((r) => (
                  <tr key={r.id}>
                    <td><div className="strong">{r.title}</div><div className="small muted">{r.mitigation}</div><div className="small muted mt-4">Owner: {r.owner}</div></td>
                    <td><LevelBadge level={r.probability} kind="level" /></td>
                    <td><LevelBadge level={r.impact} kind="level" /></td>
                    <td>
                      <select className="input select input-sm" aria-label={`Status of risk ${r.title}`} value={r.status} onChange={(e) => dispatch({ type: "updateRisk", id: r.id, patch: { status: e.target.value as typeof r.status } })}>
                        <option value="open">Open</option><option value="mitigating">Mitigating</option><option value="closed">Closed</option>
                      </select>
                    </td>
                    <td><button className="icon-btn" aria-label={`Delete risk ${r.title}`} onClick={() => { dispatch({ type: "deleteRisk", id: r.id }); toast({ tone: "info", title: "Risk deleted" }); }}><LuTrash2 /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </Card>
      </div>

      {phaseEdit && <PhaseModal key={phaseEdit.id} phase={phaseEdit} onClose={() => setPhaseEdit(null)} />}
      {riskOpen && <RiskModal owners={owners} onClose={() => setRiskOpen(false)} />}
      {editing && <TaskModal key={editing.task.id} initial={editing.task} isNew={editing.isNew} owners={owners} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TaskList({ tasks, onOpen, onStatus }: { tasks: Task[]; onOpen: (t: Task) => void; onStatus: (t: Task, s: Task["status"]) => void }) {
  const { project: p, today } = useStore();
  const sorted = [...tasks].sort((a, b) => a.phaseId.localeCompare(b.phaseId) || a.start.localeCompare(b.start));
  return (
    <div className="table-wrap">
      <table className="table task-table">
        <thead><tr><th aria-label="Complete" /><th>Task</th><th>Phase</th><th>Owner</th><th>Due</th><th>Priority</th><th>Status</th><th className="num">Budget</th></tr></thead>
        <tbody>
          {sorted.map((t) => {
            const overdue = isOverdue(t, today);
            const deps = openDependencies(t, p.tasks);
            return (
              <tr key={t.id} className={cx(t.status === "done" && "row-done")}>
                <td><input type="checkbox" className="task-check" aria-label={`Mark ${t.title} as done`} checked={t.status === "done"} onChange={(e) => onStatus(t, e.target.checked ? "done" : "in_progress")} /></td>
                <td>
                  <button className="link-btn task-title" onClick={() => onOpen(t)}>{t.title}</button>
                  <div className="task-sub">
                    {deps.length > 0 && <span title={deps.map((d) => d.title).join(", ")}><LuLink2 aria-hidden /> waits on {deps.length}</span>}
                    <LevelBadge level={t.risk} kind="risk" />
                  </div>
                </td>
                <td className="small">{p.phases.find((ph) => ph.id === t.phaseId)?.name}</td>
                <td className="small">{t.owner}</td>
                <td className={cx("small", overdue && "text-danger strong")}>{overdue && <LuTriangleAlert aria-label="Overdue" />} {fmt.shortDate(t.due)}</td>
                <td><LevelBadge level={t.priority} kind="priority" /></td>
                <td>
                  <select className={cx("input select input-sm status-select", `st-${t.status}`)} aria-label={`Status of ${t.title}`} value={t.status} onChange={(e) => onStatus(t, e.target.value as Task["status"])}>
                    {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </td>
                <td className="num small">{fmt.eur(t.budget)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Gantt({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const { project: p, today } = useStore();
  const start = startOfWeek([...p.phases.map((x) => x.start), ...tasks.map((t) => t.start)].sort()[0]);
  const end = [...p.phases.map((x) => x.end), ...tasks.map((t) => t.due)].sort().reverse()[0];
  const weeks = Math.ceil((diffDays(start, end) + 1) / 7);
  // The timeline fills the available width (min. 30 px per week; scrolls horizontally below that).
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const LABEL = 300;
  const W = Math.max(30, Math.floor((boxW - LABEL - 2) / Math.max(1, weeks)));
  const width = weeks * W;
  const px = (d: string) => (diffDays(start, d) / 7) * W;
  const months = useMemo(() => {
    const out: { label: string; x: number }[] = [];
    let last = "";
    for (let i = 0; i < weeks; i++) {
      const d = addDays(start, i * 7);
      const key = d.slice(0, 7);
      if (key !== last) {
        out.push({ label: fmt.month(key), x: i * W });
        last = key;
      }
    }
    return out;
  }, [start, weeks, W]);

  return (
    <div className="gantt" role="region" aria-label="Timeline" tabIndex={0} ref={boxRef}>
      <div className="gantt-grid" style={{ gridTemplateColumns: `${boxW && boxW < 640 ? 180 : LABEL}px ${width}px` }}>
        <div className="g-corner">Task</div>
        <div className="g-head" style={{ width }}>
          {months.map((m) => <span key={m.x} style={{ left: m.x }}>{m.label}</span>)}
        </div>
        {p.phases.map((ph) => {
          const pts = tasks.filter((t) => t.phaseId === ph.id).sort((a, b) => a.start.localeCompare(b.start));
          if (pts.length === 0) return null;
          const ms = p.milestones.filter((m) => m.phaseId === ph.id);
          return (
            <React.Fragment key={ph.id}>
              <div className="g-phase-label">{ph.order}. {ph.name}</div>
              <div className="g-phase-lane" style={{ width }}>
                <div className="g-phase-span" style={{ left: px(ph.start), width: Math.max(4, px(addDays(ph.end, 1)) - px(ph.start)) }} />
                {ms.map((m) => <span key={m.id} className={cx("g-ms", milestoneDone(m, p.tasks) && "g-ms-done", !milestoneDone(m, p.tasks) && m.due < today && "g-ms-late")} style={{ left: px(m.due) }} title={`${m.name} · ${fmt.date(m.due)}`} />)}
                <div className="g-today" style={{ left: px(today) }} />
              </div>
              {pts.map((t) => {
                const od = isOverdue(t, today);
                return (
                  <React.Fragment key={t.id}>
                    <button className={cx("g-label", t.status === "done" && "g-label-done")} onClick={() => onOpen(t)} title={t.title}>
                      <span className={cx("g-dot", `st-${t.status}`)} />{t.title}
                    </button>
                    <div className="g-lane" style={{ width }}>
                      {Array.from({ length: weeks }, (_, i) => <span key={i} className="g-col" style={{ left: i * W }} />)}
                      <button
                        className={cx("g-bar", `gb-${t.status}`, od && "gb-overdue")}
                        style={{ left: px(t.start), width: Math.max(10, px(addDays(t.due, 1)) - px(t.start)) }}
                        onClick={() => onOpen(t)}
                        aria-label={`${t.title}, ${statusLabel(t.status)}, ${fmt.date(t.start)} to ${fmt.date(t.due)}${od ? ", overdue" : ""}`}
                        title={`${t.title}\n${statusLabel(t.status)} · ${t.owner}\n${fmt.date(t.start)} → ${fmt.date(t.due)}`}
                      >
                        {t.dependsOn.length > 0 && <LuLink2 className="g-dep" aria-hidden />}
                      </button>
                      <div className="g-today" style={{ left: px(today) }} />
                    </div>
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
      <div className="legend gantt-legend">
        {STATUS.map((s) => <span key={s.value}><i className={cx("legend-sq", `gb-${s.value}`)} />{s.label}</span>)}
        <span><i className="legend-sq gb-overdue-l" />Overdue</span>
        <span><i className="legend-today" />Today</span>
        <span><LuDiamond aria-hidden /> Milestone</span>
      </div>
    </div>
  );
}

function TaskModal({ initial, isNew, owners, onClose }: { initial: Task; isNew: boolean; owners: string[]; onClose: () => void }) {
  const { project: p, dispatch, toast } = useStore();
  const [t, setT] = useState<Task>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDel, setConfirmDel] = useState(false);
  const others = p.tasks.filter((x) => x.id !== t.id);
  const set = (patch: Partial<Task>) => setT((x) => ({ ...x, ...patch }));

  const save = () => {
    const errs = validateTask(t, isNew ? [...p.tasks, t] : p.tasks.map((x) => (x.id === t.id ? t : x)));
    if (!isValidISO(t.start)) errs.start = "Enter a valid date.";
    if (!isValidISO(t.due)) errs.due = "Enter a valid date.";
    const parsed = TaskSchema.safeParse({ ...t, title: t.title.trim(), owner: t.owner.trim() });
    if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
    if (t.status !== initial.status || isNew) {
      const r = validateStatusChange({ ...t, status: isNew ? "todo" : initial.status }, t.status, p.tasks);
      if (r && t.status !== "todo" && t.status !== "blocked") errs.status = r;
    }
    setErrors(errs);
    if (Object.keys(errs).length || !parsed.success) {
      toast({ tone: "error", title: "Please fix the highlighted fields" });
      return;
    }
    dispatch({ type: "upsertTask", task: parsed.data, isNew });
    toast({ tone: "success", title: isNew ? "Task created" : "Task saved", body: parsed.data.title });
    onClose();
  };

  return (
    <>
      <Modal open onClose={onClose} title={isNew ? "New task" : "Edit task"} wide footer={<>
        {!isNew && <Button variant="danger" icon={<LuTrash2 />} onClick={() => setConfirmDel(true)} className="mr-auto">Delete</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon={<LuCheck />} onClick={save}>{isNew ? "Create task" : "Save changes"}</Button>
      </>}>
        <div className="form-grid">
          <div className="span-2"><TextInput label="Title" value={t.title} onChange={(v) => set({ title: v })} error={errors.title} maxLength={120} placeholder="e.g. Configure tolerance rules" /></div>
          <Select label="Phase" value={t.phaseId} onChange={(v) => set({ phaseId: v })} options={p.phases.map((ph) => ({ value: ph.id, label: `${ph.order}. ${ph.name}` }))} />
          <Field label="Owner" htmlFor="owner" error={errors.owner}>
            <input id="owner" className="input" list="owner-list" value={t.owner} maxLength={60} onChange={(e) => set({ owner: e.target.value })} aria-invalid={!!errors.owner} />
            <datalist id="owner-list">{owners.map((o) => <option key={o} value={o} />)}</datalist>
          </Field>
          <Field label="Start" htmlFor="start" error={errors.start}><input id="start" type="date" className="input" value={t.start} onChange={(e) => set({ start: e.target.value })} /></Field>
          <Field label="Due" htmlFor="due" error={errors.due}><input id="due" type="date" className="input" value={t.due} onChange={(e) => set({ due: e.target.value })} /></Field>
          <Field label="Status" htmlFor="status" error={errors.status}>
            <select id="status" className="input select" value={t.status} onChange={(e) => set({ status: e.target.value as Task["status"] })}>{STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          </Field>
          <Select label="Priority" value={t.priority} onChange={(v) => set({ priority: v })} options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]} />
          <Select label="Risk level" value={t.risk} onChange={(v) => set({ risk: v })} options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]} />
          <Field label="Budget (EUR)" htmlFor="budget" error={errors.budget}><input id="budget" className="input" inputMode="numeric" value={String(t.budget)} onChange={(e) => set({ budget: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} /></Field>
          <Field label="Effort (person-days)" htmlFor="effort" error={errors.effortDays}><input id="effort" className="input" inputMode="decimal" value={String(t.effortDays)} onChange={(e) => set({ effortDays: Number(e.target.value.replace(",", ".")) || 0 })} /></Field>
        </div>
        <Field label="Depends on" error={errors.dependsOn} hint="This task can only start or complete after these are done.">
          <div className="dep-list">
            {p.phases.map((ph) => {
              const pts = others.filter((x) => x.phaseId === ph.id);
              if (!pts.length) return null;
              return (
                <div key={ph.id} className="dep-group">
                  <div className="dep-phase">{ph.name}</div>
                  {pts.map((x) => (
                    <label key={x.id} className="check">
                      <input type="checkbox" checked={t.dependsOn.includes(x.id)} onChange={(e) => set({ dependsOn: e.target.checked ? [...t.dependsOn, x.id] : t.dependsOn.filter((d) => d !== x.id) })} />
                      <span>{x.title}</span>
                      <Badge tone={statusTone(x.status)}>{statusLabel(x.status)}</Badge>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </Field>
      </Modal>
      <Confirm open={confirmDel} title="Delete task?" danger confirmLabel="Delete task" body={<>“{t.title}” will be removed and dropped from other tasks' dependencies.</>} onCancel={() => setConfirmDel(false)}
        onConfirm={() => { dispatch({ type: "deleteTask", id: t.id }); toast({ tone: "info", title: "Task deleted" }); setConfirmDel(false); onClose(); }} />
    </>
  );
}

function PhaseModal({ phase, onClose }: { phase: Phase; onClose: () => void }) {
  const { project: p, dispatch, toast } = useStore();
  const ms = p.milestones.find((m) => m.phaseId === phase.id);
  const [name, setName] = useState(phase.name);
  const [start, setStart] = useState(phase.start);
  const [end, setEnd] = useState(phase.end);
  const [msName, setMsName] = useState(ms?.name ?? "");
  const [msDue, setMsDue] = useState(ms?.due ?? phase.end);
  const errors: Record<string, string> = {};
  if (!name.trim()) errors.name = "Name is required.";
  if (!isValidISO(start)) errors.start = "Enter a valid date.";
  if (!isValidISO(end)) errors.end = "Enter a valid date.";
  else if (isValidISO(start) && end < start) errors.end = "End must be on or after the start.";
  if (ms && !msName.trim()) errors.msName = "Name is required.";
  if (ms && !isValidISO(msDue)) errors.msDue = "Enter a valid date.";
  const save = () => {
    if (Object.keys(errors).length) {
      toast({ tone: "error", title: "Please fix the highlighted fields" });
      return;
    }
    dispatch({ type: "updatePhase", id: phase.id, patch: { name: name.trim(), start, end } });
    if (ms) dispatch({ type: "updateMilestone", id: ms.id, patch: { name: msName.trim(), due: msDue } });
    toast({ tone: "success", title: "Phase saved", body: name.trim() });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Edit phase" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<LuCheck />} onClick={save}>Save phase</Button></>}>
      <TextInput label="Phase name" value={name} maxLength={80} onChange={setName} error={errors.name} />
      <div className="form-grid">
        <Field label="Start" htmlFor="ph-start" error={errors.start}><input id="ph-start" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End" htmlFor="ph-end" error={errors.end}><input id="ph-end" type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      {ms && <div className="form-grid">
        <TextInput label="Milestone" value={msName} maxLength={100} onChange={setMsName} error={errors.msName} />
        <Field label="Milestone due" htmlFor="ms-due" error={errors.msDue}><input id="ms-due" type="date" className="input" value={msDue} onChange={(e) => setMsDue(e.target.value)} /></Field>
      </div>}
    </Modal>
  );
}

function RiskModal({ owners, onClose }: { owners: string[]; onClose: () => void }) {
  const { project: p, dispatch, toast } = useStore();
  const [r, setR] = useState<Risk>({ id: `r${Date.now().toString(36)}`, title: "", probability: "medium", impact: "medium", mitigation: "", owner: p.lead.trim() || p.risks[0]?.owner || p.tasks[0]?.owner || "Project lead", status: "open" });
  const [tried, setTried] = useState(false);
  const titleErr = tried && !r.title.trim() ? "Describe the risk." : undefined;
  const save = () => {
    setTried(true);
    const parsed = RiskSchema.safeParse({ ...r, title: r.title.trim(), owner: r.owner.trim(), mitigation: r.mitigation.trim() });
    if (!parsed.success || !r.title.trim()) {
      toast({ tone: "error", title: "Please fix the highlighted fields" });
      return;
    }
    dispatch({ type: "addRisk", risk: parsed.data });
    toast({ tone: "success", title: "Risk added", body: parsed.data.title });
    onClose();
  };
  const lv = [{ value: "low" as const, label: "Low" }, { value: "medium" as const, label: "Medium" }, { value: "high" as const, label: "High" }];
  return (
    <Modal open onClose={onClose} title="Add risk" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<LuCheck />} onClick={save}>Add risk</Button></>}>
      <TextInput label="Risk" value={r.title} maxLength={140} onChange={(v) => setR({ ...r, title: v })} error={titleErr} placeholder="e.g. Low supplier adoption of e-invoicing" />
      <div className="form-grid">
        <Select label="Probability" value={r.probability} onChange={(v) => setR({ ...r, probability: v })} options={lv} />
        <Select label="Impact" value={r.impact} onChange={(v) => setR({ ...r, impact: v })} options={lv} />
      </div>
      <TextInput label="Mitigation" multiline value={r.mitigation} maxLength={400} onChange={(v) => setR({ ...r, mitigation: v })} />
      <Field label="Owner" htmlFor="risk-owner">
        <input id="risk-owner" className="input" list="risk-owner-list" value={r.owner} maxLength={60} onChange={(e) => setR({ ...r, owner: e.target.value })} />
        <datalist id="risk-owner-list">{owners.map((o) => <option key={o} value={o} />)}</datalist>
      </Field>
    </Modal>
  );
}
