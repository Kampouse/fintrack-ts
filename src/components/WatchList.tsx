import type { Quote } from "@/types";
import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Search } from "lucide-react";
import { ALL_SYMBOLS, labelFromSymbol, isStock } from "@/lib/constants";
import { fmtUsd, fmtPct, fmtUsdPrice } from "@/lib/format";
import { theme } from "@/lib/styles";
import { Sparkline } from "./Sparkline";
import { TokenIcon } from "./TokenIcon";
import { useQuotes } from "@/hooks/useQuotes";
import { searchSymbols, type SearchResult } from "@/api/finnhub";
import { searchHLCoins } from "@/api/hyperliquid";

const STORAGE_KEY = "fintrack-watchlist";

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return ALL_SYMBOLS.map(c => c.symbol);
}

function saveWatchlist(list: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function WatchList({ onSelect, onClose, compact }: {
  onSelect?: (symbol: string) => void;
  onClose?: () => void;
  compact?: boolean;
}) {
  const [symbols, setSymbols] = useState<string[]>(loadWatchlist);
  const [showPicker, setShowPicker] = useState(false);
  const [filter, setFilter] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
        setFilter("");
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [showPicker]);

  useEffect(() => { saveWatchlist(symbols); }, [symbols]);

  // Debounced search: Finnhub + HL coins in parallel
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (filter.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const [fhResults, hlResults] = await Promise.all([
          searchSymbols(filter.trim()),
          searchHLCoins(filter.trim()).catch(() => [] as { coin: string; mid: number }[]),
        ]);
        const merged: SearchResult[] = [
          ...fhResults,
          ...hlResults.map(h => ({
            symbol: h.coin,
            displaySymbol: h.coin.replace("HL:", ""),
            description: h.mid > 0 ? `$${h.mid.toLocaleString()}` : "Perp",
            type: "Perp" as const,
          })),
        ];
        setSearchResults(merged);
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [filter]);

  const addSymbol = useCallback((sym: string) => {
    setSymbols(prev => prev.includes(sym) ? prev : [...prev, sym]);
  }, []);

  const removeSymbol = useCallback((sym: string) => {
    setSymbols(prev => prev.filter(s => s !== sym));
  }, []);

  const available = ALL_SYMBOLS.filter(c => {
    if (symbols.includes(c.symbol)) return false;
    if (!filter) return true;
    const q = filter.toLowerCase();
    return c.label.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
  });

  const rowH = compact ? 36 : 44;

  // Batch all quotes in one call instead of per-row
  const { quotes } = useQuotes(symbols);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: compact ? "100%" : undefined, position: "relative" }}>
      {/* Search/add picker overlay */}
      {showPicker && (
        <div ref={pickerRef} style={{
          position: "absolute", top: compact ? 0 : 8, left: 0, right: 0,
          margin: compact ? "10px 16px 0" : "14px 18px 0",
          zIndex: 10, borderRadius: 8, border: "1px solid var(--card-border)",
          background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)",
          overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          <div style={{ padding: "6px 8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "6px 10px" }}>
              <Search size={12} color="var(--text-dim)" />
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Search..."
                autoFocus
                style={{ border: "none", background: "none", color: "var(--text)", fontSize: 12, outline: "none", width: "100%", fontFamily: theme.mono }}
              />
            </div>
          </div>
          <div style={{ maxHeight: 140, overflowY: "auto" }}>
            {searching && (
              <div style={{ padding: "6px 10px", fontSize: 10, color: "var(--text-dim)" }}>Searching...</div>
            )}
            {searchResults.length > 0 && filter.trim().length >= 2 && (
              searchResults
                .filter(r => !symbols.includes(r.symbol))
                .map(r => (
                  <button key={r.symbol} onClick={() => addSymbol(r.symbol)} style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 10px",
                    border: "none", borderTop: "1px solid var(--card-border)", background: "none",
                    cursor: "pointer", color: "var(--text)", textAlign: "left",
                  }}>
                    <TokenIcon symbol={r.symbol} size={20} />
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{r.displaySymbol}</span>
                    <span style={{ fontSize: 10, color: "var(--text-dim)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</span>
                    <span style={{ fontSize: 9, color: "var(--text-dim)" }}>{r.type === "Common Stock" ? "S" : r.type === "ETF" ? "E" : r.type === "Perp" ? "P" : "·"}</span>
                    <Plus size={12} color="var(--lime)" />
                  </button>
                ))
            )}
            {(!filter || filter.trim().length < 2) && available.map(c => (
              <button key={c.symbol} onClick={() => addSymbol(c.symbol)} style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 10px",
                border: "none", borderTop: "1px solid var(--card-border)", background: "none",
                cursor: "pointer", color: "var(--text)", textAlign: "left",
              }}>
                <TokenIcon symbol={c.symbol} size={20} />
                <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{c.label}</span>
                <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{c.name}</span>
                <Plus size={12} color="var(--lime)" />
              </button>
            ))}
            {searchResults.length === 0 && !searching && filter.trim().length >= 2 && available.length === 0 && (
              <div style={{ padding: "6px 10px", fontSize: 10, color: "var(--text-dim)" }}>No results</div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: compact ? "10px 16px 6px" : "14px 18px 8px" }}>
        <span style={{ fontSize: compact ? 11 : 13, fontWeight: 600, color: "var(--text-dim)", letterSpacing: "0.06em" }}>WATCHLIST</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => { setShowPicker(!showPicker); setFilter(""); }} style={{
            width: 28, height: 28, borderRadius: 6, border: "none", display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", background: showPicker ? "var(--lime-dim)" : "transparent",
          }}>
            <Plus size={14} color={showPicker ? "var(--lime)" : "var(--text-dim)"} />
          </button>
          {onClose && (
            <button onClick={onClose} style={{
              width: 28, height: 28, borderRadius: 6, border: "none", display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", background: "transparent",
            }}>
              <span style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1 }}>✕</span>
            </button>
          )}
        </div>
      </div>

      {/* Screener table */}
      <div style={{ padding: compact ? "0 16px" : "0 18px", flex: compact ? 1 : undefined, minHeight: 0, maxHeight: compact ? undefined : "calc(70vh - 160px)", overflowY: "auto" }}>
        {/* Column headers */}
        <div style={{ display: "flex", alignItems: "center", padding: "0 0 4px", borderBottom: "1px solid var(--card-border)" }}>
          <span style={{ width: 72, fontSize: 10, color: "var(--text-dim)", fontWeight: 600, letterSpacing: "0.05em" }}>SYMBOL</span>
          <span style={{ flex: 1, fontSize: 10, color: "var(--text-dim)", fontWeight: 600, letterSpacing: "0.05em", textAlign: "right" }}>PRICE</span>
          <span style={{ width: 60, fontSize: 10, color: "var(--text-dim)", fontWeight: 600, letterSpacing: "0.05em", textAlign: "right" }}>CHG%</span>
          <span style={{ width: 56, fontSize: 10, color: "var(--text-dim)", fontWeight: 600, letterSpacing: "0.05em", textAlign: "right" }}>HIGH</span>
          <span style={{ width: 56, fontSize: 10, color: "var(--text-dim)", fontWeight: 600, letterSpacing: "0.05em", textAlign: "right" }}>LOW</span>
          <span style={{ width: 52, fontSize: 10, color: "var(--text-dim)", fontWeight: 600, letterSpacing: "0.05em", textAlign: "right" }}>7D</span>
          {!compact && <span style={{ width: 28, fontSize: 10, color: "var(--text-dim)", fontWeight: 600, letterSpacing: "0.05em", textAlign: "right" }} />}
        </div>

        {symbols.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
            Click + to add tokens
          </div>
        )}
        {symbols.map((sym, i) => (
          <WatchRow key={sym} sym={sym} index={i} onSelect={onSelect} onRemove={removeSymbol} compact={compact} rowH={rowH} quote={quotes[sym]} />
        ))}
      </div>
    </div>
  );
}

function WatchRow({ sym, index, onSelect, onRemove, compact, rowH, quote }: {
  sym: string;
  index: number;
  onSelect?: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  compact?: boolean;
  rowH: number;
  quote?: Quote;
}) {
  const label = labelFromSymbol(sym);
  const price = quote?.price;
  const pct = quote?.changePct;
  const high = quote?.high;
  const low = quote?.low;
  const isUp = pct != null ? pct >= 0 : null;
  const isBg = index % 2 === 1;

  return (
    <div onClick={() => onSelect?.(sym)}
    onContextMenu={e => { e.preventDefault(); onRemove(sym); }}
    style={{
      display: "flex", alignItems: "center", gap: 0,
      borderBottom: "1px solid rgba(255,255,255,0.03)",
      background: isBg ? "rgba(255,255,255,0.015)" : "transparent",
      cursor: "pointer", borderRadius: 2, height: rowH,
    }}
    >
    <div style={{ width: 72, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <TokenIcon symbol={sym} size={compact ? 20 : 24} />
      <span style={{ fontSize: compact ? 12 : 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </div>

    <span style={{
      flex: 1, fontSize: compact ? 12 : 14, fontFamily: theme.mono, textAlign: "right", whiteSpace: "nowrap",
      color: price != null ? "var(--text)" : "var(--text-dim)",
    }}>
      {price != null ? fmtUsd(price) : "--"}
    </span>

    <span style={{
      width: 60, fontSize: compact ? 11 : 12, fontFamily: theme.mono, fontWeight: 600, textAlign: "right", whiteSpace: "nowrap",
      color: isUp === true ? "var(--green)" : isUp === false ? "var(--red)" : "var(--text-dim)",
    }}>
      {pct != null ? fmtPct(pct) : "--"}
    </span>

    <span style={{ width: 56, fontSize: compact ? 10 : 11, fontFamily: theme.mono, textAlign: "right", color: "var(--text-dim)", whiteSpace: "nowrap" }}>
      {high != null ? fmtUsdPrice(high) : "--"}
    </span>

    <span style={{ width: 56, fontSize: compact ? 10 : 11, fontFamily: theme.mono, textAlign: "right", color: "var(--text-dim)", whiteSpace: "nowrap" }}>
      {low != null ? fmtUsdPrice(low) : "--"}
    </span>

    <div style={{ width: 52, height: compact ? 20 : 24, flexShrink: 0 }}>
      <Sparkline symbol={sym} width={compact ? 48 : 52} height={compact ? 20 : 24} />
    </div>

    {!compact && (
      <button
        onClick={e => { e.stopPropagation(); onRemove(sym); }}
        style={{ width: 28, background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: 12, textAlign: "right", padding: 0 }}
      >
        ✕
      </button>
    )}
    </div>
  );
}
