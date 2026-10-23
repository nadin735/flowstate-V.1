/** Roadmap logic: progress, overdue detection, dependency rules and project health. */
import { diffDays } from "./dates";
import type { Milestone, Phase, Project, Task } from "./types";

export function isOverdue(task: Task, today: string): boolean {
  return task.status !== "done" && task.due < today;
}

/** Effort-weighted completion (in_progress counts half). */
export function progress(tasks: Task[]): number {
  const total = tasks.reduce((s, t) => s + t.effortDays, 0);
  if (total === 0) return 0;
  const done = tasks.reduce((s, t) => s + (t.status === "done" ? t.effortDays : t.status === "in_progress" ? t.effortDays * 0.5 : 0), 0);
  return done / total;
}

export function phaseProgress(phase: Phase, tasks: Task[]): number {
  return progress(tasks.filter((t) => t.phaseId === phase.id));
}

export function milestoneDone(m: Milestone, tasks: Task[]): boolean {
  if (m.manuallyCompleted) return true;
  const phaseTasks = tasks.filter((t) => t.phaseId === m.phaseId);
  return phaseTasks.length > 0 && phaseTasks.every((t) => t.status === "done");
}

export function overdueMilestones(milestones: Milestone[], tasks: Task[], today: string): Milestone[] {
  return milestones.filter((m) => m.due < today && !milestoneDone(m, tasks));
}

/** Dependencies that are not done yet. */
export function openDependencies(task: Task, tasks: Task[]): Task[] {
  return task.dependsOn.map((id) => tasks.find((t) => t.id === id)).filter((t): t is Task => !!t && t.status !== "done");
}

/** Returns a reason string if the status change is not allowed, else null. */
export function validateStatusChange(task: Task, next: Task["status"], tasks: Task[]): string | null {
  if ((next === "in_progress" || next === "done") && task.status !== next) {
    const open = openDependencies(task, tasks);
    if (open.length > 0) return `Blocked by ${open.length} unfinished ${open.length === 1 ? "dependency" : "dependencies"}: ${open.map((t) => t.title).join(", ")}`;
  }
  return null;
}

/** Detects a dependency cycle if `taskId` depended on `deps`. */
export function createsCycle(taskId: string, deps: string[], tasks: Task[]): boolean {
  const map = new Map(tasks.map((t) => [t.id, t.id === taskId ? deps : t.dependsOn]));
  const seen = new Set<string>();
  const stack = [...deps];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === taskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(map.get(cur) ?? []));
  }
  return false;
}

/** Validates date and dependency consistency for a task draft. Returns field errors. */
export function validateTask(draft: Task, tasks: Task[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.title.trim().length < 2) errors.title = "Title needs at least 2 characters.";
  if (!draft.owner.trim()) errors.owner = "Owner is required.";
  if (draft.due < draft.start) errors.due = "Due date must be on or after the start date.";
  if (draft.dependsOn.includes(draft.id)) errors.dependsOn = "A task cannot depend on itself.";
  else if (createsCycle(draft.id, draft.dependsOn, tasks)) errors.dependsOn = "These dependencies would create a cycle.";
  if (!(draft.budget >= 0)) errors.budget = "Budget must be zero or positive.";
  if (!(draft.effortDays >= 0.5)) errors.effortDays = "Effort must be at least 0.5 days.";
  return errors;
}

export type Health = "no-plan" | "on-track" | "at-risk" | "off-track";

export interface ProjectHealth {
  health: Health;
  progress: number;
  plannedProgress: number;
  overdueTasks: Task[];
  overdueMilestones: Milestone[];
  blockedTasks: Task[];
  budgetTotal: number;
  budgetCommitted: number;
  reasons: string[];
}

/** Planned progress = effort-weighted share of task time elapsed by today. */
export function plannedProgress(tasks: Task[], today: string): number {
  const total = tasks.reduce((s, t) => s + t.effortDays, 0);
  if (total === 0) return 0;
  const planned = tasks.reduce((s, t) => {
    const len = Math.max(1, diffDays(t.start, t.due) + 1);
    const elapsed = Math.min(len, Math.max(0, diffDays(t.start, today) + 1));
    return s + (t.effortDays * elapsed) / len;
  }, 0);
  return planned / total;
}

export function projectHealth(p: Project, today: string): ProjectHealth {
  const overdueTasks = p.tasks.filter((t) => isOverdue(t, today));
  const om = overdueMilestones(p.milestones, p.tasks, today);
  const blocked = p.tasks.filter((t) => t.status === "blocked");
  const prog = progress(p.tasks);
  const plan = plannedProgress(p.tasks, today);
  const reasons: string[] = [];
  const gap = plan - prog;
  if (om.length) reasons.push(`${om.length} milestone${om.length > 1 ? "s" : ""} overdue`);
  if (overdueTasks.length) reasons.push(`${overdueTasks.length} task${overdueTasks.length > 1 ? "s" : ""} overdue`);
  if (blocked.length) reasons.push(`${blocked.length} task${blocked.length > 1 ? "s" : ""} blocked`);
  if (gap > 0.05) reasons.push(`${Math.round(gap * 100)} pts behind plan`);
  const highRisks = p.risks.filter((r) => r.status !== "closed" && r.probability === "high" && r.impact !== "low").length;
  if (highRisks) reasons.push(`${highRisks} high-probability risk${highRisks > 1 ? "s" : ""} open`);
  let health: Health = "on-track";
  if (p.tasks.length === 0) {
    const budgetTotal0 = 0;
    return { health: "no-plan", progress: 0, plannedProgress: 0, overdueTasks: [], overdueMilestones: [], blockedTasks: [], budgetTotal: budgetTotal0, budgetCommitted: 0, reasons: ["No tasks planned yet"] };
  }
  if (om.length > 0 || gap > 0.15 || overdueTasks.length > 3) health = "off-track";
  else if (overdueTasks.length > 0 || blocked.length > 0 || gap > 0.05 || highRisks > 0) health = "at-risk";
  const budgetTotal = p.tasks.reduce((s, t) => s + t.budget, 0);
  const budgetCommitted = p.tasks.filter((t) => t.status !== "todo").reduce((s, t) => s + t.budget, 0);
  return { health, progress: prog, plannedProgress: plan, overdueTasks, overdueMilestones: om, blockedTasks: blocked, budgetTotal, budgetCommitted, reasons };
}
