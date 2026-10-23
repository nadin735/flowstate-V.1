/**
 * Persistence adapter. Data lives only for the current browser session:
 *  - served by the FLOWSTATE server: an isolated in-memory session per browser (session cookie)
 *  - static page or Vercel: sessionStorage (per tab, cleared by the browser when the tab closes);
 *    on Vercel the AI endpoints still run server-side (health reports storage "browser")
 */
import { ProjectSchema, type Project } from "../../domain/types";

export type StorageMode = "server" | "browser" | "memory";
const LS_KEY = "flowstate.project.v1";
/** True when the page is hosted with AI functions but without server-side sessions (Vercel). */
let serverlessAi = false;
export function isServerless(): boolean {
  return serverlessAi;
}

function store(): Storage {
  return sessionStorage;
}

export async function detectMode(): Promise<StorageMode> {
  try {
    if (location.protocol === "http:" || location.protocol === "https:") {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch("/api/health", { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && body.app === "flowstate" && body.storage === "browser") serverlessAi = Boolean(body.ai);
        else if (body && body.app === "flowstate") return "server";
      }
    }
  } catch {
    /* not served by the FLOWSTATE server */
  }
  try {
    const k = "__flowstate_probe";
    store().setItem(k, "1");
    store().removeItem(k);
    try {
      localStorage.removeItem(LS_KEY); // clean up data persisted by older versions
    } catch {
      /* ignore */
    }
    return "browser";
  } catch {
    return "memory";
  }
}

export interface LoadResult {
  project: Project | null;
  error: string | null;
}

export function parseProject(raw: unknown): LoadResult {
  const res = ProjectSchema.safeParse(raw);
  if (res.success) return { project: res.data, error: null };
  const issue = res.error.issues[0];
  return { project: null, error: `Invalid project data at "${issue.path.join(".")}": ${issue.message}` };
}

export async function loadProject(mode: StorageMode): Promise<LoadResult> {
  try {
    if (mode === "server") {
      const res = await fetch("/api/project");
      if (res.status === 204 || res.status === 404) return { project: null, error: null };
      if (!res.ok) return { project: null, error: `Server returned ${res.status}` };
      return parseProject(await res.json());
    }
    if (mode === "browser") {
      const raw = store().getItem(LS_KEY);
      if (!raw) return { project: null, error: null };
      return parseProject(JSON.parse(raw));
    }
  } catch (e) {
    return { project: null, error: e instanceof Error ? e.message : "Could not load saved project" };
  }
  return { project: null, error: null };
}

export async function saveProject(mode: StorageMode, project: Project): Promise<void> {
  if (mode === "server") {
    const res = await fetch("/api/project", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(project) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Save failed (${res.status})`);
    }
    return;
  }
  if (mode === "browser") store().setItem(LS_KEY, JSON.stringify(project));
}

export async function clearProject(mode: StorageMode): Promise<void> {
  if (mode === "server") await fetch("/api/project", { method: "DELETE" });
  if (mode === "browser") store().removeItem(LS_KEY);
}

/** Deletes everything stored for this browser session. */
export async function endSession(mode: StorageMode): Promise<void> {
  if (mode === "server") {
    const res = await fetch("/api/session/end", { method: "POST" });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
  }
  if (mode === "browser") store().removeItem(LS_KEY);
}

export async function sessionTtlMinutes(mode: StorageMode): Promise<number | null> {
  if (mode !== "server") return null;
  try {
    const res = await fetch("/api/health");
    const body = await res.json();
    return typeof body.sessionTtlMinutes === "number" ? body.sessionTtlMinutes : null;
  } catch {
    return null;
  }
}

export interface AiStatus {
  available: boolean;
  model: string | null;
  /** "server": FLOWSTATE server with ANTHROPIC_API_KEY; "claude": the viewer's claude.ai account (artifact). */
  via: "server" | "claude" | null;
}

export const NO_AI: AiStatus = { available: false, model: null, via: null };

export async function aiStatus(mode: StorageMode): Promise<AiStatus> {
  if (mode !== "server" && !serverlessAi) return NO_AI;
  try {
    const res = await fetch("/api/ai/status");
    if (!res.ok) return NO_AI;
    const body = await res.json();
    return body.available ? { available: true, model: body.model, via: "server" } : NO_AI;
  } catch {
    return NO_AI;
  }
}
