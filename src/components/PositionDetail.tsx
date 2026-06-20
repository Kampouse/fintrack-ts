import { useState } from "react";
import { ChevronLeft, Trash2, Pencil, Plus } from "lucide-react";
import type { Transaction, Quote, Position } from "@/types";
import { TokenIcon } from "./TokenIcon";
import { BasisChart } from "./BasisChart";
import { CandleChart } from "./CandleChart";
import { EditLotSheet } from "./EditLotSheet";
import { labelFromSymbol } from "@/lib/constants";
import { fmtUsd, fmtPct, fmtNum, fmtDate } from "@/lib/format";
import { card, btnIcon, row, theme } from "@/lib/styles";

interface Props {
  symbol: string;
  txs: Transaction[];
  quote: Quote | undefined;
  onBack: () => void;
  onRemoveLot: (id: string) => void;
  onEditLot: (lot: Transaction) => void;
  onAddLot: () => void;
}

export function PositionDetail({ symbol, txs, quote, onBack, onRemoveLot, onEditLot, onAddLot }: Props) {
  const [editLot, setEditLot] = useState<Transaction | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const lots = txs.filter((t) => t.symbol === symbol).sort((a, b) => a.ts - b.ts);
  const label = labelFromSymbol(symbol);

  const totalQty = lots.reduce((s, l) => s + l.qty, 0);
  const totalCost = lots.reduce((s, l) => s + l.qty * l.price, 0);
  const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
  const price = quote?.price ?? null;
  const value = price != null ? price * totalQty : null;
  const pnl = value != null ? value - totalCost : null;
  const pnlPct = totalCost > 0 && pnl != null ? (pnl / totalCost) * 100 : null;
  const dayChange = value != null && quote?.changePct != null ? (value * quote.changePct) / 100 : null;
  const pnlColor = pnl != null ? (pnl >= 0 ? "var(--green)" : "var(--red)") : "var(--text-dim)";

  // Running avg cost per lot
  let runCost = 0;
  let runQty = 0;
  const lotRows = lots.map((lot) => {
    runCost += lot.qty * lot.price;
    runQty += lot.qty;
    return { lot, runAvg: runQty > 0 ? runCost / runQty : 0, runCost, runQty };
  });

  const mono: React.CSSProperties = { fontFamily: theme.mono };

  return (
    <div style={{ maxWidth: "min(720px, 100%)", margin: "0 auto", padding: "20px 16px 100px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
        <button onClick={onBack} style={btnIcon} aria-label="Back">
          <ChevronLeft size={20} color="var(--text)" />
        </button>
        <TokenIcon symbol={symbol} size={32} />
        <h1 style={{ fontSize: "20px", fontWeight: 600 }}>{label}</h1>
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          <button onClick={onAddLot} style={btnIcon} aria-label="Add to position">
            <Plus size={18} color="var(--lime)" />
          </button>
        </div>
      </div>

      {/* Desktop: chart left, info right. Mobile: stacked */}
      <div data-detail-grid style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <CandleChart symbol={symbol} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div style={{ ...card, padding: '12px 16px' }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>Price</div>
                <div style={{ fontSize: "15px", fontWeight: 600, fontFamily: theme.mono }}>{fmtUsd(price)}</div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>Qty</div>
                <div style={{ fontSize: "15px", fontWeight: 600, fontFamily: theme.mono }}>{fmtNum(totalQty)}</div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>P&L</div>
                <div style={{ fontSize: "15px", fontWeight: 600, fontFamily: theme.mono, color: pnlColor }}>
                  {pnl != null ? `${fmtUsd(pnl, 0)} ${fmtPct(pnlPct)}` : "--"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>Avg</div>
                <div style={{ fontSize: "15px", fontWeight: 600, fontFamily: theme.mono }}>{fmtUsd(avgCost)}</div>
              </div>
            </div>
          </div>
          <div style={{ ...card, flex: 1 }}>
            <BasisChart lots={lots} currentPrice={price} />
          </div>
        </div>
      </div>

      {/* Mobile: stack chart above metrics */}
      <style>{`@media (max-width: 639px) { [data-detail-grid] { grid-template-columns: 1fr !important; } }`}</style>

      <div>
        <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>Lots</div>
        <div style={{ border: "1px solid var(--card-border)", borderRadius: 16, overflow: "hidden" }}>
          {lotRows.map(({ lot, runAvg }, i) => {
            const lotValue = price != null ? price * lot.qty : null;
            const lotPnl = lotValue != null ? lotValue - lot.qty * lot.price : null;
            const lotColor = lotPnl != null ? (lotPnl >= 0 ? "var(--green)" : "var(--red)") : "var(--text-dim)";

            return (
              <div key={lot.id} style={{ ...row, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>#{i + 1}</span>
                    <span style={{ fontSize: "15px", fontWeight: 500, marginLeft: "8px", fontFamily: theme.mono }}>
                      {fmtNum(lot.qty)} @ {fmtUsd(lot.price)}
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--text-dim)", marginLeft: "8px" }}>{fmtDate(lot.ts)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 500, color: lotColor, fontFamily: theme.mono }}>
                      {lotPnl != null ? `${fmtUsd(lotPnl, 0)}` : "--"}
                    </span>
                    <button
                      onClick={() => setEditLot(lot)}
                      style={{ ...btnIcon, width: "32px", height: "32px" }}
                      aria-label="Edit lot"
                    >
                      <Pencil size={14} color="var(--text-dim)" />
                    </button>
                    {confirmDelete === lot.id ? (
                      <button
                        onClick={() => { onRemoveLot(lot.id); setConfirmDelete(null); }}
                        style={{ ...btnIcon, width: "32px", height: "32px", background: "rgba(248,113,113,0.15)" }}
                        aria-label="Confirm delete"
                      >
                        <Trash2 size={14} color="var(--red)" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(lot.id)}
                        style={{ ...btnIcon, width: "32px", height: "32px" }}
                        aria-label="Delete lot"
                      >
                        <Trash2 size={14} color="var(--text-dim)" />
                      </button>
                    )}
                  </div>
                </div>
                {i > 0 && (
                  <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "4px", marginLeft: "20px", fontFamily: theme.mono }}>
                    Avg cost after this lot: {fmtUsd(runAvg)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {editLot && (
        <EditLotSheet
          lot={editLot}
          onClose={() => setEditLot(null)}
          onSave={(updates) => {
            onEditLot({ ...editLot, ...updates });
            setEditLot(null);
          }}
        />
      )}
    </div>
  );
}
