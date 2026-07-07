import { useState, useEffect, useMemo } from "react";
import { getMarketTickers, getTopGainers, getTopLosers, type MarketTicker } from "@/api/binance";

const MONO = '"SF Mono", "JetBrains Mono", ui-monospace, monospace';

interface Props {
  onSelectSymbol?: (symbol: string) => void;
  watchlist?: string[];
  onToggleWatchlist?: (symbol: string) => void;
}

function fmtVol(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(0);
}

function fmtPrice(n: number): string {
  if (n >= 1000) return n.toFixed(0);
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

export function MarketHeatmap({ onSelectSymbol, watchlist = [], onToggleWatchlist }: Props) {
  const [tickers, setTickers] = useState<MarketTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"heatmap" | "gainers" | "losers" | "volume">("heatmap");
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getMarketTickers()
      .then(setTickers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    
    // Refresh every 30s
    const interval = setInterval(() => {
      getMarketTickers().then(setTickers);
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const displayTickers = useMemo(() => {
    switch (view) {
      case "gainers":
        return getTopGainers(tickers, 20);
      case "losers":
        return getTopLosers(tickers, 20);
      case "volume":
        return [...tickers].sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, 20);
      default:
        // For heatmap, take top 40 by volume
        return [...tickers].sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, 40);
    }
  }, [tickers, view]);

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "var(--text-dim)" }}>
        Loading market data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "var(--loss)" }}>
        Failed to load: {error}
      </div>
    );
  }

  if (view === "heatmap") {
    return <HeatmapGrid 
      tickers={displayTickers} 
      onSelectSymbol={onSelectSymbol}
      watchlist={watchlist}
      onToggleWatchlist={onToggleWatchlist}
      hovered={hovered}
      setHovered={setHovered}
    />;
  }

  return (
    <div style={{ padding: "12px", height: "100%", overflow: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}>
      <style>{`::-webkit-scrollbar { display: none }`}</style>
      {/* Tab Bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, marginTop: 8 }}>
        {(["heatmap", "gainers", "losers", "volume"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              background: view === v ? "var(--card-active)" : "transparent",
              border: "1px solid var(--card-border)",
              borderRadius: 6,
              padding: "6px 12px",
              color: view === v ? "var(--lime)" : "var(--text-dim)",
              fontSize: 12,
              fontFamily: MONO,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {v}
          </button>
        ))}
      </div>

      {/* List View */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {displayTickers.map((t) => (
          <div
            key={t.symbol}
            onClick={() => onSelectSymbol?.(t.symbol)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              background: hovered === t.symbol ? "var(--card-active)" : "var(--card)",
              border: "1px solid var(--card-border)",
              borderRadius: 8,
              cursor: "pointer",
            }}
            onMouseEnter={() => setHovered(t.symbol)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{t.baseAsset}</span>
              {watchlist.includes(t.symbol) && (
                <span style={{ fontSize: 10, color: "var(--lime)" }}>★</span>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontFamily: MONO }}>
                ${fmtPrice(t.price)}
              </div>
              <div style={{ 
                fontSize: 11, 
                color: t.changePercent >= 0 ? "var(--gain)" : "var(--loss)",
                fontFamily: MONO,
              }}>
                {t.changePercent >= 0 ? "+" : ""}{t.changePercent.toFixed(2)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatmapGrid({ 
  tickers, 
  onSelectSymbol, 
  watchlist, 
  onToggleWatchlist,
  hovered,
  setHovered,
}: { 
  tickers: MarketTicker[];
  onSelectSymbol?: (symbol: string) => void;
  watchlist: string[];
  onToggleWatchlist?: (symbol: string) => void;
  hovered: string | null;
  setHovered: (s: string | null) => void;
}) {
  if (tickers.length === 0) {
    return <div style={{ padding: 20, textAlign: "center", color: "var(--text-dim)" }}>No data</div>;
  }

  // Calculate grid layout (rows of 4-5)
  const rows: MarketTicker[][] = [];
  for (let i = 0; i < tickers.length; i += 5) {
    rows.push(tickers.slice(i, i + 5));
  }

  // Color scale based on % change
  const getColor = (pct: number): string => {
    if (pct >= 10) return "rgba(34,197,94,0.9)";
    if (pct >= 5) return "rgba(34,197,94,0.7)";
    if (pct >= 2) return "rgba(34,197,94,0.5)";
    if (pct >= 0) return "rgba(34,197,94,0.3)";
    if (pct >= -2) return "rgba(239,68,68,0.3)";
    if (pct >= -5) return "rgba(239,68,68,0.5)";
    if (pct >= -10) return "rgba(239,68,68,0.7)";
    return "rgba(239,68,68,0.9)";
  };

  // Size scale based on volume
  const maxVol = Math.max(...tickers.map(t => t.quoteVolume));
  const getFontSize = (vol: number): number => {
    const ratio = vol / maxVol;
    if (ratio > 0.5) return 14;
    if (ratio > 0.2) return 13;
    if (ratio > 0.05) return 12;
    return 11;
  };

  return (
    <div style={{ padding: "12px", height: "100%", overflow: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}>
      <style>{`::-webkit-scrollbar { display: none }`}</style>
      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, marginBottom: 12, alignItems: "center" }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
          Size = Volume • Color = 24h % Change
        </div>
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "var(--loss)" }}>-10%</span>
          <div style={{ 
            width: 60, 
            height: 8, 
            background: "linear-gradient(to right, rgba(239,68,68,0.9), rgba(239,68,68,0.3), rgba(34,197,94,0.3), rgba(34,197,94,0.9))",
            borderRadius: 4,
          }} />
          <span style={{ fontSize: 10, color: "var(--gain)" }}>+10%</span>
        </div>
      </div>

      {/* Grid */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: "flex", gap: 6, flex: 1 }}>
            {row.map((t) => {
              const isHovered = hovered === t.symbol;
              const isWatched = watchlist.includes(t.symbol);
              return (
                <div
                  key={t.symbol}
                  onClick={() => onSelectSymbol?.(t.symbol)}
                  onMouseEnter={() => setHovered(t.symbol)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "10px 8px",
                    borderRadius: 8,
                    background: getColor(t.changePercent),
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    transition: "transform 0.15s, box-shadow 0.15s",
                    transform: isHovered ? "scale(1.02)" : "scale(1)",
                    boxShadow: isHovered ? "0 4px 12px rgba(0,0,0,0.3)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: getFontSize(t.quoteVolume), color: "#000" }}>
                      {t.baseAsset}
                    </span>
                    {isWatched && <span style={{ fontSize: 10, color: "#000" }}>★</span>}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: MONO, color: "rgba(0,0,0,0.7)" }}>
                    {t.changePercent >= 0 ? "+" : ""}{t.changePercent.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 10, fontFamily: MONO, color: "rgba(0,0,0,0.6)" }}>
                    ${fmtPrice(t.price)} • {fmtVol(t.quoteVolume)}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}