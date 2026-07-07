import { useState } from "react";
import { X, Search } from "lucide-react";
import { searchSymbols, type SearchResult } from "@/api/finnhub";

interface Props {
  onClose: () => void;
  onAdd: (symbol: string) => void;
  watchlist: string[];
}

export function SearchModal({ onClose, onAdd, watchlist }: Props) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = (q: string) => {
    setSearch(q);
    if (q.length < 1) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(() => {
      searchSymbols(q)
        .then(setResults)
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timeout);
  };

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
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderBottom: "1px solid var(--card-border)",
          }}
        >
          <Search size={18} color="var(--text-dim)" />
          <input
            type="text"
            placeholder="Search crypto..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
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
          {searching && (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
              Searching...
            </div>
          )}

          {!searching && search.length === 0 && (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
              Type to search for crypto assets
            </div>
          )}

          {!searching && results.length > 0 && (
            results.slice(0, 10).map((r) => {
              const symbol = r.symbol.includes(":") ? r.symbol : `BINANCE:${r.symbol}USDT`;
              const isWatched = watchlist.includes(symbol);
              return (
                <div
                  key={symbol}
                  onClick={() => {
                    if (!isWatched) {
                      onAdd(symbol);
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
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.displaySymbol}</div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{r.description}</div>
                  </div>
                  {isWatched && (
                    <span style={{ fontSize: 10, color: "var(--lime)" }}>In watchlist</span>
                  )}
                </div>
              );
            })
          )}

          {!searching && search.length > 0 && results.length === 0 && (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
              No results found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}