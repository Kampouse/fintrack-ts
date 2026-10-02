/**
 * VelaChart — Vela-powered candlestick chart, drop-in for the classic CandleChart.
 *
 * Same Props contract as CandleChart (symbol/height/resizable/priceLevels/trendlines/
 * tf + trendline callbacks) so consumers can swap by changing the import.
 *
 * Data: Hyperliquid candleSnapshot via getCandles() — same source as CandleChart,
 * fed to Vela as offline bars (no provider fetch path).
 *
 * Vela is Apache-2.0 with an attribution watermark (kept — license requirement).
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Vela } from "@luxalgo/vela";
import type { OHLCV } from "@luxalgo/vela";
import { getCandles } from "@/api/hyperliquid";

export interface PriceLevel {
  price: number;
  label: string;
  color: string;
}

export interface TrendLine {
  id: number;
  startTime: number;  // bar timestamp (ms)
  startPrice: number;
  endTime: number;    // bar timestamp (ms)
  endPrice: number;
  color: string;
  kind?: "line" | "fib";
}

interface Props {
  symbol: string;
  height?: number;
  resizable?: boolean;
  onHeightChange?: (h: number) => void;
  priceLevels?: PriceLevel[];
  trendlines?: TrendLine[];
  onTrendlineAdd?: (tl: TrendLine) => void;
  onTrendlineUpdate?: (tl: TrendLine) => void;
  onTrendlineRemove?: (id: number) => void;
  /** Override default timeframe ("1m" | "15m" | "1h" | "4h" | "1d" | "1w") */
  tf?: string;
}

const TF_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
};

const HL_INTERVAL: Record<string, "1m" | "15m" | "1h" | "4h" | "1d" | "1w"> = {
  "1m": "1m", "5m": "15m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d", "1w": "1w",
};

function resolveTf(tf?: string): { interval: string; ms: number } {
  const key = (tf ?? "1h").toLowerCase();
  const interval = HL_INTERVAL[key] ?? "1h";
  return { interval, ms: TF_MS[interval] };
}

/** align a ms timestamp down to its bar open */
function barOpen(t: number, ms: number): number {
  return Math.floor(t / ms) * ms;
}

// --- multi-provider candle fetching (same chain as the old CandleChart) -----
type RawBar = { time: number; open: number; high: number; low: number; close: number; volume: number };

const BINANCE_INTERVAL: Record<string, string> = {
  "1m": "1m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d", "1w": "1w",
};

async function fetchBinanceKlines(sym: string, interval: string, barCount: number): Promise<RawBar[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(sym)}&interval=${BINANCE_INTERVAL[interval] ?? "1h"}&limit=${Math.min(barCount, 500)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data: unknown[][] = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((k) => ({
    time: Number(k[0]),
    open: parseFloat(String(k[1])),
    high: parseFloat(String(k[2])),
    low: parseFloat(String(k[3])),
    close: parseFloat(String(k[4])),
    volume: parseFloat(String(k[5])),
  }));
}

async function fetchProxyCandles(symbol: string, interval: string, barCount: number): Promise<RawBar[]> {
  // Local dev: vite middleware serves the same core as the prod Pages Function.
  const sec: Record<string, number> = { "1m": 60, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800 };
  const resolution = interval === "1m" ? "1" : interval === "15m" ? "5" : interval === "1h" ? "60" : "D";
  const nowSec = Math.floor(Date.now() / 1000);
  const from = nowSec - barCount * (sec[interval] ?? 86400);
  const res = await fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${nowSec}`);
  if (!res.ok) return [];
  const json = await res.json();
  if (!Array.isArray(json)) return [];
  return json.map((k: { t: number; o: number; h: number; l: number; c: number; v?: number }) => ({
    time: k.t * 1000, open: k.o, high: k.h, low: k.l, close: k.c, volume: k.v ?? 0,
  }));
}

async function fetchBars(symbol: string, interval: string, barCount: number): Promise<RawBar[]> {
  // 1) Hyperliquid venue perps (HL:BTC, HL:xyz:DRAM, ...)
  if (symbol.startsWith("HL:")) {
    const raw = await getCandles(symbol.replace(/^HL:/, ""), interval as "1m" | "15m" | "1h" | "4h" | "1d" | "1w", Date.now() - barCount * (TF_MS[interval] ?? 3600000), Date.now(), barCount);
    return raw;
  }
  // 2) Binance crypto (BINANCE:BTCUSDT, or bare NEAR-USD style pairs)
  try {
    let binanceSym = symbol.replace(/^BINANCE:/, "");
    if (/-USD$/.test(binanceSym)) binanceSym = binanceSym.replace(/-USD$/, "USDT");
    const bars = await fetchBinanceKlines(binanceSym, interval, barCount);
    if (bars.length) return bars;
  } catch { /* fall through */ }
  // 3) Everything else (stocks, symbols Binance doesn't list — XPR etc.)
  return fetchProxyCandles(symbol, interval, barCount);
}

export function VelaChart({
  symbol,
  height = 220,
  resizable = false,
  onHeightChange,
  priceLevels = [],
  trendlines = [],
  onTrendlineAdd,
  onTrendlineUpdate,
  onTrendlineRemove,
  tf,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [localH, setLocalH] = useState(height);

  // vela-id bookkeeping: app-managed drawings (levels + mirrored trendlines)
  // vs user-drawn ones. Vela events only carry {id}, so this set is the filter.
  const managedIds = useRef<Set<string>>(new Set());
  const levelVelaIds = useRef<string[]>([]);
  const tlIdMap = useRef<Map<string, number>>(new Map()); // vela id -> fintrack id
  const tlIdRev = useRef<Map<number, string>>(new Map()); // fintrack id -> vela id

  const cbRef = useRef({ onTrendlineAdd, onTrendlineUpdate, onTrendlineRemove });
  cbRef.current = { onTrendlineAdd, onTrendlineUpdate, onTrendlineRemove };
  const priceLevelsRef = useRef(priceLevels);
  priceLevelsRef.current = priceLevels;

  // --- create chart once per symbol+tf ------------------------------------
  const tfKey = resolveTf(tf).interval;
  useEffect(() => {
    if (!hostRef.current) return;
    let dead = false;
    setLoading(true);
    setError(false);
    managedIds.current.clear();
    levelVelaIds.current = [];
    tlIdMap.current.clear();
    tlIdRev.current.clear();

    (async () => {
      const { interval, ms } = resolveTf(tf);
      const now = Date.now();
      // Scale bar count to host width so narrow columns don't render sub-pixel candles
      const hostW = hostRef.current?.clientWidth || 600;
      const barCount = Math.max(40, Math.min(500, Math.floor(hostW / 3)));
      const start = now - barCount * ms;
      let bars: OHLCV[] = [];
      try {
        const raw = await fetchBars(symbol, interval, barCount);
        if (dead) return;
        bars = raw.map(b => ({
          time: barOpen(b.time, ms), open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
        }));
      } catch {
        if (!dead) setError(true);
        return;
      }
      if (dead || !hostRef.current) return;
      if (!bars.length) { setError(true); return; }
      setLoading(false);

      const chart = new Vela(hostRef.current, {
        data: bars,
        timeframe: interval,
        theme: {
          background: "transparent",
          textColor: "#9ca3af",
          gridColor: "rgba(255,255,255,0.045)",
          borderColor: "rgba(255,255,255,0.09)",
          upColor: "#00ec97",
          downColor: "#ef4444",
          fontFamily: "inherit",
        },
        height: "100%",
        live: false, // offline bars; ticks can be folded via chart.updateBar()
        animations: { intro: { on: false } },
      } as any);
      chartRef.current = chart;
      (window as any).__velaChart = chart; // debug/testing hook

      const addLevels = () => {
        const ids: string[] = [];
        for (const lvl of priceLevelsRef.current) {
          const d = chart.drawings.add("hline", {
            anchors: [{ time: Date.now(), price: lvl.price }],
            style: { lineColor: lvl.color, lineWidth: 1, lineStyle: "dashed" },
            text: { value: lvl.label, size: "small", hAlign: "right", vAlign: "bottom" },
          });
          if (d) { ids.push(d.id); managedIds.current.add(d.id); }
        }
        levelVelaIds.current = ids;
      };
      addLevels();

      // user draws a trendline → report it upward
      chart.on("drawing:created", (e: { id: string }) => {
        if (managedIds.current.has(e.id)) return; // ours (level or mirrored)
        const d = (chart.drawings.all() as any[]).find(x => x.id === e.id);
        if (!d || d.type !== "trendline") return;
        const [a, b] = d.anchors ?? [];
        if (!a || !b) return;
        const fid = Date.now() % 2_147_483_647;
        tlIdMap.current.set(e.id, fid);
        tlIdRev.current.set(fid, e.id);
        cbRef.current.onTrendlineAdd?.({
          id: fid, startTime: a.time, startPrice: a.price, endTime: b.time, endPrice: b.price,
          color: d.style?.lineColor ?? "#38bdf8", kind: "line",
        });
      });

      // user edits a trendline → report new anchors
      chart.on("drawing:edited", (e: { id: string }) => {
        const fid = tlIdMap.current.get(e.id);
        if (fid === undefined) return;
        const d = (chart.drawings.all() as any[]).find(x => x.id === e.id);
        const [a, b] = d?.anchors ?? [];
        if (!a || !b) return;
        cbRef.current.onTrendlineUpdate?.({
          id: fid, startTime: a.time, startPrice: a.price, endTime: b.time, endPrice: b.price,
          color: d?.style?.lineColor ?? "#38bdf8", kind: "line",
        });
      });

      chart.on("drawing:removed", (e: { id: string }) => {
        const fid = tlIdMap.current.get(e.id);
        if (fid === undefined) return;
        tlIdMap.current.delete(e.id);
        tlIdRev.current.delete(fid);
        cbRef.current.onTrendlineRemove?.(fid);
      });
    })();

    return () => {
      dead = true;
      try { chartRef.current?.destroy(); } catch { /* already gone */ }
      chartRef.current = null;
    };
    // symbol/tf changes rebuild the chart; levels/trendlines sync via effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tfKey]);

  // priceLevels → wipe + re-add level drawings (cheap, deterministic)
  const levelKeys = priceLevels.map(p => `${p.price}|${p.label}|${p.color}`).join(";");
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const id of levelVelaIds.current) {
      try { chart.drawings.remove(id); } catch { /* gone */ }
      managedIds.current.delete(id);
    }
    const ids: string[] = [];
    for (const lvl of priceLevels) {
      const d = chart.drawings.add("hline", {
        anchors: [{ time: Date.now(), price: lvl.price }],
        style: { lineColor: lvl.color, lineWidth: 1, lineStyle: "dashed" },
        text: { value: lvl.label, size: "small", hAlign: "right", vAlign: "bottom" },
      });
      if (d) { ids.push(d.id); managedIds.current.add(d.id); }
    }
    levelVelaIds.current = ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelKeys, loading]);

  // controlled trendlines (parent-owned, only when onTrendlineAdd is set)
  const tlKey = trendlines.map(t => `${t.id}:${t.startTime}:${t.startPrice}:${t.endTime}:${t.endPrice}:${t.color}`).join(";");
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onTrendlineAdd) return;
    const want = new Map(trendlines.map(t => [t.id, t]));
    // drop mirrors whose fintrack id vanished from props
    for (const [vid, fid] of [...tlIdMap.current]) {
      if (!want.has(fid) && vid !== undefined) {
        try { chart.drawings.remove(vid); } catch { /* gone */ }
        managedIds.current.delete(vid);
        tlIdMap.current.delete(vid);
        tlIdRev.current.delete(fid);
      }
    }
    // add/update mirrors
    for (const [fid, t] of want) {
      const vid = tlIdRev.current.get(fid);
      const anchors = [{ time: t.startTime, price: t.startPrice }, { time: t.endTime, price: t.endPrice }];
      const style = { lineColor: t.color, lineWidth: 1.5 };
      if (vid) {
        chart.drawings.update(vid, { anchors, style });
      } else {
        const d = chart.drawings.add("trendline", { anchors, style });
        if (d) {
          tlIdMap.current.set(d.id, fid);
          tlIdRev.current.set(fid, d.id);
          managedIds.current.add(d.id);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tlKey, loading]);

  const startResize = useCallback((e: React.MouseEvent) => {
    if (!resizable || !onHeightChange) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = localH;
    const move = (ev: MouseEvent) => {
      onHeightChange(Math.max(120, Math.min(window.innerHeight - 200, startH + (startY - ev.clientY))));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, [resizable, onHeightChange, localH]);

  return (
    <div style={{ position: "relative", height: localH, width: "100%", minHeight: 0 }}>
      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: 12, zIndex: 5 }}>
          Loading {symbol}…
        </div>
      )}
      {error && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: 12, zIndex: 5 }}>
          No data for {symbol}
        </div>
      )}
      <div ref={hostRef} data-vela-chart={symbol} style={{ position: "absolute", inset: 0 }} />
      {resizable && onHeightChange && (
        <div
          onMouseDown={startResize}
          style={{ position: "absolute", left: 0, right: 0, bottom: -3, height: 6, cursor: "ns-resize", zIndex: 6 }}
        />
      )}
    </div>
  );
}
