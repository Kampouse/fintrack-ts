import type { Transaction } from "@/types";
import { fmtUsd } from "@/lib/format";

interface Props {
  lots: Transaction[];
  currentPrice: number | null;
}

export function BasisChart({ lots, currentPrice }: Props) {
  const sorted = [...lots].sort((a, b) => a.ts - b.ts);

  let runningCost = 0;
  let runningQty = 0;
  const points = sorted.map((lot) => {
    runningCost += lot.qty * lot.price;
    runningQty += lot.qty;
    return {
      ts: lot.ts,
      avg: runningQty > 0 ? runningCost / runningQty : 0,
      label: lot.price,
    };
  });

  if (currentPrice != null) {
    points.push({ ts: Date.now(), avg: currentPrice, label: currentPrice });
  }

  if (points.length < 2) return null;

  const w = 280;
  const h = 60;
  const padding = 8;

  const allValues = points.map((p) => p.avg);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const xStep = (w - padding * 2) / (points.length - 1);

  const coords = points.map((p, i) => ({
    x: padding + i * xStep,
    y: h - padding - ((p.avg - min) / range) * (h - padding * 2),
    ...p,
  }));

  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const areaD = `${pathD} L ${coords[coords.length - 1].x.toFixed(1)} ${h - padding} L ${coords[0].x.toFixed(1)} ${h - padding} Z`;

  return (
    <div>
      <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "6px" }}>Cost Basis Evolution</div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
        <defs>
          <linearGradient id="basisGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--lime)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--lime)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#basisGrad)" />
        <path d={pathD} fill="none" stroke="var(--lime)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="3" fill="var(--lime)" />
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
        <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Start: {fmtUsd(points[0].avg)}</span>
        <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Now: {fmtUsd(points[points.length - 1].avg)}</span>
      </div>
    </div>
  );
}
