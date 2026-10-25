/**
 * Parses the text of a process-baseline document (e.g. a scanned AP data sheet with
 * an OCR text layer) into FLOWSTATE inputs. Works on plain text lines, so it is
 * independent of how the text was extracted. Labels are recognised in English and
 * German; numbers in German (1.234,5) and English (1,234.5) notation.
 */
import type { ProcessStep } from "./types";

export interface ExtractedSheet {
  company: { name?: string; industry?: string; country?: string; erp?: string; employees?: number };
  project: { lead?: string; sponsor?: string };
  monthlyVolume?: number;
  hourlyCost?: number;
  avgInvoiceValue?: number;
  /** Fractions 0..1 (converted from percent in the document). */
  discountEligibleShare?: number;
  discountRate?: number;
  discountCapturedToday?: number;
  steps: Partial<Record<string, Partial<Pick<ProcessStep, "minutesPerInvoice" | "automatedShare" | "errorRate" | "reworkMinutes" | "waitDays" | "owner">>>>;
  /** Field keys that were found, for the review dialog. */
  found: string[];
  warnings: string[];
}

/** Parses "1.234,5", "1,234.5", "2,5", "4.200", "15 %" → number (percent sign is NOT applied). */
export function parseLocaleNumber(raw: string): number | null {
  const s = raw.replace(/[\s €%]/g, "").replace(/[–−]/g, "-");
  if (!/^-?[\d.,]+$/.test(s)) return null;
  let n: string;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    n = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (hasComma) {
    n = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot) {
    n = /^-?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  } else n = s;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

const NUM = String.raw`-?\d[\d.,\s ]*\d|-?\d`;

const STEP_ALIASES: [string, RegExp][] = [
  ["receive", /^(invoice received|invoice receipt|receipt|rechnungseingang|eingang)\b/i],
  ["extract", /^(data extraction|data entry|extraction|datenerfassung|datenextraktion|erfassung)\b/i],
  ["validate", /^(validation|three-way match|3-way match|pr[üu]e?fung|validierung|rechnungspr[üu]e?fung)/i],
  ["approve", /^(approval|freigabe|genehmigung)\b/i],
  ["pay", /^(payment|zahlung|zahllauf|bezahlung)\b/i],
];

type FieldDef = { key: string; labels: RegExp; kind: "text" | "number" };
const FIELDS: FieldDef[] = [
  { key: "company.name", labels: /^(company|company name|unternehmen|firma|gesellschaft)\s*[:：]/i, kind: "text" },
  { key: "company.industry", labels: /^(industry|branche)\s*[:：]/i, kind: "text" },
  { key: "company.country", labels: /^(country|land|standort)\s*[:：]/i, kind: "text" },
  { key: "company.erp", labels: /^(erp|erp system|erp-system)\s*[:：]/i, kind: "text" },
  { key: "company.employees", labels: /^(employees|mitarbeitende|mitarbeiter(innen)?|beschäftigte)\s*[:：]/i, kind: "number" },
  { key: "project.lead", labels: /^(project lead|projektleitung|projektleiter(in)?)\s*[:：]/i, kind: "text" },
  { key: "project.sponsor", labels: /^(sponsor|auftraggeber(in)?)\s*[:：]/i, kind: "text" },
  { key: "monthlyVolume", labels: /^(monthly invoice volume|invoices per month|invoice volume|rechnungen pro monat|rechnungsvolumen( pro monat| \/ monat)?|monatliches rechnungsvolumen|eingangsrechnungen pro monat)\s*[:：]/i, kind: "number" },
  { key: "avgInvoiceValue", labels: /^(average invoice (value|amount)|avg\.? invoice (value|amount)|durchschnittlicher rechnungsbetrag|ø[ -]?rechnungsbetrag|rechnungsbetrag \(durchschnitt\))\s*[:：]/i, kind: "number" },
  { key: "discountEligibleShare", labels: /^(invoices with (early[- ]payment )?discount|share with discount terms|skonto[- ]?anteil|rechnungen mit skonto)\s*[:：]/i, kind: "number" },
  { key: "discountRate", labels: /^((early[- ]payment )?discount rate|skontosatz|skonto[- ]?satz)\s*[:：]/i, kind: "number" },
  { key: "discountCapturedToday", labels: /^(discounts? captured( today)?|skonto genutzt|genutztes skonto|skonto[- ]?nutzung)\s*[:：]/i, kind: "number" },
  { key: "hourlyCost", labels: /^(labou?r cost per hour|hourly (labou?r )?cost|cost per hour|stundensatz|personalkosten pro stunde|vollkostensatz( pro stunde)?)\s*[:：]/i, kind: "number" },
];

function clean(line: string): string {
  return line.replace(/\s*\|\s*/g, " | ").replace(/[ \t ]+/g, " ").trim();
}

export function parseBaselineSheet(lines: string[]): ExtractedSheet {
  const out: ExtractedSheet = { company: {}, project: {}, steps: {}, found: [], warnings: [] };
  const norm = lines.map(clean).filter(Boolean);

  for (const line of norm) {
    // Key–value fields ("Label: value"), several may share a line separated by " | ".
    for (const part of line.split(" | ")) {
      for (const f of FIELDS) {
        const m = part.match(f.labels);
        if (!m) continue;
        const value = part.slice(m[0].length).trim();
        if (!value) continue;
        if (f.kind === "number") {
          const numMatch = value.match(new RegExp(NUM));
          const n = numMatch ? parseLocaleNumber(numMatch[0]) : null;
          if (n === null) continue;
          const percentKeys = ["discountEligibleShare", "discountRate", "discountCapturedToday"];
          setField(out, f.key, percentKeys.includes(f.key) ? Math.min(1, Math.max(0, n / 100)) : n);
        } else {
          setField(out, f.key, value.slice(0, 120));
        }
        if (!out.found.includes(f.key)) out.found.push(f.key);
      }
    }

    // Step rows: "<step name> | 2,0 | 15 % | 1,0 % | 10 | 1,2 [| owner]"
    const first = line.split(" | ")[0];
    const alias = STEP_ALIASES.find(([, re]) => re.test(first));
    if (alias) {
      const rest = line.slice(first.length);
      const tokens = rest.split(" | ").map((t) => t.trim()).filter(Boolean);
      const nums: number[] = [];
      let owner: string | undefined;
      for (const t of tokens) {
        let raw = t.replace(/\b(min|minutes|minuten|tage|days|d|h)\b\.?/gi, "").trim();
        // OCR often drops the decimal comma in small values: "05 %" → "0,5 %".
        if (/^0\d+\s*%?$/.test(raw)) raw = raw.replace(/^0(\d+)/, "0,$1");
        const n = parseLocaleNumber(raw);
        if (n !== null) nums.push(n);
        else if (nums.length >= 5 && !owner) owner = t.slice(0, 60);
      }
      if (nums.length >= 5) {
        const [minutes, auto, err, rework, wait] = nums;
        const step = {
          minutesPerInvoice: clamp(minutes, 0, 240),
          automatedShare: clamp(auto / 100, 0, 0.95),
          errorRate: clamp(err / 100, 0, 0.6),
          reworkMinutes: clamp(rework, 0, 480),
          waitDays: clamp(wait, 0, 60),
          ...(owner ? { owner } : {}),
        };
        if (auto > 95 || err > 60) out.warnings.push(`${first}: values out of range were capped.`);
        if (step.errorRate > 0.15) out.warnings.push(`${first}: error rate of ${Math.round(step.errorRate * 100)} % is unusually high, please check (OCR may have dropped a decimal comma).`);
        if (step.minutesPerInvoice > 60) out.warnings.push(`${first}: ${step.minutesPerInvoice} minutes per invoice is unusually high, please check.`);
        out.steps[alias[0]] = step;
        const key = `step.${alias[0]}`;
        if (!out.found.includes(key)) out.found.push(key);
      } else if (nums.length > 0) {
        out.warnings.push(`Row “${first}” has only ${nums.length} of 5 values and was skipped.`);
      }
    }
  }
  return out;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function setField(out: ExtractedSheet, key: string, v: string | number) {
  const [a, b] = key.split(".");
  if (b) (out as unknown as Record<string, Record<string, unknown>>)[a][b] = v;
  else (out as unknown as Record<string, unknown>)[a] = v;
}

/** Groups positioned text items (as delivered by PDF.js) into reading-order lines. */
export function itemsToLines(items: { str: string; x: number; y: number; w: number; h: number }[]): string[] {
  const rows: { y: number; h: number; items: typeof items }[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const tol = Math.max(3, it.h * 0.8);
    const row = rows.find((r) => Math.abs(r.y - it.y) <= tol);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, h: it.h, items: [it] });
  }
  rows.sort((a, b) => b.y - a.y); // PDF y grows upwards
  return rows.map((r) => {
    const sorted = r.items.sort((a, b) => a.x - b.x);
    let line = "";
    let lastEnd: number | null = null;
    for (const it of sorted) {
      if (lastEnd !== null) {
        const gap = it.x - lastEnd;
        line += gap > Math.max(8, it.h * 1.2) ? " | " : gap > 0.5 ? " " : "";
      }
      line += it.str;
      lastEnd = it.x + it.w;
    }
    return line.trim();
  });
}
