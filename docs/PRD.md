# FLOWSTATE — Product Requirements

## Purpose
FLOWSTATE turns an invoice-processing problem into a measurable transformation project: analyse the current process, find bottlenecks, compare three transformation options with transparent ROI maths, plan the implementation and track KPIs, then export a report.

It is a **private, non-commercial application and portfolio project** by Nadin Okil. No revenue, no accounts, no tracking.

## Target group
- **Primary:** recruiters and hiring managers for digital-transformation, consulting and business-analysis roles. They should understand the product in 2 minutes via the demo link.
- **Persona in the product:** finance / accounts-payable leads and transformation consultants in mid-sized companies (DACH) who want a quick, defensible business case for invoice automation.

## Goals
1. Show business thinking: cost baseline, business case (ROI, payback, NPV, sensitivity), early-payment discounts net of financing cost, published benchmarks with sources.
2. Show product and engineering quality: tested, accessible (WCAG AA contrast), privacy-friendly, deployable on Vercel.
3. Be honest about numbers: every figure is labelled *Input*, *Estimate*, *Simulated* or *Measured*.

## Non-goals
- No user accounts, no database, no multi-user collaboration.
- No real ERP integration; data comes from a PDF or manual entry.
- No payments, subscriptions or advertising.

## Features
| Area | What it does |
|---|---|
| Welcome | Asks directly for data (PDF upload or manual entry); "Try with test data"; demo-scan import; animated topology background |
| Data intake | Short form: volume, labour cost, minutes per process step; optional average invoice value |
| PDF import | Reads the PDF text layer in the browser; review step before values are applied; optional AI reading for image-only scans |
| Executive Overview | Process cost, handling time, automation potential, annual net savings with range, before/after, project health with reasons, industry benchmarks, cost by step |
| Process Intelligence | Process map (5 steps), bottleneck and longest wait, editable step values, step analysis |
| Transformation Consultant | Ranked interventions (rule engine or AI) with problem, root cause, solution, impact, risks, success metrics; add to roadmap |
| Scenario Simulator | 3 scenarios, shared baseline, levers, 12+ metrics, sensitivity, charts, formulas with current values |
| Roadmap | 5 phases, milestones, Gantt, tasks with dependencies, risk register, starter roadmap |
| KPI & Impact | Baseline (pre-start months) vs. latest vs. target, monthly measurements, realised vs. projected savings |
| Report | Print / PDF and standalone HTML export |
| Settings | Company, project, assumptions, theme, light/dark, JSON export/import, clear project, end session |
| Legal | Impressum (§ 18 MStV) and Datenschutzerklärung, linked from the start page and sidebar |
| Demo | `?demo` on any deployment, separate demo artifact, offline `flowstate-demo.html` |

## Success criteria
- Demo link opens a filled dashboard in under 2 seconds.
- No request leaves the own origin except user-triggered AI calls.
- All test suites green (unit, e2e, Vercel e2e, contrast check).
