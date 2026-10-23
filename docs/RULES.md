# FLOWSTATE — Coding rules

## General
- TypeScript strict. No `any` unless unavoidable and commented.
- Business logic lives in `src/domain/` as pure functions — never in React components.
- Every entity has a zod schema in `types.ts`; new fields get a `.default()` so older saved projects still load.
- Every number shown in the UI comes from the domain layer; no hard-coded figures in components.
- Label every figure as *Input*, *Estimate*, *Simulated* or *Measured*. Never present an estimate as a result.

## UI
- Follow `docs/DESIGN.md` and the design part of `docs/CHECKLIST.md`.
- Use the components in `src/ui/components/ui.tsx` (Button, Card, Field, NumberInput, …) instead of new one-offs.
- Colours only via CSS tokens; text contrast ≥ 4.5:1 (check with `npm run a11y`).
- Every input has a visible label or an `aria-label`; every icon-only button has an `aria-label`.
- Numbers as digits ("5 phases"), sentence case for labels, no uppercase labels.

## Privacy and security
- No third-party requests from the browser (no CDNs, no Google Fonts, no analytics). Fonts and scripts are self-hosted.
- Secrets only on the server (`process.env`), never in client code or the repo. `.env` is never committed or exported.
- Data reaches an AI provider only after an explicit user action, and the UI says so first.
- Validate all external input (requests, imports, AI output) with zod.

## Tests
- New domain logic → unit test in `tests/`.
- New user-facing flow or bug fix → e2e check in `scripts/e2e.mjs`.
- Before finishing: `npm test`, `npm run build`, `node scripts/e2e.mjs`, `npm run e2e:vercel` all green.

## Process
- Work through `docs/CHECKLIST.md` before closing a task.
- Update `docs/TASKS.md` and `docs/MEMORY.md` after every session.
