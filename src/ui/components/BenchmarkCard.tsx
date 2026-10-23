import React from "react";
import { LuExternalLink } from "react-icons/lu";
import { Badge, Card } from "./ui";
import { fmt } from "../format";
import { BENCHMARKS, SOURCES, position, type Benchmark, type BenchmarkKey } from "../../domain/benchmarks";

export interface BenchmarkValues {
  today: Record<BenchmarkKey, number>;
  target: Record<BenchmarkKey, number>;
  targetName: string;
}

function show(b: Benchmark, v: number, own = false): string {
  if (b.unit === "usd") return own ? fmt.eur(v, 2) : `$${v.toFixed(2)}`;
  if (b.unit === "days") return `${fmt.num(v, 1)} d`;
  return fmt.pct(v, 1);
}

const LABEL = { better: "Better than published", within: "Within published range", worse: "Behind published" } as const;
const TONE = { better: "success", within: "neutral", worse: "warning" } as const;

/** Today's and target values next to published AP benchmarks, with linked sources. */
export function BenchmarkCard({ values, print = false }: { values: BenchmarkValues; print?: boolean }) {
  const used = new Set(BENCHMARKS.flatMap((b) => b.points.map((p) => p.source)));
  const body = (
    <>
      <div className="table-wrap">
        <table className="table bench-table">
          <thead>
            <tr><th>Metric</th><th className="num">Today</th><th className="num">{values.targetName}</th><th>Published reference</th>{!print && <th>Today vs. reference</th>}</tr>
          </thead>
          <tbody>
            {BENCHMARKS.map((b) => {
              const pos = position(b, values.today[b.key]);
              return (
                <tr key={b.key}>
                  <td><div className="strong">{b.label}</div>{b.note && <div className="small muted">{b.note}</div>}</td>
                  <td className="num">{show(b, values.today[b.key], true)}</td>
                  <td className="num strong">{show(b, values.target[b.key], true)}</td>
                  <td>
                    <div className="bench-points">
                      {b.points.map((p) => <span key={p.label} className="bench-chip"><span className="muted">{p.label}</span> {show(b, p.value)}<sup>{Object.keys(SOURCES).indexOf(p.source) + 1}</sup></span>)}
                    </div>
                  </td>
                  {!print && <td className="nowrap">{b.unit === "usd" ? <span className="small muted">Different currency</span> : <Badge tone={TONE[pos]}>{LABEL[pos]}</Badge>}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ol className="bench-sources small muted">
        {Object.values(SOURCES).filter((s) => used.has(s.id)).map((s) => (
          <li key={s.id}>{s.publisher}, <i>{s.name}</i> ({s.year}) — <a href={s.url} target="_blank" rel="noopener noreferrer">source{!print && <LuExternalLink aria-hidden />}</a></li>
        ))}
      </ol>
    </>
  );
  if (print) return body;
  return (
    <Card title="Industry benchmarks" subtitle="Your baseline and target next to published accounts-payable benchmarks — a reference point, not a guarantee" pad={false}>
      {body}
    </Card>
  );
}
