/**
 * Published accounts-payable benchmarks used to put a company's baseline in context.
 * Figures are quoted as published (USD, mixed company sizes) and are a reference point,
 * not a target — definitions differ from FLOWSTATE's model in detail.
 */
export interface BenchmarkSource {
  id: string;
  name: string;
  publisher: string;
  year: number;
  url: string;
}

export const SOURCES: Record<string, BenchmarkSource> = {
  ardent: {
    id: "ardent",
    name: "Accounts Payable Metrics that Matter in 2025",
    publisher: "Ardent Partners",
    year: 2025,
    url: "https://www.apexanalytix.com/resources/blog/ardent-partners-key-ap-metrics-2025/",
  },
  apqc: {
    id: "apqc",
    name: "Open Standards Benchmarking: cost per invoice processed (n = 5,846)",
    publisher: "APQC, via Tipalti",
    year: 2026,
    url: "https://tipalti.com/resources/learn/cost-per-invoice/",
  },
};

export type BenchmarkKey = "costPerInvoice" | "cycleTimeDays" | "automationRate" | "exceptionRate";

export interface Benchmark {
  key: BenchmarkKey;
  label: string;
  unit: "usd" | "days" | "pct";
  lowerIsBetter: boolean;
  /** Published reference points, in display order. */
  points: { label: string; value: number; source: string }[];
  note?: string;
}

export const BENCHMARKS: Benchmark[] = [
  {
    key: "costPerInvoice",
    label: "Cost per invoice",
    unit: "usd",
    lowerIsBetter: true,
    points: [
      { label: "Best-in-class", value: 2.78, source: "ardent" },
      { label: "Median", value: 6.0, source: "apqc" },
      { label: "Average", value: 9.4, source: "ardent" },
      { label: "All others", value: 12.88, source: "ardent" },
    ],
    note: "Published in USD; FLOWSTATE shows your labour cost in EUR. Benchmarks exclude some fully loaded cost elements.",
  },
  {
    key: "cycleTimeDays",
    label: "Invoice cycle time",
    unit: "days",
    lowerIsBetter: true,
    points: [{ label: "Average", value: 9.2, source: "ardent" }],
  },
  {
    key: "automationRate",
    label: "Straight-through (touchless) rate",
    unit: "pct",
    lowerIsBetter: false,
    points: [
      { label: "Average", value: 0.326, source: "ardent" },
      { label: "Best-in-class", value: 0.492, source: "ardent" },
    ],
    note: "Compared with FLOWSTATE's automated share of handling work — a close but not identical measure.",
  },
  {
    key: "exceptionRate",
    label: "Invoice exception rate",
    unit: "pct",
    lowerIsBetter: true,
    points: [{ label: "Average", value: 0.14, source: "ardent" }],
    note: "Compared with FLOWSTATE's first-pass error rate.",
  },
];

/** Where a value sits against the published points: "better" than the best point, "worse" than the worst, else "within". */
export function position(b: Benchmark, value: number): "better" | "within" | "worse" {
  const vals = b.points.map((p) => p.value);
  const best = b.lowerIsBetter ? Math.min(...vals) : Math.max(...vals);
  const worst = b.lowerIsBetter ? Math.max(...vals) : Math.min(...vals);
  if (b.lowerIsBetter ? value <= best : value >= best) return "better";
  if (b.lowerIsBetter ? value > worst : value < worst) return "worse";
  return "within";
}
