import { useState, useEffect, useRef, useCallback } from "react";
import { getUserFills, type HLUserFill } from "@/api/hyperliquid";
import { useHLContext } from "@/contexts/HLContext";

const STORAGE_KEY = "fintrack_equity_curve";
const CACHE_TTL = 60_000; // 1 min — don't re-fetch fills constantly

export interface EquityPoint {
  t: number; // timestamp ms
  v: number; // cumulative realized PnL
}

function loadCached(): { points: EquityPoint[]; ts: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { points: [], ts: 0 };
    return JSON.parse(raw);
  } catch { return { points: [], ts: 0 };
  }
}

function saveCached(points: EquityPoint[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ points, ts: Date.now() }));
  } catch { /* quota */ }
}

function buildFromFills(fills: HLUserFill[]): EquityPoint[] {
  // Sort by time, cumulate closedPnl
  const sorted = [...fills].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  let cum = 0;
  const pts: EquityPoint[] = [];
  for (const f of sorted) {
    const cpnl = parseFloat(f.closedPnl || "0");
    if (cpnl !== 0) {
      cum += cpnl;
      pts.push({ t: (f.time ?? 0) * 1000, v: cum });
    }
  }
  return pts;
}

/** Builds equity curve from HL fills history. */
export function useEquityCurve(_totalValue?: number) {
  const [points, setPoints] = useState<EquityPoint[]>(() => loadCached().points);
  const hl = useHLContext();
  const fetching = useRef(false);

  useEffect(() => {
    const wallet = hl.wallet;
    if (!wallet || fetching.current) return;

    // Check cache freshness
    const cached = loadCached();
    if (cached.points.length > 0 && Date.now() - cached.ts < CACHE_TTL) return;

    fetching.current = true;
    getUserFills(wallet, 500)
      .then((fills) => {
        const pts = buildFromFills(fills);
        saveCached(pts);
        setPoints(pts);
      })
      .catch(() => {}) // silent — use cached data
      .finally(() => { fetching.current = false; });
  }, [hl.wallet]);

  const clear = useCallback(() => {
    setPoints([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { points, clear };
}
