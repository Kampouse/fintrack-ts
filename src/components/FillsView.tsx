import { useState, useEffect } from "react";
import { ArrowUpRight, ArrowDownLeft, Clock } from "lucide-react";
import type { HLUserFill } from "@/api/hyperliquid";
import { getUserFills } from "@/api/hyperliquid";
import { useHLContext } from "@/contexts/HLContext";
import { fmtUsd, fmtQty } from "@/lib/format";

interface Props {
  wallet?: string;
}

function fmtTime(time: number): string {
  const d = new Date(time);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    + " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export function FillsView({ wallet: _wallet }: Props) {
  const { wallet } = useHLContext();
  const [fills, setFills] = useState<HLUserFill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wallet) return;
    setLoading(true);
    getUserFills(wallet, 50)
      .then(setFills)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [wallet]);

  if (!wallet) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ padding: 40, opacity: 0.4 }}>
        <Clock size={32} />
        <span className="f12 dim" style={{ marginTop: 8 }}>Connect HL wallet to view fills</span>
      </div>
    );
  }

  if (loading) {
    return <div className="skeleton" style={{ height: 200, margin: 12, borderRadius: 12 }} />;
  }

  if (fills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ padding: 40, opacity: 0.4 }}>
        <Clock size={32} />
        <span className="f12 dim" style={{ marginTop: 8 }}>No fills found</span>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 12px" }}>
      {fills.map((f, i) => {
        const isBuy = f.side === "B";
        const cpnl = parseFloat(f.closedPnl || "0");
        return (
          <div key={`${f.time}-${i}`} className="flex justify-between items-center divider-top" style={{ padding: "10px 4px" }}>
            <div className="flex items-center gap-8">
              {isBuy ? <ArrowUpRight size={14} color="var(--green)" /> : <ArrowDownLeft size={14} color="var(--red)" />}
              <div>
                <div className="flex items-center gap-4">
                  <span className="f13 semibold">{f.coin}</span>
                  <span className={`badge ${isBuy ? "badge-subtle" : "badge-subtle"}`}>{isBuy ? "BUY" : "SELL"}</span>
                </div>
                <span className="f11 mono dim">{fmtTime(f.time)} · {fmtQty(parseFloat(f.sz))} @ ${parseFloat(f.px).toFixed(1)}</span>
              </div>
            </div>
            {cpnl !== 0 && (
              <span className={`pill ${cpnl >= 0 ? "pill-green" : "pill-red"}`}>
                {fmtUsd(cpnl, 1)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
