# FLOWSTATE — Architecture

## Tech stack
| Layer | Choice |
|---|---|
| UI | React 19 + TypeScript, hash routing, custom components, SVG charts (d3-scale / d3-shape), icons: Lucide via react-icons |
| Validation | zod schemas for every entity (input, storage, import, AI output) |
| PDF | pdfjs-dist (legacy build, main thread) — text layer read in the browser |
| Build | esbuild (`scripts/build.mjs`): code splitting, CSS as text, PDF as binary |
| Server (self-hosted) | Zero-dependency Node HTTP server (`server/server.ts`) |
| Server (Vercel) | Build Output API v3 (`scripts/build-vercel.mjs`): static client + 4 serverless functions |
| AI | Anthropic Messages API, server-side only (`server/ai.ts`); in the claude.ai preview via the viewer's account |
| Tests | node:test (unit), Playwright (e2e, Vercel e2e, contrast check) |

Why not Next.js / PostgreSQL: the build environment had no npm registry access, so the stack uses locally available packages. The domain layer is framework-free, so a port is mechanical. See README → Decisions.

## Data and storage
There is **no database**.
- **Vercel / static:** the project lives in the browser tab's `sessionStorage` (deleted when the tab closes or on *End session*).
- **Node server:** one project per browser session, in memory only, keyed by an HttpOnly/SameSite=Strict session cookie; swept after 30 min of inactivity.
- RLS is therefore not applicable; access isolation is per browser session (covered by an e2e test).

## Folder structure
```
docs/                 Project documents (this folder)
src/domain/           Framework-free domain layer, shared by client, server and tests
  types.ts            zod schemas
  finance.ts          calculation engine (pure functions)
  recommendations.ts  rule-based intervention catalogue + scoring
  roadmap.ts          progress, overdue, dependencies, health
  kpi.ts              baseline / latest / target, projections
  benchmarks.ts       published AP benchmarks with sources
  template.ts         empty project, benchmark scenarios, starter roadmap
  testdata.ts         fictional test-data project
  sheetParser.ts      PDF text → values
  aiPrompt.ts         prompts and AI output coercion
src/legal.config.ts   Impressum / privacy values (name, address, e-mail)
src/ui/               React client
  app.tsx             shell, routing, sidebar
  pages/              Welcome, Overview, Process, Consultant, Simulator, Roadmap, Analytics, Report, Settings, Legal
  components/         ui primitives, charts, PDF import, data intake, benchmark card, topology background
  state/              store (reducer), persistence, onboarding, colour mode
server/               server.ts (Node), ai.ts (shared AI logic), vercel.ts (functions)
scripts/              build, build-vercel, notices, e2e, e2e-vercel, a11y-contrast, demo scan
public/               index.html, self-hosted fonts
tests/                unit tests and fixtures
```

## Build outputs
| Command | Output |
|---|---|
| `npm run build` | `dist/` (client), `dist-server/server.mjs`, `dist/flowstate-standalone.html`, `dist/flowstate-demo.html`, `dist-hosted/` and `dist-demo/` (claude.ai previews), `THIRD_PARTY_NOTICES.txt` |
| `npm run build:vercel` | `.vercel/output/` (static + functions + headers) |

## Security
CSP allowing only the own origin, HSTS, Permissions-Policy, COOP, nosniff, frame-ancestors none; zod validation on every write; body limits; AI endpoints same-origin only and rate-limited; API key read only on the server.
