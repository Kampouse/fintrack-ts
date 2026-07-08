import { useState, useEffect } from "react";
import { X, Search } from "lucide-react";
import { getMarketTickers, type MarketTicker } from "@/api/binance";

interface Props {
  onClose: () => void;
  onAdd: (symbol: string) => void;
  watchlist: string[];
}

export function SearchModal({ onClose, onAdd, watchlist }: Props) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<MarketTicker[]>([]);
  const [allTickers, setAllTickers] = useState<MarketTicker[]>([]);
  const [loading, setLoading] = useState(true);

  // Load all tickers on mount
  useEffect(() => {
    getMarketTickers().then((tickers) => {
      setAllTickers(tickers);
      setLoading(false);
    });
  }, []);

  // Filter locally based on search
  useEffect(() => {
    if (search.length < 1) {
      setResults([]);
      return;
    }
    
    const q = search.toLowerCase();
    const filtered = allTickers
      .filter((t) => 
        t.baseAsset.toLowerCase().includes(q) ||
        t.symbol.toLowerCase().includes(q)
      )
      .slice(0, 20);
    setResults(filtered);
  }, [search, allTickers]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card)",
          border: "1px solid var(--card-border)",
          borderRadius: "16px 16px 0 0",
          width: "100%",
          maxWidth: 500,
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          animation: "slideUp 0.2s ease-out",
        }}
      >
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}</style>
        
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px",
            borderBottom: "1px solid var(--card-border)",
          }}
        >
          <Search size={18} color="var(--text-dim)" />
          <input
            type="text"
            placeholder="Search crypto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text)",
              fontSize: 14,
            }}
          />
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-dim)",
              cursor: "pointer",
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
          {loading && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
              Loading...
            </div>
          )}

          {!loading && search.length === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
              Type to search for crypto assets
            </div>
          )}

          {!loading && results.length > 0 && (
            results.map((t) => {
              const isWatched = watchlist.includes(t.symbol);
              return (
                <div
                  key={t.symbol}
                  onClick={() => {
                    if (!isWatched) {
                      onAdd(t.symbol);
                    }
                    onClose();
                  }}
                  style={{
                    padding: "12px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                    background: isWatched ? "var(--card-active)" : "transparent",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isWatched) e.currentTarget.style.background = "var(--card-active)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isWatched) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.baseAsset}</div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "monospace" }}>
                      ${t.price >= 1 ? t.price.toFixed(2) : t.price.toFixed(6)}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontFamily: "monospace",
                        color: t.changePercent >= 0 ? "var(--gain)" : "var(--loss)",
                      }}
                    >
                      {t.changePercent >= 0 ? "+" : ""}{t.changePercent.toFixed(1)}%
                    </div>
                    {isWatched && (
                      <span style={{ fontSize: 11, color: "var(--lime)" }}>✓ added</span>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {!loading && search.length > 0 && results.length === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
              No results for "{search}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}