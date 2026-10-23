/**
 * Vercel serverless functions (Build Output API, see scripts/build-vercel.mjs).
 *
 * On Vercel the project data stays in the visitor's browser tab (sessionStorage) —
 * serverless instances share no memory, so the in-memory sessions of server.ts don't
 * apply. Only the AI endpoints run on the server, so ANTHROPIC_API_KEY never reaches
 * the browser.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { aiConfigFromEnv, HttpError, rateLimited, runExtract, runRecommendations } from "./ai";

export type Route = "health" | "ai-status" | "recommendations" | "extract";

// Body limit of Vercel functions is 4.5 MB; stay below it with a clear message.
const MAX_BODY = 4_400_000;
// Best-effort per-IP limit (per function instance).
const hitsByIp = new Map<string, number[]>();

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!(req.headers["content-type"] || "").includes("application/json")) throw new HttpError(415, "Expected application/json");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "File too large for AI reading here (max. about 3 MB PDF).");
    chunks.push(c as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

function clientIp(req: IncomingMessage): string {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || String(req.headers["x-real-ip"] || "") || "unknown";
}

/** Only the FLOWSTATE page itself may call the AI endpoints from a browser. */
function sameOrigin(req: IncomingMessage): boolean {
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.origin;
  if (origin && req.headers.host) {
    try {
      return new URL(String(origin)).host === req.headers.host;
    } catch {
      return false;
    }
  }
  return true;
}

export function makeHandler(route: Route) {
  return async function handler(req: IncomingMessage, res: ServerResponse) {
    const cfg = aiConfigFromEnv();
    try {
      if (route === "health") return send(res, 200, { app: "flowstate", ok: true, storage: "browser", ai: Boolean(cfg.apiKey) });
      if (route === "ai-status") return send(res, 200, { available: Boolean(cfg.apiKey), model: cfg.apiKey ? cfg.model : null });
      if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
      if (!sameOrigin(req)) throw new HttpError(403, "Forbidden");
      if (!cfg.apiKey) throw new HttpError(503, "AI is not configured. Set ANTHROPIC_API_KEY in the Vercel project settings and redeploy.");
      const ip = clientIp(req);
      const hits = hitsByIp.get(ip) || [];
      hitsByIp.set(ip, hits);
      if (hitsByIp.size > 5000) hitsByIp.clear();
      if (rateLimited(hits)) throw new HttpError(429, "Too many AI requests — please wait a minute.");
      const body = await readJson(req);
      return send(res, 200, route === "recommendations" ? await runRecommendations(cfg, body) : await runExtract(cfg, body));
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      return send(res, 500, { error: "Internal server error" });
    }
  };
}
