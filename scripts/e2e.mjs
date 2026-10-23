// End-to-end check of the primary user journey in headless Chromium.
// Usage: npm run build && npm run e2e   (screenshots → e2e-output/)
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const PORT = 3456;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "e2e-output";
await mkdir(OUT, { recursive: true });
const tmp = await mkdtemp(path.join(tmpdir(), "flowstate-e2e-"));
// The app starts empty; the later journey imports a fictional test fixture through the UI.
const FIXTURE = path.join(tmp, "sample-project.json");
execFileSync(process.execPath, ["--import", "tsx", "-e", `import("./tests/fixtures/sample-project.ts").then((m) => { const p = m.createDemoProject("nordwerk"); p.preferences.onboarded = true; require("node:fs").writeFileSync(${JSON.stringify(FIXTURE)}, JSON.stringify(p)); })`]);
// An image-only PDF (no text layer) to exercise the error path.
const IMAGE_ONLY = path.join(tmp, "image-only.pdf");
execFileSync("python3", ["-c", `
from reportlab.pdfgen import canvas
from PIL import Image, ImageDraw
img = Image.new("L", (800, 400), 240); ImageDraw.Draw(img).text((40, 40), "Rechnungen pro Monat: 3.600", fill=0)
img.save(${JSON.stringify(path.join(tmp, "img.png"))})
c = canvas.Canvas(${JSON.stringify(IMAGE_ONLY)}); c.drawImage(${JSON.stringify(path.join(tmp, "img.png"))}, 40, 400, 500, 250); c.save()
`]);
const server = spawn(process.execPath, ["dist-server/server.mjs"], { env: { ...process.env, PORT: String(PORT), ANTHROPIC_API_KEY: "" }, stdio: "inherit" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {}
  await sleep(100);
}

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ", " + detail : ""}`); };

const browser = await chromium.launch();
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();
  // Privacy: record every request that leaves our own origin (fonts, CDNs, trackers …).
  const thirdParty = new Set();
  page.on("request", (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && u.origin !== new URL(BASE).origin) thirdParty.add(u.host); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  const text = async (sel) => (await page.locator(sel).first().innerText()).trim();
  const go = async (route) => { await page.goto(`${BASE}/#/${route}`); await page.waitForSelector(".page h1"); await sleep(250); };

  // 0. First-run welcome screen
  await page.goto(`${BASE}/`);
  await page.waitForSelector(".wl-h1");
  await page.waitForFunction(() => document.querySelector(".wl-h1")?.textContent?.includes("invoices flow."), null, { timeout: 5000 });
  check("Welcome typewriter completes", true);
  await page.waitForSelector(".wl[data-halo='on'], .wl[data-halo='off'], .wl[data-halo='failed']", { timeout: 10000 });
  const haloState = await page.locator(".wl").getAttribute("data-halo");
  const vOpts = await page.evaluate(() => window.__flowstateTopology || null);
  const canvasOk = await page.evaluate(() => { const c = document.querySelector(".wl-halo canvas"); return !!c && c.width > 0 && c.height > 0; });
  check("TOPOLOGY background runs with the requested options (self-hosted, no CDN)", haloState === "on" && canvasOk && vOpts && vOpts.color === 0x00dfff && vOpts.backgroundColor === 0xeaeaea && vOpts.scale === 1 && vOpts.scaleMobile === 1 && vOpts.mouseControls === true && vOpts.touchControls === true && vOpts.gyroControls === false && vOpts.minHeight === 200 && vOpts.minWidth === 200, `state=${haloState}`);
  check("Hero keeps light text treatment on the light topology ground", await page.locator(".wl.wl-topo:not(.wl-dark)").count() === 1);
  check("Welcome asks directly for data: PDF upload or manual entry", await page.getByRole("button", { name: "Upload PDF" }).isVisible() && await page.getByRole("button", { name: "Enter data manually" }).isVisible());
  await page.mouse.move(200, 500);
  await page.mouse.move(900, 500, { steps: 8 });
  check("Mouse movement scrubs the pipeline", (await page.locator(".wl-ticker b").innerText()) !== "Invoice received");
  await page.screenshot({ path: `${OUT}/00-welcome.png` });
  await page.getByRole("button", { name: "Enter data manually" }).click();
  await page.waitForSelector(".intake");
  check("Manual choice on the welcome screen opens the manual form directly (one onboarding step)", await page.getByRole("button", { name: "Save and show business case" }).isVisible());
  await go("consultant");
  check("Empty project: recommendations wait for process data", await page.getByRole("button", { name: "Generate recommendations" }).isDisabled());

  // Demo link: ?demo opens directly in the filled dashboard; the banner leads back to an empty project
  {
    const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const dp = await dctx.newPage();
    dp.on("pageerror", (e) => errors.push(`demo pageerror: ${e.message}`));
    await dp.goto(`${BASE}/?demo`);
    await dp.waitForSelector(".demo-banner", { timeout: 8000 });
    check("Demo link opens the filled dashboard with a demo banner", (await dp.locator(".ws-name").innerText()).includes("Hanse") && (await dp.locator(".stat-grid").isVisible()));
    await dp.getByRole("button", { name: "Start with my own data" }).click();
    await dp.waitForTimeout(600);
    check("'Start with my own data' clears the demo and asks for data", (await dp.locator(".demo-banner").count()) === 0 && (await dp.getByText(/How do you want to provide your process data|Upload PDF/).first().isVisible()));
    await dctx.close();
  }

  // Regression: typing into a field that shows "0.0" must replace it (was saved as 0.042 instead of 42)
  {
    const kctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const kp = await kctx.newPage();
    await kp.goto(`${BASE}/`);
    await kp.waitForSelector(".wl-h1");
    await kp.getByRole("button", { name: "Enter data manually" }).click();
    await kp.waitForSelector("#in-rate");
    await kp.click("#in-rate");
    await kp.keyboard.type("42");
    await kp.click("#in-volume");
    await kp.keyboard.type("2500");
    await kp.locator("h1").click();
    check("Typing into a zero field replaces it (42 €/h, 2500 invoices)", (await kp.locator("#in-rate").inputValue()) === "42.0" && (await kp.locator("#in-volume").inputValue()) === "2500");
    await kctx.close();
  }

  // Test data: one click fills every page
  {
    const tctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await tctx.route(/fonts|cdnjs|jsdelivr/, (r) => r.abort());
    const tp = await tctx.newPage();
    tp.on("pageerror", (e) => errors.push(`testdata pageerror: ${e.message}`));
    await tp.goto(`${BASE}/`);
    await tp.waitForSelector(".wl-h1");
    await tp.getByRole("button", { name: /Try with test data/ }).click();
    await tp.waitForSelector(".stat-grid", { timeout: 8000 });
    const sav = await tp.locator(".stat-grid .stat >> nth=3 >> .stat-value").innerText();
    check("Try with test data fills the overview with a business case", (await tp.locator(".ws-name").innerText()).includes("Hanse") && !["0€", "€0"].includes(sav.replace(/\s/g, "")), sav);
    await tp.goto(`${BASE}/#/roadmap`);
    await tp.waitForSelector(".g-bar");
    check("Test data includes a roadmap", (await tp.locator(".g-bar").count()) === 20);
    await tp.goto(`${BASE}/#/consultant`);
    await tp.waitForSelector(".table tbody tr");
    check("Test data includes recommendations", (await tp.locator(".card", { hasText: "Compare interventions" }).locator("tbody tr").count()) >= 3);
    await tp.goto(`${BASE}/#/analytics`);
    await tp.waitForSelector(".kpi-grid");
    check("Test data includes KPI measurements", (await tp.locator(".card", { hasText: "Record a monthly measurement" }).locator("tbody tr").count()) === 6);
    check("Measurement form is pre-filled (no accidental zeros)", Number(await tp.locator("#kpi-cpi").inputValue()) > 0);
    await tp.goto(`${BASE}/#/overview`);
    await tp.waitForSelector(".bench-table");
    check("Overview compares the baseline with published AP benchmarks, sources linked", (await tp.locator(".bench-table tbody tr").count()) === 4 && (await tp.locator(".bench-sources a").count()) === 2);
    check("Project health explains why it is at risk", (await tp.locator(".issue-list").innerText()).toLowerCase().includes("risk"));
    await tp.goto(`${BASE}/#/simulator`);
    await tp.waitForSelector(".sim-table");
    check("Discount benefit is shown net of the financing cost", (await tp.locator(".formula-grid, .formulas, main").first().innerText()).includes("÷ 365"));
    await tp.setViewportSize({ width: 1440, height: 640 });
    await tp.goto(`${BASE}/#/overview`);
    await tp.waitForSelector(".stat-grid");
    const navOk = await tp.evaluate(() => { const s = document.querySelector('.nav-item[href="#/settings"]').getBoundingClientRect(); const f = document.querySelector(".sidebar-foot").getBoundingClientRect(); const nav = document.querySelector(".sidebar nav"); return s.bottom <= f.top + 1 || nav.scrollHeight > nav.clientHeight; });
    check("Sidebar footer never covers the navigation on short screens", navOk);
    const hdr = await tp.evaluate(() => getComputedStyle(document.querySelector(".topbar")).backgroundColor);
    check("Top bar is opaque (no content showing through)", !/rgba\(.*, 0\.\d+\)$/.test(hdr), hdr);
    await tctx.close();
  }

  // 0b. Empty start: no demo data anywhere, set up through the UI
  await go("overview");
  check("A new session is asked for its data first: PDF or manual", await page.getByRole("heading", { name: "How do you want to provide your process data?" }).isVisible() && await page.getByRole("button", { name: "Upload PDF" }).isVisible() && await page.getByRole("button", { name: "Enter data manually" }).isVisible());
  check("No dashboard figures before data exists", (await page.locator(".stat-grid").count()) === 0 && (await page.locator(".ws-name").innerText()).trim() === "Add company name");
  await page.screenshot({ path: `${OUT}/01a-data-intake.png` });
  await page.getByRole("button", { name: "Enter data manually" }).click();
  await page.getByRole("button", { name: "Save and show business case" }).click();
  check("Manual form requires volume, cost and minutes", await page.locator(".intake .field-msg").isVisible());
  await page.locator("#in-company").fill("Intake GmbH");
  await page.locator("#in-volume").fill("2000");
  await page.locator("#in-rate").fill("40");
  for (const [id, v] of [["receive", "2"], ["extract", "4"], ["validate", "3"], ["approve", "2"], ["pay", "1"]]) await page.getByLabel(`${{ receive: "Invoice received", extract: "Data extraction", validate: "Validation", approve: "Approval", pay: "Payment" }[id]}: minutes per invoice`).fill(v);
  await page.screenshot({ path: `${OUT}/01b-manual-intake.png`, fullPage: true });
  await page.getByRole("button", { name: "Save and show business case" }).click();
  await page.waitForSelector(".stat-grid");
  const costIntake = await text(".stat-grid .stat >> nth=0 >> .stat-value");
  check("Manual intake opens the dashboard with calculated figures", !["0€", "€0"].includes(costIntake.replace(/\s/g, "")), costIntake);
  const savingsIntake = await text(".stat-grid .stat >> nth=3 >> .stat-value");
  check("Business case shows positive savings right after data entry (benchmarks applied)", !["0€", "€0"].includes(savingsIntake.replace(/\s/g, "")) && !savingsIntake.includes("-"), savingsIntake);
  check("Savings come with a pessimistic–optimistic range", (await page.locator(".stat-grid .stat >> nth=3").innerText()).includes("Range"));
  check("Project health is honest without a plan", (await page.locator(".ov-board", { hasText: "Is the project on track?" }).locator(".badge").first().innerText()).includes("No plan yet"));
  check("Company from intake is used", (await page.locator(".ws-name").innerText()).trim() === "Intake GmbH");
  // Start over empty for the page-by-page journey below
  await go("settings");
  await page.getByRole("button", { name: "Clear project" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Clear project" }).click();
  await sleep(400);
  await go("overview");
  await page.getByRole("button", { name: "Skip for now and look around" }).click();
  check("Skipping shows the dashboard with upload on top and manual checklist below", (await page.evaluate(() => [...document.querySelector(".page").children].findIndex((e) => e.classList.contains("upload-hero")))) === 0 && (await page.locator(".setup-list li").count()) === 5);
  await go("roadmap");
  check("Roadmap starts without tasks", await page.getByText("No tasks yet").isVisible() && await page.getByText("No risks recorded").isVisible());
  await page.getByRole("button", { name: "Add risk" }).click();
  await page.getByLabel("Risk", { exact: true }).fill("Supplier adoption slower than planned");
  await page.getByRole("dialog").getByRole("button", { name: "Add risk" }).click();
  check("Risks can be added", await page.locator(".table td", { hasText: "Supplier adoption slower than planned" }).first().isVisible());
  await page.getByRole("button", { name: "Edit phase Discovery & requirements" }).click();
  await page.getByLabel("Phase name").fill("Discovery");
  await page.getByRole("button", { name: "Save phase" }).click();
  check("Phases can be edited", await page.locator(".phase-name", { hasText: "Discovery" }).first().isVisible());
  await page.getByRole("button", { name: "Generate starter roadmap" }).click();
  await sleep(200);
  check("Starter roadmap generates 20 tasks across the five phases", (await page.locator(".g-bar").count()) === 20);
  check("Project health is computed once a plan exists", !(await page.locator(".stat-grid .stat >> nth=0").innerText()).includes("No plan yet"));
  await go("settings");
  await page.getByLabel("Company name").fill("Muster GmbH");
  await go("process");
  await page.locator("#vol").fill("3000");
  await page.locator("#rate").fill("45");
  for (const [name, min] of [["Invoice received", "2"], ["Data extraction", "5"], ["Validation", "4"], ["Approval", "3"], ["Payment", "1.5"]]) {
    await page.getByRole("button", { name: new RegExp(`^${name}:`) }).click();
    await page.getByLabel("Handling time per invoice", { exact: true }).fill(min);
  }
  await sleep(200);
  await go("overview");
  check("Entered inputs drive the overview", (await text(".stat-grid .stat >> nth=0 >> .stat-value")) !== "0 €", await text(".stat-grid .stat >> nth=0 >> .stat-value"));
  check("Setup checklist reflects progress", (await text(".card:has(.setup-list) .badge")).startsWith("4 / 5"), await text(".card:has(.setup-list) .badge"));
  await go("analytics");
  check("KPI page shows derived baseline without measurements", await page.getByText("No measurements recorded yet").isVisible());
  await page.locator("#kpi-cpi").fill("11.4");
  await page.locator("#kpi-cycle").fill("10.5");
  await page.getByRole("button", { name: "Save measurement" }).click();
  check("KPI measurements can be recorded", (await page.locator(".card", { hasText: "Record a monthly measurement" }).locator("tbody tr").count()) === 1);

  // PDF scan import instead of manual input
  await go("process");
  await page.getByRole("button", { name: "Import from PDF" }).click();
  await page.locator('.modal input[type="file"]').setInputFiles(path.resolve("demo/flowstate-demo-scan.pdf"));
  await page.waitForSelector(".pdf-review", { timeout: 20000 });
  check("Demo scan PDF is read and shown for review", (await page.getByLabel("Company from PDF").inputValue()) === "Hanse Präzisionsteile GmbH");
  check("All five steps recognised in the scan", (await page.locator(".pdf-review .pdf-num").count()) === 25);
  await page.screenshot({ path: `${OUT}/09-pdf-review.png` });
  await page.getByRole("button", { name: /^Apply \d+ values$/ }).click();
  await sleep(300);
  check("Applying the scan fills volume and labour cost", (await page.locator("#vol").inputValue()) === "3600" && (await page.locator("#rate").inputValue()) === "44");
  await page.getByRole("button", { name: /^Validation:/ }).click();
  const valMin = await page.getByLabel("Handling time per invoice", { exact: true }).inputValue();
  const valTitle = await page.locator(".grid-3-2 .card-title").first().innerText();
  check("Applying the scan fills step values", valMin === "4.0" && valTitle === "Validation", `${valTitle}: ${valMin}`);
  await go("settings");
  check("Applying the scan fills company details", (await page.getByLabel("Company name").inputValue()) === "Hanse Präzisionsteile GmbH");
  await go("process");
  await page.getByRole("button", { name: "Import from PDF" }).click();
  await page.locator('.modal input[type="file"]').setInputFiles(IMAGE_ONLY);
  await page.waitForSelector(".modal .callout-danger", { timeout: 20000 });
  check("Image-only PDF gets a clear explanation", (await page.locator(".modal .callout-danger").innerText()).includes("no text layer"));
  await page.getByRole("button", { name: "Choose another file" }).click();
  await page.getByRole("button", { name: "Try the demo scan" }).click();
  await page.waitForSelector(".pdf-review", { timeout: 20000 });
  check("Built-in demo scan can be tried without a file", (await page.getByLabel("Invoices per month from PDF").inputValue()) === "3600");
  await page.keyboard.press("Escape");

  // Dark mode
  await go("overview");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  check("Dark mode toggle switches the theme", (await page.evaluate(() => document.documentElement.getAttribute("data-mode"))) === "dark");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check("Dark mode uses a dark background", /rgb\((\d+), (\d+), (\d+)\)/.test(bg) && bg.match(/\d+/g).slice(0, 3).every((n) => Number(n) < 40), bg);
  await page.screenshot({ path: `${OUT}/10-dark-overview.png`, fullPage: true });
  await go("simulator");
  await page.screenshot({ path: `${OUT}/11-dark-simulator.png`, fullPage: true });
  await go("settings");
  await page.getByRole("radio", { name: "System" }).click();

  // Session isolation: another browser gets its own, empty session
  const other = await browser.newContext();
  const otherState = await (await other.request.get(`${BASE}/api/project`)).status();
  check("Each browser gets its own session (no shared data)", otherState === 204, `status ${otherState}`);
  await other.close();

  // Load the fictional test fixture through Settings → Import for the rest of the journey
  await go("settings");
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await page.getByRole("dialog").getByRole("button", { name: "Import" }).click();
  await sleep(300);

  // 1. Overview
  await go("overview");
  check("Overview loads imported project", (await text(".page h1")) === "Invoice Processing Automation");
  const costBefore = await text(".stat-grid .stat >> nth=0 >> .stat-value");
  check("Overview shows monthly process cost", /€/.test(costBefore), costBefore);
  await page.screenshot({ path: `${OUT}/01-overview.png`, fullPage: true });

  // 2. Process intelligence: select Approval, edit minutes
  await go("process");
  await page.getByRole("button", { name: /^Approval:/ }).click();
  check("Selecting a step opens its details", (await text(".grid-3-2 .card-title")) === "Approval");
  const costCell = page.locator(".kv div", { hasText: "Monthly labour cost" }).locator("dd");
  const before = await costCell.innerText();
  const minutes = page.getByLabel("Handling time per invoice", { exact: true });
  await minutes.fill("6");
  await sleep(150);
  const after = await costCell.innerText();
  check("Editing step minutes recalculates cost", before !== after, `${before} → ${after}`);
  await minutes.fill("abc");
  check("Invalid input shows validation message", await page.getByText("Enter a number").isVisible());
  await minutes.fill("2.5");
  await page.screenshot({ path: `${OUT}/02-process.png`, fullPage: true });

  // 3. Simulator
  await go("simulator");
  const netRow = page.locator(".sim-table tr", { hasText: "Monthly net savings" });
  const net1 = await netRow.locator("td").nth(2).innerText();
  await page.getByLabel("Labour cost per hour (fully loaded)", { exact: true }).fill("55");
  await sleep(150);
  const net2 = await netRow.locator("td").nth(2).innerText();
  check("Changing hourly cost recalculates net savings", net1 !== net2, `${net1} → ${net2}`);
  await page.getByRole("radio", { name: "End-to-end transformation" }).click();
  await page.getByLabel("Initial investment", { exact: true }).fill("0");
  await sleep(150);
  const roi = await page.locator(".sim-table tr", { hasText: "ROI · 12 months" }).locator("td").nth(3).innerText();
  check("Zero investment → ROI shown as n/a", roi === "n/a", roi);
  check("Zero investment shows a warning", await page.getByText("ROI is not defined").first().isVisible());
  await page.getByLabel("Monthly operating cost", { exact: true }).fill("90000");
  await sleep(150);
  const payback = await page.locator(".sim-table tr", { hasText: "Payback after go-live" }).locator("td").nth(3).innerText();
  check("Negative savings → payback 'Not reached'", payback === "Not reached", payback);
  await page.screenshot({ path: `${OUT}/03-simulator.png`, fullPage: true });
  await page.getByRole("button", { name: "Clear levers" }).click();
  await sleep(150);
  const clearedNet = await page.locator(".sim-table tr", { hasText: "Monthly net savings" }).locator("td").nth(2).innerText();
  check("Clear levers zeroes the scenarios", ["0€", "€0"].includes(clearedNet.replace(/\s/g, "")), JSON.stringify(clearedNet));

  // 4. Consultant
  await go("consultant");
  check("No rule-engine banner on the consultant page", (await page.locator(".mode-banner").count()) === 0 && !(await page.getByText("Rule-based mode").count()));
  await page.getByLabel("Budget cap per intervention (optional)").fill("50000");
  await page.getByRole("button", { name: "Generate recommendations" }).click();
  await page.waitForSelector(".table tbody tr", { timeout: 5000 });
  check("Recommendations work without a typed description (process summary used)", (await page.locator(".card", { hasText: "Compare interventions" }).locator("tbody tr").count()) >= 3);
  await page.getByLabel(/Current process/).fill("Invoices arrive as PDF by e-mail and on paper; clerks key data manually and match against purchase orders.");
  await page.getByRole("button", { name: "Generate recommendations" }).click();
  await page.waitForSelector(".table tbody tr");
  const recRows = await page.locator(".card", { hasText: "Compare interventions" }).locator("tbody tr").count();
  check("Recommendations generated", recRows >= 3, `${recRows} rows`);
  check("Budget cap excludes expensive items", await page.getByText("Excluded by budget cap").isVisible());
  check("Results still say which engine produced them", (await page.locator(".card", { hasText: "Compare interventions" }).locator(".card-sub").innerText()).includes("rule engine"));
  for (const h of ["Problem statement", "Root-cause hypothesis", "Proposed solution", "Expected operational impact", "Key risks", "Success metrics"]) {
    if (!(await page.locator(".rec-open h4", { hasText: h }).count())) check(`Recommendation contains ${h}`, false);
  }
  check("Recommendation contains all required sections", true);
  await page.locator(".rec-open").getByRole("button", { name: "Add to roadmap" }).click();
  check("Adopting a recommendation updates its state", await page.locator(".rec-open").getByRole("button", { name: "On roadmap" }).isVisible());
  await page.screenshot({ path: `${OUT}/04-consultant.png`, fullPage: true });

  // 5. Roadmap
  await go("roadmap");
  const tasksBefore = await page.locator(".g-bar").count();
  await page.getByRole("button", { name: "Add task" }).first().click();
  await page.getByRole("button", { name: "Create task" }).click();
  check("Empty task title is rejected", await page.getByText("Title needs at least 2 characters").first().isVisible());
  await page.getByLabel("Title").fill("Define e-invoice validation rules");
  await page.getByRole("button", { name: "Create task" }).click();
  await sleep(200);
  check("New task appears on the timeline", (await page.locator(".g-bar").count()) === tasksBefore + 1);
  await page.getByRole("radio", { name: "List" }).click();
  const progressBefore = await text(".stat-grid .stat >> nth=0 >> .stat-value");
  await page.getByLabel("Mark Vendor selection & contract as done").click();
  check("Completing a task with open dependencies is blocked", await page.getByText("Status not changed").isVisible());
  await page.getByLabel("Mark Approval matrix & delegation rules with cost-centre owners as done").click();
  await sleep(200);
  const progressAfter = await text(".stat-grid .stat >> nth=0 >> .stat-value");
  check("Completing a task updates project progress", progressBefore !== progressAfter, `${progressBefore} → ${progressAfter}`);
  await page.getByRole("radio", { name: "Timeline" }).click();
  await page.screenshot({ path: `${OUT}/05-roadmap.png`, fullPage: true });

  // 6. Analytics
  await go("analytics");
  await page.getByRole("tab", { name: /Average cycle time/ }).click();
  check("Selecting a KPI switches the chart", (await text(".page > .card .card-title")) === "Average cycle time");
  await page.getByRole("radio", { name: "Actuals" }).click();
  check("KPI range filter works", (await page.locator(".legend span", { hasText: "Projected" }).count()) === 0);
  await page.screenshot({ path: `${OUT}/06-analytics.png`, fullPage: true });

  // 7. Persistence: reload and verify the hourly cost change survived
  await sleep(1200);
  const saved = await page.evaluate(async () => (await fetch("/api/project")).json());
  check("Project saved in this browser's server session", saved.assumptions.hourlyCost === 55, `hourlyCost=${saved.assumptions.hourlyCost}`);
  await page.reload();
  await go("simulator");
  check("Changes restored after reload", (await page.getByLabel("Labour cost per hour (fully loaded)", { exact: true }).inputValue()) === "55");

  // 8. Report & PDF
  await go("report");
  check("Report renders executive summary", await page.getByText("1. Executive summary").isVisible());
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: `${OUT}/flowstate-report.pdf`, format: "A4", printBackground: true });
  await page.emulateMedia({ media: "screen" });
  check("Report exports to PDF via print stylesheet", true);
  await page.screenshot({ path: `${OUT}/07-report.png`, fullPage: true });

  // AI via the viewer's Claude account (artifact `sample` capability), stubbed
  {
    const actx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await actx.route(/fonts\.(googleapis|gstatic)\.com|cdnjs|jsdelivr/, (r) => r.abort());
    await actx.addInitScript(() => {
      const items = [{ id: "ai-capture", title: "AI: intelligent capture", targetStepId: "extract", problemStatement: "p", rootCause: "r", solution: "s", impact: "i", monthlySavings: 5000, complexity: "medium", investment: 40000, implementationWeeks: 10, risks: ["a"], successMetrics: ["b"], fitScore: 80 }];
      const sample = async () => ({ text: "ok" });
      sample.json = async (prompt) => { window.__samplePrompt = prompt; return { items }; };
      sample.limits = async () => ({});
      window.claude = { use: async (n) => (n === "sample" ? sample : null) };
    });
    const ap = await actx.newPage();
    ap.on("pageerror", (e) => errors.push(`claude-ctx pageerror: ${e.message}`));
    await ap.goto(`${BASE}/#/overview`);
    await ap.getByRole("link", { name: "Open workspace" }).first().click();
    await ap.getByRole("button", { name: "Enter data manually" }).click();
    await ap.locator("#in-volume").fill("1000");
    await ap.locator("#in-rate").fill("40");
    for (const n of ["Invoice received", "Data extraction", "Validation", "Approval", "Payment"]) await ap.getByLabel(`${n}: minutes per invoice`).fill("3");
    await ap.getByRole("button", { name: "Save and show business case" }).click();
    await ap.waitForSelector(".stat-grid", { timeout: 8000 }).catch(async (e) => { await ap.screenshot({ path: `${OUT}/x-claude-fail.png`, fullPage: true }); throw e; });
    await ap.goto(`${BASE}/#/consultant`);
    await ap.waitForSelector(".grid-consult");
    check("Claude engine is offered and preselected in the artifact", await ap.getByRole("radio", { name: "AI (Claude)" }).getAttribute("aria-checked") === "true");
    await ap.getByLabel(/Current process/).fill("Invoices arrive as PDF by e-mail; clerks key data manually into the ERP.");
    await ap.getByRole("button", { name: "Generate recommendations" }).click();
    await ap.waitForSelector(".table tbody tr", { timeout: 10000 });
    const sub = await ap.locator(".card", { hasText: "Compare interventions" }).locator(".card-sub").innerText();
    check("Recommendations come from Claude and are labelled as AI", sub.includes("AI model") && sub.includes("Claude") && (await ap.getByText("AI: intelligent capture").first().isVisible()), sub);
    check("Prompt sent to Claude contains the process data", (await ap.evaluate(() => window.__samplePrompt || "")).includes('"monthlyVolume":1000'));
    await actx.close();
  }

  // 10. Mobile layout
  const m = await ctx.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  m.on("pageerror", (e) => errors.push(`mobile pageerror: ${e.message}`));
  for (const r of ["overview", "process", "simulator", "roadmap"]) {
    await m.goto(`${BASE}/#/${r}`);
    await m.waitForSelector(".page h1");
    await sleep(250);
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`Mobile ${r}: no horizontal page scroll`, overflow <= 1, `overflow ${overflow}px`);
    await m.screenshot({ path: `${OUT}/m-${r}.png`, fullPage: true });
  }
  await m.getByRole("button", { name: "Open navigation" }).click();
  await m.getByRole("link", { name: "KPI & Impact" }).click();
  await m.waitForSelector("text=Baseline, actuals and targets");
  check("Mobile navigation drawer works", true);

  // 9. Settings: clear project, then end the session
  await page.bringToFront();
  await go("settings");
  await page.getByRole("button", { name: "Clear project" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Clear project" }).click();
  await sleep(500);
  await go("simulator");
  check("Clear project removes all inputs", (await page.getByLabel("Labour cost per hour (fully loaded)", { exact: true }).inputValue()) === "0");
  await go("process");
  await page.locator("#vol").fill("1234");
  await sleep(1000);
  await page.screenshot({ path: `${OUT}/08-settings.png`, fullPage: true });
  await page.getByRole("button", { name: "End session & delete data" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete data" }).click();
  await page.waitForSelector(".wl-h1");
  const afterEnd = await page.evaluate(async () => (await fetch("/api/project")).status);
  check("Ending the session deletes the data on the server", afterEnd === 204, `status ${afterEnd}`);
  check("A fresh session starts at the welcome screen", await page.locator(".wl-h1").isVisible());

  // Legal pages and privacy/security baseline
  await page.locator(".wl-fine").getByRole("link", { name: "Impressum" }).click();
  await page.waitForSelector(".legal h1");
  check("Impressum page reachable from the start page (§ 18 MStV)", (await page.locator(".legal h1").innerText()) === "Impressum" && (await page.getByText("Angaben gemäß § 18 Abs. 1 MStV").isVisible()));
  check("Legal pages show no placeholder warning (no address on purpose)", !(await page.locator(".legal .callout-danger").isVisible()));
  await page.locator(".legal-links").getByRole("link", { name: "Datenschutz" }).click();
  await page.waitForFunction(() => document.querySelector(".legal h1")?.textContent === "Datenschutzerklärung");
  check("Privacy policy covers hosting, storage, AI provider and rights", await (async () => { const t = await page.locator(".legal").innerText(); return ["Hosting", "sessionStorage", "KI-Funktionen", "Ihre Rechte", "Anthropic", "Art. 15–21"].every((w) => t.includes(w)); })());
  check("No requests to third-party hosts (fonts, CDNs, trackers)", thirdParty.size === 0, [...thirdParty].join(", "));
  const hdr = await page.evaluate(async () => { const r = await fetch("/"); return Object.fromEntries(r.headers.entries()); });
  check("Security headers: HSTS, Permissions-Policy, CSP without external hosts", Boolean(hdr["strict-transport-security"]) && Boolean(hdr["permissions-policy"]) && !/https?:\/\//.test(hdr["content-security-policy"] || "http://"));
  const missing = await fetch(`${BASE}/vendor/does-not-exist.js`).then((r) => [r.status, r.headers.get("content-type")]);
  check("Missing assets return 404, never HTML", missing[0] === 404 && !String(missing[1]).includes("text/html"));
} catch (e) {
  check("Journey completed without exceptions", false, e.message.split("\n")[0]);
} finally {
  await browser.close();
  server.kill();
}

check("No browser errors", errors.length === 0, errors.slice(0, 5).join(" | "));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
