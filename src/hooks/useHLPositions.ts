import { useState, useEffect, useCallback, useRef } from "react";
import type { EnrichedPosition, HLPositionMeta } from "@/types";
import type { HLUserPosition } from "@/api/hyperliquid";
import {
  getClearinghouseState,
  getSpotUserState,
  getAllMids,
} from "@/api/hyperliquid";
import { labelFromSymbol } from "@/lib/constants";
import { uid } from "@/lib/format";

const HL_WALLET_KEY = "fintrack_hl_wallet";
const POLL_MS = 60_000;

function loadHLWallet(): string | null {
  try {
    return localStorage.getItem(HL_WALLET_KEY);
  } catch {
    return null;
  }
}

function saveHLWallet(addr: string) {
  localStorage.setItem(HL_WALLET_KEY, addr);
}

function clearHLWallet() {
  localStorage.removeItem(HL_WALLET_KEY);
}

/** Map clearinghouse state → enriched positions */
function mapHLPositions(
  hlPositions: HLUserPosition[],
  mids: Record<string, number>,
): EnrichedPosition[] {
  return hlPositions
    .map((hp) => {
      const pos = hp.position;
      if (!pos || Math.abs(pos.size) === 0) return null;

      const symbol = `HL:${pos.coin}`;
      const absQty = Math.abs(pos.size);
      const entryPrice = pos.entryPx;
      const mid = mids[pos.coin];
      const price = mid ?? null;
      const value = price != null ? price * absQty : null;
      const totalCost = absQty * entryPrice;
      const pnl = value != null ? (pos.size > 0 ? value - totalCost : totalCost - value) : null;
      const pnlPct = totalCost > 0 && pnl != null ? (pnl / totalCost) * 100 : null;
      const isShort = pos.size < 0;

      return {
        symbol,
        label: labelFromSymbol(symbol) + (isShort ? " (short)" : ""),
        qty: absQty,
        totalCost,
        avgCost: entryPrice,
        lots: [
          {
            id: uid(),
            symbol,
            side: isShort ? ("sell" as const) : ("buy" as const),
            qty: absQty,
            price: entryPrice,
            ts: Date.now(), // synthetic timestamp
          },
        ],
        realized: [],
        source: "hyperliquid" as const,
        price,
        value,
        pnl,
        pnlPct,
        dayChange: null,
        changePct: null,
        hlMeta: {
          margin: pos.margin,
          leverage: pos.leverage?.value ?? 1,
          liquidationPx: pos.liquidationPx,
          funding: hp.funding ?? 0,
        },
      } as EnrichedPosition & { hlMeta: HLPositionMeta };
    })
    .filter((p): p is NonNullable<typeof p> => p != null);
}

export function useHLPositions() {
  const [wallet, setWalletState] = useState<string | null>(loadHLWallet);
  const [positions, setPositions] = useState<EnrichedPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPositions = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const [hlPositions, mids] = await Promise.all([
        getClearinghouseState(wallet),
        getAllMids(),
      ]);

      // Also fetch spot balances with non-zero holdings
      const spotBalances = await getSpotUserState(wallet);
      const spotCoins = spotBalances.filter((b) => b.total > 0);

      const mapped = mapHLPositions(hlPositions, mids);

      // Add spot positions for coins with >0 balance
      for (const bal of spotCoins) {
        const mid = mids[bal.coin];
        if (mid == null || mid === 0) continue;
        const symbol = `HL:${bal.coin}`;
        // Skip if already in perps
        if (mapped.some((p) => p.symbol === symbol)) continue;
        mapped.push({
          symbol,
          label: labelFromSymbol(symbol),
          qty: bal.total,
          totalCost: 0, // unknown cost basis for spot
          avgCost: mid,
          lots: [
            {
              id: uid(),
              symbol,
              side: "buy" as const,
              qty: bal.total,
              price: mid,
              ts: Date.now(),
            },
          ],
          realized: [],
          source: "hyperliquid" as const,
          price: mid,
          value: mid * bal.total,
          pnl: 0,
          pnlPct: 0,
          dayChange: null,
          changePct: null,
        });
      }

      setPositions(mapped);
      setLastFetch(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch HL positions");
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  // Initial fetch + polling
  useEffect(() => {
    if (!wallet) {
      setPositions([]);
      return;
    }
    fetchPositions();
    timerRef.current = setInterval(fetchPositions, POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [wallet, fetchPositions]);

  const setWallet = useCallback((addr: string | null) => {
    if (addr) saveHLWallet(addr);
    else clearHLWallet();
    setWalletState(addr);
  }, []);

  return { wallet, setWallet, positions, loading, error, lastFetch, refetch: fetchPositions };
}
