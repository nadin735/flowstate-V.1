# FLOWSTATE — Tasks

_Last updated: 21.10.2026_

## Done
- Core platform: overview, process map, consultant (rule engine + AI), simulator with ROI/NPV/sensitivity, roadmap, KPI page, report, settings.
- Per-browser sessions, data deleted after the session; no demo data by default, empty project with structure.
- PDF import (text layer in the browser, review step, AI fallback) and demo scan.
- Light/dark mode, 3 colour themes; WCAG AA contrast in all themes.
- "Try with test data", demo mode (`?demo`, demo artifact, offline demo file).
- Business case: early-payment discount net of financing cost, KPI baseline before project start, published benchmarks with sources.
- Vercel deployment (Build Output API, serverless AI functions), Dockerfile, CI workflow, Dependabot.
- Privacy/security: self-hosted font and background animation (no CDN), CSP/HSTS/Permissions-Policy, AI notice before sending.
- Legal: Impressum (§ 18 MStV) and short Datenschutzerklärung, LICENSE, THIRD_PARTY_NOTICES.
- Self-test fixes: number-input typing bug, default task owner, "Add starter tasks", percent display in PDF review, phone simulator table.
- Design pass against CHECKLIST part 2 (no uppercase labels, no eyebrows, no gradients/glass, no stripes, no placeholder avatar, digits instead of number words, one primary action).
- docs/ folder created.

## Open (Nadin)
- Enter street + postcode/city in `src/legal.config.ts`.
- Run `npm install` locally and commit `package-lock.json`; run `npm audit`.
- Push to GitHub, import in Vercel, set `ANTHROPIC_API_KEY`, set function region to Frankfurt (fra1) if not applied automatically.
- Set a monthly spend limit in the Anthropic Console.
- After deploy: check HTTPS, test AI with the real key, open `/?demo`.
- Optional: screen-reader walkthrough.

## Next (suggestions)
- "About this project" page (role, decisions, learnings, LinkedIn).
- 2-minute walkthrough video for the CV.
