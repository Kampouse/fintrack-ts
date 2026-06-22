import { useState, useEffect, useRef, useCallback } from "react";
import { X, Search } from "lucide-react";
import type { Quote } from "@/types";
import { ALL_SYMBOLS, tokenIcon, labelFromSymbol } from "@/lib/constants";
import { getQuote, searchSymbols, type SearchResult } from "@/api/finnhub";
import { TokenIcon } from "./TokenIcon";
import { card, input } from "@/lib/styles";
import { fmtUsd } from "@/lib/format";

interface Props {
  onClose: () => void;
  onSave: (symbol: string, qty: number, price: number) => void;
  preselect?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  "Common Stock": "Stock",
  "ETF": "ETF",
  "REIT": "REIT",
  "CRYPTO_DEPOSIT_RECEIPT": "Crypto",
};

export function AddSheet({ onClose, onSave, preselect }: Props) {
  const [symbol, setSymbol] = useState(preselect || "");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [liveQuote, setLiveQuote] = useState<Quote | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const priceRef = useRef(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced symbol search
  const runSearch = useCallback((q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 1) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchSymbols(q.trim());
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  // Auto-fetch live price when symbol changes
  useEffect(() => {
    if (!symbol) {
      setLiveQuote(null);
      return;
    }
    setPriceLoading(true);
    priceRef.current = false;
    getQuote(symbol)
      .then((q) => {
        if (!priceRef.current) {
          setLiveQuote(q);
          setPrice(String(q.price));
        }
      })
      .catch(() => {})
      .finally(() => setPriceLoading(false));
  }, [symbol]);

  const handlePriceChange = (v: string) => {
    priceRef.current = true;
    setPrice(v);
  };

  const pickSearchResult = (r: SearchResult) => {
    setSymbol(r.symbol);
    setSearchQuery("");
    setSearchResults([]);
  };

  const valid = symbol && parseFloat(qty) > 0 && parseFloat(price) > 0;
  const label = preselect ? labelFromSymbol(symbol) : null;
  const showSearchResults = searchQuery.trim().length > 0;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 250 }} />
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--bg)",
          borderTop: "1px solid var(--card-border)",
          borderRadius: "24px 24px 0 0",
          padding: "20px 16px 32px",
          zIndex: 260,
          maxWidth: "480px",
          margin: "0 auto",
          maxHeight: "85vh",
          overflow: "auto",
        }}
        className="sheet-enter"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 600 }}>Add Buy</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px" }}>
            <X size={20} color="var(--text-dim)" />
          </button>
        </div>

        {preselect && label ? (
          <div style={{ ...card, padding: "12px 14px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
            <TokenIcon symbol={symbol} size={28} />
            <span style={{ fontSize: "16px", fontWeight: 600 }}>{label}</span>
          </div>
        ) : (
          <>
            {/* Search field */}
            <div style={{ position: "relative", marginBottom: "12px" }}>
              <Search size={16} color="var(--text-dim)" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="text"
                placeholder="Search any asset..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); runSearch(e.target.value); }}
                style={{ ...input, paddingLeft: "36px" }}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>

            {/* Search results OR crypto quick-grid */}
            {showSearchResults ? (
              <div style={{ marginBottom: "16px", maxHeight: "280px", overflowY: "auto" }}>
                {searching && (
                  <div style={{ textAlign: "center", padding: "20px", color: "var(--text-dim)", fontSize: "13px" }}>Searching...</div>
                )}
                {!searching && searchResults.length === 0 && (
                  <div style={{ textAlign: "center", padding: "20px", color: "var(--text-dim)", fontSize: "13px" }}>No results</div>
                )}
                {!searching && searchResults.map((r) => (
                  <button
                    key={r.symbol}
                    onClick={() => pickSearchResult(r)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 12px",
                      borderRadius: "12px",
                      border: "1px solid transparent",
                      background: "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                      marginBottom: "4px",
                    }}
                  >
                    <TokenIcon symbol={r.symbol} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>{r.displaySymbol}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.description}</div>
                    </div>
                    {r.type && TYPE_LABELS[r.type] && (
                      <span style={{ fontSize: "10px", color: "var(--text-dim)", padding: "2px 6px", borderRadius: "4px", background: "var(--card-border)", flexShrink: 0 }}>{TYPE_LABELS[r.type]}</span>
                    )}
                  </button>
                ))}
              </div>
            ) : symbol ? (
              /* Selected asset chip (from grid tap) */
              <div style={{ ...card, padding: "12px 14px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                <TokenIcon symbol={symbol} size={28} />
                <span style={{ fontSize: "16px", fontWeight: 600 }}>{labelFromSymbol(symbol)}</span>
                <button
                  onClick={() => setSymbol("")}
                  style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", padding: "4px" }}
                >
                  <X size={16} color="var(--text-dim)" />
                </button>
              </div>
            ) : (
              /* Crypto quick-grid (original) */
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
                {ALL_SYMBOLS.map((c) => (
                  <button
                    key={c.symbol}
                    onClick={() => setSymbol(c.symbol)}
                    style={{
                      padding: "10px 8px",
                      borderRadius: "12px",
                      border: symbol === c.symbol ? "1px solid var(--lime)" : "1px solid var(--card-border)",
                      background: symbol === c.symbol ? "var(--lime-dim)" : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <TokenIcon symbol={c.symbol} size={20} />
                    <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text)" }}>{c.label}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ marginBottom: "12px" }}>
          <input type="number" inputMode="decimal" placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} style={input} />
        </div>
        <div style={{ marginBottom: "8px" }}>
          {priceLoading && <div style={{ fontSize: "11px", color: "var(--lime)", marginBottom: "6px", paddingLeft: "4px" }}>fetching live price...</div>}
          {!priceLoading && liveQuote && price && !priceRef.current && (
            <div style={{ fontSize: "11px", color: "var(--lime)", marginBottom: "6px", paddingLeft: "4px" }}>
              {`\u25CF live: ${fmtUsd(liveQuote.price)}`}
            </div>
          )}
          <input
            type="number"
            inputMode="decimal"
            placeholder="Buy price (USD)"
            value={price}
            onChange={(e) => handlePriceChange(e.target.value)}
            style={input}
          />
        </div>

        <button
          onClick={() => valid && onSave(symbol, parseFloat(qty), parseFloat(price))}
          disabled={!valid}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "12px",
            border: "none",
            background: valid ? "#22c55e" : "var(--card-border)",
            color: valid ? "#fff" : "var(--text-dim)",
            fontSize: "15px",
            fontWeight: 600,
            cursor: valid ? "pointer" : "default",
            marginTop: "12px",
          }}
        >
          Add Buy
        </button>
      </div>
    </>
  );
}
