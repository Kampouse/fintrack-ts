import type { EnrichedPosition } from "@/types";
import { fmtUsd, fmtPct } from "@/lib/format";
import { card, theme } from "@/lib/styles";

interface Props {
  positions: EnrichedPosition[];
}

export function PortfolioSummary({ positions }: Props) {
  const totalValue = positions.reduce((s, p) => s + (p.value ?? 0), 0);
  const totalCost = positions.reduce((s, p) => s + p.totalCost, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : null;
  const totalDayChange = positions.reduce((s, p) => s + (p.dayChange ?? 0), 0);
  const dayChangePct = totalValue > 0 ? (totalDayChange / totalValue) * 100 : null;
  const pnlColor = totalPnl >= 0 ? "var(--green)" : "var(--red)";
  const dayColor = totalDayChange >= 0 ? "var(--green)" : "var(--red)";

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "12px" }}>
        <div style={{ fontSize: "13px", color: "var(--text-dim)" }}>Portfolio Value</div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.02em", fontFamily: theme.mono }}>
            {fmtUsd(totalValue, 0)}
          </div>
          <div style={{ fontSize: "13px", color: dayColor, fontFamily: theme.mono }}>
            {totalDayChange >= 0 ? "+" : ""}{fmtPct(dayChangePct)} today
          </div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: "13px", color: "var(--text-dim)", fontFamily: theme.mono }}>{fmtUsd(totalCost, 0)}</span>
        <span style={{ fontSize: "13px", fontWeight: 500, color: totalPnl !== 0 ? pnlColor : "var(--text-dim)", fontFamily: theme.mono }}>
          {fmtUsd(totalPnl, 0)} {fmtPct(totalPnlPct)}
        </span>
      </div>
    </div>
  );
}
