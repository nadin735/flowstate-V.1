/**
 * TEST FIXTURE ONLY — a fictional sample project used by unit and end-to-end tests.
 * ILLUSTRATIVE. Dates are generated relative to a reference date so the demo
 * project is always "in flight" when opened.
 */
import { addDays, addMonths, monthKey, todayISO } from "../../src/domain/dates";
import { processBaseline, resolveInputs, calculateScenario } from "../../src/domain/finance";
import type { Company, Phase, Project, Risk, Scenario, Task, Milestone, KpiMeasurement, ProcessStep, User } from "../../src/domain/types";

export type DemoCompanyId = "nordwerk" | "alpenlog";

interface CompanySeed {
  company: Company;
  volume: number;
  hourlyCost: number;
  steps: ProcessStep[];
  team: User[];
  scale: number; // investment scaling vs. the reference company
}

const NORDWERK: CompanySeed = {
  company: {
    id: "nordwerk",
    name: "Nordwerk Industrietechnik GmbH",
    industry: "Industrial components manufacturing",
    country: "Germany",
    employees: 860,
    revenueEurM: 214,
    erp: "SAP S/4HANA (on-premise)",
    currency: "EUR",
    description:
      "Fictional mid-sized manufacturer with three plants. Accounts payable is centralised in Hamburg and processes supplier invoices arriving by e-mail, paper and EDI.",
  },
  volume: 4200,
  hourlyCost: 42,
  scale: 1,
  team: [
    { id: "u1", name: "Lena Hartmann", role: "Transformation Lead", initials: "LH" },
    { id: "u2", name: "Jonas Becker", role: "Head of Accounts Payable", initials: "JB" },
    { id: "u3", name: "Mira Schulz", role: "SAP Solution Architect", initials: "MS" },
    { id: "u4", name: "Tobias Klein", role: "Process Analyst", initials: "TK" },
    { id: "u5", name: "Aylin Demir", role: "QA & Test Manager", initials: "AD" },
    { id: "u6", name: "Dr. Petra Vogt", role: "CFO (Sponsor)", initials: "PV" },
  ],
  steps: [
    {
      id: "receive",
      name: "Invoice received",
      description: "Invoices arrive via shared mailbox (62%), paper post (23%) and EDI/XRechnung (15%). Paper is scanned, e-mails are triaged and forwarded manually.",
      owner: "AP Mailroom",
      minutesPerInvoice: 2.0,
      automatedShare: 0.15,
      errorRate: 0.01,
      reworkMinutes: 10,
      waitDays: 1.2,
      systems: ["Outlook", "Scanner"],
    },
    {
      id: "extract",
      name: "Data extraction",
      description: "Header and line-item data are keyed manually into SAP (MIRO). Supplier, PO number, tax and bank details are re-typed from PDF or paper.",
      owner: "AP Clerks",
      minutesPerInvoice: 4.5,
      automatedShare: 0.1,
      errorRate: 0.045,
      reworkMinutes: 25,
      waitDays: 1.5,
      systems: ["SAP MIRO"],
    },
    {
      id: "validate",
      name: "Validation",
      description: "Three-way match of invoice, purchase order and goods receipt. Price and quantity variances are investigated by e-mail with purchasing.",
      owner: "AP Clerks",
      minutesPerInvoice: 3.5,
      automatedShare: 0.2,
      errorRate: 0.03,
      reworkMinutes: 35,
      waitDays: 1.8,
      systems: ["SAP MM", "E-mail"],
    },
    {
      id: "approve",
      name: "Approval",
      description: "Non-PO and variance invoices are routed to cost-centre owners via e-mail with PDF attachments. No delegation rules; reminders are sent manually.",
      owner: "Cost-centre owners",
      minutesPerInvoice: 2.5,
      automatedShare: 0,
      errorRate: 0.01,
      reworkMinutes: 20,
      waitDays: 4.1,
      systems: ["E-mail", "Excel tracker"],
    },
    {
      id: "pay",
      name: "Payment",
      description: "Approved invoices are released in weekly SAP payment runs. Early-payment discounts are frequently missed due to late approvals.",
      owner: "Treasury",
      minutesPerInvoice: 1.5,
      automatedShare: 0.6,
      errorRate: 0.005,
      reworkMinutes: 30,
      waitDays: 2.4,
      systems: ["SAP F110", "Banking portal"],
    },
  ],
};

const ALPENLOG: CompanySeed = {
  company: {
    id: "alpenlog",
    name: "Alpenlogistik AG",
    industry: "Contract logistics & freight forwarding",
    country: "Austria",
    employees: 1240,
    revenueEurM: 386,
    erp: "Microsoft Dynamics 365 Finance",
    currency: "EUR",
    description:
      "Fictional logistics provider with 14 hubs in DACH. High volume of low-value carrier and fuel invoices, many without purchase orders.",
  },
  volume: 9500,
  hourlyCost: 39,
  scale: 1.35,
  team: [
    { id: "u1", name: "Sarah Gruber", role: "Transformation Lead", initials: "SG" },
    { id: "u2", name: "Martin Huber", role: "Head of Finance Operations", initials: "MH" },
    { id: "u3", name: "Elif Kaya", role: "Dynamics Solution Architect", initials: "EK" },
    { id: "u4", name: "Lukas Moser", role: "Process Analyst", initials: "LM" },
    { id: "u5", name: "Nina Berger", role: "QA & Test Manager", initials: "NB" },
    { id: "u6", name: "Andreas Wimmer", role: "CFO (Sponsor)", initials: "AW" },
  ],
  steps: [
    { ...NORDWERK.steps[0], minutesPerInvoice: 1.5, automatedShare: 0.25, waitDays: 0.8, systems: ["Shared mailbox"] },
    { ...NORDWERK.steps[1], minutesPerInvoice: 3.5, automatedShare: 0.2, errorRate: 0.05, systems: ["Dynamics 365"] },
    { ...NORDWERK.steps[2], minutesPerInvoice: 2.5, automatedShare: 0.1, errorRate: 0.04, reworkMinutes: 30, description: "Carrier invoices are checked against freight orders and tariff tables; fuel surcharges are verified manually.", systems: ["TMS", "Excel"] },
    { ...NORDWERK.steps[3], minutesPerInvoice: 2.0, waitDays: 3.2, description: "Non-PO invoices (≈48%) are approved by hub managers via e-mail.", systems: ["E-mail"] },
    { ...NORDWERK.steps[4], minutesPerInvoice: 1.0, automatedShare: 0.7, waitDays: 1.6, systems: ["Dynamics 365", "Banking portal"] },
  ],
};

export const DEMO_COMPANIES: Record<DemoCompanyId, CompanySeed> = { nordwerk: NORDWERK, alpenlog: ALPENLOG };

export function defaultScenarios(scale = 1): Scenario[] {
  const r = (n: number) => Math.round((n * scale) / 1000) * 1000;
  const o = (n: number) => Math.round((n * scale) / 100) * 100;
  return [
    {
      id: "optimization",
      name: "Process optimization",
      summary: "Standardise intake channels, approval rules and delegation; quick wins with existing ERP features. Minimal new technology.",
      automationShare: 0.15,
      processEfficiencyGain: 0.18,
      processErrorGain: 0.2,
      waitTimeReduction: 0.3,
      initialInvestment: r(45000),
      monthlyOperatingCost: o(800),
      implementationMonths: 3,
      discountCaptureTarget: 0,
    },
    {
      id: "automation",
      name: "Workflow automation",
      summary: "Intelligent document capture, automated three-way match and a digital approval workflow integrated with the ERP.",
      automationShare: 0.55,
      processEfficiencyGain: 0.1,
      processErrorGain: 0.1,
      waitTimeReduction: 0.55,
      initialInvestment: r(180000),
      monthlyOperatingCost: o(4500),
      implementationMonths: 6,
      discountCaptureTarget: 0,
    },
    {
      id: "transformation",
      name: "End-to-end transformation",
      summary: "E-invoicing first (XRechnung/ZUGFeRD/Peppol), touchless processing, supplier portal, dynamic discounting and continuous process mining.",
      automationShare: 0.8,
      processEfficiencyGain: 0.15,
      processErrorGain: 0.25,
      waitTimeReduction: 0.75,
      initialInvestment: r(420000),
      monthlyOperatingCost: o(9500),
      implementationMonths: 12,
      discountCaptureTarget: 0,
    },
  ];
}

/** Deterministic pseudo-random generator (mulberry32) so demo data is stable. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRoadmap(start: string, scale: number, team: User[]) {
  const n = (i: number) => team[i]?.name ?? "Unassigned";
  const phaseDefs: [string, string, number][] = [
    ["p1", "Discovery & requirements", 35],
    ["p2", "Process redesign", 42],
    ["p3", "Solution development", 84],
    ["p4", "Testing & validation", 42],
    ["p5", "Deployment & monitoring", 56],
  ];
  const phases: Phase[] = [];
  let cursor = start;
  phaseDefs.forEach(([id, name, days], i) => {
    const end = addDays(cursor, days - 1);
    phases.push({ id, name, order: i + 1, start: cursor, end });
    cursor = addDays(end, 1);
  });
  const P = Object.fromEntries(phases.map((p) => [p.id, p]));
  const b = (x: number) => Math.round((x * scale) / 500) * 500;
  const t = (
    id: string, phaseId: string, title: string, owner: string, offset: number, len: number,
    status: Task["status"], priority: Task["priority"], risk: Task["risk"], budget: number, effortDays: number, dependsOn: string[] = [],
  ): Task => ({ id, phaseId, title, owner, start: addDays(P[phaseId].start, offset), due: addDays(P[phaseId].start, offset + len - 1), status, priority, risk, budget: b(budget), effortDays, dependsOn });

  const tasks: Task[] = [
    t("t1", "p1", "Stakeholder interviews (AP, purchasing, treasury)", n(3), 0, 10, "done", "high", "low", 6000, 8),
    t("t2", "p1", "Baseline measurement: volumes, times, error rates", n(3), 5, 15, "done", "high", "medium", 8000, 10, ["t1"]),
    t("t3", "p1", "Requirements catalogue & non-functional requirements", n(2), 14, 18, "done", "high", "medium", 9000, 12, ["t1"]),
    t("t4", "p1", "Vendor long-list and RFI for capture & workflow tools", n(0), 20, 15, "done", "medium", "low", 4000, 6, ["t3"]),
    t("t5", "p2", "Target process design (to-be BPMN)", n(3), 0, 18, "done", "high", "medium", 10000, 14, ["t2", "t3"]),
    t("t6", "p2", "Approval matrix & delegation rules with cost-centre owners", n(1), 2, 10, "in_progress", "high", "high", 5000, 10, ["t5"]),
    t("t7", "p2", "Works council information & data protection impact assessment", n(0), 10, 18, "in_progress", "high", "high", 7000, 8, ["t5"]),
    t("t8", "p2", "Vendor selection & contract", n(0), 18, 22, "todo", "high", "medium", 12000, 9, ["t4", "t6"]),
    t("t9", "p2", "Supplier communication plan for e-invoicing", n(1), 24, 14, "todo", "medium", "low", 3000, 5, ["t5"]),
    t("t10", "p3", "Configure document capture & extraction models", n(2), 0, 35, "todo", "high", "high", 42000, 30, ["t8"]),
    t("t11", "p3", "Automated three-way match rules in ERP", n(2), 14, 42, "todo", "high", "high", 38000, 28, ["t8"]),
    t("t12", "p3", "Digital approval workflow incl. mobile approval", n(2), 28, 42, "todo", "high", "medium", 34000, 25, ["t6", "t8"]),
    t("t13", "p3", "ERP integration & master-data cleansing", n(2), 21, 56, "todo", "medium", "high", 26000, 22, ["t8"]),
    t("t14", "p3", "KPI dashboard & process-mining connector", n(3), 56, 28, "todo", "medium", "low", 9000, 10, ["t11"]),
    t("t15", "p4", "System integration testing", n(4), 0, 21, "todo", "high", "medium", 12000, 15, ["t10", "t11", "t12", "t13"]),
    t("t16", "p4", "User acceptance testing with AP team", n(4), 14, 21, "todo", "high", "medium", 8000, 12, ["t15"]),
    t("t17", "p4", "Parallel run on 500 live invoices", n(1), 28, 14, "todo", "high", "high", 6000, 10, ["t16"]),
    t("t18", "p5", "Training & change management", n(0), 0, 21, "todo", "medium", "medium", 9000, 12, ["t16"]),
    t("t19", "p5", "Go-live & hypercare", n(2), 14, 21, "todo", "high", "high", 14000, 15, ["t17", "t18"]),
    t("t20", "p5", "Benefit tracking & continuous improvement backlog", n(3), 28, 28, "todo", "medium", "low", 5000, 8, ["t19"]),
  ];
  const milestones: Milestone[] = [
    { id: "m1", phaseId: "p1", name: "Requirements signed off", due: P.p1.end, manuallyCompleted: false },
    { id: "m2", phaseId: "p2", name: "Target process & vendor approved", due: P.p2.end, manuallyCompleted: false },
    { id: "m3", phaseId: "p3", name: "Solution build complete", due: P.p3.end, manuallyCompleted: false },
    { id: "m4", phaseId: "p4", name: "Go-live readiness", due: P.p4.end, manuallyCompleted: false },
    { id: "m5", phaseId: "p5", name: "Benefits review (90 days)", due: P.p5.end, manuallyCompleted: false },
  ];
  const risks: Risk[] = [
    { id: "r1", title: "Low supplier adoption of e-invoicing formats", probability: "medium", impact: "high", mitigation: "Supplier onboarding campaign; prioritise top-50 suppliers by volume.", owner: n(1), status: "open" },
    { id: "r2", title: "Extraction accuracy below target on line items", probability: "medium", impact: "medium", mitigation: "Pilot with 3 vendors; measure field-level accuracy before scaling.", owner: n(2), status: "mitigating" },
    { id: "r3", title: "Works council approval delays rollout", probability: "low", impact: "high", mitigation: "Early involvement; no individual performance monitoring in dashboards.", owner: n(0), status: "mitigating" },
    { id: "r4", title: "Master-data quality (vendor bank details, tax IDs)", probability: "high", impact: "medium", mitigation: "Cleansing sprint before integration; four-eyes check on bank-detail changes.", owner: n(2), status: "open" },
    { id: "r5", title: "AP team capacity during month-end close", probability: "medium", impact: "medium", mitigation: "Avoid test windows in close weeks; temporary backfill.", owner: n(1), status: "open" },
  ];
  return { phases, tasks, milestones, risks, goLive: P.p4.end };
}

function buildKpis(seedCo: CompanySeed, today: string): KpiMeasurement[] {
  const rand = prng(seedCo.company.id === "nordwerk" ? 42 : 7);
  const process = { id: "ap", name: "Invoice processing", monthlyVolume: seedCo.volume, steps: seedCo.steps };
  const base = processBaseline(process);
  const r = calculateScenario(
    resolveInputs(process, { hourlyCost: seedCo.hourlyCost, processingMinutesOverride: null, errorRateOverride: null, monthlyVolume: seedCo.volume, residualEffortOnAutomated: 0.1, automationErrorReduction: 0.7, roiHorizonMonths: 36, avgInvoiceValue: 0, discountEligibleShare: 0, discountRate: 0, discountCapturedToday: 0, capacityRealisation: 1, rampUpMonths: 0, wacc: 0.08, discountDaysEarlier: 20 }),
    defaultScenarios()[0],
  );
  const costPerInvoice = r.currentCostPerInvoice ?? 0;
  const current = monthKey(today);
  const out: KpiMeasurement[] = [];
  for (let i = 9; i >= 1; i--) {
    const month = addMonths(current, -i);
    // Quick wins (approval reminders, mailbox rules) introduced 3 months ago.
    const qw = i <= 3 ? (4 - i) / 3 : 0;
    const noise = () => 1 + (rand() - 0.5) * 0.06;
    const volume = Math.round(seedCo.volume * (1 + (rand() - 0.5) * 0.1));
    const cpi = costPerInvoice * (1 - 0.035 * qw) * noise();
    out.push({
      month,
      volume,
      costPerInvoice: round(cpi, 2),
      cycleTimeDays: round(base.cycleTimeDays * (1 - 0.12 * qw) * noise(), 1),
      manualHours: Math.round((volume * cpi) / seedCo.hourlyCost),
      errorRate: round(base.errorRate * (1 - 0.06 * qw) * noise(), 4),
      automationRate: round(base.automationRate + 0.015 * qw, 4),
    });
  }
  return out;
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

export function createDemoProject(companyId: DemoCompanyId = "nordwerk", reference: string = todayISO()): Project {
  const seedCo = DEMO_COMPANIES[companyId];
  const start = addDays(reference, -48);
  const roadmap = buildRoadmap(start, seedCo.scale, seedCo.team);
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: `proj-${companyId}`,
    name: "Invoice Processing Automation",
    description:
      "Reduce cost and cycle time of supplier-invoice processing through process redesign and automation, and prepare for mandatory B2B e-invoicing. All figures are illustrative demo data.",
    sponsor: seedCo.team[5].name,
    lead: seedCo.team[0].name,
    startDate: start,
    targetGoLive: roadmap.goLive,
    company: seedCo.company,
    team: seedCo.team,
    process: { id: "ap-invoice", name: "Supplier invoice processing (P2P)", monthlyVolume: seedCo.volume, steps: seedCo.steps.map((s) => ({ ...s })) },
    assumptions: {
      hourlyCost: seedCo.hourlyCost,
      processingMinutesOverride: null,
      errorRateOverride: null,
      monthlyVolume: seedCo.volume,
      residualEffortOnAutomated: 0.1,
      automationErrorReduction: 0.7,
      roiHorizonMonths: 36,
      avgInvoiceValue: 0,
      discountEligibleShare: 0.3,
      discountRate: 0.02,
      discountCapturedToday: 0.4,
      capacityRealisation: 1,
      rampUpMonths: 0,
      wacc: 0.08,
      discountDaysEarlier: 20,
    },
    scenarios: defaultScenarios(seedCo.scale),
    selectedScenario: "automation",
    recommendationRuns: [],
    adoptedRecommendationIds: [],
    phases: roadmap.phases,
    tasks: roadmap.tasks,
    milestones: roadmap.milestones,
    risks: roadmap.risks,
    kpis: buildKpis(seedCo, reference),
    activity: [
      { id: "a3", at: addDays(reference, -2) + "T09:12:00Z", text: "Approval matrix workshop held with 14 cost-centre owners", kind: "task" },
      { id: "a2", at: addDays(reference, -9) + "T15:40:00Z", text: "Target process (to-be BPMN) approved by steering committee", kind: "process" },
      { id: "a1", at: addDays(reference, -20) + "T11:05:00Z", text: "Baseline measurement completed for 9 months of invoice data", kind: "system" },
    ],
    preferences: { locale: "de-DE", density: "comfortable", showFormulas: true, asOfDate: null, accent: "forest", colorMode: "system", onboarded: false },
    updatedAt: now,
  };
}
