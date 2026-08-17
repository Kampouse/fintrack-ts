import { useState, useEffect } from "react";
import { ArrowUpRight, ArrowDownLeft, Clock } from "lucide-react";
import type { HLUserFill } from "@/api/hyperliquid";
import { getUserFills } from "@/api/hyperliquid";
import { useHLContext } from "@/contexts/HLContext";
import { theme } from "@/lib/styles";
import { fmtUsd, fmtQty } from "@/lib/format";

interface Props {
  wallet?: string;
}

function fmtTime(time: number): string {
  if (!time) return "--";
  const d = new Date(time * 1000);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function FillsView({ wallet }: Props) {
  const [fills, setFills] = useState<HLUserFill[]>([]);
  const [loading, setLoading] = useState(true);
  const hl = useHLContext();

  useEffect(() => {
    const addr = wallet || hl.wallet;
    if (!addr) { setLoading(false); return; }
    setLoading(true);
    getUserFills(addr, 50).then((f) => {
      setFills(f);
      setLoading(false);
    });
  }, [wallet, hl.wallet]);

  if (!wallet && !hl.wallet) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: "var(--text-dim)" }}>
        <Clock size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
        <div style={{ fontSize: 13 }}>Connect wallet to see fills</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ height: 48, marginBottom: 8, borderRadius: 8, background: "var(--card)", opacity: 0.5, animation: `pulse 1.5s ${i * 0.1}s infinite` }} />
        ))}
      </div>
    );
  }

  if (fills.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: "var(--text-dim)" }}>
        <Clock size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
        <div style={{ fontSize: 13 }}>No recent fills</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "4px 16px 16px" }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 500, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Recent Fills
      </div>
      {fills.map((fill, i) => {
        const isBuy = fill.side === "B";
        const px = Number(fill.px);
        const sz = Number(fill.sz);
        const coin = fill.coin;
        const closedPnl = Number(fill.closedPnl || 0);
        return (
          <div
            key={`${fill.hash}-${i}`}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 0",
              borderBottom: i < fills.length - 1 ? "1px solid var(--card-border)" : "none",
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: isBuy ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
            }}>
              {isBuy ? <ArrowUpRight size={14} color="#4ade80" /> : <ArrowDownLeft size={14} color="#f87171" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{coin}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, fontFamily: theme.mono,
                    padding: "1px 4px", borderRadius: 3,
                    color: isBuy ? "#4ade80" : "#f87171",
                    background: isBuy ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                  }}>
                    {isBuy ? "BUY" : "SELL"}
                  </span>
                </div>
                <span style={{ fontSize: 12, fontFamily: theme.mono, fontWeight: 600, color: "var(--text)" }}>
                  {fmtUsd(px * sz, 0)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: theme.mono }}>
                  {fmtQty(sz)} @ {fmtUsd(px)}
                </span>
                {closedPnl !== 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, fontFamily: theme.mono,
                    color: closedPnl >= 0 ? "var(--green)" : "var(--red)",
                  }}>
                    {closedPnl >= 0 ? "+" : ""}{fmtUsd(closedPnl, 0)}
                  </span>
                )}
              </div>
            </div>
            <span style={{ fontSize: 10, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
              {fmtTime(fill.time)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
