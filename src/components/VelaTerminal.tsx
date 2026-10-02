import { useEffect, useMemo, useRef, useState } from "react";
import { VelaChart, type PriceLevel } from "./VelaChart";
import { labelFromSymbol } from "@/lib/constants";
import { loadTpsl, saveTpsl, nextTpslLabel, type TpslLevel } from "@/lib/tpsl";

/**
 * Fullscreen chart terminal backed by VelaChart (replaces KiyotakaTerminal).
 * Viewport-fill layout: header bar + chart that auto-tracks the remaining
 * space via ResizeObserver (Vela re-syncs its canvases on box changes).
 * Data comes from VelaChart's provider chain (HL -> Binance -> /api/candles),
 * so HL perps, Binance pairs, stocks and NEAR/XPR-style symbols all work.
 *
 * TP/SL levels are user-placed: click a button (or an existing chip) then click
 * the chart — or drag any unlocked line. Everything persists per symbol.
 */

const TFS = ["1m", "15m", "1h", "4h", "1d", "1w"] as const;
const HEADER_H = 48;
const GREEN = "#00ec97";
const RED = "#ef4444";

interface Props {
  symbol: string;
  /** horizontal price lines: entry, liquidation, ... (locked, from position data) */
  levels?: PriceLevel[];
  onBack: () => void;
}

export default function VelaTerminal({ symbol, levels = [], onBack }: Props) {
  const [tf, setTf] = useState<string>("1h");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [chartH, setChartH] = useState(() => Math.max(200, window.innerHeight - HEADER_H));

  // user-placed TP/SL levels for this symbol (persisted)
  const [tpsl, setTpsl] = useState<TpslLevel[]>(() => loadTpsl(symbol));
  // when non-null: next chart click places this kind of level
  const [placing, setPlacing] = useState<"tp" | "sl" | null>(null);

  // reset local state when the symbol changes
  useEffect(() => {
    setTpsl(loadTpsl(symbol));
    setPlacing(null);
  }, [symbol]);

  const persist = (next: TpslLevel[]) => {
    setTpsl(next);
    saveTpsl(symbol, next);
  };

  const addLevel = (kind: "tp" | "sl", price: number) => {
    const label = nextTpslLabel(tpsl, kind);
    persist([...tpsl, { label, price, kind }]);
  };

  const moveLevel = (label: string, price: number) => {
    persist(tpsl.map((l) => (l.label === label ? { ...l, price } : l)));
  };

  const removeLevel = (label: string) => {
    persist(tpsl.filter((l) => l.label !== label));
  };

  // position lines (entry/liq) stay locked; user TP/SL are draggable
  const allLevels: PriceLevel[] = useMemo(
    () => [
      ...levels.map((l) => ({ ...l, locked: true as const })),
      ...tpsl.map((l) => ({
        price: l.price,
        label: l.label,
        color: l.kind === "tp" ? GREEN : RED,
        locked: false as const,
      })),
    ],
    [levels, tpsl],
  );

  // Track the chart wrapper so the chart always fills the viewport below the header
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setChartH(el.clientHeight));
    ro.observe(el);
    setChartH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (placing) setPlacing(null);
        else onBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack, placing]);

  const chipBtn = (kind: "tp" | "sl"): React.CSSProperties => ({
    background: placing === kind ? (kind === "tp" ? GREEN : RED) : "transparent",
    border: `1px solid ${kind === "tp" ? GREEN : RED}`,
    borderRadius: 6,
    color: placing === kind ? "#0A0A0F" : kind === "tp" ? GREEN : RED,
    fontSize: 12,
    fontWeight: 700,
    padding: "5px 10px",
    cursor: "pointer",
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "#0A0A0F",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: HEADER_H,
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 12px",
          borderBottom: "1px solid #1c1c26",
        }}
      >
        <button
          onClick={onBack}
          title="Back (Esc)"
          style={{
            background: "none",
            border: "1px solid #2a2a38",
            borderRadius: 6,
            color: "#e5e7eb",
            fontSize: 15,
            width: 32,
            height: 32,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ←
        </button>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#f5f5f5" }}>{labelFromSymbol(symbol)}</span>
          <span style={{ fontSize: 11, color: "#6b7280" }}>{symbol}</span>
        </div>

        {/* TP/SL placement */}
        <div style={{ display: "flex", gap: 6, marginLeft: 12 }}>
          <button onClick={() => setPlacing(placing === "tp" ? null : "tp")} style={chipBtn("tp")} title="Click the chart to place a take-profit line">
            + TP
          </button>
          <button onClick={() => setPlacing(placing === "sl" ? null : "sl")} style={chipBtn("sl")} title="Click the chart to place a stop-loss line">
            + SL
          </button>
          {placing && (
            <span style={{ fontSize: 11, color: "#9ca3af", alignSelf: "center" }}>
              click chart to place · Esc to cancel
            </span>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Timeframes */}
        <div style={{ display: "flex", gap: 2, background: "#12121a", borderRadius: 8, padding: 3 }}>
          {TFS.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              style={{
                background: tf === t ? "#1f6f43" : "transparent",
                border: "none",
                borderRadius: 6,
                color: tf === t ? "#ecfdf5" : "#9ca3af",
                fontSize: 12,
                fontWeight: 600,
                padding: "5px 10px",
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Chart fills the rest */}
      <div ref={wrapRef} style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <VelaChart
          symbol={symbol}
          tf={tf}
          height={chartH}
          priceLevels={allLevels}
          interactive
          onLevelMove={moveLevel}
          onLevelRemove={removeLevel}
          placeLevel={placing ? { label: placing } : null}
          onPlaceLevel={(price) => {
            if (!placing) return;
            addLevel(placing, price);
            setPlacing(null);
          }}
        />
      </div>
    </div>
  );
}
