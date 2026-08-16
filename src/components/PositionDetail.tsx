import { useState, useRef, useCallback } from "react";
import { ChevronLeft, Trash2, Pencil, Plus, Minus, LayoutGrid, Monitor, X, PanelRightClose, PanelRightOpen, ExternalLink } from "lucide-react";
import type { Transaction, Quote, Position, HLPositionMeta } from "@/types";
import type { HLUserFill } from "@/api/hyperliquid";
import { TokenIcon } from "./TokenIcon";
import { BasisChart } from "./BasisChart";
import { CandleChart, type PriceLevel } from "./CandleChart";
import KiyotakaTerminal from "./KiyotakaTerminal";
import { EditLotSheet } from "./EditLotSheet";
import { labelFromSymbol } from "@/lib/constants";
import { fmtUsd, fmtUsdPrice, fmtPct, fmtQty, fmtDate } from "@/lib/format";
import { card, btnIcon, row, theme } from "@/lib/styles";

// ─── Kiyotaka terminal colors ───
const K = {
  bg: "#0a0a0b",
  green: "#00EC97",
  red: "#FF4D4D",
  dim: "rgba(255,255,255,0.5)",
  text: "rgba(255,255,255,0.95)",
  border: "#1e1e22",
  overlay: "rgba(10,10,11,0.85)",
  sidebar: "rgba(10,10,11,0.96)",
  activeBg: "rgba(0,236,151,0.12)",
};

const MONO: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, monospace", fontVariantNumeric: "tabular-nums" as const };

const TF_OPTIONS = [
  { days: 0, label: "5m" },
  { days: -1, label: "1m" },
  { days: 1, label: "1H" },
  { days: 7, label: "4H" },
  { days: 30, label: "1D" },
  { days: 90, label: "1W" },
] as const;

interface Props {
  symbol: string;
  txs: Transaction[];
  quote: Quote | undefined;
  entryPrice?: number;
  hlMeta?: HLPositionMeta;
  recentFills?: HLUserFill[];
  onBack: () => void;
  onRemoveLot: (id: string) => void;
  onEditLot: (lot: Transaction) => void;
  onAddLot: () => void;
  onSellLot: () => void;
  terminal: boolean;
  onToggleTerminal: () => void;
}

export function PositionDetail({ symbol, txs, quote, entryPrice, hlMeta, recentFills, onBack, onRemoveLot, onEditLot, onAddLot, onSellLot, terminal, onToggleTerminal }: Props) {
  const [editLot, setEditLot] = useState<Transaction | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showLots, setShowLots] = useState(false);
  const [showAvgs, setShowAvgs] = useState(false);
  const [chartH, setChartH] = useState(286);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Chart tick for terminal toolbar sync
  const [chartTick, setChartTick] = useState(0);

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
  const kPnlColor = pnl != null ? (pnl >= 0 ? K.green : K.red) : K.dim;
  const changeColor = (quote?.changePct ?? 0) >= 0 ? K.green : K.red;

  // Realized P&L from sells (FIFO)
  const buys = lots.filter((l) => l.side === "buy" || !l.side).map((l) => ({ ...l }));
  const sellTxs = lots.filter((l) => l.side === "sell");
  let realizedPnl = 0;
  for (const sell of sellTxs) {
    let qtyLeft = sell.qty;
    for (const buy of buys) {
      if (qtyLeft <= 0 || buy.qty <= 0) continue;
      const match = Math.min(qtyLeft, buy.qty);
      realizedPnl += match * (sell.price - buy.price);
      buy.qty -= match;
      qtyLeft -= match;
    }
  }

  // Running avg cost per lot
  let runCost = 0;
  let runQty = 0;
  const lotRows = lots.map((lot) => {
    runCost += lot.qty * lot.price;
    runQty += lot.qty;
    return { lot, runAvg: runQty > 0 ? runCost / runQty : 0, runCost, runQty };
  });

  const mono: React.CSSProperties = { fontFamily: theme.mono };

  // Build price levels for chart overlay
  const priceLevels: PriceLevel[] = [];
  const lotColors = ["#38bdf8", "#fbbf24", "#a78bfa", "#f472b6", "#34d399", "#fb923c"];
  if (showLots) {
    lots.forEach((lot, i) => {
      priceLevels.push({
        price: lot.price,
        label: `#${i + 1}`,
        color: lotColors[i % lotColors.length],
      });
    });
  }
  if (showAvgs && lots.length > 1) {
    let rc = 0, rq = 0;
    lots.forEach((lot, i) => {
      rc += lot.qty * lot.price;
      rq += lot.qty;
      const avg = rq > 0 ? rc / rq : 0;
      priceLevels.push({
        price: avg,
        label: `Avg${i + 1}`,
        color: "#c084fc",
      });
    });
  }

  // HL / external entry price overlay
  if (entryPrice != null && entryPrice > 0) {
    priceLevels.push({
      price: entryPrice,
      label: "Entry",
      color: "#f97316",
    });
  }

  const sepId = useRef(0);

  // ─── Terminal mode ───
  if (terminal) {
    return <KiyotakaTerminal symbol={symbol} onBack={() => onToggleTerminal()} />;
  }

  // ─── Normal mode (unchanged) ───
  const metricsRow = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: 12 }}>
      <div>
        <div style={{ fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Price</div>
        <div style={{ fontSize: "14px", fontWeight: 600, fontFamily: theme.mono }}>{fmtUsdPrice(price)}</div>
      </div>
      <div>
        <div style={{ fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Qty</div>
        <div style={{ fontSize: "14px", fontWeight: 600, fontFamily: theme.mono }}>{fmtQty(totalQty)}</div>
      </div>
      <div>
        <div style={{ fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>P&L</div>
        <div style={{ fontSize: "14px", fontWeight: 600, fontFamily: theme.mono, color: pnlColor }}>
          {pnl != null ? `${fmtUsd(pnl, 0)} ${fmtPct(pnlPct)}` : "--"}
        </div>
      </div>
      {sellTxs.length > 0 && (
        <div>
          <div style={{ fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Realized</div>
          <div style={{ fontSize: "14px", fontWeight: 600, fontFamily: theme.mono, color: realizedPnl >= 0 ? K.green : K.red }}>
            {fmtUsd(realizedPnl, 0)} {realizedPnl !== 0 ? fmtPct(totalCost > 0 ? (realizedPnl / totalCost) * 100 : 0) : ""}
          </div>
        </div>
      )}
      <div>
        <div style={{ fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Avg</div>
        <div style={{ fontSize: "14px", fontWeight: 600, fontFamily: theme.mono }}>{fmtUsdPrice(avgCost)}</div>
      </div>
    </div>
  );

  const lotsSection = (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ fontSize: "14px", fontWeight: 600 }}>Lots</span>
        <button onClick={onAddLot} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center" }}>
          <Plus size={18} color="var(--lime)" />
        </button>
      </div>
      <div style={{ border: "1px solid var(--card-border)", borderRadius: 16, overflow: "hidden" }}>
        {lotRows.map(({ lot, runAvg }, i) => {
          const isSell = lot.side === "sell";
          const lotValue = isSell ? null : price != null ? price * lot.qty : null;
          const lotPnl = lotValue != null ? lotValue - lot.qty * lot.price : null;
          const lotColor = lotPnl != null ? (lotPnl >= 0 ? "var(--green)" : "var(--red)") : "var(--text-dim)";

          return (
            <div key={lot.id} style={{ ...row, padding: "12px 14px", borderLeft: isSell ? "3px solid #ef4444" : "3px solid transparent" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>#{i + 1}</span>
                  {isSell && <span style={{ fontSize: "10px", color: "#ef4444", marginLeft: "6px", fontWeight: 600, fontFamily: theme.mono }}>SELL</span>}
                  <span style={{ fontSize: "15px", fontWeight: 500, marginLeft: "8px", fontFamily: theme.mono, color: isSell ? "#ef4444" : "var(--text)" }}>
                    {fmtQty(lot.qty)} @ {fmtUsdPrice(lot.price)}
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
                  Avg cost after this lot: {fmtUsdPrice(runAvg)}
                </div>
              )}
              {lot.note && (
                <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "6px", marginLeft: "20px", fontStyle: "italic", lineHeight: 1.4 }}>
                  {lot.note}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: terminal ? "100%" : "min(720px, 100%)", margin: "0 auto", padding: "20px var(--app-hpad, 16px) 100px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <button onClick={onBack} style={btnIcon} aria-label="Back">
          <ChevronLeft size={20} color="var(--text)" />
        </button>
        <TokenIcon symbol={symbol} size={32} />
        <h1 style={{ fontSize: "20px", fontWeight: 600 }}>{label}</h1>
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          {hlMeta ? (
            <a
              href={`https://app.hyperliquid.xyz/trade/${encodeURIComponent(symbol.replace("HL:", ""))}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid rgba(249,115,22,0.3)",
                background: "rgba(249,115,22,0.08)",
                color: "#f97316",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                textDecoration: "none",
                fontFamily: theme.mono,
              }}
            >
              <ExternalLink size={14} />
              Close on HL
            </a>
          ) : (
            <>
              <button onClick={onSellLot} style={btnIcon} aria-label="Sell">
                <Minus size={18} color="#ef4444" />
              </button>
              <button onClick={onAddLot} style={btnIcon} aria-label="Add to position">
                <Plus size={18} color="var(--lime)" />
              </button>
            </>
          )}
          <button
            onClick={onToggleTerminal}
            style={{
              ...btnIcon,
              background: terminal ? "var(--lime-dim)" : "transparent",
            }}
            aria-label="Toggle layout"
          >
            {terminal ? <Monitor size={16} color="var(--lime)" /> : <LayoutGrid size={16} color="var(--text-dim)" />}
          </button>
        </div>
      </div>

      {/* Level toggles */}
      {lots.length > 0 && (
        <div style={{ display: "flex", gap: "6px", marginBottom: 12, flexWrap: "wrap" }}>
          {lots.length > 0 && (
            <button
              onClick={() => setShowLots(!showLots)}
              style={{
                padding: "3px 8px",
                borderRadius: "6px",
                border: "none",
                background: showLots ? "rgba(56,189,248,0.15)" : "transparent",
                color: showLots ? "#38bdf8" : "var(--text-dim)",
                fontSize: "11px",
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: theme.mono,
              }}
            >
              Lots
            </button>
          )}
          {lots.length > 1 && (
            <button
              onClick={() => setShowAvgs(!showAvgs)}
              style={{
                padding: "3px 8px",
                borderRadius: "6px",
                border: "none",
                background: showAvgs ? "rgba(192,132,252,0.15)" : "transparent",
                color: showAvgs ? "#c084fc" : "var(--text-dim)",
                fontSize: "11px",
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: theme.mono,
              }}
            >
              Avgs
            </button>
          )}
        </div>
      )}

      {/* Chart — rendered once, persists across view switches */}
      <div style={{ border: "1px solid var(--card-border)", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
        <CandleChart symbol={symbol} height={chartH} resizable onHeightChange={setChartH} priceLevels={priceLevels} />
      </div>

      {/* HL-specific stats */}
      {hlMeta && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: 12 }}>
          <div style={{ ...card, padding: "10px 12px" }}>
            <div style={{ fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Leverage</div>
            <div style={{ fontSize: "15px", fontWeight: 600, fontFamily: theme.mono, color: hlMeta.leverage > 5 ? "#f97316" : "var(--text)" }}>{hlMeta.leverage}x</div>
          </div>
          <div style={{ ...card, padding: "10px 12px" }}>
            <div style={{ fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Margin</div>
            <div style={{ fontSize: "15px", fontWeight: 600, fontFamily: theme.mono }}>{fmtUsd(hlMeta.margin, 0)}</div>
          </div>
          <div style={{ ...card, padding: "10px 12px" }}>
            <div style={{ fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Liq Price</div>
            <div style={{ fontSize: "15px", fontWeight: 600, fontFamily: theme.mono, color: "var(--red)" }}>{hlMeta.liquidationPx != null ? fmtUsdPrice(hlMeta.liquidationPx) : "--"}</div>
          </div>
        </div>
      )}

      {/* Normal view — metrics left, lots below (hide for HL-only positions) */}
      {(!hlMeta || lots.length > 0) && (
      <div data-detail-row style={{ display: "flex", gap: "var(--app-hpad, 16px)", marginBottom: 16 }}>
        <div style={{ ...card, flex: 1, padding: '12px 16px' }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div>
              <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>Price</div>
              <div style={{ fontSize: "15px", fontWeight: 600, fontFamily: theme.mono }}>{fmtUsdPrice(price)}</div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>Qty</div>
              <div style={{ fontSize: "15px", fontWeight: 600, fontFamily: theme.mono }}>{fmtQty(totalQty)}</div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>P&L</div>
              <div style={{ fontSize: "15px", fontWeight: 600, fontFamily: theme.mono, color: pnlColor }}>
                {pnl != null ? `${fmtUsd(pnl, 0)} ${fmtPct(pnlPct)}` : "--"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>Avg</div>
              <div style={{ fontSize: "15px", fontWeight: 600, fontFamily: theme.mono }}>{fmtUsdPrice(avgCost)}</div>
            </div>
          </div>
        </div>
        <div style={{ ...card, flex: 1 }}>
          <BasisChart lots={lots} currentPrice={price} />
        </div>
      </div>
      )}
      <style>{`@media (max-width: 639px) { [data-detail-row] { flex-direction: column !important; } }`}</style>
      {(!hlMeta || lots.length > 0) && lotsSection}

      {/* HL recent fills */}
      {hlMeta && recentFills && recentFills.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-dim)", marginBottom: "8px" }}>
            Recent Fills
          </div>
          <div style={{ border: "1px solid var(--card-border)", borderRadius: 12, overflow: "hidden" }}>
            {recentFills.slice(0, 10).map((f, i) => (
              <div key={`${f.hash}-${i}`} style={{ padding: "8px 14px", borderTop: i > 0 ? "1px solid var(--card-border)" : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "10px", fontWeight: 600, fontFamily: theme.mono, color: f.side === "B" ? "var(--green)" : "var(--red)" }}>
                    {f.side === "B" ? "BUY" : "SELL"}
                  </span>
                  <span style={{ fontSize: "11px", fontFamily: theme.mono, color: "var(--text-dim)" }}>{f.sz} @ ${Number(f.px).toFixed(2)}</span>
                  {f.dir && (
                    <span style={{ fontSize: "10px", color: "var(--text-dim)", background: "rgba(255,255,255,0.04)", padding: "1px 4px", borderRadius: 3 }}>
                      {f.dir}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {f.closedPnl && f.closedPnl !== "0" && (
                    <span style={{ fontSize: "11px", fontFamily: theme.mono, color: Number(f.closedPnl) >= 0 ? "var(--green)" : "var(--red)" }}>
                      {Number(f.closedPnl) >= 0 ? "+" : ""}{Number(f.closedPnl).toFixed(2)}
                    </span>
                  )}
                  <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>{new Date(f.time).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
