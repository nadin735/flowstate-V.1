// Checks the Vercel build (.vercel/output) locally: static files + the AI functions,
// served by a minimal stand-in for Vercel's router. Run `npm run build:vercel` first.
// The AI call uses a fake key, so the expected result is a clean error message from the
// API (401) or a network error — proving the function chain without spending credits.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const OUT = path.resolve(".vercel/output");
process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-a-real-key";
const fns = {};
for (const r of ["health", "ai/status", "recommendations", "extract"]) fns[`/api/${r}`] = (await import(path.join(OUT, "functions/api", `${r}.func/index.mjs`))).default;
const cfg = JSON.parse(await readFile(path.join(OUT, "config.json"), "utf8"));
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css" };
const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(cfg.routes[0].headers)) res.setHeader(k, v);
  const u = req.url.split("?")[0];
  if (fns[u]) return fns[u](req, res);
  try {
    const f = path.join(OUT, "static", u === "/" ? "index.html" : u);
    const body = await readFile(f);
    res.setHeader("Content-Type", TYPES[path.extname(f)] || "application/octet-stream");
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
});
await new Promise((r) => server.listen(4567, r));
const BASE = "http://localhost:4567";

let pass = 0;
let fail = 0;
const check = (name, ok, info = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "✔" : "✘"} ${name}${info ? ` (${info})` : ""}`);
};

const health = await (await fetch(`${BASE}/api/health`)).json();
check("Health reports browser storage + AI", health.storage === "browser" && health.ai === true);
const cross = await fetch(`${BASE}/api/recommendations`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: "{}" });
check("Cross-origin AI calls are refused", cross.status === 403);
const bad = await fetch(`${BASE}/api/recommendations`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
check("Invalid AI requests are rejected with 422", bad.status === 422);

const h = (await fetch(`${BASE}/`)).headers;
check("Vercel config sends HSTS, Permissions-Policy and a CSP without external hosts", Boolean(h.get("strict-transport-security")) && Boolean(h.get("permissions-policy")) && !/https?:\/\//.test(h.get("content-security-policy") || "http://"));
check("Self-hosted fonts and licence notices are deployed", (await fetch(`${BASE}/fonts/inter-Regular.woff`)).ok && (await fetch(`${BASE}/third-party-notices.txt`)).ok);

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.route(/fonts|cdnjs|jsdelivr/, (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${BASE}/`);
await page.waitForSelector(".wl-h1");
await page.getByRole("button", { name: /Try with test data/ }).click();
await page.waitForSelector(".stat-grid");
await page.waitForTimeout(1500);
await page.reload();
await page.waitForSelector(".stat-grid");
check("Project persists in the tab across reload (sessionStorage)", (await page.locator(".ws-name").innerText()).includes("Hanse"));
await page.goto(`${BASE}/#/consultant`);
await page.waitForSelector("text=Generate recommendations");
check("Consultant offers the server AI", (await page.locator("main").innerText()).includes("AI (claude-sonnet-5-5)"));
const resP = page.waitForResponse((r) => r.url().endsWith("/api/recommendations"), { timeout: 60000 });
await page.getByRole("button", { name: "Generate recommendations" }).click();
const res = await resP;
const body = await res.json().catch(() => ({}));
check("AI function calls the Anthropic API and reports errors cleanly", [502, 504].includes(res.status()) && typeof body.error === "string", `${res.status()}: ${body.error}`);
check("No browser errors", errors.length === 0, errors.join("; "));
await browser.close();
server.close();
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
