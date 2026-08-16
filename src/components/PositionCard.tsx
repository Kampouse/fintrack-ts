import { useCallback } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { EnrichedPosition } from "@/types";
import { TokenIcon } from "./TokenIcon";
import { Sparkline } from "./Sparkline";
import { fmtUsd, fmtUsdPrice, fmtPct, fmtQty } from "@/lib/format";
import { theme } from "@/lib/styles";
import { useSwipe } from "@/hooks/useSwipe";

interface Props {
  pos: EnrichedPosition;
  onClick: () => void;
  onDelete?: () => void;
}

export function PositionCard({ pos, onClick, onDelete }: Props) {
  const pnlColor = pos.pnl != null ? (pos.pnl >= 0 ? "var(--green)" : "var(--red)") : "var(--text-dim)";
  const lotCount = pos.lots.length;
  const isHL = pos.source === "hyperliquid";

  const swipe = useSwipe({
    onSwipeLeft: onDelete,
  });

  const handleClick = useCallback(() => {
    if (swipe.revealed) { swipe.reset(); return; }
    onClick();
  }, [onClick, swipe]);

  const isUp = pos.changePct != null ? pos.changePct >= 0 : null;

  return (
    <div
      style={{
        position: "relative",
        borderTop: `1px solid ${theme.cardBorder}`,
      }}
    >
      {/* Delete action — always rendered behind, revealed by swipe */}
      <div
        onClick={swipe.onActionTap}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          width: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(248,113,113,0.2)",
          cursor: "pointer",
          zIndex: 0,
        }}
      >
        <span style={{ fontSize: "11px", color: "var(--red)", fontWeight: 700, letterSpacing: "0.05em" }}>DELETE</span>
      </div>

      {/* Card content */}
      <div
        onClick={handleClick}
        style={{
          position: "relative",
          cursor: "pointer",
          padding: "14px 16px",
          transform: `translateX(${swipe.offset}px)`,
          transition: swipe.revealed ? "transform 0.2s ease" : swipe.offset === 0 ? "transform 0.25s ease" : "none",
          background: "var(--bg)",
          zIndex: 1,
        }}
        {...swipe.handlers}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <TokenIcon symbol={pos.symbol} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "16px", fontWeight: 600 }}>{pos.label}</span>
                {isHL && (
                  <span style={{ fontSize: "9px", fontWeight: 700, fontFamily: theme.mono, color: "#f97316", padding: "2px 5px", borderRadius: "4px", background: "rgba(249,115,22,0.12)" }}>LIVE</span>
                )}
              </div>
              <span style={{
                fontSize: 11,
                fontFamily: theme.mono,
                fontWeight: 600,
                color: pnlColor,
                padding: "2px 8px",
                borderRadius: 6,
                background: pos.pnl != null ? (pos.pnl >= 0 ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)") : "transparent",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}>
                {isUp !== null && (
                  isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />
                )}
                {pos.changePct != null ? fmtPct(pos.changePct) : ""}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "2px" }}>
              <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>
                {fmtQty(pos.qty)} {pos.label}
                {lotCount > 1 && ` · ${lotCount}`}
              </span>
              <span style={{ fontSize: "13px", color: "var(--text-dim)", fontFamily: theme.mono }}>
                {pos.price != null ? fmtUsdPrice(pos.price) : "--"}
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
    </div>
  );
}
