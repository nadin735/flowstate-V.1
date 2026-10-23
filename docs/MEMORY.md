# FLOWSTATE — Decisions and context

_Last updated: 21.10.2026_

## Context
- Private, non-commercial application/portfolio project by Nadin Okil. No revenue → no AGB, no taxes, no BFSG; Impressum under § 18 MStV (name + address + e-mail) and a short privacy notice are still required.
- Hosting: Vercel (user has an account and an Anthropic API key; key only as a Vercel environment variable).
- UI language English (en-GB); legal pages German.

## Key decisions
| Decision | Why |
|---|---|
| No database; sessionStorage (Vercel) or in-memory session (Node) | Privacy by design, nothing to secure or back up; data deleted after the session |
| Stack: React + esbuild + Node instead of Next.js/PostgreSQL | No npm registry access during the build; domain layer kept framework-free for an easy port |
| Domain layer as pure TypeScript shared by client, server and tests | One source of truth for every number |
| Rule engine as default, AI optional | Works without a key; AI output validated against the same schema |
| Early-payment discount netted with WACC × days ÷ 365 | Otherwise the benefit is overstated by ~20 % |
| KPI baseline = months before project start | Normal monthly variation must not show as "realised savings" |
| Benchmarks only with named, linked sources (Ardent Partners 2025, APQC via Tipalti) | No unverifiable claims |
| Self-hosted Inter font; topology background re-implemented on canvas (no p5/Vanta CDN) | No visitor IP to third parties, works on every host and offline |
| Vercel via Build Output API with 4 functions | Static client + server-side AI; key never reaches the browser |
| AI endpoints: same-origin check + per-IP rate limit; spend limit recommended | Protect the key from abuse |
| Legal pages slimmed to the minimum for a private project | User request ("alles Unnötige raus") |
| Design follows CHECKLIST part 2 | User's own "no vibecoded look" rules |

## User preferences (from the sessions)
- Wants honest ratings (recruiter / consultant view) and concrete fixes.
- Likes the animated topology background (cyan on #eaeaea), made faster and more visible on request.
- Wants a demo version and one-click test data.
- Communicates in German; prefers short, actionable answers.

## Known limits
- AI path not tested with a real key in the build environment.
- No live Vercel deployment tested from here.
- `package-lock.json` missing (registry unreachable during the build).
