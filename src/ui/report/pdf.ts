/**
 * Turns the on-screen report into a real, readable PDF (A4, selectable text) in the
 * browser. Nothing is uploaded. The renderer walks the report DOM and lays out headings,
 * paragraphs (with bold runs), lists and tables with PDF.js-independent pdf-lib, so it
 * works the same in Safari, Chrome and Firefox — also on phones, where a downloaded
 * HTML file would only show source code.
 */
import type { PDFDocument as PDFDocumentT, PDFFont, PDFPage, RGB } from "pdf-lib";

type Lib = typeof import("pdf-lib");
type Run = { text: string; bold: boolean };

const A4 = { w: 595.28, h: 841.89 };
const M = { x: 50, top: 56, bottom: 60 };
const WIDTH = A4.w - 2 * M.x;

export async function reportToPdf(root: HTMLElement, opts: { title: string; subtitle?: string }): Promise<Uint8Array> {
  const lib: Lib = await import("pdf-lib");
  const { PDFDocument, StandardFonts, rgb } = lib;
  const doc: PDFDocumentT = await PDFDocument.create();
  doc.setTitle(opts.title);
  doc.setCreator("FLOWSTATE");
  doc.setProducer("FLOWSTATE (pdf-lib)");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const C = {
    text: rgb(0.09, 0.11, 0.16),
    dim: rgb(0.36, 0.4, 0.47),
    faint: rgb(0.55, 0.58, 0.64),
    accent: rgb(0.2, 0.33, 0.9),
    line: rgb(0.85, 0.87, 0.9),
    soft: rgb(0.94, 0.94, 0.99),
    softText: rgb(0.24, 0.2, 0.55),
  };

  // Standard PDF fonts only cover WinAnsi; map common symbols and drop the rest.
  const MAP: Record<string, string> = { "≈": "~", "→": "->", "←": "<-", "★": "*", "−": "-", "≥": ">=", "≤": "<=", "✓": "v", "✔": "v", "✕": "x", "✗": "x", "\u00a0": " ", "\u202f": " ", "\u2011": "-" };
  const clean = (s: string) =>
    Array.from(s)
      .map((ch) => {
        if (MAP[ch] !== undefined) return MAP[ch];
        try {
          regular.encodeText(ch);
          return ch;
        } catch {
          return "";
        }
      })
      .join("");

  let page: PDFPage = doc.addPage([A4.w, A4.h]);
  let y = A4.h - M.top;
  const newPage = () => {
    page = doc.addPage([A4.w, A4.h]);
    y = A4.h - M.top;
  };
  const ensure = (h: number) => {
    if (y - h < M.bottom) newPage();
  };

  // ---- text layout ----------------------------------------------------------------
  type Word = { text: string; font: PDFFont; space: boolean };
  const toWords = (runs: Run[]): Word[] => {
    const out: Word[] = [];
    for (const r of runs) {
      const font = r.bold ? bold : regular;
      const parts = clean(r.text).split(/(\s+)/);
      for (const part of parts) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          if (out.length) out[out.length - 1].space = true;
        } else out.push({ text: part, font, space: false });
      }
    }
    return out;
  };
  const wrap = (runs: Run[], size: number, width: number): Word[][] => {
    const words = toWords(runs);
    const lines: Word[][] = [];
    let line: Word[] = [];
    let w = 0;
    for (const word of words) {
      const ww = word.font.widthOfTextAtSize(word.text, size);
      const prev = line[line.length - 1];
      const gap = prev && prev.space ? regular.widthOfTextAtSize(" ", size) : 0;
      if (line.length && w + gap + ww > width) {
        lines.push(line);
        line = [];
        w = 0;
      }
      w += (line.length ? gap : 0) + ww;
      line.push(word);
    }
    if (line.length) lines.push(line);
    return lines;
  };
  const lineWidth = (line: Word[], size: number) =>
    line.reduce((s, wd, i) => s + wd.font.widthOfTextAtSize(wd.text, size) + (i < line.length - 1 && wd.space ? regular.widthOfTextAtSize(" ", size) : 0), 0);
  const drawLine = (line: Word[], x: number, yy: number, size: number, color: RGB) => {
    let cx = x;
    line.forEach((wd, i) => {
      page.drawText(wd.text, { x: cx, y: yy, size, font: wd.font, color });
      cx += wd.font.widthOfTextAtSize(wd.text, size) + (wd.space && i < line.length - 1 ? regular.widthOfTextAtSize(" ", size) : 0);
    });
  };
  const paragraph = (runs: Run[], o: { size?: number; color?: RGB; indent?: number; before?: number; after?: number; bullet?: boolean; box?: boolean } = {}) => {
    const size = o.size ?? 10;
    const lead = size * 1.42;
    const indent = (o.indent ?? 0) + (o.bullet ? 12 : 0) + (o.box ? 8 : 0);
    const lines = wrap(runs, size, WIDTH - indent - (o.box ? 8 : 0));
    if (!lines.length) return;
    y -= o.before ?? 0;
    if (o.box) {
      const h = lines.length * lead + 10;
      ensure(h);
      page.drawRectangle({ x: M.x, y: y - h + 4, width: WIDTH, height: h, color: C.soft });
      y -= 5;
    }
    lines.forEach((line, i) => {
      ensure(lead);
      y -= lead;
      if (o.bullet && i === 0) page.drawText("•", { x: M.x + (o.indent ?? 0) + 2, y: y + lead - size * 1.12, size, font: regular, color: o.color ?? C.text });
      drawLine(line, M.x + indent, y + lead - size * 1.12, size, o.color ?? C.text);
    });
    if (o.box) y -= 5;
    y -= o.after ?? 4;
  };
  const rule = (thick = 0.6, color = C.line, gap = 6) => {
    ensure(gap);
    page.drawLine({ start: { x: M.x, y }, end: { x: M.x + WIDTH, y }, thickness: thick, color });
    y -= gap;
  };

  // ---- DOM helpers ----------------------------------------------------------------
  const hidden = (el: Element) => el.classList.contains("no-print") || (el as HTMLElement).hidden || getComputedStyle(el).display === "none";
  const runsOf = (node: Node, inBold = false, out: Run[] = []): Run[] => {
    node.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) out.push({ text: n.textContent ?? "", bold: inBold });
      else if (n instanceof HTMLElement && !hidden(n)) {
        if (n.tagName === "SVG" || n.tagName === "svg") return;
        if (n.tagName === "BR") out.push({ text: " ", bold: inBold });
        else if (n.tagName === "SUP") {
          const t = (n.textContent ?? "").trim();
          out.push({ text: ({ "1": "¹", "2": "²", "3": "³" } as Record<string, string>)[t] ?? `[${t}]`, bold: false });
        }
        else {
          const b = inBold || ["B", "STRONG", "TH"].includes(n.tagName) || n.classList.contains("rp-tag");
          const isBlock = ["DIV", "P", "LI"].includes(n.tagName) || getComputedStyle(n).display === "block";
          if (isBlock && out.length) out.push({ text: " ", bold: inBold });
          if (n.classList.contains("rp-tag")) out.push({ text: " [", bold: false });
          runsOf(n, b, out);
          if (n.classList.contains("rp-tag")) out.push({ text: "]", bold: false });
          // keep inline-flex chips apart
          if (getComputedStyle(n).display.includes("flex") || n.classList.contains("bench-chip")) out.push({ text: "  ", bold: inBold });
        }
      }
    });
    return out;
  };
  const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

  const table = (t: HTMLTableElement) => {
    const rows = Array.from(t.rows).filter((r) => !hidden(r));
    if (!rows.length) return;
    const ncol = Math.max(...rows.map((r) => r.cells.length));
    const size = 8.6;
    const pad = 4;
    // Column widths from content length, first column gets more room.
    const lens = Array.from({ length: ncol }, (_, c) => Math.max(7, ...rows.map((r) => Math.min(60, text(r.cells[c] ?? r).length))));
    lens[0] = Math.max(lens[0], 14);
    const total = lens.reduce((a, b) => a + b, 0);
    const widths = lens.map((l) => (l / total) * WIDTH);
    const head = rows[0].cells[0]?.tagName === "TH" ? rows[0] : null;
    const drawRow = (r: HTMLTableRowElement, isHead: boolean) => {
      const cells = Array.from(r.cells);
      const isTotal = r.classList.contains("rp-total");
      const wrapped = cells.map((cell, i) => {
        const runs = runsOf(cell, isHead || isTotal);
        return wrap(runs, size, widths[i] - 2 * pad);
      });
      const lead = size * 1.35;
      const h = Math.max(1, ...wrapped.map((l) => l.length)) * lead + 2 * pad;
      if (y - h < M.bottom) {
        newPage();
        if (head && !isHead) drawRow(head, true);
      }
      if (isHead) page.drawRectangle({ x: M.x, y: y - h, width: WIDTH, height: h, color: rgb(0.96, 0.97, 0.98) });
      let x = M.x;
      wrapped.forEach((lines, i) => {
        const cell = cells[i];
        const right = cell.classList.contains("num") || getComputedStyle(cell).textAlign === "right";
        lines.forEach((line, k) => {
          const lw = lineWidth(line, size);
          const tx = right ? x + widths[i] - pad - lw : x + pad;
          drawLine(line, tx, y - pad - (k + 1) * lead + lead * 0.25, size, isHead ? C.dim : C.text);
        });
        x += widths[i] * (cell.colSpan || 1);
      });
      y -= h;
      page.drawLine({ start: { x: M.x, y }, end: { x: M.x + WIDTH, y }, thickness: isTotal ? 0.8 : 0.4, color: isTotal ? C.text : C.line });
    };
    y -= 4;
    rows.forEach((r) => drawRow(r, r === head));
    y -= 8;
  };

  const block = (el: Element) => {
    if (hidden(el)) return;
    const tag = el.tagName;
    const cls = el.classList;
    if (cls.contains("rp-break") && y < A4.h - M.top - 1) newPage();
    if (tag === "H1") return paragraph(runsOf(el, true), { size: 22, before: 4, after: 6 });
    if (tag === "H2") {
      ensure(60);
      paragraph(runsOf(el, true), { size: 14, before: 14, after: 2 });
      return rule(1, C.text, 8);
    }
    if (tag === "H3") {
      ensure(40);
      return paragraph(runsOf(el, true), { size: 11, before: 8, after: 3 });
    }
    if (tag === "TABLE") return table(el as HTMLTableElement);
    if (tag === "UL" || tag === "OL") {
      Array.from(el.children).forEach((li) => paragraph(runsOf(li), { size: 9.5, bullet: true, after: 1 }));
      y -= 4;
      return;
    }
    if (cls.contains("rp-brand")) return paragraph(runsOf(el, true), { size: 9, color: C.accent, after: 2 });
    if (cls.contains("rp-sub")) return paragraph(runsOf(el), { size: 11.5, color: C.dim });
    if (cls.contains("rp-meta")) return paragraph([{ text: Array.from(el.children).map(text).filter(Boolean).join("   ·   "), bold: false }], { size: 9, color: C.dim, before: 2 });
    if (cls.contains("rp-disclaimer")) return paragraph(runsOf(el), { size: 9, color: C.softText, box: true, before: 6, after: 6 });
    if (cls.contains("rp-note") || cls.contains("rp-foot")) return paragraph(runsOf(el), { size: 8, color: C.faint, before: 2 });
    if (tag === "P") return paragraph(runsOf(el), { size: 10, after: 6 });
    if (tag === "HEADER" && cls.contains("rp-cover")) {
      Array.from(el.children).forEach(block);
      y -= 4;
      return rule(0.6, C.line, 10);
    }
    // Containers: recurse when they hold blocks, otherwise treat as a paragraph.
    const kids = Array.from(el.children);
    const hasBlocks = kids.some((k) => ["P", "H1", "H2", "H3", "TABLE", "UL", "OL", "DIV", "SECTION", "HEADER", "FOOTER"].includes(k.tagName));
    if (hasBlocks) kids.forEach(block);
    else if (text(el)) paragraph(runsOf(el), { size: 10, after: 4 });
  };

  Array.from(root.children).forEach(block);

  // Footer with page numbers on every page.
  const pages = doc.getPages();
  const foot = clean(`${opts.title}${opts.subtitle ? " · " + opts.subtitle : ""}`);
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M.x, y: 40 }, end: { x: M.x + WIDTH, y: 40 }, thickness: 0.4, color: C.line });
    pg.drawText(foot.length > 90 ? foot.slice(0, 89) + "…" : foot, { x: M.x, y: 28, size: 7.5, font: regular, color: C.faint });
    const num = `Page ${i + 1} of ${pages.length}`;
    pg.drawText(num, { x: M.x + WIDTH - regular.widthOfTextAtSize(num, 7.5), y: 28, size: 7.5, font: regular, color: C.faint });
  });
  return doc.save();
}
