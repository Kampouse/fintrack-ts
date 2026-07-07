import { useState, useEffect, useMemo } from "react";
import { Plus, X, Star, TrendingUp, TrendingDown, BarChart2 } from "lucide-react";
import { getMarketTickers, getTopGainers, getTopLosers, type MarketTicker } from "@/api/binance";
import { searchSymbols, type SearchResult } from "@/api/finnhub";

const MONO = '"SF Mono", "JetBrains Mono", ui-monospace, monospace';

interface Props {
  onSelectSymbol: (symbol: string) => void;
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
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

export function TerminalWidgets({ onSelectSymbol, watchlist, onToggleWatchlist }: Props) {
  const [tickers, setTickers] = useState<MarketTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Fetch market data
  useEffect(() => {
    setLoading(true);
    getMarketTickers()
      .then(setTickers)
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      getMarketTickers().then(setTickers);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Search for symbols
  useEffect(() => {
    if (search.length < 1) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    const timeout = setTimeout(() => {
      searchSymbols(search)
        .then(setSearchResults)
        .finally(() => setSearching(false));
    }, 300);

    return () => clearTimeout(timeout);
  }, [search]);

  const gainers = useMemo(() => getTopGainers(tickers, 5), [tickers]);
  const losers = useMemo(() => getTopLosers(tickers, 5), [tickers]);
  const watched = useMemo(
    () => tickers.filter((t) => watchlist.includes(t.symbol)),
    [tickers, watchlist]
  );

  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Watchlist */}
      <WidgetSection
        title="Watchlist"
        icon={<Star size={12} />}
        action={
          <button
            onClick={() => setShowAdd(!showAdd)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--lime)",
              cursor: "pointer",
              padding: 2,
            }}
          >
            <Plus size={14} />
          </button>
        }
      >
        {/* Add asset form */}
        {showAdd && (
          <div style={{ padding: "4px 8px 8px" }}>
            <input
              type="text"
              placeholder="Search asset..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                background: "var(--card)",
                border: "1px solid var(--card-border)",
                borderRadius: 4,
                color: "var(--text)",
                fontSize: 11,
                outline: "none",
              }}
            />
            {searching && (
              <div style={{ padding: "8px 4px", fontSize: 10, color: "var(--text-dim)" }}>
                Searching...
              </div>
            )}
            {searchResults.length > 0 && (
              <div
                style={{
                  marginTop: 4,
                  background: "var(--card)",
                  border: "1px solid var(--card-border)",
                  borderRadius: 4,
                  maxHeight: 150,
                  overflow: "auto",
                }}
              >
                {searchResults.slice(0, 5).map((r) => {
                  const symbol = r.symbol.includes(":") ? r.symbol : `BINANCE:${r.symbol}USDT`;
                  const isWatched = watchlist.includes(symbol);
                  return (
                    <div
                      key={symbol}
                      onClick={() => {
                        if (!isWatched) onToggleWatchlist(symbol);
                        setSearch("");
                        setSearchResults([]);
                        setShowAdd(false);
                      }}
                      style={{
                        padding: "6px 8px",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 11,
                      }}
                    >
                      <span>
                        <span style={{ fontWeight: 600 }}>{r.displaySymbol}</span>
                        <span style={{ color: "var(--text-dim)", marginLeft: 4, fontSize: 10 }}>
                          {r.description.slice(0, 15)}
                        </span>
                      </span>
                      {isWatched && <Star size={10} fill="var(--lime)" color="var(--lime)" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {watched.length === 0 && !showAdd && (
          <div style={{ padding: "12px 8px", textAlign: "center", color: "var(--text-dim)", fontSize: 10 }}>
            No assets in watchlist.<br />Click + to add.
          </div>
        )}

        {watched.map((t) => (
          <TickerRow
            key={t.symbol}
            ticker={t}
            isWatched
            onClick={() => onSelectSymbol(t.symbol)}
            onRemove={() => onToggleWatchlist(t.symbol)}
          />
        ))}
      </WidgetSection>

      {/* Top Gainers */}
      <WidgetSection title="Top Gainers" icon={<TrendingUp size={12} color="var(--gain)" />}>
        {loading ? (
          <div style={{ padding: 8, color: "var(--text-dim)", fontSize: 10 }}>Loading...</div>
        ) : (
          gainers.map((t) => (
            <TickerRow
              key={t.symbol}
              ticker={t}
              onClick={() => {
                if (!watchlist.includes(t.symbol)) onToggleWatchlist(t.symbol);
                onSelectSymbol(t.symbol);
              }}
            />
          ))
        )}
      </WidgetSection>

      {/* Top Losers */}
      <WidgetSection title="Top Losers" icon={<TrendingDown size={12} color="var(--loss)" />}>
        {loading ? (
          <div style={{ padding: 8, color: "var(--text-dim)", fontSize: 10 }}>Loading...</div>
        ) : (
          losers.map((t) => (
            <TickerRow
              key={t.symbol}
              ticker={t}
              onClick={() => {
                if (!watchlist.includes(t.symbol)) onToggleWatchlist(t.symbol);
                onSelectSymbol(t.symbol);
              }}
            />
          ))
        )}
      </WidgetSection>
    </div>
  );
}

function WidgetSection({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: "1px solid var(--card-border)" }}>
      <div
        style={{
          padding: "8px 10px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "var(--card)",
          position: "sticky",
          top: 0,
          zIndex: 1,
        }}
      >
        {icon}
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {title}
        </span>
        {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
      </div>
      {children}
    </div>
  );
}

function TickerRow({
  ticker,
  isWatched = false,
  showVolume = false,
  onClick,
  onRemove,
}: {
  ticker: MarketTicker;
  isWatched?: boolean;
  showVolume?: boolean;
  onClick: () => void;
  onRemove?: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "6px 10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        cursor: "pointer",
        background: hovered ? "var(--card-active)" : "transparent",
        transition: "background 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {isWatched && <Star size={10} fill="var(--lime)" color="var(--lime)" />}
        <span style={{ fontWeight: 500, fontSize: 11 }}>{ticker.baseAsset}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: MONO, fontSize: 10 }}>
            ${fmtPrice(ticker.price)}
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 9,
              color: ticker.changePercent >= 0 ? "var(--gain)" : "var(--loss)",
            }}
          >
            {ticker.changePercent >= 0 ? "+" : ""}
            {ticker.changePercent.toFixed(1)}%
            {showVolume && ` • ${fmtVol(ticker.quoteVolume)}`}
          </div>
        </div>
        {isWatched && hovered && onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-dim)",
              cursor: "pointer",
              padding: 2,
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}