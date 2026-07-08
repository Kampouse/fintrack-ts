import { useState, useEffect } from "react";
import { X, Search } from "lucide-react";
import { getMarketTickers, type MarketTicker } from "@/api/binance";
import { searchSymbols, type SearchResult } from "@/api/finnhub";

interface Props {
  onClose: () => void;
  onAdd: (symbol: string) => void;
  watchlist?: string[];
}

interface CryptoResult {
  type: "crypto";
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
}

interface StockResult {
  type: "stock";
  symbol: string;
  name: string;
  description: string;
}

type CombinedResult = CryptoResult | StockResult;

export function SearchModal({ onClose, onAdd, watchlist = [] }: Props) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CombinedResult[]>([]);
  const [allTickers, setAllTickers] = useState<MarketTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  // Load all crypto tickers on mount
  useEffect(() => {
    getMarketTickers().then((tickers) => {
      setAllTickers(tickers);
      setLoading(false);
    });
  }, []);

  // Search both crypto and stocks
  useEffect(() => {
    if (search.length < 1) {
      setResults([]);
      return;
    }
    
    setSearching(true);
    const q = search.toLowerCase();
    
    // Filter crypto locally
    const cryptoResults: CryptoResult[] = allTickers
      .filter((t) => 
        t.baseAsset.toLowerCase().includes(q) ||
        t.symbol.toLowerCase().includes(q)
      )
      .slice(0, 10)
      .map((t) => ({
        type: "crypto" as const,
        symbol: t.symbol,
        name: t.baseAsset,
        price: t.price,
        changePercent: t.changePercent,
      }));

    // Search stocks via Finnhub
    const timeout = setTimeout(() => {
      searchSymbols(search)
        .then((stockResults) => {
          const stocks: StockResult[] = (stockResults ?? [])
            .slice(0, 10)
            .map((r) => ({
              type: "stock" as const,
              symbol: r.symbol,
              name: r.displaySymbol,
              description: r.description,
            }));
          
          // Combine results: crypto first, then stocks
          setResults([...cryptoResults, ...stocks]);
          setSearching(false);
        })
        .catch(() => {
          setResults(cryptoResults);
          setSearching(false);
        });
    }, 300);

    return () => clearTimeout(timeout);
  }, [search, allTickers]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card)",
          border: "1px solid var(--card-border)",
          borderRadius: 12,
          width: "100%",
          maxWidth: 400,
          display: "flex",
          flexDirection: "column",
          maxHeight: "70vh",
        }}
      >
        {/* Header - fixed at eye level */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px",
            borderBottom: "1px solid var(--card-border)",
            flexShrink: 0,
          }}
        >
          <Search size={18} color="var(--text-dim)" />
          <input
            type="text"
            placeholder="Search crypto or stocks..."
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

        {/* Results - fixed height, scroll internally */}
        <div style={{ flex: 1, overflow: "auto", minHeight: 200, maxHeight: 300 }}>
          {loading && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
              Loading...
            </div>
          )}

          {!loading && search.length === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
              Type to search for crypto or stocks
            </div>
          )}

          {!loading && results.length > 0 && (
            results.map((r) => {
              const isWatched = watchlist.includes(r.symbol);
              return (
                <div
                  key={r.symbol}
                  onClick={() => {
                    if (!isWatched) {
                      onAdd(r.symbol);
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
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {r.name}
                      {r.type === "stock" && (
                        <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: 6, fontWeight: 400 }}>
                          ({r.symbol})
                        </span>
                      )}
                    </div>
                    {r.type === "crypto" && (
                      <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "monospace" }}>
                        ${r.price >= 1 ? r.price.toFixed(2) : r.price.toFixed(6)}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {r.type === "crypto" && (
                      <div
                        style={{
                          fontSize: 12,
                          fontFamily: "monospace",
                          color: r.changePercent >= 0 ? "var(--gain)" : "var(--loss)",
                        }}
                      >
                        {r.changePercent >= 0 ? "+" : ""}{r.changePercent.toFixed(1)}%
                      </div>
                    )}
                    {r.type === "stock" && (
                      <div style={{ fontSize: 10, color: "var(--lime)", background: "var(--lime-dim)", padding: "2px 6px", borderRadius: 4 }}>
                        STOCK
                      </div>
                    )}
                    {isWatched && (
                      <span style={{ fontSize: 11, color: "var(--lime)" }}>✓ added</span>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {!loading && searching && search.length > 0 && (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
              Searching stocks...
            </div>
          )}

          {!loading && !searching && search.length > 0 && results.length === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
              No results for "{search}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}