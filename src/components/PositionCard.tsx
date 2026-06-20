import type { EnrichedPosition } from "@/types";
import { TokenIcon } from "./TokenIcon";
import { fmtUsd, fmtPct, fmtNum } from "@/lib/format";
import { card } from "@/lib/styles";

interface Props {
  pos: EnrichedPosition;
  onClick: () => void;
}

export function PositionCard({ pos, onClick }: Props) {
  const pnlColor = pos.pnl != null ? (pos.pnl >= 0 ? "var(--green)" : "var(--red)") : "var(--text-dim)";
  const lotCount = pos.lots.length;

  return (
    <div onClick={onClick} style={{ ...card, cursor: "pointer", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <TokenIcon symbol={pos.symbol} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: "16px", fontWeight: 600 }}>{pos.label}</span>
            <span style={{ fontSize: "16px", fontWeight: 500 }}>
              {pos.value != null ? fmtUsd(pos.value, 0) : "--"}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "2px" }}>
            <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>
              {fmtNum(pos.qty)} {pos.label}
              {lotCount > 1 && ` (${lotCount} lots)`}
            </span>
            {pos.pnl != null && (
              <span style={{ fontSize: "13px", color: pnlColor, fontWeight: 500 }}>
                {fmtUsd(pos.pnl, 0)} {fmtPct(pos.pnlPct)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
