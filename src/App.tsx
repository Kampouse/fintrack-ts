import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useTransactions } from "@/hooks/useTransactions";
import { useQuotes } from "@/hooks/useQuotes";
import { labelFromSymbol } from "@/lib/constants";
import type { EnrichedPosition, Position } from "@/types";
import { PortfolioSummary } from "@/components/PortfolioSummary";
import { PositionCard } from "@/components/PositionCard";
import { PositionDetail } from "@/components/PositionDetail";
import { AddSheet } from "@/components/AddSheet";
import { btnIcon } from "@/lib/styles";

export default function App() {
  const { txs, addLot, updateLot, removeLot } = useTransactions();
  const [showAdd, setShowAdd] = useState(false);
  const [preselectSymbol, setPreselectSymbol] = useState<string | null>(null);
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);

  // Unique symbols from transactions
  const symbols = useMemo(() => [...new Set(txs.map((t) => t.symbol))], [txs]);

  // Live quotes via server-side proxy (key never reaches client)
  const { quotes } = useQuotes(symbols);

  // Aggregate transactions into positions
  const positions: Position[] = useMemo(() => {
    const map = new Map<string, Position>();
    for (const tx of txs) {
      const existing = map.get(tx.symbol);
      if (existing) {
        existing.lots.push(tx);
        existing.qty += tx.qty;
        existing.totalCost += tx.qty * tx.price;
        existing.avgCost = existing.totalCost / existing.qty;
      } else {
        map.set(tx.symbol, {
          symbol: tx.symbol,
          label: labelFromSymbol(tx.symbol),
          qty: tx.qty,
          totalCost: tx.qty * tx.price,
          avgCost: tx.price,
          lots: [tx],
        });
      }
    }
    return [...map.values()];
  }, [txs]);

  // Enrich positions with live quote data
  const enriched: EnrichedPosition[] = useMemo(() => {
    return positions.map((p) => {
      const q = quotes[p.symbol];
      const price = q?.price ?? null;
      const value = price != null ? price * p.qty : null;
      const pnl = value != null ? value - p.totalCost : null;
      const pnlPct = p.totalCost > 0 && pnl != null ? (pnl / p.totalCost) * 100 : null;
      const dayChange = value != null && q?.changePct != null ? (value * q.changePct) / 100 : null;
      return { ...p, price, value, pnl, pnlPct, dayChange, changePct: q?.changePct ?? null };
    });
  }, [positions, quotes]);

  // Detail view
  if (detailSymbol) {
    return (
      <>
        <PositionDetail
          symbol={detailSymbol}
          txs={txs}
          quote={quotes[detailSymbol]}
          onBack={() => setDetailSymbol(null)}
          onRemoveLot={removeLot}
          onEditLot={(lot) => updateLot(lot.id, { qty: lot.qty, price: lot.price, ts: lot.ts })}
          onAddLot={() => {
            setPreselectSymbol(detailSymbol);
            setDetailSymbol(null);
            setShowAdd(true);
          }}
        />
        {showAdd && (
          <AddSheet
            onClose={() => { setShowAdd(false); setPreselectSymbol(null); }}
            onSave={(sym, qty, price) => { addLot(sym, qty, price); setShowAdd(false); setPreselectSymbol(null); }}
            preselect={preselectSymbol}
          />
        )}
      </>
    );
  }

  return (
    <div style={{ maxWidth: "480px", margin: "0 auto", padding: "20px 16px 100px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.02em" }}>Fintrack</h1>
        <button
          onClick={() => setShowAdd(true)}
          style={{ ...btnIcon, background: "var(--lime-dim)" }}
          aria-label="Add"
        >
          <Plus size={18} color="var(--lime)" />
        </button>
      </div>

      {enriched.length > 0 && <PortfolioSummary positions={enriched} />}

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" }}>
        {enriched.map((pos) => (
          <PositionCard key={pos.symbol} pos={pos} onClick={() => setDetailSymbol(pos.symbol)} />
        ))}
      </div>

      {enriched.length === 0 && (
        <div style={{ textAlign: "center", paddingTop: "60px", color: "var(--text-dim)" }}>
          <div style={{ fontSize: "16px", marginBottom: "8px" }}>No positions yet</div>
          <div style={{ fontSize: "14px" }}>Tap + to add your first buy</div>
        </div>
      )}

      {showAdd && (
        <AddSheet
          onClose={() => { setShowAdd(false); setPreselectSymbol(null); }}
          onSave={(sym, qty, price) => { addLot(sym, qty, price); setShowAdd(false); setPreselectSymbol(null); }}
          preselect={preselectSymbol}
        />
      )}
    </div>
  );
}
