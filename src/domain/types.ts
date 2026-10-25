/**
 * FLOWSTATE domain model.
 *
 * Every schema is defined with zod so that the same definition validates
 * user input, persisted project files, imported JSON and LLM responses.
 * All data is entered by the user and lives only for the current browser session.
 */
import { z } from "zod";

const id = z.string().min(1).max(64);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const pct = z.number().min(0).max(1); // fractions 0..1
const nonNeg = z.number().finite().min(0);

export const CompanySchema = z.object({
  id,
  name: z.string().max(120),
  industry: z.string().max(120),
  country: z.string().max(60),
  employees: z.number().int().min(0),
  revenueEurM: nonNeg,
  erp: z.string().max(80),
  currency: z.literal("EUR"),
  description: z.string().max(600),
});
export type Company = z.infer<typeof CompanySchema>;

export const UserSchema = z.object({
  id,
  name: z.string().min(1).max(80),
  role: z.string().max(80),
  initials: z.string().max(3),
});
export type User = z.infer<typeof UserSchema>;

export const ProcessStepSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  description: z.string().max(400),
  owner: z.string().max(60),
  /** Active handling time per invoice, minutes (demo input). */
  minutesPerInvoice: z.number().min(0).max(240),
  /** Share of the step's work already automated today (0..1). */
  automatedShare: pct,
  /** Share of invoices with an error introduced/detected in this step (0..1). */
  errorRate: z.number().min(0).max(0.6),
  /** Additional minutes of rework per error. */
  reworkMinutes: z.number().min(0).max(480),
  /** Average queue/wait time before the step completes, in business days. */
  waitDays: z.number().min(0).max(60),
  /** Rough systems involved, purely descriptive. */
  systems: z.array(z.string().max(40)).max(8),
});
export type ProcessStep = z.infer<typeof ProcessStepSchema>;

export const BusinessProcessSchema = z.object({
  id,
  name: z.string().min(1).max(80),
  monthlyVolume: z.number().int().min(0).max(1_000_000),
  steps: z.array(ProcessStepSchema).min(1).max(12),
});
export type BusinessProcess = z.infer<typeof BusinessProcessSchema>;

/** Global financial assumptions (shared by every scenario). */
export const AssumptionsSchema = z.object({
  /** Fully loaded labour cost per hour, EUR. */
  hourlyCost: z.number().min(0).max(500),
  /** Override for processing minutes per invoice; null = derived from the process map. */
  processingMinutesOverride: z.number().min(0.5).max(480).nullable(),
  /** Override for overall error rate; null = derived from the process map. */
  errorRateOverride: z.number().min(0).max(0.6).nullable(),
  /** Monthly invoice volume (mirrors the process volume). */
  monthlyVolume: z.number().int().min(0).max(1_000_000),
  /** Share of effort that remains on automated work (exception handling, monitoring). */
  residualEffortOnAutomated: pct,
  /** Share of errors avoided on work that becomes automated. */
  automationErrorReduction: pct,
  /** Multi-year horizon (months) for the extended ROI view. */
  roiHorizonMonths: z.number().int().min(12).max(60),
  /** Average gross amount of a supplier invoice, EUR (0 = unknown → no discount benefit). */
  avgInvoiceValue: z.number().min(0).max(10_000_000).default(0),
  /** Share of invoices whose payment terms offer an early-payment discount (Skonto). */
  discountEligibleShare: pct.default(0.3),
  /** Early-payment discount rate, e.g. 0.02 = 2 %. */
  discountRate: z.number().min(0).max(0.1).default(0.02),
  /** Share of eligible discounts captured today. */
  discountCapturedToday: pct.default(0.4),
  /** Days the invoice is paid earlier to take the discount (e.g. "2/10 net 30" → 20). Financed at WACC. */
  discountDaysEarlier: z.number().min(0).max(120).default(20),
  /** Share of freed labour capacity that turns into real cost savings (redeployment, attrition, fewer temps). */
  capacityRealisation: pct.default(0.8),
  /** Months after go-live until benefits reach full level (linear ramp). */
  rampUpMonths: z.number().int().min(0).max(12).default(3),
  /** Annual discount rate (WACC) for the net present value. */
  wacc: z.number().min(0).max(0.3).default(0.08),
});
export type Assumptions = z.infer<typeof AssumptionsSchema>;

export const ScenarioKind = z.enum(["optimization", "automation", "transformation"]);
export type ScenarioKind = z.infer<typeof ScenarioKind>;

export const ScenarioSchema = z.object({
  id: ScenarioKind,
  name: z.string().max(60),
  summary: z.string().max(300),
  /** Target share of total handling effort that is automated after the change. */
  automationShare: pct,
  /** Effort reduction from redesign/standardisation, before automation. */
  processEfficiencyGain: pct,
  /** Error reduction from redesign/standardisation, before automation. */
  processErrorGain: pct,
  /** Approval/wait-time reduction for cycle time estimates. */
  waitTimeReduction: pct,
  initialInvestment: nonNeg,
  monthlyOperatingCost: nonNeg,
  implementationMonths: z.number().int().min(1).max(36),
  /** Share of eligible early-payment discounts captured after the change. */
  discountCaptureTarget: pct.default(0),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const Complexity = z.enum(["Low", "Medium", "High"]);
export const Level = z.enum(["low", "medium", "high"]);
export type Level = z.infer<typeof Level>;

export const RecommendationSchema = z.object({
  id,
  title: z.string().min(1).max(120),
  targetStepId: z.string().max(64).nullable(),
  problemStatement: z.string().max(600),
  rootCause: z.string().max(600),
  solution: z.string().max(800),
  impact: z.string().max(400),
  /** Estimated monthly gross savings in EUR (estimate). */
  monthlySavings: nonNeg,
  complexity: Complexity,
  investment: nonNeg,
  implementationWeeks: z.number().int().min(1).max(104),
  risks: z.array(z.string().max(240)).max(6),
  successMetrics: z.array(z.string().max(240)).max(6),
  fitScore: z.number().min(0).max(100),
  notes: z.array(z.string().max(240)).max(6).default([]),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const RecommendationRunSchema = z.object({
  id,
  createdAt: z.string(),
  source: z.enum(["demo-rules", "llm"]),
  model: z.string().nullable(),
  problem: z.string().max(80),
  description: z.string().max(4000),
  constraints: z.array(z.string().max(60)).max(12),
  budgetCap: z.number().min(0).nullable(),
  items: z.array(RecommendationSchema).max(10),
});
export type RecommendationRun = z.infer<typeof RecommendationRunSchema>;

export const TaskStatus = z.enum(["todo", "in_progress", "blocked", "done"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const TaskSchema = z.object({
  id,
  phaseId: id,
  title: z.string().min(2, "Title needs at least 2 characters").max(120),
  owner: z.string().min(1, "Owner is required").max(60),
  status: TaskStatus,
  priority: Level,
  risk: Level,
  start: isoDate,
  due: isoDate,
  dependsOn: z.array(id).max(10),
  budget: nonNeg,
  effortDays: z.number().min(0.5).max(400),
});
export type Task = z.infer<typeof TaskSchema>;

export const PhaseSchema = z.object({
  id,
  name: z.string().min(1).max(80),
  order: z.number().int(),
  start: isoDate,
  end: isoDate,
});
export type Phase = z.infer<typeof PhaseSchema>;

export const MilestoneSchema = z.object({
  id,
  phaseId: id,
  name: z.string().min(1).max(100),
  due: isoDate,
  /** Completion is derived: done when all tasks in its phase are done, unless manually set. */
  manuallyCompleted: z.boolean(),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const RiskSchema = z.object({
  id,
  title: z.string().min(1).max(140),
  probability: Level,
  impact: Level,
  mitigation: z.string().max(400),
  owner: z.string().max(60),
  status: z.enum(["open", "mitigating", "closed"]),
});
export type Risk = z.infer<typeof RiskSchema>;

export const KpiKey = z.enum(["costPerInvoice", "cycleTimeDays", "manualHours", "errorRate", "automationRate", "monthlySavings"]);
export type KpiKey = z.infer<typeof KpiKey>;

/** Monthly measured (demo) values. */
export const KpiMeasurementSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  costPerInvoice: nonNeg,
  cycleTimeDays: nonNeg,
  manualHours: nonNeg,
  errorRate: pct,
  automationRate: pct,
  volume: nonNeg,
});
export type KpiMeasurement = z.infer<typeof KpiMeasurementSchema>;

export const ActivitySchema = z.object({
  id,
  at: z.string(),
  text: z.string().max(240),
  kind: z.enum(["task", "scenario", "process", "recommendation", "system"]),
});
export type Activity = z.infer<typeof ActivitySchema>;

export const PreferencesSchema = z.object({
  locale: z.enum(["de-DE", "en-GB"]),
  density: z.enum(["comfortable", "compact"]),
  showFormulas: z.boolean(),
  /** Simulated "today" used for overdue logic. null = real date. */
  asOfDate: isoDate.nullable(),
  /** Colour theme of the workspace. */
  accent: z.enum(["neon", "forest", "electric"]).default("electric"),
  /** Light/dark appearance; "system" follows the OS or host setting. */
  colorMode: z.enum(["system", "light", "dark"]).default("system"),
  /** Whether the first-run welcome screen has been completed or skipped. */
  onboarded: z.boolean().default(false),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

export const IdeaStage = z.enum(["inbox", "exploring", "promoted"]);
export type IdeaStage = z.infer<typeof IdeaStage>;

/** A free-form idea captured in the Creative Workspace. */
export const IdeaSchema = z.object({
  id,
  title: z.string().min(2, "Title needs at least 2 characters").max(120),
  note: z.string().max(600),
  /** Process step the idea relates to, if any. */
  stepId: z.string().max(64).nullable(),
  stage: IdeaStage,
  createdAt: z.string(),
});
export type Idea = z.infer<typeof IdeaSchema>;

export const ProjectSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  name: z.string().min(1).max(120),
  description: z.string().max(1000),
  sponsor: z.string().max(80),
  lead: z.string().max(80),
  startDate: isoDate,
  targetGoLive: isoDate,
  company: CompanySchema,
  team: z.array(UserSchema).max(20),
  process: BusinessProcessSchema,
  assumptions: AssumptionsSchema,
  scenarios: z.array(ScenarioSchema).length(3),
  selectedScenario: ScenarioKind,
  recommendationRuns: z.array(RecommendationRunSchema).max(20),
  adoptedRecommendationIds: z.array(id).max(30),
  phases: z.array(PhaseSchema).max(12),
  tasks: z.array(TaskSchema).max(300),
  milestones: z.array(MilestoneSchema).max(40),
  risks: z.array(RiskSchema).max(60),
  kpis: z.array(KpiMeasurementSchema).max(60),
  ideas: z.array(IdeaSchema).max(100).default([]),
  activity: z.array(ActivitySchema).max(80),
  preferences: PreferencesSchema,
  updatedAt: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;
