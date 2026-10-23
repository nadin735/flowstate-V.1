/**
 * Deterministic recommendation engine ("demo mode").
 *
 * This is a transparent rule engine, NOT an AI model. It scores a fixed catalogue
 * of interventions against the project's process metrics, the selected problem,
 * keywords in the description and the stated constraints. The same inputs always
 * produce the same output. Savings are estimates derived from the step costs
 * computed by the finance engine.
 */
import { stepMetrics, processBaseline } from "./finance";
import type { Project, Recommendation } from "./types";

export const PROBLEMS = [
  { id: "high-cost", label: "High processing cost per invoice" },
  { id: "slow-cycle", label: "Long cycle times & missed discounts" },
  { id: "errors", label: "High error and rework rate" },
  { id: "compliance", label: "E-invoicing readiness & compliance" },
  { id: "scalability", label: "Volume growth without extra headcount" },
] as const;
export type ProblemId = (typeof PROBLEMS)[number]["id"];

export const CONSTRAINTS = [
  { id: "erp-fixed", label: "ERP core must stay unchanged" },
  { id: "limited-it", label: "Limited internal IT capacity" },
  { id: "works-council", label: "Works council approval required" },
  { id: "eu-data", label: "Data must stay in the EU (GDPR)" },
  { id: "fast", label: "Visible results within 3 months" },
] as const;
export type ConstraintId = (typeof CONSTRAINTS)[number]["id"];

export interface RecommendationRequest {
  problem: ProblemId;
  description: string;
  constraints: ConstraintId[];
  budgetCap: number | null;
}

interface Ctx {
  project: Project;
  stepCost: Record<string, number>;
  stepScore: Record<string, number>;
  reworkCost: number;
  totalCost: number;
  hourly: number;
  germany: boolean;
}

interface CatalogItem {
  id: string;
  title: string;
  targetStepId: string | null;
  complexity: Recommendation["complexity"];
  investment: number;
  monthlyRunCost: number;
  weeks: number;
  relevance: Partial<Record<ProblemId, number>>; // 0..1
  keywords: string[];
  technology: boolean; // requires new software
  touchesErp: boolean;
  savings: (c: Ctx) => number; // gross monthly
  build: (c: Ctx) => Pick<Recommendation, "problemStatement" | "rootCause" | "solution" | "impact" | "risks" | "successMetrics">;
}

const eur = (n: number) => `€${Math.round(n).toLocaleString("en-GB")}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

function step(c: Ctx, id: string) {
  return c.project.process.steps.find((s) => s.id === id);
}

const CATALOG: CatalogItem[] = [
  {
    id: "rec-idp",
    title: "Intelligent document capture for invoice data",
    targetStepId: "extract",
    complexity: "Medium",
    investment: 60000,
    monthlyRunCost: 1800,
    weeks: 12,
    relevance: { "high-cost": 1, errors: 0.8, scalability: 1, "slow-cycle": 0.4, compliance: 0.3 },
    keywords: ["manual", "typing", "keying", "pdf", "scan", "paper", "data entry", "extraction", "ocr"],
    technology: true,
    touchesErp: false,
    savings: (c) => (c.stepCost.extract ?? 0) * 0.6,
    build: (c) => {
      const s = step(c, "extract");
      return {
        problemStatement: `Invoice header and line data are keyed manually (${s?.minutesPerInvoice ?? "?"} min per invoice, ${pct(s?.errorRate ?? 0)} error rate), costing about ${eur(c.stepCost.extract ?? 0)} per month.`,
        rootCause: "Unstructured PDF and paper inputs, no capture layer between inbox and ERP, and no supplier-specific extraction templates.",
        solution: "Introduce an EU-hosted intelligent document capture service that classifies documents, extracts header and line items with confidence scores, and posts validated data to the ERP. Low-confidence fields go to a human validation queue.",
        impact: `Estimated 60% reduction of extraction effort and fewer keying errors; frees roughly ${((c.stepCost.extract ?? 0) * 0.6 / c.hourly / 140).toFixed(1)} FTE for exception handling.`,
        risks: ["Line-item accuracy varies by supplier layout", "Requires a human-in-the-loop queue for low-confidence fields", "Vendor lock-in on extraction models"],
        successMetrics: ["Touchless extraction rate ≥ 70% within 3 months", "Field-level accuracy ≥ 97% on header fields", "Extraction minutes per invoice ≤ 1.5"],
      };
    },
  },
  {
    id: "rec-einvoice",
    title: "Structured e-invoice intake (XRechnung / ZUGFeRD / Peppol)",
    targetStepId: "receive",
    complexity: "Medium",
    investment: 35000,
    monthlyRunCost: 900,
    weeks: 10,
    relevance: { compliance: 1, "high-cost": 0.6, errors: 0.6, scalability: 0.8, "slow-cycle": 0.3 },
    keywords: ["e-invoice", "einvoice", "xrechnung", "zugferd", "peppol", "edi", "compliance", "mandate", "email", "e-mail"],
    technology: true,
    touchesErp: false,
    savings: (c) => ((c.stepCost.receive ?? 0) + (c.stepCost.extract ?? 0)) * 0.3,
    build: (c) => ({
      problemStatement: "Most invoices arrive as PDF or paper and must be digitised before processing, even though suppliers increasingly can send structured formats.",
      rootCause: "No inbound channel for structured invoices and no supplier onboarding programme.",
      solution: c.germany
        ? "Set up a central inbound channel for XRechnung/ZUGFeRD and Peppol, map structured data straight to the ERP, and onboard the top suppliers by volume. German rules already require businesses to be able to receive e-invoices, with issuing obligations phasing in — verify current deadlines with your tax advisor."
        : "Set up a central inbound channel for Peppol and other structured formats, map structured data straight to the ERP, and onboard the top suppliers by volume.",
      impact: "Structured invoices bypass capture and keying entirely; estimate assumes 30% of receipt and extraction effort is eliminated in year one.",
      risks: ["Supplier adoption is slower than planned", "Format variants (ZUGFeRD profiles) need validation rules", "Parallel channels during transition"],
      successMetrics: ["Share of structured invoices ≥ 35% after 12 months", "Top-50 suppliers onboarded", "Zero rejected e-invoices due to format errors"],
    }),
  },
  {
    id: "rec-match",
    title: "Automated three-way match with tolerance rules",
    targetStepId: "validate",
    complexity: "Medium",
    investment: 40000,
    monthlyRunCost: 400,
    weeks: 10,
    relevance: { "high-cost": 0.9, errors: 1, "slow-cycle": 0.6, scalability: 0.8 },
    keywords: ["match", "po", "purchase order", "goods receipt", "variance", "price", "quantity", "validation"],
    technology: false,
    touchesErp: true,
    savings: (c) => (c.stepCost.validate ?? 0) * 0.55,
    build: (c) => {
      const s = step(c, "validate");
      return {
        problemStatement: `Every PO invoice is matched manually against order and goods receipt (${s?.minutesPerInvoice ?? "?"} min each), and variances are clarified by e-mail.`,
        rootCause: "No tolerance rules, missing or late goods receipts, and no structured variance workflow with purchasing.",
        solution: "Configure automatic three-way matching with price/quantity tolerances in the ERP, auto-post matched invoices, and route only true exceptions to a variance queue with reason codes owned by purchasing.",
        impact: "Estimated 55% less validation effort; most matched invoices post without touch, shortening cycle time.",
        risks: ["Goods-receipt discipline in plants must improve first", "Tolerances need finance and audit sign-off"],
        successMetrics: ["Auto-match rate ≥ 65% of PO invoices", "Variance resolution ≤ 3 business days", "Duplicate payments = 0"],
      };
    },
  },
  {
    id: "rec-workflow",
    title: "Digital approval workflow with delegation & SLAs",
    targetStepId: "approve",
    complexity: "Medium",
    investment: 30000,
    monthlyRunCost: 1200,
    weeks: 8,
    relevance: { "slow-cycle": 1, "high-cost": 0.5, scalability: 0.6, compliance: 0.3 },
    keywords: ["approval", "approve", "delay", "waiting", "reminder", "late", "discount", "bottleneck", "mobile"],
    technology: true,
    touchesErp: false,
    savings: (c) => (c.stepCost.approve ?? 0) * 0.45,
    build: (c) => {
      const s = step(c, "approve");
      return {
        problemStatement: `Approvals take on average ${s?.waitDays ?? "?"} business days, the longest wait in the process, and are chased manually by e-mail.`,
        rootCause: "E-mail based routing, no delegation during absence, no escalation rules and no visibility of pending items.",
        solution: "Route invoices automatically by cost centre and amount, enable mobile one-click approval with the invoice image, define deputies and escalate after SLA breach.",
        impact: "Estimated 45% less approval handling effort and a substantial reduction of approval wait time, enabling more early-payment discounts (discount value not included in the estimate).",
        risks: ["Approver adoption", "Approval matrix must be agreed with all cost-centre owners", "Works council involvement for audit trails"],
        successMetrics: ["Median approval time ≤ 1.5 business days", "Share of invoices approved within SLA ≥ 90%", "Captured early-payment discounts (tracked)"],
      };
    },
  },
  {
    id: "rec-discount",
    title: "Early-payment discount capture programme",
    targetStepId: "approve",
    complexity: "Low",
    investment: 15000,
    monthlyRunCost: 300,
    weeks: 6,
    relevance: { "slow-cycle": 1, "high-cost": 0.5 },
    keywords: ["skonto", "discount", "early payment", "missed", "verpasst", "cash", "payment run"],
    technology: false,
    touchesErp: true,
    savings: (c) => {
      const a = c.project.assumptions;
      const netRate = Math.max(0, a.discountRate - ((a.wacc ?? 0) * (a.discountDaysEarlier ?? 20)) / 365);
      return c.project.process.monthlyVolume * a.avgInvoiceValue * a.discountEligibleShare * netRate * Math.max(0, 0.85 - a.discountCapturedToday);
    },
    build: (c) => {
      const a = c.project.assumptions;
      return {
        problemStatement: a.avgInvoiceValue > 0
          ? `Only ${pct(a.discountCapturedToday)} of available early-payment discounts (${pct(a.discountRate)} on ${pct(a.discountEligibleShare)} of invoices) are captured today.`
          : "Early-payment discounts are likely being missed, but the average invoice value has not been entered yet, so the value cannot be quantified.",
        rootCause: "Approvals finish after the discount deadline, weekly payment runs ignore discount dates, and nobody tracks discount capture.",
        solution: "Flag discount-eligible invoices at receipt, give them priority approval with an SLA, schedule daily payment runs for discount deadlines and report the capture rate weekly.",
        impact: "Estimate assumes discount capture rises to 85 %. Valued net of the financing cost of paying earlier (WACC). This is a cash benefit on top of the labour savings.",
        risks: ["Requires reliable approval lead times", "Liquidity planning must allow earlier payments"],
        successMetrics: ["Discount capture rate ≥ 85 %", "Discount-eligible invoices approved within SLA ≥ 95 %"],
      };
    },
  },
  {
    id: "rec-quickwin",
    title: "Approval rules & reminder quick wins (no new software)",
    targetStepId: "approve",
    complexity: "Low",
    investment: 8000,
    monthlyRunCost: 0,
    weeks: 4,
    relevance: { "slow-cycle": 0.8, "high-cost": 0.3 },
    keywords: ["quick", "fast", "budget", "simple", "reminder", "approval"],
    technology: false,
    touchesErp: false,
    savings: (c) => (c.stepCost.approve ?? 0) * 0.15,
    build: () => ({
      problemStatement: "Approval delays are partly caused by unclear responsibilities rather than missing technology.",
      rootCause: "No documented approval limits, no deputies, invoices sent to the wrong person.",
      solution: "Publish an approval matrix, define deputies, set standard mailbox rules and a weekly reminder routine. Use as a bridge until a digital workflow is live.",
      impact: "Estimated 15% less approval effort and fewer misrouted invoices within weeks.",
      risks: ["Benefits fade without enforcement", "Does not scale with volume"],
      successMetrics: ["Misrouted invoices −50%", "Approval wait time −20%"],
    }),
  },
  {
    id: "rec-rpa",
    title: "RPA bots for repetitive ERP postings",
    targetStepId: "validate",
    complexity: "Medium",
    investment: 45000,
    monthlyRunCost: 1500,
    weeks: 8,
    relevance: { "high-cost": 0.6, scalability: 0.5 },
    keywords: ["legacy", "repetitive", "copy", "rpa", "bot", "screen"],
    technology: true,
    touchesErp: false,
    savings: (c) => ((c.stepCost.validate ?? 0) + (c.stepCost.extract ?? 0)) * 0.2,
    build: () => ({
      problemStatement: "Clerks perform repetitive copy-and-paste work between e-mail, spreadsheets and ERP screens.",
      rootCause: "Missing integrations and no API access to legacy screens.",
      solution: "Use software robots for stable, rule-based steps (status lookups, posting matched invoices, vendor statement reconciliation) without changing the ERP core.",
      impact: "Estimated 20% less effort in extraction and validation; useful where ERP changes are not possible.",
      risks: ["Bots break when screens change", "Hidden maintenance effort", "Does not fix the underlying process"],
      successMetrics: ["Bot success rate ≥ 95%", "Hours returned per month (tracked)"],
    }),
  },
  {
    id: "rec-masterdata",
    title: "Vendor master-data governance",
    targetStepId: "validate",
    complexity: "Low",
    investment: 20000,
    monthlyRunCost: 300,
    weeks: 6,
    relevance: { errors: 1, compliance: 0.5, "high-cost": 0.3 },
    keywords: ["master data", "vendor", "supplier", "bank", "duplicate", "tax", "error", "fraud"],
    technology: false,
    touchesErp: true,
    savings: (c) => c.reworkCost * 0.3,
    build: (c) => ({
      problemStatement: `Rework from errors costs an estimated ${eur(c.reworkCost)} per month across the process.`,
      rootCause: "Duplicate vendors, outdated bank and tax data, and no owner for vendor master data.",
      solution: "Cleanse vendor master data, introduce a single owner, four-eyes approval for bank-detail changes and automated tax-ID validation.",
      impact: "Estimated 30% less rework and lower payment-fraud exposure.",
      risks: ["Cleansing effort is often underestimated", "Requires purchasing cooperation"],
      successMetrics: ["Duplicate vendor records = 0", "Rework hours −30%", "All bank-detail changes four-eyes approved"],
    }),
  },
  {
    id: "rec-mining",
    title: "Process mining & KPI monitoring",
    targetStepId: null,
    complexity: "Medium",
    investment: 25000,
    monthlyRunCost: 1500,
    weeks: 8,
    relevance: { scalability: 0.7, "slow-cycle": 0.6, "high-cost": 0.4, errors: 0.4 },
    keywords: ["transparency", "visibility", "kpi", "measure", "mining", "dashboard", "bottleneck"],
    technology: true,
    touchesErp: false,
    savings: (c) => c.totalCost * 0.03,
    build: () => ({
      problemStatement: "There is no continuous, data-based view of where invoices wait or loop back.",
      rootCause: "KPIs are collected manually and only for month-end reporting.",
      solution: "Connect ERP event logs to a process-mining tool and publish team-level KPIs (no individual performance tracking) to steer continuous improvement and verify benefits.",
      impact: "Enables benefit tracking; direct savings estimated conservatively at 3% of process cost.",
      risks: ["Event-log extraction effort", "Works council concerns about monitoring"],
      successMetrics: ["Weekly KPI refresh", "Benefits tracked against business case", "Top-3 variants documented"],
    }),
  },
];

export function buildContext(project: Project): Ctx {
  const metrics = stepMetrics(project.process, project.assumptions.hourlyCost);
  const stepCost: Record<string, number> = {};
  const stepScore: Record<string, number> = {};
  let reworkCost = 0;
  for (const m of metrics) {
    stepCost[m.stepId] = m.monthlyCost;
    stepScore[m.stepId] = m.bottleneckScore;
    reworkCost += m.reworkHours * project.assumptions.hourlyCost;
  }
  return {
    project,
    stepCost,
    stepScore,
    reworkCost,
    totalCost: metrics.reduce((s, m) => s + m.monthlyCost, 0),
    hourly: project.assumptions.hourlyCost,
    germany: project.company.country.toLowerCase() === "germany",
  };
}

export function generateRecommendations(project: Project, req: RecommendationRequest): { items: Recommendation[]; excluded: { title: string; reason: string }[] } {
  const c = buildContext(project);
  const base = processBaseline(project.process);
  const text = req.description.toLowerCase();
  const cons = new Set(req.constraints);
  const scale = project.process.monthlyVolume / 4200 > 1.5 ? 1.35 : 1;
  const excluded: { title: string; reason: string }[] = [];
  const out: Recommendation[] = [];

  for (const item of CATALOG) {
    const notes: string[] = [];
    let score = 40 * (item.relevance[req.problem] ?? 0.1);
    if (item.targetStepId) score += 0.25 * (c.stepScore[item.targetStepId] ?? 0);
    else score += 8;
    const hits = item.keywords.filter((k) => text.includes(k));
    if (hits.length) {
      score += Math.min(15, hits.length * 5);
      notes.push(`Matches your description: ${hits.slice(0, 3).join(", ")}`);
    }
    let complexity = item.complexity;
    let weeks = item.weeks;
    const risks = [...item.build(c).risks];
    if (cons.has("erp-fixed") && item.touchesErp) {
      score -= 15;
      notes.push("Requires ERP configuration — conflicts with “ERP core must stay unchanged”.");
    }
    if (cons.has("erp-fixed") && item.id === "rec-rpa") score += 12;
    if (cons.has("limited-it") && item.technology) {
      score -= 8;
      weeks = Math.round(weeks * 1.25);
      notes.push("Limited IT capacity: timeline extended by 25%; consider a managed service.");
    }
    if (cons.has("works-council") && (item.id === "rec-mining" || item.id === "rec-workflow")) {
      weeks += 4;
      risks.push("Co-determination process may add 4+ weeks");
    }
    if (cons.has("eu-data") && item.technology) notes.push("Select an EU-hosted provider with a data processing agreement (GDPR Art. 28).");
    if (cons.has("fast")) {
      if (weeks <= 8) score += 10;
      else if (weeks > 12) score -= 10;
    }
    if (req.problem === "slow-cycle" && base.cycleTimeDays > 8 && item.targetStepId === "approve") score += 5;

    const investment = Math.round((item.investment * scale) / 1000) * 1000;
    if (req.budgetCap !== null && investment > req.budgetCap) {
      excluded.push({ title: item.title, reason: `Estimated investment ${eur(investment)} exceeds budget cap ${eur(req.budgetCap)}` });
      continue;
    }
    if (complexity === "Medium" && cons.has("limited-it") && item.technology) complexity = "High";

    const monthly = Math.max(0, item.savings(c) - item.monthlyRunCost * scale);
    const built = item.build(c);
    out.push({
      id: item.id,
      title: item.title,
      targetStepId: item.targetStepId,
      ...built,
      risks: risks.slice(0, 6),
      monthlySavings: Math.round(monthly),
      complexity,
      investment,
      implementationWeeks: weeks,
      fitScore: Math.round(Math.max(0, Math.min(100, score))),
      notes: [...notes, item.monthlyRunCost > 0 ? `Savings are net of ~${eur(item.monthlyRunCost * scale)}/month estimated running cost.` : "No recurring running cost assumed."].slice(0, 6),
    });
  }
  out.sort((a, b) => b.fitScore - a.fitScore || b.monthlySavings - a.monthlySavings || a.id.localeCompare(b.id));
  return { items: out.slice(0, 5), excluded };
}
