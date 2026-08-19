import { useCallback } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { EnrichedPosition } from "@/types";
import { TokenIcon } from "./TokenIcon";
import { Sparkline } from "./Sparkline";
import { fmtUsd, fmtUsdPrice, fmtPct, fmtQty } from "@/lib/format";
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
  const isUp = pos.changePct != null ? pos.changePct >= 0 : null;

  const swipe = useSwipe({ onSwipeLeft: onDelete });
  const handleClick = useCallback(() => {
    if (swipe.revealed) { swipe.reset(); return; }
    onClick();
  }, [onClick, swipe]);

  return (
    <div className="relative divider-top">
      {/* Delete action */}
      <div
        onClick={swipe.onActionTap}
        className="absolute pointer"
        style={{ top: 0, bottom: 0, right: 0, width: 80, justifyContent: "center", display: "flex", alignItems: "center", background: "rgba(248,113,113,0.2)", zIndex: 0 }}
      >
        <span style={{ fontSize: 11, color: "var(--red)", fontWeight: 700, letterSpacing: "0.05em" }}>DELETE</span>
      </div>

      {/* Card content */}
      <div
        onClick={handleClick}
        className="pointer"
        style={{
          position: "relative",
          padding: "14px 16px",
          transform: `translateX(${swipe.offset}px)`,
          transition: swipe.revealed ? "transform 0.2s ease" : swipe.offset === 0 ? "transform 0.25s ease" : "none",
          background: "var(--bg)",
          zIndex: 1,
        }}
        {...swipe.handlers}
      >
        <div className="flex items-center gap-12">
          <TokenIcon symbol={pos.symbol} size={36} />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-6">
                <span className="f16 semibold">{pos.label}</span>
                {isHL && <span className="badge badge-orange">LIVE</span>}
                {isHL && pos.hlMeta && <span className="badge badge-subtle">{pos.hlMeta.leverage}x</span>}
              </div>
              {pos.changePct != null && (
                <span className={`pill ${isUp ? "pill-green" : "pill-red"}`}>
                  {isUp !== null && (isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />)}
                  {fmtPct(pos.changePct)}
                </span>
              )}
            </div>
            <div className="flex justify-between items-center" style={{ marginTop: 2 }}>
              <span className="f13 dim">
                {fmtQty(pos.qty)} {pos.label}
                {lotCount > 1 && ` · ${lotCount}`}
              </span>
              <span className="f13 mono dim">
                {pos.price != null ? fmtUsdPrice(pos.price) : "--"}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-4 shrink-0">
            <Sparkline symbol={pos.symbol} />
            {pos.pnl != null && (
              <span className={`pill ${pos.pnl >= 0 ? "pill-green" : "pill-red"}`}>
                {fmtUsd(pos.pnl, 0)} {fmtPct(pos.pnlPct)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
