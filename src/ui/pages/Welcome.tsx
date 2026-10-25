import React, { useEffect, useRef, useState } from "react";
import { LuArrowRight, LuFileUp, LuKeyboard } from "react-icons/lu";
import { useStore } from "../state/store";
import { cx } from "../components/ui";
import { fmt } from "../format";
import { processBaseline } from "../../domain/finance";
import { requestManualIntake } from "../state/onboarding";
import { PdfImport, type PdfStart } from "../components/PdfImport";
import { useTopology } from "../components/vanta";

/** Builds `text` character by character; returns the visible slice and whether typing finished. */
export function useTypewriter(text: string, speed = 38, startDelay = 600): { displayed: string; done: boolean } {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(text.length);
      return;
    }
    setCount(0);
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      interval = setInterval(() => {
        setCount((c) => {
          if (c + 1 >= text.length && interval) clearInterval(interval);
          return Math.min(text.length, c + 1);
        });
      }, speed);
    }, startDelay);
    return () => {
      clearTimeout(start);
      if (interval) clearInterval(interval);
    };
  }, [text, speed, startDelay]);
  return { displayed: text.slice(0, count), done: count >= text.length };
}

const NAV = [
  { label: "Process", route: "process" },
  { label: "Simulator", route: "simulator" },
  { label: "Roadmap", route: "roadmap" },
  { label: "Impact", route: "analytics" },
] as const;

export function WelcomePage({ onEnter }: { onEnter: (route: string) => void }) {
  const { project: p, dispatch, toast } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfStart, setPdfStart] = useState<PdfStart>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const beginPdf = async (f: File | null | undefined) => {
    if (!f) return;
    setPdfStart({ bytes: new Uint8Array(await f.arrayBuffer()), name: f.name });
    setPdfOpen(true);
  };
  const { displayed, done } = useTypewriter("let's make your\ninvoices flow.");
  const haloRef = useRef<HTMLDivElement>(null);
  const dark = typeof document !== "undefined" && document.documentElement.getAttribute("data-mode") === "dark";
  const halo = useTopology(haloRef, dark);

  useEffect(() => {
    document.title = "Welcome · FLOWSTATE";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);


  return (
    <>
    <div className={cx("wl", halo === "on" && "wl-topo", halo === "on" && dark && "wl-dark")} data-halo={halo}>
      <div className="wl-halo" ref={haloRef} aria-hidden />
      <PipelineVisual />

      <header className="wl-header">
        <a href="#/overview" className="wl-logo" onClick={(e) => { e.preventDefault(); onEnter("overview"); }} aria-label="FLOWSTATE workspace">
          <span className="wl-word">FLOWSTATE</span>
          <span className="wl-star" aria-hidden>&#10033;</span>
        </a>
        <nav className="wl-nav" aria-label="Sections">
          {NAV.map((n, i) => (
            <React.Fragment key={n.route}>
              <a href={`#/${n.route}`} onClick={(e) => { e.preventDefault(); onEnter(n.route); }}>{n.label}</a>
              {i < NAV.length - 1 && <span className="wl-comma" aria-hidden>,&nbsp;</span>}
            </React.Fragment>
          ))}
        </nav>
        <a href="#/overview" className="wl-cta" onClick={(e) => { e.preventDefault(); onEnter("overview"); }}>Open workspace</a>
        <button className={cx("wl-burger", menuOpen && "wl-burger-open")} aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
          <span /><span /><span />
        </button>
      </header>

      <div className={cx("wl-overlay", menuOpen && "wl-overlay-open")} aria-hidden={!menuOpen}>
        <nav aria-label="Mobile sections">
          {NAV.map((n) => <a key={n.route} href={`#/${n.route}`} tabIndex={menuOpen ? 0 : -1} onClick={(e) => { e.preventDefault(); onEnter(n.route); }}>{n.label}</a>)}
          <a href="#/overview" className="wl-overlay-cta" tabIndex={menuOpen ? 0 : -1} onClick={(e) => { e.preventDefault(); onEnter("overview"); }}>Open workspace</a>
        </nav>
      </div>

      <div className="wl-content">
        <main className="wl-main" id="welcome-hero">
          <div className="wl-rise">
            <h1 className="wl-h1" aria-label="let's make your invoices flow.">
              {displayed}
              {!done && <span className="wl-cursor" aria-hidden />}
            </h1>
          </div>
          <div className="wl-rise wl-rise-2">
            <p className="wl-lead">
              Give FLOWSTATE your invoice process data,<br className="wl-br" /> and it maps the process, prices 3 transformation options and plans the fix.
            </p>
          </div>

          <div className="wl-rise wl-rise-3">
            <h2 className="wl-q">How do you want to start?</h2>
            <p className="wl-sub">Upload your process sheet as PDF, or type in a few numbers.</p>
            <div
              className={cx("wl-pills wl-drop", drag && "wl-drop-on")}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
              onDrop={(e) => { e.preventDefault(); setDrag(false); beginPdf(e.dataTransfer.files?.[0]); }}
            >
              <button className="wl-pill wl-pill-on wl-pill-lg" onClick={() => fileRef.current?.click()}><LuFileUp aria-hidden /> Upload PDF</button>
              <button className="wl-pill wl-pill-lg" onClick={() => { requestManualIntake(); onEnter("overview"); }}><LuKeyboard aria-hidden /> Enter data manually</button>
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden aria-label="Upload PDF file" onChange={(e) => { beginPdf(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            <div className="wl-status">
              <button className="wl-go" onClick={() => { dispatch({ type: "loadTestData" }); onEnter("overview"); toast({ tone: "success", title: "Test data loaded", body: "Fictional company with process, scenarios, roadmap, KPIs and recommendations. Replace it with your own data any time." }); }}>Try with test data <LuArrowRight aria-hidden /></button>
              <button className="wl-go wl-go-muted" onClick={() => { setPdfStart("demo"); setPdfOpen(true); }}>Try the PDF import with a demo scan <LuArrowRight aria-hidden /></button>
            </div>
            <p className="wl-fine">Your data stays in this browser session only and is deleted when the session ends. PDFs are read in your browser unless you choose AI reading. · <a href="#/impressum">Impressum</a> · <a href="#/datenschutz">Datenschutz</a></p>
          </div>
        </main>
      </div>
    </div>
    <PdfImport open={pdfOpen} start={pdfStart} onClose={() => { setPdfOpen(false); setPdfStart(null); }} onApplied={() => onEnter("overview")} />
    </>
  );
}

/**
 * The 5 invoice steps as a pipeline. On wide screens horizontal mouse movement
 * scrubs an invoice through the process; on narrow screens it plays on its own.
 */
function PipelineVisual() {
  const { project: p } = useStore();
  const steps = p.process.steps;
  const base = processBaseline(p.process);
  const [t, setT] = useState(0.18);
  const tRef = useRef(0.18);
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Desktop scrubbing: delta of mouse X against the previous X moves the invoice.
  useEffect(() => {
    let prevX: number | null = null;
    const onMove = (e: MouseEvent) => {
      if (window.innerWidth < 1024) return;
      if (prevX === null) {
        prevX = e.clientX;
        return;
      }
      const delta = e.clientX - prevX;
      prevX = e.clientX;
      const next = Math.min(1, Math.max(0, tRef.current + (delta / window.innerWidth) * 0.8));
      tRef.current = next;
      setT(next);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Narrow screens: autoplay in a loop.
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (window.innerWidth < 1024) {
        const next = (tRef.current + (now - last) / 9000) % 1;
        tRef.current = next;
        setT(next);
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);

  const n = steps.length;
  const active = Math.min(n - 1, Math.floor(t * n));
  // Node layout on a gentle diagonal in a 600×600 box.
  const pts = steps.map((_, i) => ({ x: 120 + (i * 380) / (n - 1), y: 500 - (i * 380) / (n - 1) }));
  const pathD = pts.map((pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `S ${(pts[i - 1].x + pt.x) / 2} ${pt.y} ${pt.x} ${pt.y}`)).join(" ");
  const seg = t * (n - 1);
  const i0 = Math.min(n - 2, Math.floor(seg));
  const f = seg - i0;
  const dot = { x: pts[i0].x + (pts[i0 + 1].x - pts[i0].x) * f, y: pts[i0].y + (pts[i0 + 1].y - pts[i0].y) * f };
  const elapsed = steps.slice(0, active).reduce((s, x) => s + x.waitDays, 0) + steps[active].waitDays * (t * n - active);

  return (
    <div className="wl-visual" aria-hidden>
      <svg viewBox="0 0 600 600" preserveAspectRatio="xMaxYMax meet" className="wl-svg">
        <defs>
          <pattern id="wl-dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.2" className="wl-dotgrid" /></pattern>
        </defs>
        <rect width="600" height="600" fill="url(#wl-dots)" />
        <path d={pathD} className="wl-track" />
        <path d={pathD} className="wl-track-done" pathLength={1} strokeDasharray={`${t} 1`} />
        {steps.map((s, i) => {
          const pt = pts[i];
          const on = i === active;
          const past = i < active;
          return (
            <g key={s.id} transform={`translate(${pt.x} ${pt.y})`} className={cx("wl-node", on && "wl-node-on", past && "wl-node-past")}>
              <rect x={-62} y={-26} width={124} height={52} rx={14} />
              <text y={-3} textAnchor="middle" className="wl-node-name">{s.name}</text>
              <text y={14} textAnchor="middle" className="wl-node-meta">{s.minutesPerInvoice > 0 || s.waitDays > 0 ? `${fmt.num(s.minutesPerInvoice, 1)} min · ${fmt.num(s.waitDays, 1)} d wait` : `step ${i + 1} of ${n}`}</text>
            </g>
          );
        })}
        <g transform={`translate(${dot.x - 88} ${dot.y})`} className="wl-doc">
          <rect x={-15} y={-19} width={30} height={38} rx={4} />
          <line x1={-8} x2={8} y1={-8} y2={-8} /><line x1={-8} x2={8} y1={-1} y2={-1} /><line x1={-8} x2={3} y1={6} y2={6} />
        </g>
      </svg>
      <div className="wl-ticker">
        <span>An invoice is at</span>
        <b>{steps[active].name}</b>
        {base.cycleTimeDays > 0 && <span>day {fmt.num(elapsed, 1)} of {fmt.num(base.cycleTimeDays, 1)}</span>}
      </div>
    </div>
  );
}
