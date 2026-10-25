import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Activity, Assumptions, Company, Idea, KpiMeasurement, Milestone, Phase, Preferences, ProcessStep, Project, Recommendation, RecommendationRun, Risk, Scenario, Task } from "../../domain/types";
import { benchmarkScenarios, createEmptyProject, emptyScenarios, scenariosAreEmpty, starterRoadmap, STEP_TEMPLATES } from "../../domain/template";
import { todayISO, addDays } from "../../domain/dates";
import { calculateAll, type ScenarioResult } from "../../domain/finance";
import { setLocale } from "../format";
import { setIntakeSkipped } from "./onboarding";
import { claudeSample } from "../ai/claude";
import { createTestDataProject } from "../../domain/testdata";
import { aiStatus, endSession as endStoredSession, detectMode, loadProject, saveProject, sessionTtlMinutes, type AiStatus, type StorageMode } from "./persistence";

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type Action =
  | { type: "load"; project: Project }
  | { type: "updateStep"; id: string; patch: Partial<ProcessStep> }
  | { type: "resetStep"; id: string }
  | { type: "setVolume"; volume: number }
  | { type: "updateAssumptions"; patch: Partial<Assumptions> }
  | { type: "updateScenario"; id: Scenario["id"]; patch: Partial<Scenario> }
  | { type: "resetScenarios" }
  | { type: "selectScenario"; id: Scenario["id"] }
  | { type: "addRecommendationRun"; run: RecommendationRun }
  | { type: "adoptRecommendation"; rec: Recommendation }
  | { type: "upsertTask"; task: Task; isNew: boolean }
  | { type: "deleteTask"; id: string }
  | { type: "setTaskStatus"; id: string; status: Task["status"] }
  | { type: "toggleMilestone"; id: string }
  | { type: "updateRisk"; id: string; patch: Partial<Risk> }
  | { type: "addRisk"; risk: Risk }
  | { type: "deleteRisk"; id: string }
  | { type: "updatePhase"; id: string; patch: Partial<Phase> }
  | { type: "updateMilestone"; id: string; patch: Partial<Milestone> }
  | { type: "addIdea"; idea: Idea }
  | { type: "updateIdea"; id: string; patch: Partial<Idea> }
  | { type: "deleteIdea"; id: string }
  | { type: "promoteIdea"; id: string }
  | { type: "upsertKpi"; kpi: KpiMeasurement }
  | { type: "deleteKpi"; month: string }
  | { type: "updateCompany"; patch: Partial<Company> }
  | { type: "updateDetails"; patch: Partial<Pick<Project, "name" | "description" | "sponsor" | "lead" | "targetGoLive" | "startDate">> }
  | { type: "updatePrefs"; patch: Partial<Preferences> }
  | { type: "log"; text: string; kind: Activity["kind"] }
  | { type: "applyBenchmarks"; onlyIfEmpty?: boolean }
  | { type: "generateStarterRoadmap" }
  | { type: "loadTestData" };

let seq = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

function log(p: Project, text: string, kind: Activity["kind"]): Activity[] {
  return [{ id: uid("a"), at: new Date().toISOString(), text, kind }, ...p.activity].slice(0, 60);
}

function reducer(p: Project, a: Action): Project {
  const touch = (next: Project): Project => ({ ...next, updatedAt: new Date().toISOString() });
  switch (a.type) {
    case "load":
      return a.project;
    case "updateStep": {
      const steps = p.process.steps.map((s) => (s.id === a.id ? { ...s, ...a.patch } : s));
      return touch({ ...p, process: { ...p.process, steps } });
    }
    case "resetStep": {
      const tpl = STEP_TEMPLATES.find((s) => s.id === a.id);
      if (!tpl) return p;
      const steps = p.process.steps.map((s) => (s.id === a.id ? { ...tpl, systems: [] } : s));
      return touch({ ...p, process: { ...p.process, steps }, activity: log(p, `Process step “${tpl.name}” cleared`, "process") });
    }
    case "setVolume": {
      const v = Math.max(0, Math.round(a.volume));
      return touch({ ...p, process: { ...p.process, monthlyVolume: v }, assumptions: { ...p.assumptions, monthlyVolume: v } });
    }
    case "updateAssumptions":
      return touch({ ...p, assumptions: { ...p.assumptions, ...a.patch } });
    case "updateScenario":
      return touch({ ...p, scenarios: p.scenarios.map((s) => (s.id === a.id ? { ...s, ...a.patch } : s)) });
    case "resetScenarios": {
      return touch({ ...p, scenarios: emptyScenarios(), activity: log(p, "Scenario levers cleared", "scenario") });
    }
    case "selectScenario": {
      const s = p.scenarios.find((x) => x.id === a.id)!;
      return touch({ ...p, selectedScenario: a.id, activity: log(p, `“${s.name}” selected as preferred scenario`, "scenario") });
    }
    case "addRecommendationRun":
      return touch({
        ...p,
        recommendationRuns: [a.run, ...p.recommendationRuns].slice(0, 20),
        activity: log(p, `${a.run.items.length} recommendations generated (${a.run.source === "llm" ? "AI model" : "rule engine"})`, "recommendation"),
      });
    case "adoptRecommendation": {
      if (p.adoptedRecommendationIds.includes(a.rec.id)) return p;
      const phase = p.phases.find((x) => x.id === "p3") ?? p.phases[p.phases.length - 1];
      const task: Task = {
        id: uid("t"),
        phaseId: phase.id,
        title: a.rec.title.slice(0, 120),
        owner: p.lead.trim() || "Unassigned",
        status: "todo",
        priority: a.rec.fitScore >= 50 ? "high" : "medium",
        risk: a.rec.complexity === "High" ? "high" : a.rec.complexity === "Medium" ? "medium" : "low",
        start: phase.start,
        due: [addDays(phase.start, a.rec.implementationWeeks * 7 - 1), phase.end].sort()[0],
        dependsOn: [],
        budget: a.rec.investment,
        effortDays: Math.max(1, Math.round(a.rec.implementationWeeks * 2)),
      };
      return touch({
        ...p,
        adoptedRecommendationIds: [...p.adoptedRecommendationIds, a.rec.id],
        tasks: [...p.tasks, task],
        activity: log(p, `Recommendation “${a.rec.title}” added to roadmap`, "recommendation"),
      });
    }
    case "upsertTask": {
      const tasks = a.isNew ? [...p.tasks, a.task] : p.tasks.map((t) => (t.id === a.task.id ? a.task : t));
      return touch({ ...p, tasks, activity: log(p, `${a.isNew ? "Task created" : "Task updated"}: ${a.task.title}`, "task") });
    }
    case "deleteTask": {
      const t = p.tasks.find((x) => x.id === a.id);
      const tasks = p.tasks.filter((x) => x.id !== a.id).map((x) => ({ ...x, dependsOn: x.dependsOn.filter((d) => d !== a.id) }));
      return touch({ ...p, tasks, activity: log(p, `Task deleted: ${t?.title ?? a.id}`, "task") });
    }
    case "setTaskStatus": {
      const t = p.tasks.find((x) => x.id === a.id);
      if (!t || t.status === a.status) return p;
      const label = { todo: "To do", in_progress: "In progress", blocked: "Blocked", done: "Done" }[a.status];
      return touch({ ...p, tasks: p.tasks.map((x) => (x.id === a.id ? { ...x, status: a.status } : x)), activity: log(p, `${t.title} → ${label}`, "task") });
    }
    case "toggleMilestone":
      return touch({ ...p, milestones: p.milestones.map((m: Milestone) => (m.id === a.id ? { ...m, manuallyCompleted: !m.manuallyCompleted } : m)) });
    case "updateRisk":
      return touch({ ...p, risks: p.risks.map((r) => (r.id === a.id ? { ...r, ...a.patch } : r)) });
    case "addRisk":
      return touch({ ...p, risks: [...p.risks, a.risk], activity: log(p, `Risk added: ${a.risk.title}`, "task") });
    case "deleteRisk":
      return touch({ ...p, risks: p.risks.filter((r) => r.id !== a.id) });
    case "updatePhase":
      return touch({ ...p, phases: p.phases.map((ph) => (ph.id === a.id ? { ...ph, ...a.patch } : ph)) });
    case "updateMilestone":
      return touch({ ...p, milestones: p.milestones.map((m) => (m.id === a.id ? { ...m, ...a.patch } : m)) });
    case "addIdea":
      return touch({ ...p, ideas: [a.idea, ...p.ideas].slice(0, 100), activity: log(p, `Idea added: ${a.idea.title}`, "system") });
    case "updateIdea":
      return touch({ ...p, ideas: p.ideas.map((i) => (i.id === a.id ? { ...i, ...a.patch } : i)) });
    case "deleteIdea":
      return touch({ ...p, ideas: p.ideas.filter((i) => i.id !== a.id) });
    case "promoteIdea": {
      const idea = p.ideas.find((i) => i.id === a.id);
      if (!idea || idea.stage === "promoted" || p.phases.length === 0) return p;
      const phase = [...p.phases].sort((x, y) => x.order - y.order).find((ph) => ph.end >= todayISO()) ?? p.phases[p.phases.length - 1];
      const task: Task = {
        id: uid("t"), phaseId: phase.id, title: idea.title.slice(0, 120), owner: p.lead.trim() || "Unassigned",
        status: "todo", priority: "medium", risk: "low", start: phase.start, due: phase.end, dependsOn: [], budget: 0, effortDays: 1,
      };
      return touch({ ...p, ideas: p.ideas.map((i) => (i.id === a.id ? { ...i, stage: "promoted" } : i)), tasks: [...p.tasks, task], activity: log(p, `Idea “${idea.title}” moved to roadmap`, "task") });
    }
    case "upsertKpi": {
      const kpis = [...p.kpis.filter((k) => k.month !== a.kpi.month), a.kpi].sort((x, y) => x.month.localeCompare(y.month)).slice(-60);
      return touch({ ...p, kpis, activity: log(p, `KPI measurement recorded for ${a.kpi.month}`, "system") });
    }
    case "deleteKpi":
      return touch({ ...p, kpis: p.kpis.filter((k) => k.month !== a.month) });
    case "updateCompany":
      return touch({ ...p, company: { ...p.company, ...a.patch } });
    case "updateDetails":
      return touch({ ...p, ...a.patch });
    case "applyBenchmarks": {
      if (a.onlyIfEmpty && !scenariosAreEmpty(p.scenarios)) return p;
      return touch({ ...p, scenarios: benchmarkScenarios(p.process.monthlyVolume), activity: log(p, "Benchmark values loaded for the 3 scenarios", "scenario") });
    }
    case "generateStarterRoadmap": {
      const { tasks, risks } = starterRoadmap(p);
      return touch({ ...p, tasks: [...p.tasks, ...tasks], risks: p.risks.length ? p.risks : risks, activity: log(p, `Starter roadmap generated (${tasks.length} tasks)`, "task") });
    }
    case "loadTestData":
      return createTestDataProject({ ...p.preferences });
    case "log":
      return touch({ ...p, activity: log(p, a.text, a.kind) });
    case "updatePrefs":
      return touch({ ...p, preferences: { ...p.preferences, ...a.patch } });
  }
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export interface Toast {
  id: string;
  tone: "success" | "error" | "info" | "warning";
  title: string;
  body?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type SaveState = "idle" | "saving" | "saved" | "error";

interface Store {
  project: Project;
  dispatch: (a: Action) => void;
  results: ScenarioResult[];
  selectedResult: ScenarioResult;
  today: string;
  mode: StorageMode;
  saveState: SaveState;
  saveError: string | null;
  ai: AiStatus;
  toast: (t: Omit<Toast, "id">) => void;
  resetProject: () => Promise<void>;
  endSession: () => Promise<void>;
  sessionTtl: number | null;
  saveNow: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);
const ToastCtx = createContext<{ toasts: Toast[]; dismiss: (id: string) => void } | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}
export function useToasts() {
  return useContext(ToastCtx)!;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<StorageMode>("memory");
  const [ai, setAi] = useState<AiStatus>({ available: false, model: null, via: null });
  const [project, dispatch] = useReducer(reducer, undefined, () => createEmptyProject());
  const [sessionTtl, setSessionTtl] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const loadedAt = useRef<string | null>(null);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = uid("n");
    setToasts((x) => [...x.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.tone === "error" ? 7000 : 4200);
  }, []);
  const dismiss = useCallback((id: string) => setToasts((x) => x.filter((y) => y.id !== id)), []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = await detectMode();
      const [loaded, aiS, ttl] = await Promise.all([loadProject(m), aiStatus(m), sessionTtlMinutes(m)]);
      if (cancelled) return;
      setMode(m);
      setAi(aiS);
      if (!aiS.available) {
        // Published as a claude.ai artifact: use Claude through the viewer's own account.
        claudeSample().then((s) => {
          if (s && !cancelled) setAi({ available: true, model: "Claude", via: "claude" });
        });
      }
      setSessionTtl(ttl);
      if (loaded.project) {
        dispatch({ type: "load", project: loaded.project });
        loadedAt.current = loaded.project.updatedAt;
      } else if (loaded.error) {
        toast({ tone: "warning", title: "Saved project could not be restored", body: `${loaded.error}. A new empty project was started instead.` });
      }
      // Demo mode (demo build, ?demo or #/demo): start with the fictional test-data project.
      if (!loaded.project && isDemoRequest()) {
        dispatch({ type: "loadTestData" });
        if (location.hash === "#/demo" || location.hash === "" || location.hash === "#/" || location.hash === "#/welcome") location.hash = "#/overview";
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  setLocale(project.preferences.locale);

  // Debounced autosave
  const doSave = useCallback(async (p: Project) => {
    if (mode === "memory") return;
    setSaveState("saving");
    try {
      await saveProject(mode, p);
      setSaveState("saved");
      setSaveError(null);
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : "Save failed");
    }
  }, [mode]);

  useEffect(() => {
    if (!ready) return;
    if (loadedAt.current === project.updatedAt) return;
    const t = setTimeout(() => doSave(project), 700);
    return () => clearTimeout(t);
  }, [project, ready, doSave]);

  const resetProject = useCallback(async () => {
    setIntakeSkipped(false);
    const fresh = createEmptyProject();
    fresh.preferences = { ...project.preferences, onboarded: true };
    dispatch({ type: "load", project: fresh });
    loadedAt.current = null;
    await doSave(fresh);
  }, [project.preferences, doSave]);

  /** Deletes all data of this browser session and starts over with an empty project. */
  const endSession = useCallback(async () => {
    try {
      await endStoredSession(mode);
    } catch (e) {
      toast({ tone: "error", title: "Session data could not be deleted", body: e instanceof Error ? e.message : undefined });
      return;
    }
    setIntakeSkipped(false);
    const fresh = createEmptyProject();
    fresh.preferences = { ...project.preferences, onboarded: false, asOfDate: null };
    loadedAt.current = fresh.updatedAt; // do not re-save the empty project until the user changes something
    dispatch({ type: "load", project: fresh });
    setSaveState("idle");
    toast({ tone: "success", title: "Session ended", body: "All data from this session was deleted." });
  }, [mode, project.preferences, toast]);

  const saveNow = useCallback(() => doSave(project), [doSave, project]);

  const results = useMemo(() => calculateAll(project.process, project.assumptions, project.scenarios), [project.process, project.assumptions, project.scenarios]);
  const selectedResult = results.find((r) => r.scenarioId === project.selectedScenario) ?? results[0];
  const today = project.preferences.asOfDate ?? todayISO();

  const value: Store = { project, dispatch, results, selectedResult, today, mode, saveState, saveError, ai, toast, resetProject, endSession, sessionTtl, saveNow };

  return (
    <ToastCtx.Provider value={{ toasts, dismiss }}>
      <Ctx.Provider value={value}>{ready ? children : <BootScreen />}</Ctx.Provider>
    </ToastCtx.Provider>
  );
}

function BootScreen() {
  return (
    <div className="boot" role="status" aria-live="polite">
      <div className="boot-mark" />
      <div className="boot-text">Loading workspace…</div>
    </div>
  );
}

/** True for the demo build, or when the page is opened with ?demo or #/demo. */
export function isDemoRequest(): boolean {
  if (typeof __DEMO__ !== "undefined" && __DEMO__) return true;
  return /[?&]demo\b/.test(location.search) || location.hash === "#/demo";
}

/** The project currently shown is the fictional test-data project. */
export function isTestData(p: Project): boolean {
  return p.description.startsWith("TEST DATA");
}
