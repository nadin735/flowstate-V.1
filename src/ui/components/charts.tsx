import React, { useLayoutEffect, useRef, useState } from "react";
import { scaleBand, scaleLinear, scalePoint } from "d3-scale";
import { line as d3line } from "d3-shape";

export function useWidth<T extends HTMLElement>(fallback = 600): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || fallback);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => setW(Math.max(200, entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w];
}

export interface Series {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
  area?: boolean;
}

function niceTicks(min: number, max: number, count = 4) {
  return scaleLinear().domain([min, max]).nice(count).ticks(count);
}

/** Drops ticks whose formatted label repeats the previous one (e.g. "1 €, 1 €" after rounding). */
export function uniqueTicks(ticks: number[], format: (n: number) => string): { value: number; label: string }[] {
  const out: { value: number; label: string }[] = [];
  for (const t of ticks) {
    const label = format(t);
    if (!out.length || out[out.length - 1].label !== label) out.push({ value: t, label });
  }
  return out;
}

/** Multi-series line chart with hover crosshair and optional reference lines. */
export function LineChart({
  labels, series, height = 240, format, refLines = [], highlightFrom, ariaLabel, yMin,
}: {
  labels: string[]; series: Series[]; height?: number; format: (n: number) => string;
  refLines?: { value: number; label: string; color: string }[]; highlightFrom?: number; ariaLabel: string; yMin?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { t: 14, r: 16, b: 28, l: 64 };
  const all = [...series.flatMap((s) => s.values.filter((v): v is number => v !== null)), ...refLines.map((r) => r.value)];
  let lo = Math.min(...all, yMin ?? Infinity);
  let hi = Math.max(...all);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  if (lo === hi) { hi = lo + 1; }
  const pad = (hi - lo) * 0.08;
  const y = scaleLinear().domain([yMin ?? lo - pad, hi + pad]).nice(4).range([height - m.b, m.t]);
  const x = scalePoint<string>().domain(labels.map((_, i) => String(i))).range([m.l, width - m.r]).padding(0.2);
  const xi = (i: number) => x(String(i)) ?? 0;
  const ticks = uniqueTicks(niceTicks(y.domain()[0], y.domain()[1]), format);
  const flat = all.length === 0 || all.every((v) => v === 0);
  const every = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(width / 70))));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0, bd = Infinity;
    labels.forEach((_, i) => { const d = Math.abs(xi(i) - px); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  };

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {highlightFrom !== undefined && highlightFrom < labels.length && (
          <rect x={xi(highlightFrom) - 6} y={m.t} width={Math.max(0, width - m.r - xi(highlightFrom) + 6)} height={height - m.b - m.t} className="chart-proj-zone" />
        )}
        {ticks.map((t) => (
          <g key={t.value}>
            <line x1={m.l} x2={width - m.r} y1={y(t.value)} y2={y(t.value)} className="chart-grid" />
            <text x={m.l - 8} y={y(t.value)} dy="0.32em" textAnchor="end" className="chart-axis">{t.label}</text>
          </g>
        ))}
        {flat && <text x={(m.l + width - m.r) / 2} y={height / 2 - 10} textAnchor="middle" className="chart-empty">No values yet, enter process data and scenario levers</text>}
        {labels.map((l, i) => i % every === 0 && (
          <text key={i} x={xi(i)} y={height - 8} textAnchor="middle" className="chart-axis">{l}</text>
        ))}
        {refLines.map((r) => (
          <g key={r.label}>
            <line x1={m.l} x2={width - m.r} y1={y(r.value)} y2={y(r.value)} stroke={r.color} strokeDasharray="2 4" strokeWidth={1.5} />
            <text x={width - m.r} y={y(r.value) - 5} textAnchor="end" className="chart-ref" fill={r.color}>{r.label}</text>
          </g>
        ))}
        {series.map((s) => {
          const pts = s.values.map((v, i) => [xi(i), v] as const);
          const path = d3line<readonly [number, number | null]>().defined((d) => d[1] !== null).x((d) => d[0]).y((d) => y(d[1] as number))(pts) ?? "";
          return (
            <g key={s.key}>
              <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map(([px, v], i) => v !== null && (hover === i || pts.filter((p) => p[1] !== null).length < 14) && (
                <circle key={i} cx={px} cy={y(v)} r={hover === i ? 4 : 2.5} fill="var(--surface)" stroke={s.color} strokeWidth={2} />
              ))}
            </g>
          );
        })}
        {hover !== null && <line x1={xi(hover)} x2={xi(hover)} y1={m.t} y2={height - m.b} className="chart-cross" />}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: Math.min(width - 170, Math.max(0, xi(hover) + 12)), top: 8 }}>
          <div className="chart-tip-title">{labels[hover]}</div>
          {series.map((s) => s.values[hover] !== null && (
            <div key={s.key} className="chart-tip-row"><span className="swatch" style={{ background: s.color }} />{s.label}<b>{format(s.values[hover] as number)}</b></div>
          ))}
        </div>
      )}
      <div className="legend">
        {series.map((s) => <span key={s.key}><i className={s.dashed ? "legend-dash" : "legend-line"} style={{ borderColor: s.color }} />{s.label}</span>)}
        {refLines.map((r) => <span key={r.label}><i className="legend-dot-line" style={{ borderColor: r.color }} />{r.label}</span>)}
      </div>
    </div>
  );
}

/** Grouped vertical bars, e.g. current vs. future monthly cost per scenario. */
export function GroupedBars({ groups, keys, height = 220, format, ariaLabel }: { groups: { label: string; values: number[] }[]; keys: { label: string; color: string }[]; height?: number; format: (n: number) => string; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const m = { t: 18, r: 8, b: 30, l: 64 };
  const max = Math.max(1, ...groups.flatMap((g) => g.values));
  const y = scaleLinear().domain([0, max]).nice(4).range([height - m.b, m.t]);
  const x0 = scaleBand().domain(groups.map((g) => g.label)).range([m.l, width - m.r]).paddingInner(0.28).paddingOuter(0.12);
  const x1 = scaleBand().domain(keys.map((k) => k.label)).range([0, x0.bandwidth()]).padding(0.12);
  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {uniqueTicks(y.ticks(4), format).map((t) => (
          <g key={t.value}>
            <line x1={m.l} x2={width - m.r} y1={y(t.value)} y2={y(t.value)} className="chart-grid" />
            <text x={m.l - 8} y={y(t.value)} dy="0.32em" textAnchor="end" className="chart-axis">{t.label}</text>
          </g>
        ))}
        {groups.map((g) => (
          <g key={g.label} transform={`translate(${x0(g.label)},0)`}>
            {g.values.map((v, i) => {
              const k = `${g.label}-${i}`;
              const bx = x1(keys[i].label) ?? 0;
              const h = Math.max(0, height - m.b - y(Math.max(0, v)));
              return (
                <g key={k} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)}>
                  <rect x={bx} y={y(Math.max(0, v))} width={x1.bandwidth()} height={h} rx={3} fill={keys[i].color} opacity={hover && hover !== k ? 0.55 : 1} />
                  {(hover === k || x1.bandwidth() > 46) && <text x={bx + x1.bandwidth() / 2} y={y(Math.max(0, v)) - 5} textAnchor="middle" className="chart-val">{format(v)}</text>}
                </g>
              );
            })}
            <text x={x0.bandwidth() / 2} y={height - 9} textAnchor="middle" className="chart-axis">{g.label}</text>
          </g>
        ))}
      </svg>
      <div className="legend">{keys.map((k) => <span key={k.label}><i className="legend-sq" style={{ background: k.color }} />{k.label}</span>)}</div>
    </div>
  );
}

/** Horizontal bars with labels, used for step cost and bottleneck ranking. */
export function HBars({ rows, format, max: maxIn }: { rows: { label: string; value: number; color?: string; note?: string; onClick?: () => void; active?: boolean }[]; format: (n: number) => string; max?: number }) {
  const max = maxIn ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="hbars">
      {rows.map((r) => {
        const content = (
          <>
            <div className="hbar-label"><span>{r.label}</span><b>{format(r.value)}</b></div>
            <div className="hbar-track"><div className="hbar-fill" style={{ width: `${(Math.max(0, r.value) / max) * 100}%`, background: r.color }} /></div>
            {r.note && <div className="hbar-note">{r.note}</div>}
          </>
        );
        return r.onClick ? (
          <button key={r.label} type="button" className={`hbar hbar-btn${r.active ? " hbar-active" : ""}`} onClick={r.onClick}>{content}</button>
        ) : (
          <div key={r.label} className="hbar">{content}</div>
        );
      })}
    </div>
  );
}

export function Sparkline({ values, color = "var(--accent-line)", width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values);
  const x = scaleLinear().domain([0, values.length - 1]).range([2, width - 2]);
  const y = scaleLinear().domain([lo, hi === lo ? lo + 1 : hi]).range([height - 3, 3]);
  const d = d3line<number>().x((_, i) => x(i)).y((v) => y(v))(values) ?? "";
  return <svg width={width} height={height} aria-hidden className="spark"><path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" /></svg>;
}

/** Ring gauge for single percentages. */
export function Ring({ value, size = 64, color = "var(--accent-line)", label }: { value: number; size?: number; color?: string; label?: string }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${Math.round(v * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6} strokeDasharray={`${c * v} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dy="0.35em" textAnchor="middle" className="ring-text">{Math.round(v * 100)}%</text>
    </svg>
  );
}
