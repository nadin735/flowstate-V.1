import { LuArrowRight, LuTriangleAlert } from "react-icons/lu";
import { useStore } from "../state/store";
import { Badge, Button, Card } from "./ui";
import { fmt } from "../format";
import { diffDays } from "../../domain/dates";
import { isOverdue, milestoneDone, phaseProgress } from "../../domain/roadmap";
import { navigate } from "../app";
import type { Task } from "../../domain/types";

const STATUS: Record<Task["status"], [string, "neutral" | "accent" | "warning" | "success"]> = {
  todo: ["To do", "neutral"],
  in_progress: ["In progress", "accent"],
  blocked: ["Blocked", "warning"],
  done: ["Done", "success"],
};

/** Focus cockpit: next steps and a phase timeline, built only from the existing roadmap data. */
export function FocusCockpit() {
  const { project: p, today } = useStore();
  if (p.tasks.length === 0 || p.phases.length === 0) return null;

  const rank = (t: Task) => (t.status === "blocked" ? 0 : isOverdue(t, today) ? 1 : t.status === "in_progress" ? 2 : 3);
  const open = p.tasks.filter((t) => t.status !== "done").sort((a, b) => rank(a) - rank(b) || a.due.localeCompare(b.due));
  const next = open.slice(0, 4);

  const phases = [...p.phases].sort((a, b) => a.order - b.order);
  const min = phases.reduce((m, ph) => (ph.start < m ? ph.start : m), phases[0].start);
  const max = phases.reduce((m, ph) => (ph.end > m ? ph.end : m), phases[0].end);
  const span = Math.max(1, diffDays(min, max));
  const pos = (d: string) => Math.max(0, Math.min(100, (diffDays(min, d) / span) * 100));
  const todayPos = today >= min && today <= max ? pos(today) : null;

  return (
    <div className="focus-grid">
      <Card title="Next steps" subtitle="Blocked and overdue first, then work in progress">
        {next.length === 0 ? (
          <p className="small muted">All tasks are done.</p>
        ) : (
          <ul className="focus-list">
            {next.map((t) => {
              const late = isOverdue(t, today);
              const [label, tone] = STATUS[t.status];
              return (
                <li key={t.id}>
                  <button className="focus-item" onClick={() => navigate("roadmap")}>
                    <span className="focus-title">{t.title}</span>
                    <span className="focus-meta">
                      <span>{t.owner}</span>
                      <span className={late ? "text-danger" : undefined}>{late && <LuTriangleAlert aria-hidden />} due {fmt.shortDate(t.due)}</span>
                      <Badge tone={late && t.status !== "blocked" ? "danger" : tone}>{late && t.status !== "blocked" ? "Overdue" : label}</Badge>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4"><Button size="sm" variant="ghost" onClick={() => navigate("roadmap")}>All tasks <LuArrowRight aria-hidden /></Button></div>
      </Card>

      <Card title="Timeline" subtitle={`${fmt.shortDate(min)} – ${fmt.shortDate(max)} · go-live ${fmt.date(p.targetGoLive)}`} actions={<Button size="sm" variant="ghost" onClick={() => navigate("roadmap")}>Roadmap <LuArrowRight aria-hidden /></Button>}>
        <ul className="tl">
          {phases.map((ph) => {
            const pr = phaseProgress(ph, p.tasks);
            const left = pos(ph.start);
            const width = Math.max(2, pos(ph.end) - left);
            const ms = p.milestones.filter((m) => m.phaseId === ph.id);
            const current = ph.start <= today && ph.end >= today;
            return (
              <li key={ph.id} className="tl-row">
                <div className="tl-label"><span className={current ? "strong" : undefined}>{ph.name}</span><span className="muted">{Math.round(pr * 100)}%</span></div>
                <div className="tl-track" aria-hidden>
                  {todayPos !== null && <span className="tl-today" style={{ left: `${todayPos}%` }} />}
                  <span className={`tl-bar${current ? " tl-bar-now" : ""}`} style={{ left: `${left}%`, width: `${width}%` }}>
                    <span className="tl-fill" style={{ width: `${pr * 100}%` }} />
                  </span>
                  {ms.map((m) => <span key={m.id} className={`tl-ms${milestoneDone(m, p.tasks) ? " tl-ms-done" : ""}`} style={{ left: `${pos(m.due)}%` }} title={`${m.name} · ${fmt.shortDate(m.due)}`} />)}
                </div>
                <span className="sr">{fmt.shortDate(ph.start)} to {fmt.shortDate(ph.end)}{current ? ", current phase" : ""}</span>
              </li>
            );
          })}
        </ul>
        <div className="tl-legend small muted"><span><i className="tl-key tl-key-today" /> Today</span><span><i className="tl-key tl-key-ms" /> Milestone</span><span><i className="tl-key tl-key-bar" /> Phase progress</span></div>
      </Card>
    </div>
  );
}
