# FLOWSTATE

**AI-assisted digital transformation & project intelligence platform**.

FLOWSTATE turns a business problem into a measurable transformation project: analyse a process, find the bottlenecks, get ranked interventions, compare three transformation scenarios with transparent ROI maths, plan the implementation and track KPIs — then export a report.

FLOWSTATE starts **empty**: no company, no figures, no tasks. It provides the structure for invoice-processing automation — the five process steps (Invoice received → Data extraction → Validation → Approval → Payment), three scenario types and five roadmap phases — and you enter your own values. A setup checklist on the Overview shows what is still missing.

> **Private sessions.** Every browser gets its own isolated session. Data is never written to disk and is deleted when the visitor clicks *End session & delete data*, after a period of inactivity (default 30 minutes) or when the browser is closed. Savings and ROI are model estimates based on your inputs, never measured outcomes; the UI labels every number as *Input*, *Estimate*, *Simulated* or *Measured*.

---

## Project documents

`docs/` holds the working documents: [PRD](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [Rules](docs/RULES.md) · [Design](docs/DESIGN.md) · [Tasks](docs/TASKS.md) · [Memory](docs/MEMORY.md) · [Checklist](docs/CHECKLIST.md) · [Methodology](docs/METHODOLOGY.md). Work through the checklist before closing any task or export.

## Quick start

Requirements: **Node.js 20+**.

```bash
npm install
npm run build        # client bundle, standalone HTML and server bundle
npm start            # → http://127.0.0.1:3000
```

| Script | What it does |
|---|---|
| `npm run build` | Bundles the React client to `dist/`, a single-file app to `dist/flowstate-standalone.html`, and the server to `dist-server/server.mjs` |
| `npm start` | Runs the server (static client + API + JSON persistence) |
| `npm run dev` | Rebuilds once and restarts the server on change |
| `npm test` | Unit tests for the finance engine, recommendations, roadmap and KPI logic (`node:test`) |
| `npm run build:vercel` | Builds the Vercel deployment (`.vercel/output`: static client + AI functions) |
| `npm run e2e:vercel` | Builds for Vercel and checks it locally (9 checks) |
| `npm run a11y` | WCAG AA contrast check of every page, all themes, light and dark (needs a running server on port 3999) |
| `npm run e2e` | Drives the full user journey in headless Chromium (93 checks, screenshots + PDF in `e2e-output/`) |
| `npm run typecheck` | TypeScript strict type check |

The welcome hero uses an animated **TOPOLOGY** background in the style of Vanta.js (same options: cyan 0x00dfff lines on 0xeaeaea, mouse/touch controls, scale 1) — implemented in-house on a canvas (`src/ui/components/vanta.ts`), so it needs no p5.js/Vanta scripts and no CDN, and works on every host and offline. It pauses when hidden; with reduced motion a static pattern is drawn.

`dist/flowstate-standalone.html` runs without a server (double-click it): data then lives in the tab's sessionStorage and is gone when the tab closes; AI is unavailable.

## Privacy, security & legal

- **Before going live:** enter name, address and e-mail in `src/legal.config.ts` (private, non-commercial project → provider notice under § 18 MStV plus a short GDPR privacy notice). Until every `TODO:` is replaced, the *Impressum* and *Datenschutz* pages show a red warning. Both pages are linked from the start page and the sidebar.
- **No third-party requests:** the Inter font (OFL) and the hero animation are self-hosted; the CSP allows only the own origin. The e2e suite fails if any request leaves the origin.
- **No consent banner needed:** no tracking; only technically necessary storage (sessionStorage, and the session cookie in server mode).
- **AI:** data reaches Anthropic only when the user triggers an AI function; the UI says so before sending.
- **Headers:** CSP, HSTS, Permissions-Policy, COOP, nosniff, frame-ancestors none (server and Vercel).
- **Dependencies:** `.github/dependabot.yml` and `.github/workflows/ci.yml` (audit, tests, builds, e2e). Commit `package-lock.json` after the first `npm install`.
- **Licences:** `THIRD_PARTY_NOTICES.txt` is generated from the bundles (`npm run build`) and served at `/third-party-notices.txt`. The project itself: `LICENSE` (all rights reserved; private application project).

## Deployment

### Vercel (recommended)

1. Push the project to GitHub (without `.env`) and import it in Vercel → *Add New → Project*. `vercel.json` sets everything: install `npm install`, build `npm run build:vercel`, framework *Other*. Don't change these settings.
2. *Settings → Environment Variables*: add `ANTHROPIC_API_KEY` (Production + Preview), optionally `FLOWSTATE_AI_MODEL`. Then redeploy, because variables only apply to new deployments.
3. Open the site: the Consultant shows *AI (model name)* when the key is active.

How it runs on Vercel: the page is static, and the AI endpoints (`/api/recommendations`, `/api/extract`, `/api/ai/status`, `/api/health`) are serverless functions, so the key stays on the server. Project data lives in the visitor's browser tab (sessionStorage) and is deleted when the tab closes or on *End session*, because serverless functions share no memory. AI endpoints accept same-origin calls only and are rate-limited per IP. PDFs for AI reading are limited to about 3 MB (Vercel's body limit). Set a monthly spend limit in the Anthropic Console as an extra safeguard. `npm run e2e:vercel` checks the Vercel build locally.

### Other hosts (Node server)

The full server (`npm start`) needs a host that runs **Node.js** continuously (Render, Railway, Fly.io, a VPS or Docker).

- **Docker:** `docker build -t flowstate . && docker run -p 3000:3000 -e ANTHROPIC_API_KEY=sk-ant-… flowstate`
- **Node platforms:** build command `npm install && npm run build`, start command `npm start`. The server listens on the platform's `PORT` (and on `0.0.0.0` automatically when `PORT` is set).
- **API key:** set `ANTHROPIC_API_KEY` as a secret environment variable in the platform's dashboard. Don't upload a `.env` file and don't commit it.
- **One instance:** sessions are held in memory, so run a single instance (no horizontal scaling). A restart or redeploy ends all open sessions, which is intended.
- **HTTPS:** let the platform terminate TLS; the session cookie is marked `Secure` automatically behind HTTPS (`X-Forwarded-Proto`).

## First step: your data

A new session opens the workspace with one question: **how do you want to provide your process data?** Upload a PDF (read and reviewed in the browser) or enter the essentials in a short form — company, invoices per month, labour cost and minutes per process step. The dashboard appears once the data is there; "Skip for now" shows it empty with the upload area on top and the manual checklist below.

## Demo version

- **Demo link on any deployment:** append `?demo` (e.g. `https://your-app.vercel.app/?demo`). The app opens directly in the filled dashboard with the fictional company and a *Demo* banner; *Start with my own data* clears it.
- **Offline demo file:** `npm run build` also writes `dist/flowstate-demo.html` — one self-contained file that opens with the demo data (double-click, no server; AI unavailable).

## Try with test data

"Try with test data" (welcome page, the data-intake screen, or Settings) fills every page in one click with a fictional company — Hanse Präzisionsteile GmbH, 3,600 invoices a month: process steps, benchmark scenarios, a 20-task roadmap with risks, six months of KPI measurements and a recommendation run. It is labelled as test data and can be replaced at any time.

## PDF scan import

Instead of typing values by hand you can import a scanned process sheet: **Process → Import from PDF** or **Overview → Scan a PDF instead**.

- The PDF's text layer is read **in the browser** with PDF.js; the file is not uploaded.
- The parser (`src/domain/sheetParser.ts`) recognises English and German labels (`Unternehmen:`, `Rechnungen pro Monat:`, `Stundensatz:` …), German and English number formats, and one table row per process step (minutes, automated %, error %, rework minutes, waiting days, owner). Typical OCR slips (lost decimal comma) are corrected or flagged.
- Every value is shown in a **review step** with the current value next to it; you can edit or untick values before applying.
- Image-only scans without a text layer get a clear message. With `ANTHROPIC_API_KEY` set, the server can let the AI model read such scans (`POST /api/extract`); the result goes through the same parser and review.
- **Demo scan:** `demo/flowstate-demo-scan.pdf` is a fictional scan-style sheet (skewed grey paper, stamp, handwriting, searchable text layer). It is also built into the app ("Try the demo scan"). Regenerate with `npm run demo:scan` (needs Python with reportlab and Pillow, and poppler's `pdftoppm`).

## Dark mode

Light, dark or system appearance (Settings → Appearance, or the moon/sun button in the top bar). "System" follows the operating system, or the host page when FLOWSTATE is embedded. All colour themes (Electric blue — the default —, Forest, Neon yellow) have dark variants; printed reports always use light colours.

## AI features

The Transformation Consultant and the reading of image-only scans use Claude when it is available, and fall back to the transparent rule engine otherwise. Every result says which engine produced it.

- **Own server (`npm start`):** put your key into a `.env` file next to `package.json` — `ANTHROPIC_API_KEY=sk-ant-…` (see `.env.example`). The server loads it at start; the key never reaches the browser.
- **Published as a claude.ai artifact:** no key needed. The page asks Claude through the viewer's own claude.ai account (the artifact `sample` capability); the first request asks the viewer for permission.

## Environment variables

Copy `.env.example` and set as needed — all optional.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `HOST` | `3000` / `127.0.0.1` | Server address |
| `FLOWSTATE_SESSION_TTL_MIN` | `30` | Minutes of inactivity after which a session and its data are deleted |
| `FLOWSTATE_MAX_SESSIONS` | `500` | Upper bound of concurrent sessions held in memory (least recently used is dropped) |
| `ANTHROPIC_API_KEY` | — | Enables live AI recommendations. Read **only** by the server; never sent to the browser |
| `FLOWSTATE_AI_MODEL` | `claude-sonnet-5-5` | Model used for AI recommendations |
| `FLOWSTATE_AI_TIMEOUT_MS` | `45000` | Upstream timeout |

Without an API key the Transformation Consultant runs a **deterministic rule engine** and says so on screen — it never pretends a model was called.

## Pages

| Page | Highlights |
|---|---|
| **Executive Overview** | Monthly process cost, handling time, automation potential, annual net savings, before/after table, scenario switch, project health with overdue items, cost by step, recommendations, activity |
| **Process Intelligence** | Interactive process map (Invoice received → Data extraction → Validation → Approval → Payment), bottleneck and longest-wait detection, manual vs. automated share, cycle-time breakdown, editable step inputs with validation and live step analysis |
| **Transformation Consultant** | Problem, process description, constraints and budget cap → ranked interventions with problem statement, root-cause hypothesis, solution, impact, complexity, investment, risks and success metrics; sortable comparison; "Add to roadmap" |
| **Scenario Simulator** | Process optimisation vs. workflow automation vs. end-to-end transformation; shared baseline inputs (linked to the process map or overridden) and per-scenario levers; 12 metrics side-by-side; cost and cumulative cash-flow charts; every formula shown with the current values plugged in |
| **Transformation Roadmap** | Five phases, milestones, Gantt timeline with today line, list view, filters, add/edit/delete tasks, dependency enforcement and cycle detection, effort-weighted progress vs. plan, budget, risk register |
| **KPI & Impact** | Cost/invoice, cycle time, manual effort, error rate, automation rate, savings: baseline vs. latest vs. target, recorded monthly measurements (solid) vs. simulated projection (dashed), realised vs. projected savings; baseline derived from inputs until something is measured |
| **Report** | Print-ready report (Print → *Save as PDF*) and standalone HTML download |
| **Settings** | Company details, project details and dates, global assumptions, theme/locale/density/formula preferences, reference date, JSON export/import, clear project, end session & delete data |

## Financial model

Full description, assumptions and limitations: **[docs/METHODOLOGY.md](docs/METHODOLOGY.md)**. In short:

```
Realised labour savings = (current − future monthly process cost) × capacity realisation
Discount benefit        = volume × avg. invoice value × eligible share × (discount rate − WACC × days earlier ÷ 365) × (target − today capture)
Monthly net savings     = realised labour savings + discount benefit − running cost
First-year net benefit  = Σ first 12 months after go-live (linear ramp-up) − investment
ROI (12 months)         = first-year net benefit ÷ investment            (n/a when investment = 0)
Payback                 = months until cumulative cash flow ≥ 0 (after go-live; + implementation = from start)
NPV                     = −investment + Σ cash flow ÷ (1 + WACC)^(month/12)
```

Early-payment discounts are valued **net of the financing cost** of paying earlier (WACC × days ÷ 365). The Overview and the report compare the baseline with **published AP benchmarks** (Ardent Partners 2025, APQC), with linked sources.

A pessimistic / base / optimistic sensitivity is shown for the preferred scenario. Benchmark scenario values (scaled to invoice volume) are loaded after data entry so a business case exists immediately; they are labelled and editable.

## Architecture

```
src/domain/        Framework-free TypeScript domain layer (shared by client, server, tests)
  types.ts           zod schemas for every entity → validation of input, storage, imports and AI output
  finance.ts         calculation engine (pure functions)
  recommendations.ts deterministic intervention catalogue + scoring
  roadmap.ts         progress, plan vs. actual, overdue, dependency and cycle rules, health
  kpi.ts             baseline / latest / target and projections
  template.ts        empty project template (structure only) and setup checklist
src/ui/            React 19 client
  state/             reducer store, autosave, persistence adapter (server → localStorage fallback)
  components/        accessible UI primitives, SVG charts (d3-scale/d3-shape)
  pages/             the eight screens
server/server.ts   dependency-free Node HTTP server: static files, /api/project, /api/recommendations
tests/             node:test unit tests; tests/fixtures holds a fictional sample project used only by tests
scripts/           esbuild build, Playwright end-to-end journey
```

**Decisions**

- **One domain layer everywhere.** The same schemas and calculations run in the browser, on the server and in tests, so every number on every page derives from one set of assumptions.
- **Why not Next.js / FastAPI / PostgreSQL in this build?** The build environment had no access to the npm or PyPI registries, so the stack was assembled from locally available packages (React, zod, d3, esbuild, Playwright). Rather than ship code that was never run, the MVP uses a small Node server that keeps one validated project per browser session in memory. Because the domain layer is framework-agnostic, moving to Next.js route handlers and PostgreSQL (one table per schema in `types.ts`) is a mechanical port — the UI talks to three REST endpoints only.
- **Custom process map and charts** (instead of React Flow / Recharts) for the same reason; they are keyboard-accessible buttons and SVG with ARIA labels.
- **AI is optional and isolated.** `/api/recommendations` builds a prompt from process metrics, treats the user's description as untrusted data, validates the model's JSON against `RecommendationSchema`, re-applies the budget cap and rate-limits requests. The key never leaves the server.
- **Sessions:** an `HttpOnly`, `SameSite=Strict` browser-session cookie identifies each browser; data is held in memory only, swept after the inactivity timeout, and deleted immediately on *End session*.
- **Security:** strict Content-Security-Policy, `nosniff`, `frame-ancestors 'none'`, 2 MB body limit, path-traversal-safe static serving schema validation on every write and import.

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | `{ app: "flowstate", ok, ai }` |
| GET / PUT / DELETE | `/api/project` | This browser session's project: load (204 if none), save (validated, 422 on invalid), clear |
| POST | `/api/extract` | `{ filename, pdfBase64 }` → `{ model, text }` — AI reading of image-only scans (503 without API key) |
| POST | `/api/session/end` | Deletes the session and its data, expires the session cookie |
| GET | `/api/ai/status` | Whether AI is configured and which model |
| POST | `/api/recommendations` | `{ project, request }` → `{ model, items }` (503 without API key) |

## Testing

- `npm test` — 40 unit tests: formula correctness, rework, error reduction, zero investment, negative savings, zero volume/minutes, invalid inputs, payback/cash-flow consistency, bottleneck detection, schema validation, deterministic recommendations and budget cap, dependency/cycle rules, effort-weighted progress, KPI projections, empty-project template, number parsing and PDF sheet parsing (including the real demo scan through PDF.js), the financing-cost correction of early-payment discounts, the KPI baseline before project start, benchmark positioning and the test-data project.
- `npm run e2e` — 93 browser checks (incl. demo link, legal pages, no third-party requests, security headers): one-click test data (overview, roadmap, recommendations, KPIs, benchmarks, pre-filled measurement form) → data intake (PDF or manual form, validation) → empty start and setup checklist → entering company, volume, cost and step times through the UI → risks, phases, KPI measurements → PDF scan import with review (file upload, built-in demo, image-only error) → dark mode → session isolation between two browsers → import of a fictional test fixture → open project → inspect/edit process map → change assumptions → compare scenarios and ROI edge cases → generate and adopt recommendations → create/complete tasks with dependency enforcement → KPI filters → persistence across reload → PDF export → mobile layout without horizontal scroll → clear project → end session deletes the server data → zero browser errors.

The AI path is implemented and schema-validated but was not exercised against the live API in the build environment (no network access to it); the rule engine is fully tested.
