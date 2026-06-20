import type { EnrichedPosition } from "@/types";
import { TokenIcon } from "./TokenIcon";
import { Sparkline } from "./Sparkline";
import { fmtUsd, fmtPct, fmtNum } from "@/lib/format";
import { row, theme } from "@/lib/styles";

interface Props {
  pos: EnrichedPosition;
  onClick: () => void;
}

export function PositionCard({ pos, onClick }: Props) {
  const pnlColor = pos.pnl != null ? (pos.pnl >= 0 ? "var(--green)" : "var(--red)") : "var(--text-dim)";
  const lotCount = pos.lots.length;

  return (
    <div onClick={onClick} style={{ ...row, cursor: "pointer", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <TokenIcon symbol={pos.symbol} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: "16px", fontWeight: 600 }}>{pos.label}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "2px" }}>
            <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>
              {fmtNum(pos.qty)} {pos.label}
              {lotCount > 1 && ` (${lotCount} lots)`}
            </span>
            <span style={{ fontSize: "13px", color: "var(--text-dim)", fontFamily: theme.mono }}>
              {pos.price != null ? fmtUsd(pos.price) : "--"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
          <Sparkline symbol={pos.symbol} />
          {pos.pnl != null && (
            <span style={{
              fontSize: 11,
              fontFamily: theme.mono,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '6px',
              background: pos.pnl >= 0 ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
              color: pnlColor,
            }}>
              {fmtUsd(pos.pnl, 0)} {fmtPct(pos.pnlPct)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
