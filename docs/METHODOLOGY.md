# FLOWSTATE — Methodology and limitations

This document explains how FLOWSTATE turns process data into a business case, which assumptions it makes, and where its limits are. All formulas are implemented in `src/domain/finance.ts` and covered by unit tests (`tests/finance.test.ts`).

## 1. Inputs

| Input | Source | Used for |
|---|---|---|
| Invoices per month | PDF or manual entry | every cost and benefit |
| Labour cost per hour (fully loaded) | PDF or manual entry | labour cost |
| Minutes, automated share, error rate, rework minutes, waiting days per step | PDF or manual entry | process baseline, bottlenecks, cycle time |
| Average invoice value, share with discount terms, discount rate, share captured today, days paid earlier | PDF, manual entry or simulator | early-payment discount benefit |
| Scenario levers (automation, efficiency, error and waiting-time reduction, discount capture target, investment, running cost, implementation months) | benchmark values, then the user's own estimates or vendor quotes | future state |

**Benchmark values** (`benchmarkScenarios` in `src/domain/template.ts`) are typical starting points for the three scenario types so a business case exists immediately. Investment and running cost scale with invoice volume (reference 4,000 invoices/month, bounded 0.5×–3×). They are labelled as benchmarks and should be replaced by quotes before any decision.

## 2. Process baseline

- Handling time per invoice = sum of step minutes.
- First-pass error rate = 1 − Π(1 − error rate of each step) — the probability that an invoice hits at least one error.
- Rework minutes per error = error-weighted average of the steps' rework minutes.
- Cycle time = sum of waiting days + handling time converted to 8-hour workdays.
- Current monthly cost = volume × (minutes ÷ 60 + error rate × rework minutes ÷ 60) × hourly cost.

## 3. Future state per scenario

- Future minutes = minutes × (1 − efficiency gain) × (1 − automation × (1 − residual effort)).
  *Residual effort* (default 10 %) is exception handling and monitoring that remains on automated work.
- Future error rate = error rate × (1 − process error gain) × (1 − automation × automation error reduction).

## 4. Benefits

1. **Realised labour savings** = (current − future monthly process cost) × *capacity realisation* (default 80 %).
   Freed hours only become cash when they lead to redeployment, attrition or fewer temporary staff. The gross figure and freed FTE are shown separately.
2. **Early-payment discount benefit** = volume × average invoice value × eligible share × **net discount rate** × (target capture − capture today).
   Net discount rate = discount rate − WACC × days paid earlier ÷ 365 (never below 0). Paying 20 days earlier to earn 2 % ties up cash; at 8 % WACC that costs 0.44 %, so the net gain is 1.56 %. Without this correction the benefit would be overstated by roughly a fifth.
   Often the largest benefit in accounts payable; zero when the average invoice value is unknown.
3. **Monthly net savings** = realised labour savings + discount benefit − monthly running cost.
   With 100 % realisation and no discount data this reduces to the textbook formula *current − future − running cost*.

## 4b. Measured savings (KPI page)

The KPI baseline is the average of the months measured **before project start** (the first months if none exist). Realised savings count only from the project-start month onward, so normal month-to-month variation before the project is never reported as a saving.

## 4c. Industry benchmarks

`src/domain/benchmarks.ts` holds published accounts-payable benchmarks, shown on the Overview and in the report with linked sources:

| Metric | Reference points | Source |
|---|---|---|
| Cost per invoice | best-in-class $2.78 · average $9.40 · all others $12.88 | Ardent Partners, *AP Metrics that Matter in 2025* |
| Cost per invoice | median $6.00 (n = 5,846) | APQC Open Standards Benchmarking, via Tipalti (2026) |
| Invoice cycle time | average 9.2 days | Ardent Partners 2025 |
| Straight-through rate | average 32.6 % · best-in-class 49.2 % | Ardent Partners 2025 |
| Exception rate | average 14 % | Ardent Partners 2025 |

They are reference points, not targets: they are published in USD, cover mixed company sizes and define some measures slightly differently (FLOWSTATE compares its automated share of handling work with the straight-through rate, and its first-pass error rate with the exception rate). Cost per invoice is therefore shown side by side without a "better/worse" verdict.

## 5. Investment view

- Benefits ramp up linearly over *ramp-up months* after go-live (default 3).
- **First-year net benefit** = sum of the first 12 months after go-live − initial investment; **ROI (12 months)** = first-year net benefit ÷ investment.
- **Payback after go-live**: month in which cumulative cash flow turns positive (interpolated). **Payback from project start** adds the implementation months.
- **NPV** = −investment + Σ monthly cash flow ÷ (1 + WACC)^(month ÷ 12) over the horizon (default 36 months, WACC 8 %).
- Edge cases: investment 0 → ROI "n/a"; net savings ≤ 0 → payback "not reached" plus a warning.

## 6. Sensitivity

The preferred scenario is recalculated with fixed, documented stress factors (`SENSITIVITY_FACTORS`):

| | Levers | Investment | Running cost | Capacity realisation | Discount gain |
|---|---|---|---|---|---|
| Pessimistic | ×0.7 | ×1.25 | ×1.15 | ×0.85 | ×0.6 |
| Optimistic | ×1.15 | ×0.9 | ×0.95 | ×1.1 (max 100 %) | ×1.15 |

A business case is robust when the pessimistic case still pays back within an acceptable period.

## 7. Bottleneck score

Score (0–100) = 45 % share of process cost + 30 % share of waiting time + 15 % relative error rate + 10 % manual share. Steps within 85 % of the top score are flagged. The weights reflect that cost and waiting time drive most improvement cases; they are a prioritisation aid, not a statistical result.

## 8. Recommendations

Without AI, a transparent rule engine scores a fixed catalogue of interventions against the process metrics, the chosen problem, description keywords, constraints and budget cap. With AI (server key or Claude in the artifact), the model receives the same process data and must return the same schema; every answer is validated and labelled as AI-generated. Savings of different interventions overlap and must not be added up.

## 9. Known limitations

- Labour and discount benefits only; postage, paper, late-payment fees and licence savings are not modelled.
- No tax effects, no inflation, implementation costs are a single up-front investment.
- Scenario benchmark values (investment, levers) are typical starting points, not industry-specific; replace them with vendor quotes. The published AP benchmarks (4c) put the baseline in context but are not segmented by industry or size.
- The PDF reader recognises labelled values and one row per process step. Other layouts need the AI interpretation (when available) or manual entry. The bundled demo scan is synthetic: its text layer was generated from the form, not by OCR.
- Data lives in memory per browser session; there is no user management or database.
