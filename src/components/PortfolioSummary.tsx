import { useState, useEffect, useRef, useCallback } from "react";
import type { EnrichedPosition } from "@/types";
import { fmtPct, fmtUsd } from "@/lib/format";
import { card, theme } from "@/lib/styles";
import { AllocationDonut } from "./AllocationDonut";
import { EquityCurve } from "./EquityCurve";
import { useEquityCurve } from "@/hooks/useEquityCurve";
import { Download } from "lucide-react";

interface Props {
  positions: EnrichedPosition[];
}

const ALLOC_COLORS = [
  "#f59e0b", "#3b82f6", "#a78bfa", "#34d399",
  "#f472b6", "#fb923c", "#38bdf8", "#e879f9",
  "#4ade80", "#f87171",
];

function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    const dur = 500;

    const tick = (now: number) => {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  return fmtUsd(display, decimals);
}

export function PortfolioSummary({ positions }: Props) {
  const totalValue = positions.reduce((s, p) => s + (p.value ?? 0), 0);
  const totalCost = positions.reduce((s, p) => s + p.totalCost, 0);
  // Use pos.pnl when available (HL provides unrealizedPnl from API), fall back to value-cost
  const totalPnl = positions.reduce((s, p) => s + (p.pnl ?? 0), 0);
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : null;
  const totalDayChange = positions.reduce((s, p) => s + (p.dayChange ?? 0), 0);
  const dayChangePct = totalValue > 0 ? (totalDayChange / totalValue) * 100 : null;
  const pnlColor = totalPnl >= 0 ? "var(--green)" : "var(--red)";
  const dayColor = totalDayChange >= 0 ? "var(--green)" : "var(--red)";

  // Realized P&L from closed lots
  const totalRealized = positions.reduce((s, p) => s + p.realized.reduce((r, sale) => r + sale.realized, 0), 0);
  const realizedColor = totalRealized >= 0 ? "var(--green)" : "var(--red)";

  // Tick flash
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevRef = useRef(totalValue);
  useEffect(() => {
    if (totalValue > prevRef.current) setFlash("up");
    else if (totalValue < prevRef.current) setFlash("down");
    prevRef.current = totalValue;
    const t = setTimeout(() => setFlash(null), 400);
    return () => clearTimeout(t);
  }, [totalValue]);

  // Allocation donut slices
  const allocSlices = positions
    .filter((p) => p.value != null && p.value > 0)
    .map((p, i) => ({
      label: p.label,
      value: p.value!,
      color: ALLOC_COLORS[i % ALLOC_COLORS.length],
    }));

  const { points: equityPoints } = useEquityCurve(totalValue);

  const exportData = useCallback(() => {
    const data = positions.map((p) => ({
      symbol: p.symbol,
      label: p.label,
      qty: p.qty,
      avgCost: p.avgCost,
      totalCost: p.totalCost,
      price: p.price,
      value: p.value,
      pnl: p.pnl,
      pnlPct: p.pnlPct,
      dayChange: p.dayChange,
      source: p.source,
      lots: p.lots.map((l) => ({ qty: l.qty, price: l.price, ts: l.ts, side: l.side, note: l.note })),
      realized: p.realized.map((r) => ({ qty: r.qty, price: r.price, realized: r.realized, realizedPct: r.realizedPct, ts: r.ts })),
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fintrack-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [positions]);

  return (
    <div style={card}>
      <div style={{ display: "flex", gap: 16 }}>
        {/* Main value section */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: "12px", color: "var(--text-dim)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Portfolio
              </div>
              <button onClick={exportData} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: 2, display: "flex" }} title="Export JSON">
                <Download size={12} />
              </button>
            </div>
          </div>
          <div className={flash ? `flash-${flash}` : ""} style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.02em", fontFamily: theme.mono }}>
            <AnimatedNumber value={totalValue} />
          </div>
          <div style={{ fontSize: "13px", color: dayColor, fontFamily: theme.mono, marginTop: "2px" }}>
            {totalDayChange >= 0 ? "+" : ""}{fmtPct(dayChangePct)} today
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-dim)", fontFamily: theme.mono }}>{fmtUsd(totalCost, 0)} cost</span>
            <span style={{ fontSize: "12px", fontWeight: 500, color: totalPnl !== 0 ? pnlColor : "var(--text-dim)", fontFamily: theme.mono }}>
              {fmtUsd(totalPnl, 0)} {fmtPct(totalPnlPct)}
            </span>
          </div>
          {totalRealized !== 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Realized</span>
              <span style={{ fontSize: "11px", fontWeight: 600, fontFamily: theme.mono, color: realizedColor }}>
                {fmtUsd(totalRealized, 0)}
              </span>
            </div>
          )}
        </div>

        {/* Allocation donut + equity curve */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <AllocationDonut slices={allocSlices} size={72} />
          <EquityCurve points={equityPoints} width={120} height={28} />
        </div>
      </div>
    </div>
  );
}
