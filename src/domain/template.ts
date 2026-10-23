/**
 * Empty project template. Contains structure only — the five invoice-processing
 * steps, the three scenario types and the five roadmap phases — and no company
 * data, figures, tasks, risks or measurements. Everything else is entered by the user.
 */
import { addDays, diffDays, todayISO } from "./dates";
import type { Milestone, Phase, ProcessStep, Project, Risk, Scenario, Task } from "./types";

export const STEP_TEMPLATES: ProcessStep[] = [
  { id: "receive", name: "Invoice received", description: "Invoices arrive (e-mail, paper, EDI, e-invoice) and are captured.", owner: "", minutesPerInvoice: 0, automatedShare: 0, errorRate: 0, reworkMinutes: 0, waitDays: 0, systems: [] },
  { id: "extract", name: "Data extraction", description: "Header and line-item data are transferred into the ERP.", owner: "", minutesPerInvoice: 0, automatedShare: 0, errorRate: 0, reworkMinutes: 0, waitDays: 0, systems: [] },
  { id: "validate", name: "Validation", description: "Invoice is checked against purchase order and goods receipt; variances are clarified.", owner: "", minutesPerInvoice: 0, automatedShare: 0, errorRate: 0, reworkMinutes: 0, waitDays: 0, systems: [] },
  { id: "approve", name: "Approval", description: "Invoice is approved by the responsible cost-centre owner.", owner: "", minutesPerInvoice: 0, automatedShare: 0, errorRate: 0, reworkMinutes: 0, waitDays: 0, systems: [] },
  { id: "pay", name: "Payment", description: "Approved invoices are released for payment.", owner: "", minutesPerInvoice: 0, automatedShare: 0, errorRate: 0, reworkMinutes: 0, waitDays: 0, systems: [] },
];

export function emptyScenarios(): Scenario[] {
  const base = { automationShare: 0, processEfficiencyGain: 0, processErrorGain: 0, waitTimeReduction: 0, initialInvestment: 0, monthlyOperatingCost: 0, implementationMonths: 1, discountCaptureTarget: 0 };
  return [
    { id: "optimization", name: "Process optimization", summary: "Standardise and redesign the process with existing tools.", ...base },
    { id: "automation", name: "Workflow automation", summary: "Automate capture, matching and approval workflows.", ...base },
    { id: "transformation", name: "End-to-end transformation", summary: "Redesign end to end, e.g. e-invoicing first and touchless processing.", ...base },
  ];
}

const PHASES: [string, string, string][] = [
  ["p1", "Discovery & requirements", "Requirements signed off"],
  ["p2", "Process redesign", "Target process approved"],
  ["p3", "Solution development", "Solution build complete"],
  ["p4", "Testing & validation", "Go-live readiness"],
  ["p5", "Deployment & monitoring", "Benefits review"],
];

/** Phases are placed back to back in 4-week blocks from `start`; the user adjusts them. */
export function emptyRoadmap(start: string): { phases: Phase[]; milestones: Milestone[] } {
  const phases: Phase[] = [];
  const milestones: Milestone[] = [];
  let cursor = start;
  PHASES.forEach(([id, name, gate], i) => {
    const end = addDays(cursor, 27);
    phases.push({ id, name, order: i + 1, start: cursor, end });
    milestones.push({ id: `m${i + 1}`, phaseId: id, name: gate, due: end, manuallyCompleted: false });
    cursor = addDays(end, 1);
  });
  return { phases, milestones };
}

export function createEmptyProject(today: string = todayISO()): Project {
  const { phases, milestones } = emptyRoadmap(today);
  return {
    schemaVersion: 1,
    id: `proj-${Date.now().toString(36)}`,
    name: "Invoice processing automation",
    description: "",
    sponsor: "",
    lead: "",
    startDate: today,
    targetGoLive: phases[3].end,
    company: { id: "company", name: "", industry: "", country: "", employees: 0, revenueEurM: 0, erp: "", currency: "EUR", description: "" },
    team: [],
    process: { id: "ap-invoice", name: "Supplier invoice processing", monthlyVolume: 0, steps: STEP_TEMPLATES.map((s) => ({ ...s, systems: [] })) },
    assumptions: {
      hourlyCost: 0,
      processingMinutesOverride: null,
      errorRateOverride: null,
      monthlyVolume: 0,
      // Model parameters of the calculation engine (not company data); editable in the simulator.
      residualEffortOnAutomated: 0.1,
      automationErrorReduction: 0.7,
      roiHorizonMonths: 36,
      avgInvoiceValue: 0,
      discountEligibleShare: 0.3,
      discountRate: 0.02,
      discountCapturedToday: 0.4,
      discountDaysEarlier: 20,
      capacityRealisation: 0.8,
      rampUpMonths: 3,
      wacc: 0.08,
    },
    scenarios: emptyScenarios(),
    selectedScenario: "automation",
    recommendationRuns: [],
    adoptedRecommendationIds: [],
    phases,
    tasks: [],
    milestones,
    risks: [],
    kpis: [],
    activity: [],
    preferences: { locale: "en-GB", density: "comfortable", showFormulas: true, asOfDate: null, accent: "electric", colorMode: "system", onboarded: false },
    updatedAt: new Date().toISOString(),
  };
}

/** Which setup inputs are still missing; drives the setup checklist. */
export function setupStatus(p: Project) {
  const steps = p.process.steps;
  const items = [
    { id: "company", label: "Company details", done: p.company.name.trim().length > 0, route: "settings" as const },
    { id: "volume", label: "Invoice volume and labour cost", done: p.process.monthlyVolume > 0 && p.assumptions.hourlyCost > 0, route: "process" as const },
    { id: "steps", label: "Handling time for each process step", done: steps.every((s) => s.minutesPerInvoice > 0), route: "process" as const },
    { id: "scenarios", label: "Scenario levers (automation, investment, running cost)", done: p.scenarios.some((s) => s.automationShare > 0 || s.processEfficiencyGain > 0), route: "simulator" as const },
    { id: "tasks", label: "Roadmap tasks", done: p.tasks.length > 0, route: "roadmap" as const },
  ];
  return { items, complete: items.filter((i) => i.done).length, total: items.length, ready: items.filter((i) => i.id === "volume" || i.id === "steps").every((i) => i.done) };
}

// ---------------------------------------------------------------------------
// Benchmark scenario levers (editable starting points, not company data)
// ---------------------------------------------------------------------------

/**
 * Typical starting values for the three scenario types, so a business case exists
 * as soon as process data is entered. Investment and running cost scale with the
 * invoice volume (reference: 4,000 invoices / month), bounded to 0.5×–3×.
 * They are labelled as benchmarks in the UI and should be replaced by vendor quotes.
 */
export function benchmarkScenarios(monthlyVolume: number): Scenario[] {
  const scale = Math.min(3, Math.max(0.5, (monthlyVolume || 4000) / 4000));
  const k = (n: number) => Math.round((n * scale) / 1000) * 1000;
  const h = (n: number) => Math.round((n * scale) / 100) * 100;
  const base = emptyScenarios();
  return [
    { ...base[0], automationShare: 0.15, processEfficiencyGain: 0.18, processErrorGain: 0.2, waitTimeReduction: 0.3, initialInvestment: k(45000), monthlyOperatingCost: h(800), implementationMonths: 3, discountCaptureTarget: 0.55 },
    { ...base[1], automationShare: 0.55, processEfficiencyGain: 0.1, processErrorGain: 0.1, waitTimeReduction: 0.55, initialInvestment: k(180000), monthlyOperatingCost: h(4500), implementationMonths: 6, discountCaptureTarget: 0.8 },
    { ...base[2], automationShare: 0.8, processEfficiencyGain: 0.15, processErrorGain: 0.25, waitTimeReduction: 0.75, initialInvestment: k(420000), monthlyOperatingCost: h(9500), implementationMonths: 12, discountCaptureTarget: 0.9 },
  ];
}

export function scenariosAreEmpty(scenarios: Scenario[]): boolean {
  return scenarios.every((s) => !s.automationShare && !s.processEfficiencyGain && !s.initialInvestment && !s.monthlyOperatingCost && !s.discountCaptureTarget);
}

// ---------------------------------------------------------------------------
// Starter roadmap (template plan for an invoice-automation initiative)
// ---------------------------------------------------------------------------

type StarterTask = [key: string, phase: string, title: string, startFrac: number, lenFrac: number, priority: Task["priority"], risk: Task["risk"], effortDays: number, deps: string[]];

const STARTER: StarterTask[] = [
  ["1", "p1", "Stakeholder interviews (AP, purchasing, treasury)", 0, 0.35, "high", "low", 8, []],
  ["2", "p1", "Baseline measurement: volumes, times, error rates", 0.15, 0.45, "high", "medium", 10, ["1"]],
  ["3", "p1", "Requirements catalogue & non-functional requirements", 0.4, 0.5, "high", "medium", 12, ["1"]],
  ["4", "p1", "Vendor long-list and RFI for capture & workflow tools", 0.6, 0.4, "medium", "low", 6, ["3"]],
  ["5", "p2", "Target process design (to-be BPMN)", 0, 0.45, "high", "medium", 14, ["2", "3"]],
  ["6", "p2", "Approval matrix & delegation rules with cost-centre owners", 0.2, 0.45, "high", "high", 10, ["5"]],
  ["7", "p2", "Works council information & data protection impact assessment", 0.25, 0.5, "high", "high", 8, ["5"]],
  ["8", "p2", "Vendor selection & contract", 0.5, 0.5, "high", "medium", 9, ["4", "6"]],
  ["9", "p2", "Supplier communication plan for e-invoicing", 0.6, 0.4, "medium", "low", 5, ["5"]],
  ["10", "p3", "Configure document capture & extraction", 0, 0.45, "high", "high", 30, ["8"]],
  ["11", "p3", "Automated three-way match rules in ERP", 0.15, 0.5, "high", "high", 28, ["8"]],
  ["12", "p3", "Digital approval workflow incl. mobile approval", 0.3, 0.5, "high", "medium", 25, ["6", "8"]],
  ["13", "p3", "ERP integration & master-data cleansing", 0.25, 0.65, "medium", "high", 22, ["8"]],
  ["14", "p3", "KPI dashboard & process-mining connector", 0.65, 0.35, "medium", "low", 10, ["11"]],
  ["15", "p4", "System integration testing", 0, 0.5, "high", "medium", 15, ["10", "11", "12", "13"]],
  ["16", "p4", "User acceptance testing with AP team", 0.35, 0.5, "high", "medium", 12, ["15"]],
  ["17", "p4", "Parallel run on live invoices", 0.65, 0.35, "high", "high", 10, ["16"]],
  ["18", "p5", "Training & change management", 0, 0.4, "medium", "medium", 12, ["16"]],
  ["19", "p5", "Go-live & hypercare", 0.25, 0.4, "high", "high", 15, ["17", "18"]],
  ["20", "p5", "Benefit tracking & continuous improvement backlog", 0.5, 0.5, "medium", "low", 8, ["19"]],
];

export const STARTER_RISKS: Omit<Risk, "id" | "owner">[] = [
  { title: "Low supplier adoption of e-invoicing formats", probability: "medium", impact: "high", mitigation: "Supplier onboarding campaign; prioritise the top suppliers by volume.", status: "open" },
  { title: "Extraction accuracy below target on line items", probability: "medium", impact: "medium", mitigation: "Pilot with a few vendors; measure field-level accuracy before scaling.", status: "open" },
  { title: "Works council approval delays rollout", probability: "low", impact: "high", mitigation: "Early involvement; no individual performance monitoring in dashboards.", status: "open" },
  { title: "Master-data quality (vendor bank details, tax IDs)", probability: "high", impact: "medium", mitigation: "Cleansing sprint before integration; four-eyes check on bank-detail changes.", status: "open" },
  { title: "AP team capacity during month-end close", probability: "medium", impact: "medium", mitigation: "Avoid test windows in close weeks; temporary backfill.", status: "open" },
];

/**
 * Builds the starter plan inside the project's current phases. Task budgets split
 * the preferred scenario's initial investment in proportion to effort, so roadmap
 * budget and business case stay consistent.
 */
export function starterRoadmap(p: Project): { tasks: Task[]; risks: Risk[] } {
  const owner = p.lead.trim() || "Unassigned";
  const scen = p.scenarios.find((s) => s.id === p.selectedScenario);
  const investment = scen?.initialInvestment ?? 0;
  const totalEffort = STARTER.reduce((t, x) => t + x[7], 0);
  const stamp = Date.now().toString(36);
  const id = (k: string) => `st${stamp}-${k}`;
  const tasks: Task[] = [];
  for (const [key, phaseId, title, sf, lf, priority, risk, effortDays, deps] of STARTER) {
    const ph = p.phases.find((x) => x.id === phaseId);
    if (!ph) continue;
    const len = Math.max(1, diffDays(ph.start, ph.end) + 1);
    const start = addDays(ph.start, Math.floor(len * sf));
    const due = addDays(start, Math.max(0, Math.round(len * lf) - 1));
    tasks.push({
      id: id(key), phaseId, title, owner, status: "todo", priority, risk,
      start, due: due > ph.end ? ph.end : due,
      dependsOn: deps.map(id),
      budget: Math.round((investment * effortDays) / totalEffort / 100) * 100,
      effortDays,
    });
  }
  const risks: Risk[] = STARTER_RISKS.map((r, i) => ({ ...r, id: `sr${stamp}-${i + 1}`, owner }));
  return { tasks, risks };
}
