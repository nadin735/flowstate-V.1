// WCAG 2.1 AA contrast check of all visible text on every page, for each colour theme in
// light and dark mode. Expects a running server (default http://127.0.0.1:3999, or BASE=…).
//   npm run build && PORT=3999 npm start &   then   npm run a11y
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:3999";
const themes = process.argv.slice(2).length ? process.argv.slice(2) : ["electric", "forest", "neon"];
const PAGES = ["welcome", "overview", "process", "consultant", "simulator", "roadmap", "analytics", "report", "settings", "datenschutz"];

const b = await chromium.launch();
let total = 0;
for (const accent of themes) {
  for (const scheme of ["light", "dark"]) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, reducedMotion: "reduce" });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`);
    await p.waitForSelector(".wl-h1");
    const all = {};
    let loaded = false;
    for (const r of PAGES) {
      if (r !== "welcome") {
        if (!loaded) {
          await p.getByRole("button", { name: /Try with test data/ }).click();
          await p.waitForSelector(".stat-grid");
          await p.locator(".toast button").first().click().catch(() => {});
          loaded = true;
        }
        await p.goto(`${BASE}/#/${r}`);
        await p.waitForTimeout(600);
      }
      await p.evaluate((a) => (document.documentElement.dataset.accent = a), accent);
      const fails = await p.evaluate(() => {
        const parse = (c) => {
          const m = c.match(/rgba?\(([^)]+)\)/);
          if (!m) return null;
          const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
          return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 };
        };
        const lum = ({ r, g, b }) => {
          const f = (x) => ((x /= 255) <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
        const bgOf = (el) => {
          const stack = [];
          for (let e = el; e; e = e.parentElement) {
            const c = parse(getComputedStyle(e).backgroundColor);
            if (c && c.a > 0) stack.push(c);
            if (c && c.a >= 1) break;
            if (getComputedStyle(e).backgroundImage !== "none" && e !== el) return null; // gradients/images: skip
          }
          let bg = document.documentElement.dataset.mode === "dark" ? { r: 11, g: 15, b: 26, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
          for (let i = stack.length - 1; i >= 0; i--) bg = blend(stack[i], bg);
          return bg;
        };
        const out = [];
        const seen = new Set();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const t = walker.currentNode;
          if (!t.textContent.trim()) continue;
          const el = t.parentElement;
          if (!el || seen.has(el)) continue;
          seen.add(el);
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || el.closest("[aria-hidden=true], [aria-hidden=''], svg, .wl-visual, [disabled]")) continue;
          const rect = el.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          let fg = parse(cs.color);
          const bg = bgOf(el);
          if (!fg || !bg) continue;
          fg = blend({ ...fg, a: fg.a * parseFloat(cs.opacity) }, bg);
          const L1 = lum(fg), L2 = lum(bg);
          const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
          const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
          if (ratio < need) out.push(`${ratio.toFixed(2)} <${need} · ${el.tagName.toLowerCase()}.${String(el.className || "").split(" ")[0]} · "${t.textContent.trim().slice(0, 30)}"`);
        }
        return out;
      });
      for (const f of fails) {
        const k = f.split(" · ")[1];
        (all[k] ||= { n: 0, ex: f, pages: new Set() }).n++;
        all[k].pages.add(r);
      }
    }
    const keys = Object.keys(all);
    total += keys.length;
    console.log(`${keys.length ? "✘" : "✔"} ${accent}/${scheme}: ${keys.length} element types below WCAG AA`);
    for (const [, v] of Object.entries(all).sort((a, c) => c[1].n - a[1].n).slice(0, 15)) console.log(`    ${v.n}× ${v.ex}  [${[...v.pages].slice(0, 4).join(",")}]`);
    await ctx.close();
  }
}
await b.close();
process.exit(total ? 1 : 0);
