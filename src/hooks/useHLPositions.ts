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

const LS_KEY = "fintrack_hl_wallet";
const POLL_MS = 60_000;

function loadLocal(): string | null {
  try { return localStorage.getItem(LS_KEY); } catch { return null; }
}

function saveLocal(addr: string) {
  localStorage.setItem(LS_KEY, addr);
}

function clearLocal() {
  localStorage.removeItem(LS_KEY);
}

/** Map clearinghouse state → enriched positions */
function mapHLPositions(
  hlPositions: HLUserPosition[],
  mids: Record<string, number>,
): EnrichedPosition[] {
  return hlPositions
    .map((hp) => {
      const pos = hp.position;
      if (!pos || Math.abs(parseFloat(String(pos.szi))) === 0) return null;

      const symbol = `HL:${pos.coin}`;
      const size = parseFloat(String(pos.szi));
      const absQty = Math.abs(size);
      const entryPrice = parseFloat(String(pos.entryPx));
      // Use API-provided positionValue and unrealizedPnl when available
      const posValue = parseFloat(String(pos.positionValue ?? 0));
      const rawPnl = parseFloat(String(pos.unrealizedPnl ?? 0));
      const mid = mids[pos.coin];
      const price = mid ?? (posValue > 0 ? posValue / absQty : null);
      const value = posValue > 0 ? posValue : (price != null ? price * absQty : null);
      const totalCost = absQty * entryPrice;
      const pnl = rawPnl !== 0 ? rawPnl : (value != null ? (size > 0 ? value - totalCost : totalCost - value) : null);
      const pnlPct = totalCost > 0 && pnl != null ? (pnl / totalCost) * 100 : null;
      const isShort = size < 0;

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
            ts: Date.now(),
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
          margin: pos.margin ?? 0,
          leverage: pos.leverage?.value ?? 1,
          liquidationPx: pos.liquidationPx != null ? parseFloat(String(pos.liquidationPx)) : null,
          funding: hp.funding ?? 0,
        },
      } as EnrichedPosition & { hlMeta: HLPositionMeta };
    })
    .filter((p): p is NonNullable<typeof p> => p != null);
}

/**
 * Hook to track Hyperliquid account positions.
 *
 * @param nearAccountId - NEAR account for KV sync (pull wallet on connect, push on change). Optional.
 * @param kvPush - callback to push a value to KV under "hl_wallet" key. Optional.
 */
export function useHLPositions(
  nearAccountId?: string | null,
  kvPush?: (data: unknown, key: string) => Promise<void>,
) {
  const [wallet, setWalletState] = useState<string | null>(loadLocal);
  const [positions, setPositions] = useState<EnrichedPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const kvPulled = useRef(false);

  const fetchPositions = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const [hlPositions, mids] = await Promise.all([
        getClearinghouseState(wallet),
        getAllMids(),
      ]);

      const spotBalances = await getSpotUserState(wallet);
      const spotCoins = spotBalances.filter((b) => b.total > 0);

      const mapped = mapHLPositions(hlPositions, mids);

      for (const bal of spotCoins) {
        const mid = mids[bal.coin];
        if (mid == null || mid === 0) continue;
        const symbol = `HL:${bal.coin}`;
        if (mapped.some((p) => p.symbol === symbol)) continue;
        mapped.push({
          symbol,
          label: labelFromSymbol(symbol),
          qty: bal.total,
          totalCost: 0,
          avgCost: mid,
          lots: [
            { id: uid(), symbol, side: "buy" as const, qty: bal.total, price: mid, ts: Date.now() },
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

  // Poll
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

  // Pull HL wallet from KV when NEAR connects (once per session)
  useEffect(() => {
    if (!nearAccountId || kvPulled.current) return;
    kvPulled.current = true;
    pullHLWalletFromKV(nearAccountId).then((remote) => {
      if (remote && !wallet) {
        saveLocal(remote);
        setWalletState(remote);
      }
    });
  }, [nearAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setWallet = useCallback(async (addr: string | null) => {
    if (addr) saveLocal(addr);
    else clearLocal();
    setWalletState(addr);

    // Push to KV if NEAR connected
    if (kvPush && nearAccountId) {
      try {
        await kvPush(addr ?? "", "hl_wallet");
      } catch (e) {
        console.warn("[fintrack] KV push hl_wallet failed:", e);
      }
    }
  }, [kvPush, nearAccountId]);

  return { wallet, setWallet, positions, loading, error, lastFetch, refetch: fetchPositions };
}

/** Pull HL wallet from NEAR KV (standalone, no hook needed) */
async function pullHLWalletFromKV(accountId: string): Promise<string | null> {
  try {
    const url = `https://kv.main.fastnear.com/v0/latest/contextual.near/${accountId}/hl_wallet`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.entries?.[0]?.value ?? null;
  } catch {
    return null;
  }
}
