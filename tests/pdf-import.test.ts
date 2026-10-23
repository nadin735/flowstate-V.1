import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { itemsToLines, parseBaselineSheet, parseLocaleNumber } from "../src/domain/sheetParser";

test("locale numbers: German and English notation", () => {
  assert.equal(parseLocaleNumber("3.600"), 3600);
  assert.equal(parseLocaleNumber("1.234,5"), 1234.5);
  assert.equal(parseLocaleNumber("1,234.5"), 1234.5);
  assert.equal(parseLocaleNumber("2,5"), 2.5);
  assert.equal(parseLocaleNumber("44,00 €"), 44);
  assert.equal(parseLocaleNumber("15 %"), 15);
  assert.equal(parseLocaleNumber("abc"), null);
});

test("parses labelled fields and step rows (EN + DE, OCR quirks)", () => {
  const r = parseBaselineSheet([
    "Company: Muster AG | Country: Austria",
    "Invoices per month: 1,250",
    "Stundensatz: 38,50 EUR",
    "Invoice received | 2 min | 20 % | 1 % | 10 | 0,5 | Mailroom",
    "Datenerfassung | 4,5 | 0 % | 05 % | 20 | 1,5",
    "Approval | 3 | 0 %",
  ]);
  assert.equal(r.company.name, "Muster AG");
  assert.equal(r.company.country, "Austria");
  assert.equal(r.monthlyVolume, 1250);
  assert.equal(r.hourlyCost, 38.5);
  assert.equal(r.steps.receive?.minutesPerInvoice, 2);
  assert.equal(r.steps.receive?.automatedShare, 0.2);
  assert.equal(r.steps.receive?.owner, "Mailroom");
  assert.equal(r.steps.extract?.errorRate, 0.005);
  assert.equal(r.steps.approve, undefined);
  assert.ok(r.warnings.some((w) => w.includes("Approval")));
});

test("demo scan PDF: text layer is extracted and parsed completely", async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(new URL("../demo/flowstate-demo-scan.pdf", import.meta.url)));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const items = (content.items as { str: string; transform: number[]; width: number; height: number }[]).map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]) }));
  const r = parseBaselineSheet(itemsToLines(items));
  assert.equal(r.company.name, "Hanse Präzisionsteile GmbH");
  assert.equal(r.company.employees, 640);
  assert.equal(r.company.erp, "SAP S/4HANA");
  assert.equal(r.project.lead, "Katrin Albers");
  assert.equal(r.monthlyVolume, 3600);
  assert.equal(r.hourlyCost, 44);
  assert.equal(r.avgInvoiceValue, 2150);
  assert.equal(r.discountEligibleShare, 0.35);
  assert.equal(r.discountRate, 0.02);
  assert.equal(r.discountCapturedToday, 0.3);
  assert.deepEqual(Object.keys(r.steps).sort(), ["approve", "extract", "pay", "receive", "validate"]);
  assert.equal(r.steps.validate?.minutesPerInvoice, 4);
  assert.equal(r.steps.validate?.errorRate, 0.035);
  assert.equal(r.steps.approve?.waitDays, 4.5);
  assert.equal(r.steps.pay?.automatedShare, 0.55);
  assert.equal(r.steps.pay?.owner, "Treasury");
  assert.deepEqual(r.warnings, []);
});
