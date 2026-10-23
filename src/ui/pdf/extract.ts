/**
 * Reads the text layer of a PDF in the browser with PDF.js (no upload, nothing leaves
 * the browser). PDF.js runs on the main thread ("fake worker"): process sheets are a
 * few pages, and this works everywhere — also from a local file and under strict CSPs.
 */
// The legacy build ships polyfills, so it also runs in browsers without the newest JS features.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.min.mjs";
import * as pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs";
import { itemsToLines } from "../../domain/sheetParser";

(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = pdfWorker;

export interface PdfText {
  pages: number;
  lines: string[];
  /** Number of non-space characters found in the text layer. */
  chars: number;
}

export async function readPdfText(data: ArrayBuffer | Uint8Array, maxPages = 5): Promise<PdfText> {
  const task = pdfjs.getDocument({ data: data instanceof Uint8Array ? data.slice() : new Uint8Array(data), isEvalSupported: false });
  const doc = await task.promise;
  try {
    const lines: string[] = [];
    const n = Math.min(doc.numPages, maxPages);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const items = (content.items as { str?: string; transform?: number[]; width?: number; height?: number }[])
        .filter((it) => typeof it.str === "string" && it.transform)
        .map((it) => ({ str: it.str!, x: it.transform![4], y: it.transform![5], w: it.width ?? 0, h: it.height || Math.abs(it.transform![3]) || 10 }));
      lines.push(...itemsToLines(items));
    }
    return { pages: doc.numPages, lines, chars: lines.join("").replace(/\s|\|/g, "").length };
  } finally {
    await task.destroy();
  }
}

/** Renders one page to a PNG (for AI reading of image-only scans). */
export async function renderPageToPng(data: Uint8Array, pageNo = 1, targetWidth = 1600): Promise<Blob> {
  const task = pdfjs.getDocument({ data: data.slice(), isEvalSupported: false });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(Math.min(pageNo, doc.numPages));
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: targetWidth / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not render the page"))), "image/png"));
  } finally {
    await task.destroy();
  }
}
