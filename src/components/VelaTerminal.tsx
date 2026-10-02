import { useEffect, useRef, useState } from "react";
import { VelaChart } from "./VelaChart";
import { labelFromSymbol } from "@/lib/constants";

/**
 * Fullscreen chart terminal backed by VelaChart (replaces KiyotakaTerminal).
 * Viewport-fill layout: header bar + chart that auto-tracks the remaining
 * space via ResizeObserver (Vela re-syncs its canvases on box changes).
 * Data comes from VelaChart's provider chain (HL -> Binance -> /api/candles),
 * so HL perps, Binance pairs, stocks and NEAR/XPR-style symbols all work.
 */

const TFS = ["1m", "15m", "1h", "4h", "1d", "1w"] as const;
const HEADER_H = 48;

interface Props {
  symbol: string;
  entryPrice?: number;
  onBack: () => void;
}

export default function VelaTerminal({ symbol, entryPrice, onBack }: Props) {
  const [tf, setTf] = useState<string>("1h");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [chartH, setChartH] = useState(() => Math.max(200, window.innerHeight - HEADER_H));

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
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

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
          priceLevels={entryPrice ? [{ price: entryPrice, label: "Entry", color: "#f97316" }] : []}
        />
      </div>
    </div>
  );
}
