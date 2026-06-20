import type { EnrichedPosition } from "@/types";
import { fmtUsd, fmtPct } from "@/lib/format";
import { card } from "@/lib/styles";

interface Props {
  positions: EnrichedPosition[];
}

export function PortfolioSummary({ positions }: Props) {
  const totalValue = positions.reduce((s, p) => s + (p.value ?? 0), 0);
  const totalCost = positions.reduce((s, p) => s + p.totalCost, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : null;
  const todayChange = positions.reduce((s, p) => s + (p.dayChange ?? 0), 0);

  const pnlColor = totalPnl >= 0 ? "var(--green)" : "var(--red)";

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "12px" }}>
        <div>
          <div style={{ fontSize: "13px", color: "var(--text-dim)" }}>Portfolio Value</div>
          <div style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.02em" }}>
            {fmtUsd(totalValue, 0)}
          </div>
        </div>
        {todayChange !== 0 && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>Today</div>
            <div style={{ fontSize: "15px", fontWeight: 500, color: todayChange >= 0 ? "var(--green)" : "var(--red)" }}>
              {fmtUsd(todayChange, 0)} {fmtPct(positions[0]?.changePct ?? null)}
            </div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>Cost: {fmtUsd(totalCost, 0)}</span>
        <span style={{ fontSize: "13px", fontWeight: 500, color: totalPnl !== 0 ? pnlColor : "var(--text-dim)" }}>
          {fmtUsd(totalPnl, 0)} {fmtPct(totalPnlPct)}
        </span>
      </div>
    </div>
  );
}
