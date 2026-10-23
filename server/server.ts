/**
 * FLOWSTATE server — zero-dependency Node HTTP server.
 *
 *  - Serves the built client from ./dist
 *  - Keeps one isolated project per browser session, in memory only. Nothing is written
 *    to disk; a session's data is deleted when the visitor ends the session or after
 *    FLOWSTATE_SESSION_TTL_MIN minutes of inactivity.
 *  - Optional AI recommendations via the Anthropic Messages API (server-side key only)
 *
 * Environment: see README / .env.example.
 */
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ProjectSchema } from "../src/domain/types";
import { HttpError, rateLimited, runExtract, runRecommendations } from "./ai";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Loads KEY=value lines from ./.env (if present) without overriding real environment variables. */
function loadDotEnv(file: string) {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadDotEnv(path.join(ROOT, ".env"));
const DIST = path.join(ROOT, "dist");
const SESSION_TTL_MIN = Math.max(1, Number(process.env.FLOWSTATE_SESSION_TTL_MIN || 30));
const MAX_SESSIONS = Math.max(10, Number(process.env.FLOWSTATE_MAX_SESSIONS || 500));
const COOKIE = "fs_sid";
const PORT = Number(process.env.PORT || 3000);
// Hosting platforms set PORT and need the server reachable from outside the container.
const HOST = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const AI_MODEL = process.env.FLOWSTATE_AI_MODEL || "claude-sonnet-5-5";
const AI_TIMEOUT_MS = Number(process.env.FLOWSTATE_AI_TIMEOUT_MS || 45000);
const MAX_BODY = 2_000_000;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};


function send(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(payload);
}

async function readBody(req: http.IncomingMessage, max = MAX_BODY): Promise<unknown> {
  if (!(req.headers["content-type"] || "").includes("application/json")) throw new HttpError(415, "Expected application/json");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > max) throw new HttpError(413, "Request body too large");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

// ---------------------------------------------------------------------------
// Per-browser sessions (in memory, never persisted)
// ---------------------------------------------------------------------------

interface Session {
  id: string;
  project: string | null;
  lastSeen: number;
  aiHits: number[];
}
const sessions = new Map<string, Session>();

function readCookie(req: http.IncomingMessage, name: string): string | null {
  for (const part of (req.headers.cookie || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function cookieHeader(req: http.IncomingMessage, value: string, expire = false): string {
  const secure = req.headers["x-forwarded-proto"] === "https" || (req.socket as { encrypted?: boolean }).encrypted ? "; Secure" : "";
  // No Max-Age/Expires → a browser-session cookie: it disappears when the browser closes.
  return `${COOKIE}=${expire ? "" : value}; Path=/; HttpOnly; SameSite=Strict${secure}${expire ? "; Max-Age=0" : ""}`;
}

/** Returns this browser's session, creating one (and setting its cookie) when needed. */
function session(req: http.IncomingMessage, res: http.ServerResponse): Session {
  const sid = readCookie(req, COOKIE);
  const existing = sid ? sessions.get(sid) : undefined;
  if (existing) {
    existing.lastSeen = Date.now();
    return existing;
  }
  if (sessions.size >= MAX_SESSIONS) {
    // Evict the least recently used session to bound memory.
    let oldest: Session | null = null;
    for (const s of sessions.values()) if (!oldest || s.lastSeen < oldest.lastSeen) oldest = s;
    if (oldest) sessions.delete(oldest.id);
  }
  const fresh: Session = { id: randomUUID(), project: null, lastSeen: Date.now(), aiHits: [] };
  sessions.set(fresh.id, fresh);
  res.setHeader("Set-Cookie", cookieHeader(req, fresh.id));
  return fresh;
}

function sweep() {
  const cutoff = Date.now() - SESSION_TTL_MIN * 60_000;
  let removed = 0;
  for (const [id, s] of sessions) {
    if (s.lastSeen < cutoff) {
      sessions.delete(id);
      removed++;
    }
  }
  if (removed) console.log(`[sessions] deleted ${removed} expired session${removed > 1 ? "s" : ""} · ${sessions.size} active`);
}
setInterval(sweep, 60_000).unref();

function getProject(s: Session, res: http.ServerResponse) {
  if (!s.project) {
    res.writeHead(204, { ...SECURITY_HEADERS, "Cache-Control": "no-store" });
    return res.end();
  }
  send(res, 200, s.project);
}

async function putProject(s: Session, req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await readBody(req);
  const parsed = ProjectSchema.safeParse(body);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new HttpError(422, `Invalid project at "${i.path.join(".")}": ${i.message}`);
  }
  s.project = JSON.stringify(parsed.data);
  send(res, 200, { ok: true, updatedAt: parsed.data.updatedAt });
}

// ---------------------------------------------------------------------------
// AI (shared with the Vercel functions, see ai.ts)
// ---------------------------------------------------------------------------

const AI = { apiKey: API_KEY, model: AI_MODEL, timeoutMs: AI_TIMEOUT_MS };

async function recommend(s: Session, req: http.IncomingMessage, res: http.ServerResponse) {
  if (!API_KEY) throw new HttpError(503, "AI is not configured on this server. Set ANTHROPIC_API_KEY in .env.");
  if (rateLimited(s.aiHits)) throw new HttpError(429, "Too many AI requests — please wait a minute.");
  send(res, 200, await runRecommendations(AI, await readBody(req)));
}

async function extractPdf(s: Session, req: http.IncomingMessage, res: http.ServerResponse) {
  if (!API_KEY) throw new HttpError(503, "AI is not configured on this server.");
  if (rateLimited(s.aiHits)) throw new HttpError(429, "Too many AI requests — please wait a minute.");
  send(res, 200, await runExtract(AI, await readBody(req, 15_000_000)));
}

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------

async function serveStatic(urlPath: string, res: http.ServerResponse) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  let file = path.normalize(path.join(DIST, clean));
  if (!file.startsWith(DIST)) throw new HttpError(403, "Forbidden");
  try {
    const st = await stat(file);
    if (st.isDirectory()) file = path.join(file, "index.html");
  } catch {
    // Missing assets are a 404 (never HTML served as a script); only extension-less paths fall back to the app.
    if (path.extname(clean)) return send(res, 404, { error: "Not found" });
    file = path.join(DIST, "index.html");
  }
  try {
    const body = await readFile(file);
    const ext = path.extname(file);
    res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300" });
    res.end(body);
  } catch {
    send(res, 500, { error: "Client build missing. Run `npm run build` first." });
  }
}

const server = http.createServer(async (req, res) => {
  const url = req.url || "/";
  const method = req.method || "GET";
  try {
    if (url === "/api/health") return send(res, 200, { app: "flowstate", ok: true, storage: "session", sessionTtlMinutes: SESSION_TTL_MIN, ai: Boolean(API_KEY) });
    if (url === "/api/ai/status") return send(res, 200, { available: Boolean(API_KEY), model: API_KEY ? AI_MODEL : null });
    if (url === "/api/project") {
      const s = session(req, res);
      if (method === "GET") return getProject(s, res);
      if (method === "PUT") return await putProject(s, req, res);
      if (method === "DELETE") {
        s.project = null;
        return send(res, 200, { ok: true });
      }
      throw new HttpError(405, "Method not allowed");
    }
    if (url === "/api/session/end") {
      if (method !== "POST") throw new HttpError(405, "Method not allowed");
      const sid = readCookie(req, COOKIE);
      if (sid) sessions.delete(sid);
      return send(res, 200, { ok: true }, { "Set-Cookie": cookieHeader(req, "", true) });
    }
    if (url === "/api/extract") {
      if (method !== "POST") throw new HttpError(405, "Method not allowed");
      return await extractPdf(session(req, res), req, res);
    }
    if (url === "/api/recommendations") {
      if (method !== "POST") throw new HttpError(405, "Method not allowed");
      return await recommend(session(req, res), req, res);
    }
    if (url.startsWith("/api/")) throw new HttpError(404, "Not found");
    if (method !== "GET" && method !== "HEAD") throw new HttpError(405, "Method not allowed");
    return await serveStatic(url, res);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    return send(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`FLOWSTATE running at http://${HOST}:${PORT}`);
  console.log(`  storage: in-memory per browser session, deleted after ${SESSION_TTL_MIN} min of inactivity (nothing written to disk)`);
  console.log(`  AI: ${API_KEY ? `enabled (${AI_MODEL})` : "disabled — deterministic demo engine only"}`);
});
