import { useMemo, type DependencyList } from "react";
import type { Transaction, Quote, Position, EnrichedPosition, RealizedSale } from "@/types";
import { labelFromSymbol } from "@/lib/constants";
import { uid } from "@/lib/format";

/**
 * Aggregate raw transactions into positions with FIFO sell tracking.
 * Sells reduce qty and compute realized P&L against oldest lots.
 */
export function aggregatePositions(txs: Transaction[]): Position[] {
  const map = new Map<string, Position>();

  for (const tx of txs) {
    const existing = map.get(tx.symbol);

    if (tx.side === "buy") {
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
          realized: [],
        });
      }
    } else {
      // Sell: FIFO against oldest lots, compute realized P&L
      if (!existing) continue;
      let qtyToSell = tx.qty;
      while (qtyToSell > 0 && existing.lots.length > 0) {
        const lot = existing.lots[0];
        const match = Math.min(qtyToSell, lot.qty);
        const costBasis = match * lot.price;
        const saleProceeds = match * tx.price;
        const realized = saleProceeds - costBasis;
        const realizedPct = costBasis > 0 ? (realized / costBasis) * 100 : 0;

        existing.realized.push({
          id: uid(),
          ts: tx.ts,
          qty: match,
          price: tx.price,
          costBasis,
          realized,
          realizedPct,
        });

        existing.qty -= match;
        existing.totalCost -= costBasis;
        lot.qty -= match;
        qtyToSell -= match;

        if (lot.qty <= 0) {
          existing.lots.shift();
        }
      }
      // Recalculate avg from remaining lots
      if (existing.qty > 0) {
        existing.avgCost = existing.totalCost / existing.qty;
      } else {
        existing.avgCost = 0;
      }
    }
  }

  return [...map.values()];
}

/**
 * Enrich positions with live quote data (price, value, P&L).
 */
export function enrichPositions(
  positions: Position[],
  quotes: Record<string, Quote | undefined>,
): EnrichedPosition[] {
  return positions.map((p) => {
    const q = quotes[p.symbol];
    const price = q?.price ?? null;
    const value = price != null ? price * p.qty : null;
    const pnl = value != null ? value - p.totalCost : null;
    const pnlPct = p.totalCost > 0 && pnl != null ? (pnl / p.totalCost) * 100 : null;
    const dayChange = value != null && q?.changePct != null ? (value * q.changePct) / 100 : null;
    return { ...p, price, value, pnl, pnlPct, dayChange, changePct: q?.changePct ?? null };
  });
}

/**
 * Combined hook: given txs + quotes, returns enriched positions.
 * Pass `extraDeps` if callers have additional reactive deps.
 */
export function usePositions(
  txs: Transaction[],
  quotes: Record<string, Quote | undefined>,
  extraDeps?: DependencyList,
) {
  return useMemo(() => {
    const positions = aggregatePositions(txs);
    return enrichPositions(positions, quotes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, quotes, ...(extraDeps ?? [])]);
}

/**
 * Get all unique symbols from transactions.
 */
export function positionSymbols(txs: Transaction[]): string[] {
  return [...new Set(txs.map((t) => t.symbol))];
}
