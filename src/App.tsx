import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { HashRouter, Routes, Route, useNavigate, useParams, useLocation } from "react-router-dom";
import { Plus, ChevronDown, ChevronUp, LogOut, Wallet, Cloud, CloudOff, Eye, RefreshCw, LayoutGrid, BarChart3, Search } from "lucide-react";
import { useTransactions } from "@/hooks/useTransactions";
import { useQuotes } from "@/hooks/useQuotes";
import { useNearAuth } from "@/contexts/NearAuth";
import { labelFromSymbol } from "@/lib/constants";
import type { EnrichedPosition, Position, Transaction } from "@/types";
import { PortfolioSummary } from "@/components/PortfolioSummary";
import { PositionCard } from "@/components/PositionCard";
import { PositionDetail } from "@/components/PositionDetail";
import { TerminalView } from "@/components/TerminalView";
import { AddSheet } from "@/components/AddSheet";
import { HelpSheet } from "@/components/HelpSheet";
import { WatchList } from "@/components/WatchList";
import { WatchListSheet } from "@/components/WatchListSheet";
import { ChartPreviewSheet } from "@/components/ChartPreviewSheet";
import { SyncSheet, isSyncEnabled, setSyncEnabled } from "@/components/SyncSheet";
import { TabBar } from "@/components/TabBar";
import { SkeletonCard } from "@/components/SkeletonCard";
import { SearchModal } from "@/components/SearchModal";
import { btnIcon, theme } from "@/lib/styles";
import { pullPositions, useSyncPush } from "@/lib/kv";

type SortKey = "value" | "pnl" | "name" | "change";

const SORT_LABELS: Record<SortKey, string> = {
  value: "Value",
  pnl: "P&L",
  name: "Name",
  change: "24h",
};

function PortfolioView() {
  const { txs, setTxs, addLot, updateLot, removeLot } = useTransactions();
  const [showAdd, setShowAdd] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [preselectSymbol, setPreselectSymbol] = useState<string | null>(null);
  const [showWatch, setShowWatch] = useState(false);
  const [showSortDD, setShowSortDD] = useState(false);
  const sortDDRef = useRef<HTMLDivElement>(null);
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortAsc, setSortAsc] = useState(false);
  const [chartPreview, setChartPreview] = useState<string | null>(null);
  const navigate = useNavigate();

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!showSortDD) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (sortDDRef.current && !sortDDRef.current.contains(e.target as Node)) setShowSortDD(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("touchstart", handler); };
  }, [showSortDD]);

  const { accountId, isConnected, connect, disconnect } = useNearAuth();
  const positionSymbols = useMemo(() => [...new Set(txs.map((t) => t.symbol))], [txs]);
  const { quotes } = useQuotes(positionSymbols);

  // Sync state
  const [syncOn, setSyncOn] = useState(isSyncEnabled);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [remoteCount, setRemoteCount] = useState<number | null>(null);
  const { push: pushToKv } = useSyncPush();

  // Probe remote count when sync sheet opens
  useEffect(() => {
    if (!showSync || !isConnected || !syncOn) return;
    pullPositions(accountId!).then((data) => {
      setRemoteCount(data?.length ?? null);
    });
  }, [showSync, isConnected, syncOn, accountId]);

  // Aggregate transactions into positions
  const positions: Position[] = useMemo(() => {
    const map = new Map<string, Position>();
    for (const tx of txs) {
      const existing = map.get(tx.symbol);
      if (existing) {
        existing.lots.push(tx);
        existing.qty += tx.qty;
        existing.totalCost += tx.qty * tx.price;
        existing.avgCost = existing.totalCost / existing.qty;
      } else {
        map.set(tx.symbol, {
          symbol: tx.symbol,
          label: labelFromSymbol(tx.symbol),
          qty: tx.qty,
          totalCost: tx.qty * tx.price,
          avgCost: tx.price,
          lots: [tx],
        });
      }
    }
    return [...map.values()];
  }, [txs]);

  // Enrich positions with live quote data
  const enriched: EnrichedPosition[] = useMemo(() => {
    return positions.map((p) => {
      const q = quotes[p.symbol];
      const price = q?.price ?? null;
      const value = price != null ? price * p.qty : null;
      const pnl = value != null ? value - p.totalCost : null;
      const pnlPct = p.totalCost > 0 && pnl != null ? (pnl / p.totalCost) * 100 : null;
      const dayChange = value != null && q?.changePct != null ? (value * q.changePct) / 100 : null;
      return { ...p, price, value, pnl, pnlPct, dayChange, changePct: q?.changePct ?? null };
    });
  }, [positions, quotes]);

  // Sorted positions
  const sorted = useMemo(() => {
    return [...enriched].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "value": cmp = (b.value ?? 0) - (a.value ?? 0); break;
        case "pnl": cmp = (b.pnl ?? 0) - (a.pnl ?? 0); break;
        case "name": cmp = a.label.localeCompare(b.label); break;
        case "change": cmp = ((b.changePct ?? 0) - (a.changePct ?? 0)); break;
      }
      return sortAsc ? -cmp : cmp;
    });
  }, [enriched, sortKey, sortAsc]);

  // Sync: push
  const handlePush = useCallback(async () => {
    if (!isConnected || syncing) return;
    setSyncing(true);
    try {
      await pushToKv(txs);
      setLastSync(Date.now());
      setRemoteCount(txs.length);
    } catch (e) {
      console.error("[fintrack] sync push failed:", e);
    } finally {
      setSyncing(false);
    }
  }, [isConnected, syncing, txs, pushToKv]);

  // Sync: pull
  const handlePull = useCallback(async () => {
    if (!isConnected || !accountId || syncing) return;
    setSyncing(true);
    try {
      const remote = await pullPositions(accountId);
      if (!remote || remote.length === 0) {
        setSyncing(false);
        return;
      }
      const remoteTxs = remote as Transaction[];
      const localIds = new Set(txs.map(t => t.id));
      const newRemote = remoteTxs.filter(t => !localIds.has(t.id));
      const merged = [...txs, ...newRemote];
      setTxs(merged);
      setLastSync(Date.now());
      setRemoteCount(remoteTxs.length);
      setSyncing(false);
      setShowSync(false);
    } catch {
      setSyncing(false);
    }
  }, [isConnected, accountId, syncing, txs, setTxs]);

  // Toggle sync
  const handleToggleSync = useCallback(() => {
    const next = !syncOn;
    setSyncOn(next);
    setSyncEnabled(next);
    if (!next) {
      setRemoteCount(null);
      setLastSync(null);
    }
  }, [syncOn]);

  return (
    <div style={{ minHeight: "100vh" }} className="portfolio-view">
      <style>{`
        .portfolio-view { padding: 20px var(--app-hpad, 16px) calc(60px + env(safe-area-inset-bottom, 0px)); }
        @media (max-width: 767px) { .portfolio-view { padding: 20px 12px calc(60px + env(safe-area-inset-bottom, 0px)); } }
        @media (min-width: 768px) { 
          .portfolio-content { max-width: 800px; margin: 0 auto; }
        }
      `}</style>

      {/* Desktop header with tabs */}
      <div className="desktop-header">
        <style>{`.desktop-header { display: none; } @media (min-width: 768px) { .desktop-header { display: flex; position: sticky; top: 0; z-index: 100; background: var(--bg); border-bottom: 1px solid var(--card-border); padding: 12px 16px; align-items: center; justify-content: space-between; } }`}</style>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>Fintrack</h1>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid var(--card-border)",
                background: "var(--lime-dim)",
                color: "var(--lime)",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: theme.mono,
                cursor: "pointer",
              }}
            >
              Portfolio
            </button>
            <button
              onClick={() => navigate("/terminal")}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid var(--card-border)",
                background: "transparent",
                color: "var(--text-dim)",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: theme.mono,
                cursor: "pointer",
              }}
            >
              Terminal
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isConnected && (
            <span style={{ fontSize: 12, fontFamily: theme.mono, color: "var(--lime)" }}>
              {accountId}
            </span>
          )}
          <button
            onClick={() => { setPreselectSymbol(null); setShowAdd(true); }}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--card-border)", background: "var(--lime-dim)", color: "var(--lime)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
          >
            + Add
          </button>
        </div>
      </div>

      <div className="portfolio-content">
      {/* Header - mobile only */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }} className="mobile-header">
        <style>{`.mobile-header { } @media (min-width: 768px) { .mobile-header { display: none; } }`}</style>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.02em" }}>Fintrack</h1>
          <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "2px" }}>
            {sorted.length} position{sorted.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {isConnected ? (
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ fontSize: "12px", fontFamily: theme.mono, color: "var(--lime)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {accountId}
              </span>
              <button onClick={disconnect} style={btnIcon} aria-label="Disconnect">
                <LogOut size={14} color="var(--text-dim)" />
              </button>
            </div>
          ) : (
            <button onClick={connect} style={btnIcon} aria-label="Connect NEAR">
              <Wallet size={18} color="#00d4ff" />
            </button>
          )}
          {syncOn && isConnected && (
            <button onClick={handlePull} disabled={syncing} style={{ ...btnIcon, opacity: syncing ? 0.5 : 1 }} aria-label="Pull">
              <RefreshCw size={14} color={syncing ? "var(--lime)" : "var(--text-dim)"} style={{ animation: syncing ? "spin 1s linear infinite" : "none" }} />
            </button>
          )}
          <button onClick={() => setShowSync(true)} style={btnIcon} aria-label="Cloud settings">
            {syncOn && isConnected ? <Cloud size={14} color="#00d4ff" /> : <CloudOff size={14} color="var(--text-dim)" />}
          </button>
        </div>
      </div>

      {enriched.length > 0 && <PortfolioSummary positions={enriched} />}

      {/* Sort dropdown + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: 12, marginBottom: 8 }}>
        {sorted.length > 1 && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowSortDD(!showSortDD)}
              style={{
                padding: "3px 8px", borderRadius: "6px", border: "1px solid var(--card-border)",
                background: "transparent", color: "var(--lime)", fontSize: "11px", fontWeight: 500,
                cursor: "pointer", fontFamily: theme.mono, display: "inline-flex", alignItems: "center", gap: 4,
              }}
            >
              {SORT_LABELS[sortKey]} {sortAsc ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
            {showSortDD && (
              <div ref={sortDDRef} style={{
                position: "absolute", top: "100%", left: 0, marginTop: 4,
                background: "var(--card)", border: "1px solid var(--card-border)", borderRadius: 8,
                overflow: "hidden", minWidth: 100, zIndex: 50,
              }}>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (sortKey === key) setSortAsc(!sortAsc);
                      else { setSortKey(key); setSortAsc(false); }
                      setShowSortDD(false);
                    }}
                    style={{
                      padding: "6px 12px", border: "none", background: "transparent", width: "100%",
                      textAlign: "left", cursor: "pointer", fontSize: "11px", fontFamily: theme.mono,
                      color: sortKey === key ? "var(--lime)" : "var(--text)",
                    }}
                  >
                    {SORT_LABELS[key]} {sortKey === key && (sortAsc ? "↑" : "↓")}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: "6px", alignItems: "center" }}>
          <button onClick={() => setShowWatch(true)} style={btnIcon} aria-label="Watchlist">
            <Eye size={16} color="var(--text-dim)" />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            style={{ ...btnIcon, background: "var(--lime-dim)" }}
            aria-label="Add"
          >
            <Plus size={16} color="var(--lime)" />
          </button>
        </div>
      </div>

      {/* Position list */}
      <div style={{ border: "1px solid var(--card-border)", borderRadius: 16, overflow: "hidden", marginTop: "8px" }}>
        {sorted.length > 0 ? (
          sorted.map((pos) => (
            <PositionCard
              key={pos.symbol}
              pos={pos}
              onClick={() => navigate(`/position/${encodeURIComponent(pos.symbol)}`)}
              onDelete={() => pos.lots.forEach((l) => removeLot(l.id))}
            />
          ))
        ) : txs.length === 0 ? (
          <SkeletonCard count={3} />
        ) : null}
      </div>

      {enriched.length === 0 && txs.length === 0 && (
        <div style={{ textAlign: "center", paddingTop: "60px", color: "var(--text-dim)" }}>
          <div style={{ fontSize: "16px", marginBottom: "8px" }}>No positions yet</div>
          <div style={{ fontSize: "14px" }}>Tap + to add your first buy</div>
        </div>
      )}

      {showAdd && (
        <AddSheet
          onClose={() => { setShowAdd(false); setPreselectSymbol(null); }}
          onSave={(sym, qty, price, note) => { addLot(sym, qty, price, note); setShowAdd(false); setPreselectSymbol(null); }}
          preselect={preselectSymbol}
        />
      )}
      <HelpSheet open={showHelp} onClose={() => { setShowHelp(false); }} />
      {showWatch && (
        <WatchListSheet onClose={() => setShowWatch(false)} onSelect={(sym) => { setChartPreview(sym); }} />
      )}
      <SyncSheet
        open={showSync}
        enabled={syncOn}
        syncing={syncing}
        lastSync={lastSync}
        remoteCount={remoteCount}
        onToggle={handleToggleSync}
        onPull={handlePull}
        onPush={handlePush}
        onClose={() => { setShowSync(false); }}
      />
      {chartPreview && (
        <ChartPreviewSheet symbol={chartPreview} onClose={() => setChartPreview(null)} />
      )}
      <TabBar
        active="portfolio"
        onChange={(tab) => { if (tab === "terminal") navigate("/terminal"); }}
        onAdd={() => { setPreselectSymbol(null); setShowAdd(true); }}
        onWatch={() => setShowWatch(true)}
      />
      </div>
    </div>
  );
}

const TF_OPTIONS = [
  { days: 0, label: "5m" },
  { days: -1, label: "1m" },
  { days: 1, label: "1D" },
  { days: 7, label: "1W" },
  { days: 30, label: "1M" },
] as const;

function TerminalRoute() {
  const { txs, addLot } = useTransactions();
  const { accountId, isConnected, connect, disconnect } = useNearAuth();
  const navigate = useNavigate();
  const positionSymbols = useMemo(() => [...new Set(txs.map((t) => t.symbol))], [txs]);
  const { quotes } = useQuotes(positionSymbols);

  // Terminal toolbar state (lifted from TerminalView)
  const [viewMode, setViewMode] = useState<"positions" | "market">("positions");
  const [timeframe, setTimeframe] = useState(1);
  const [showSearch, setShowSearch] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    const saved = localStorage.getItem("terminal-watchlist");
    return saved ? JSON.parse(saved) : [];
  });

  // Save watchlist
  useEffect(() => {
    localStorage.setItem("terminal-watchlist", JSON.stringify(watchlist));
  }, [watchlist]);

  // Toggle watchlist
  const toggleWatchlist = useCallback((symbol: string) => {
    setWatchlist((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
    );
  }, []);

  // Aggregate transactions into positions
  const positions: Position[] = useMemo(() => {
    const map = new Map<string, Position>();
    for (const tx of txs) {
      const existing = map.get(tx.symbol);
      if (existing) {
        existing.lots.push(tx);
        existing.qty += tx.qty;
        existing.totalCost += tx.qty * tx.price;
        existing.avgCost = existing.totalCost / existing.qty;
      } else {
        map.set(tx.symbol, {
          symbol: tx.symbol,
          label: labelFromSymbol(tx.symbol),
          qty: tx.qty,
          totalCost: tx.qty * tx.price,
          avgCost: tx.price,
          lots: [tx],
        });
      }
    }
    return [...map.values()];
  }, [txs]);

  // Enrich positions with live quote data
  const enriched: EnrichedPosition[] = useMemo(() => {
    return positions.map((p) => {
      const q = quotes[p.symbol];
      const price = q?.price ?? null;
      const value = price != null ? price * p.qty : null;
      const pnl = value != null ? value - p.totalCost : null;
      const pnlPct = p.totalCost > 0 && pnl != null ? (pnl / p.totalCost) * 100 : null;
      const dayChange = value != null && q?.changePct != null ? (value * q.changePct) / 100 : null;
      return { ...p, price, value, pnl, pnlPct, dayChange, changePct: q?.changePct ?? null };
    });
  }, [positions, quotes]);

  const [showAdd, setShowAdd] = useState(false);
  const [preselectSymbol, setPreselectSymbol] = useState<string | null>(null);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`@media(max-width:639px){:root{--app-hpad:12px}}`}</style>
      {/* Desktop header with toolbar integrated */}
      <div className="desktop-header">
        <style>{`.desktop-header { display: none; } @media (min-width: 768px) { .desktop-header { display: flex; padding: 8px 16px; border-bottom: 1px solid var(--card-border); background: var(--bg); align-items: center; justify-content: space-between; gap: 8; } }`}</style>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h1 style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>Fintrack</h1>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => navigate("/")}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid var(--card-border)",
                background: "transparent",
                color: "var(--text-dim)",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: theme.mono,
                cursor: "pointer",
              }}
            >
              Portfolio
            </button>
            <button
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid var(--card-border)",
                background: "var(--lime-dim)",
                color: "var(--lime)",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: theme.mono,
                cursor: "pointer",
              }}
            >
              Terminal
            </button>
          </div>
          {/* View mode toggle */}
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => setViewMode("positions")}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid var(--card-border)",
                background: viewMode === "positions" ? "var(--lime-dim)" : "transparent",
                color: viewMode === "positions" ? "var(--lime)" : "var(--text-dim)",
                fontSize: 11,
                fontWeight: 500,
                fontFamily: theme.mono,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <LayoutGrid size={14} />
              Positions
            </button>
            <button
              onClick={() => setViewMode("market")}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid var(--card-border)",
                background: viewMode === "market" ? "var(--lime-dim)" : "transparent",
                color: viewMode === "market" ? "var(--lime)" : "var(--text-dim)",
                fontSize: 11,
                fontWeight: 500,
                fontFamily: theme.mono,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <BarChart3 size={14} />
              Market
            </button>
          </div>
          {/* Timeframe (only in positions mode) */}
          {viewMode === "positions" && (
            <div style={{ display: "flex", gap: 4 }}>
              {TF_OPTIONS.map((tf, i) => (
                <button
                  key={tf.label}
                  onClick={() => setTimeframe(i)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--card-border)",
                    background: timeframe === i ? "var(--lime-dim)" : "transparent",
                    color: timeframe === i ? "var(--lime)" : "var(--text-dim)",
                    fontSize: 11,
                    fontWeight: 500,
                    fontFamily: theme.mono,
                    cursor: "pointer",
                  }}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isConnected && (
            <span style={{ fontSize: 12, fontFamily: theme.mono, color: "var(--lime)" }}>
              {accountId}
            </span>
          )}
          <button
            onClick={() => { setPreselectSymbol(null); setShowAdd(true); }}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--card-border)", background: "var(--lime-dim)", color: "var(--lime)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
          >
            + Add
          </button>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <TerminalView
          positions={enriched}
          onSelect={(symbol) => navigate(`/position/${encodeURIComponent(symbol)}`)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          watchlist={watchlist}
          onToggleWatchlist={toggleWatchlist}
        />
      </div>
      <TabBar
        active="terminal"
        onChange={(tab) => { if (tab === "portfolio") navigate("/"); }}
        onAdd={() => { setPreselectSymbol(null); setShowAdd(true); }}
        onWatch={() => {}}
      />
      {showAdd && (
        <AddSheet
          onClose={() => { setShowAdd(false); setPreselectSymbol(null); }}
          onSave={(sym, qty, price, note) => { addLot(sym, qty, price, note); setShowAdd(false); setPreselectSymbol(null); }}
          preselect={preselectSymbol}
        />
      )}
    </div>
  );
}

function PositionRoute() {
  const { symbol } = useParams<{ symbol: string }>();
  const decodedSymbol = symbol ? decodeURIComponent(symbol) : "";
  const navigate = useNavigate();
  const { txs, addLot, updateLot, removeLot } = useTransactions();
  const positionSymbols = useMemo(() => {
    const all = new Set(txs.map((t) => t.symbol));
    if (decodedSymbol) all.add(decodedSymbol);
    return [...all];
  }, [txs, decodedSymbol]);
  const { quotes } = useQuotes(positionSymbols);
  const [showAdd, setShowAdd] = useState(false);
  const [preselectSymbol, setPreselectSymbol] = useState<string | null>(null);
  const [terminalView, setTerminalView] = useState(false);

  if (!decodedSymbol) {
    return <div style={{ padding: 20 }}>Position not found</div>;
  }

  return (
    <div style={{ maxWidth: 768, margin: "0 auto", padding: "20px var(--app-hpad, 16px) 40px" }}>
      <style>{`@media(max-width:639px){:root{--app-hpad:12px}}`}</style>
      <PositionDetail
        symbol={decodedSymbol}
        txs={txs}
        quote={quotes[decodedSymbol]}
        onBack={() => navigate(-1)}
        onRemoveLot={removeLot}
        onEditLot={(lot) => updateLot(lot.id, { qty: lot.qty, price: lot.price, ts: lot.ts, note: lot.note })}
        onAddLot={() => {
          setPreselectSymbol(decodedSymbol);
          setShowAdd(true);
        }}
        terminal={terminalView}
        onToggleTerminal={() => setTerminalView(!terminalView)}
      />
      {showAdd && (
        <AddSheet
          onClose={() => { setShowAdd(false); setPreselectSymbol(null); }}
          onSave={(sym, qty, price, note) => { addLot(sym, qty, price, note); setShowAdd(false); setPreselectSymbol(null); }}
          preselect={preselectSymbol}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<PortfolioView />} />
        <Route path="/terminal" element={<TerminalRoute />} />
        <Route path="/position/:symbol" element={<PositionRoute />} />
      </Routes>
    </HashRouter>
  );
}