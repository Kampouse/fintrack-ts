import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { TrendingUp, TrendingDown, Move, LayoutGrid, BarChart3, SidebarOpen, SidebarClose, Search } from "lucide-react";
import { SearchModal } from "./SearchModal";
import type { EnrichedPosition } from "@/types";
import { CandleChart } from "./CandleChart";
import { TerminalWidgets } from "./TerminalWidgets";
import { MarketHeatmap } from "./MarketHeatmap";
import { ChartModal } from "./ChartModal";
import { fmtUsd, fmtUsdPrice, fmtPct, fmtQty } from "@/lib/format";
import { theme } from "@/lib/styles";

interface Props {
  positions: EnrichedPosition[];
  onSelect: (symbol: string) => void;
  viewMode?: "positions" | "market";
  onViewModeChange?: (mode: "positions" | "market") => void;
  timeframe?: number;
  onTimeframeChange?: (index: number) => void;
  watchlist?: string[];
  onToggleWatchlist?: (symbol: string) => void;
}

const TF_OPTIONS = [
  { days: 0, label: "5m" },
  { days: -1, label: "1m" },
  { days: 1, label: "1D" },
  { days: 7, label: "1W" },
  { days: 30, label: "1M" },
] as const;

interface PanelState {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function TerminalView({ positions, onSelect, viewMode: externalViewMode, onViewModeChange, timeframe: externalTimeframe, onTimeframeChange, watchlist: externalWatchlist, onToggleWatchlist }: Props) {
  const [timeframe, setTimeframe] = useState(1);
  const [viewMode, setViewMode] = useState<"positions" | "market">("positions");
  const [showWidgets, setShowWidgets] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [modalSymbol, setModalSymbol] = useState<string | null>(null);
  const modalEntryPrice = useMemo(() => {
    if (!modalSymbol) return undefined;
    const pos = positions.find(p => p.symbol === modalSymbol);
    return pos?.hlMeta?.entryPx ?? pos?.avgCost;
  }, [modalSymbol, positions]);
  const [showSearch, setShowSearch] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    const saved = localStorage.getItem("terminal-watchlist");
    return saved ? JSON.parse(saved) : [];
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Use external props on desktop, internal state on mobile
  const effectiveViewMode = externalViewMode ?? viewMode;
  const effectiveTimeframe = externalTimeframe ?? timeframe;
  const effectiveWatchlist = externalWatchlist ?? watchlist;

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Show widgets by default on desktop, hide on mobile
  useEffect(() => {
    setShowWidgets(!isMobile);
  }, [isMobile]);

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

  // Panel positions - each symbol has its own x, y, width, height
  const [panels, setPanels] = useState<Record<string, PanelState>>({});
  const [dragging, setDragging] = useState<{
    symbol: string;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [resizing, setResizing] = useState<{
    symbol: string;
    direction: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startLeft: number;
    startTop: number;
  } | null>(null);

  // Sort by value
  const sorted = useMemo(() => {
    return [...positions].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  }, [positions]);

  // Calculate panel grid based on screen size
  const calculateGrid = useCallback(() => {
    if (sorted.length === 0) return;

    const containerWidth = containerRef.current?.clientWidth || window.innerWidth - 240; // Account for sidebar
    const containerHeight = window.innerHeight - 100; // Account for header and padding
    
    // Calculate columns based on container width (min card width 280px)
    const cols = Math.max(1, Math.floor(containerWidth / 280));
    const rows = Math.ceil(sorted.length / cols);
    
    const cardWidth = (containerWidth - 16 - (cols - 1) * 8) / cols;
    const cardHeight = Math.max(200, (containerHeight - 16 - (rows - 1) * 8) / rows);

    const newPanels: Record<string, PanelState> = {};
    sorted.forEach((pos, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      newPanels[pos.symbol] = {
        x: 8 + col * (cardWidth + 8),
        y: 8 + row * (cardHeight + 8),
        width: cardWidth,
        height: cardHeight,
      };
    });

    setPanels(newPanels);
  }, [sorted]);

  // Initialize panels on mount and resize
  useEffect(() => {
    // Check for saved positions first
    const saved = localStorage.getItem("terminal-panels");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const hasAllPositions = sorted.every(pos => parsed[pos.symbol]);
        if (hasAllPositions) {
          setPanels(parsed);
          return;
        }
      } catch {}
    }
    
    calculateGrid();
  }, [sorted, calculateGrid]);

  // Recalculate on window resize
  useEffect(() => {
    const handleResize = () => {
      // Only recalculate if no saved positions
      if (!localStorage.getItem("terminal-panels")) {
        calculateGrid();
      }
    };
    
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [calculateGrid]);

  // Save panels
  useEffect(() => {
    if (Object.keys(panels).length > 0) {
      localStorage.setItem("terminal-panels", JSON.stringify(panels));
    }
  }, [panels]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent, symbol: string) => {
    e.preventDefault();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const panel = panels[symbol];

    setDragging({
      symbol,
      startX: clientX,
      startY: clientY,
      offsetX: clientX - panel.x,
      offsetY: clientY - panel.y,
    });
  }, [panels]);

  const handleResizeStart = useCallback((
    e: React.MouseEvent | React.TouchEvent,
    symbol: string,
    direction: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const panel = panels[symbol];

    setResizing({
      symbol,
      direction,
      startX: clientX,
      startY: clientY,
      startWidth: panel.width,
      startHeight: panel.height,
      startLeft: panel.x,
      startTop: panel.y,
    });
  }, [panels]);

  // Mouse/touch move
  useEffect(() => {
    if (!dragging && !resizing) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      if (dragging) {
        setPanels(prev => {
          const panel = prev[dragging.symbol];
          if (!panel) return prev;
          return {
            ...prev,
            [dragging.symbol]: {
              ...panel,
              x: clientX - dragging.offsetX,
              y: clientY - dragging.offsetY,
            },
          };
        });
      }

      if (resizing) {
        const deltaX = clientX - resizing.startX;
        const deltaY = clientY - resizing.startY;

        setPanels(prev => {
          const current = prev[resizing.symbol];
          let newX = current.x;
          let newY = current.y;
          let newW = current.width;
          let newH = current.height;

          if (resizing.direction.includes("e")) {
            newW = Math.max(150, resizing.startWidth + deltaX);
          }
          if (resizing.direction.includes("w")) {
            newW = Math.max(150, resizing.startWidth - deltaX);
            newX = resizing.startLeft + (resizing.startWidth - newW);
          }
          if (resizing.direction.includes("s")) {
            newH = Math.max(150, resizing.startHeight + deltaY);
          }
          if (resizing.direction.includes("n")) {
            newH = Math.max(150, resizing.startHeight - deltaY);
            newY = resizing.startTop + (resizing.startHeight - newH);
          }

          return {
            ...prev,
            [resizing.symbol]: { x: newX, y: newY, width: newW, height: newH },
          };
        });
      }
    };

    const handleEnd = () => {
      setDragging(null);
      setResizing(null);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleEnd);
    document.addEventListener("touchmove", handleMove);
    document.addEventListener("touchend", handleEnd);

    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchmove", handleMove);
      document.removeEventListener("touchend", handleEnd);
    };
  }, [dragging, resizing]);

  const days = TF_OPTIONS[timeframe].days;

  // Reset layout
  const resetLayout = useCallback(() => {
    localStorage.removeItem("terminal-panels");
    calculateGrid();
  }, [calculateGrid]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      className="terminal-view"
    >
      <style>{`
        .terminal-toolbar { position: sticky; top: 0; z-index: 100; }
        @media (min-width: 768px) { .terminal-toolbar { display: none !important; } }
        @media (max-width: 767px) { 
          .terminal-content { 
            padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px)); 
          } 
        }
      `}</style>
      {/* Toolbar */}
      <div className="terminal-toolbar" style={{
        background: "var(--bg)",
        padding: "8px",
        borderBottom: "1px solid var(--card-border)",
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
      }}>
        {/* View Mode Toggle */}
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => onViewModeChange ? onViewModeChange("positions") : setViewMode("positions")}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--card-border)",
              background: effectiveViewMode === "positions" ? "var(--lime-dim)" : "transparent",
              color: effectiveViewMode === "positions" ? "var(--lime)" : "var(--text-dim)",
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
            onClick={() => onViewModeChange ? onViewModeChange("market") : setViewMode("market")}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--card-border)",
              background: effectiveViewMode === "market" ? "var(--lime-dim)" : "transparent",
              color: effectiveViewMode === "market" ? "var(--lime)" : "var(--text-dim)",
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

        {/* Timeframe */}
        {effectiveViewMode === "positions" && (
          <div style={{ display: "flex", gap: 4 }}>
            {TF_OPTIONS.map((tf, i) => (
              <button
                key={tf.label}
                onClick={() => onTimeframeChange ? onTimeframeChange(i) : setTimeframe(i)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--card-border)",
                  background: effectiveTimeframe === i ? "var(--lime-dim)" : "transparent",
                  color: effectiveTimeframe === i ? "var(--lime)" : "var(--text-dim)",
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

        {/* Search button */}
        <button
          onClick={() => setShowSearch(true)}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid var(--card-border)",
            background: "transparent",
            color: "var(--text-dim)",
            fontSize: 11,
            fontWeight: 500,
            fontFamily: theme.mono,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Search size={14} />
          <span style={{ display: isMobile ? "none" : "inline" }}>Add</span>
        </button>

        {/* Reset button */}
        <button
          onClick={resetLayout}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid var(--card-border)",
            background: "transparent",
            color: "var(--text-dim)",
            fontSize: 11,
            fontWeight: 500,
            fontFamily: theme.mono,
            cursor: "pointer",
          }}
        >
          Reset
        </button>

        {/* Widget toggle (mobile) */}
        {isMobile && (
          <button
            onClick={() => setShowWidgets(!showWidgets)}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--card-border)",
              background: "transparent",
              color: "var(--text-dim)",
              cursor: "pointer",
            }}
          >
            {showWidgets ? <SidebarClose size={16} /> : <SidebarOpen size={16} />}
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Widgets sidebar */}
        {showWidgets && effectiveViewMode === "positions" && (
          <>
            {isMobile && showWidgets && (
              <div
                onClick={() => setShowWidgets(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.5)",
                  zIndex: 99,
                }}
              />
            )}
            <div
              style={{
                width: isMobile ? 260 : 220,
                minWidth: isMobile ? 260 : 220,
                height: "100%",
                overflow: "auto",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                borderRight: "1px solid var(--card-border)",
                background: "var(--bg)",
                display: "flex",
                flexDirection: "column",
                position: isMobile ? "fixed" : "relative",
                left: isMobile ? 0 : "auto",
                top: isMobile ? 0 : "auto",
                zIndex: isMobile ? 100 : "auto",
              }}
            >
              <style>{`.terminal-sidebar::-webkit-scrollbar { display: none }`}</style>
              <TerminalWidgets
                onSelectSymbol={(symbol) => setModalSymbol(symbol)}
                watchlist={effectiveWatchlist}
                onToggleWatchlist={toggleWatchlist}
              />
            </div>
          </>
        )}

        {/* Main chart area */}
        <div 
          style={{ 
            flex: 1, 
            position: "relative", 
            overflow: "auto",
          }}
        >
          {effectiveViewMode === "positions" && (
            isMobile ? (
              /* Mobile: scrollable card list */
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}>
                {sorted.map((pos) => (
                  <MobilePositionCard
                    key={pos.symbol}
                    position={pos}
                    onClick={() => setModalSymbol(pos.symbol)}
                  />
                ))}
              </div>
            ) : (
              /* Desktop: draggable canvas panels */
              sorted.map((pos) => {
                const panel = panels[pos.symbol];
                if (!panel) return null;
                return (
                  <TerminalCard
                    key={pos.symbol}
                    position={pos}
                    panel={panel}
                    days={days}
                    isDragging={dragging?.symbol === pos.symbol}
                    onDragStart={(e) => handleDragStart(e, pos.symbol)}
                    onResizeStart={handleResizeStart}
                  />
                );
              })
            )
          )}
          {effectiveViewMode === "market" && (
            <MarketHeatmap
              onSelectSymbol={(symbol) => setModalSymbol(symbol)}
              watchlist={effectiveWatchlist}
              onToggleWatchlist={toggleWatchlist}
            />
          )}
        </div>
      </div>

      {effectiveViewMode === "positions" && sorted.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-dim)" }}>
          No positions found
        </div>
      )}

      <ChartModal symbol={modalSymbol} entryPrice={modalEntryPrice} onClose={() => setModalSymbol(null)} />
      
      {showSearch && (
        <SearchModal
          onClose={() => setShowSearch(false)}
          onAdd={(symbol) => {
            toggleWatchlist(symbol);
            setShowSearch(false);
          }}
          watchlist={watchlist}
        />
      )}
    </div>
  );
}

/* Mobile: compact position card - tap to open chart modal */
function MobilePositionCard({ position, onClick }: {
  position: EnrichedPosition;
  onClick: () => void;
}) {
  const pnlColor = position.pnl != null && position.pnl >= 0 ? "var(--green)" : "var(--red)";
  const isUp = position.changePct != null ? position.changePct >= 0 : null;

  return (
    <div
      style={{
        background: "var(--card)",
        borderRadius: 12,
        border: "1px solid var(--card-border)",
        overflow: "hidden",
      }}
    >
      {/* Header - clickable to open modal */}
      <div
        onClick={onClick}
        style={{
          padding: "10px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{position.symbol}</span>
          <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: theme.mono }}>
            {position.qty != null ? fmtQty(position.qty) : "--"}
          </span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: theme.mono, fontSize: 13 }}>
            {position.value != null ? fmtUsd(position.value, 0) : "--"}
          </div>
          <div style={{ fontFamily: theme.mono, fontSize: 11, color: pnlColor }}>
            {position.pnl != null ? `${position.pnl >= 0 ? "+" : ""}${fmtUsd(position.pnl, 0)}` : "--"}
          </div>
        </div>
      </div>

      {/* P&L bar */}
      <div style={{ height: 3, background: "var(--card-border)" }}>
        {position.value != null && position.pnl != null && (
          <div
            style={{
              width: `${Math.min(100, Math.abs(position.pnl) / position.value * 100)}%`,
              height: "100%",
              background: pnlColor,
              marginLeft: position.pnl >= 0 ? "auto" : 0,
            }}
          />
        )}
      </div>

      {/* Mini chart */}
      <div style={{ height: 120, background: "rgba(0,0,0,0.15)" }}>
        <CandleChart symbol={position.symbol} height={120} priceLevels={position.hlMeta?.entryPx ? [{ price: position.hlMeta.entryPx, label: "Entry", color: "#f97316" }] : []} />
      </div>

      {/* Footer */}
      <div style={{
        padding: "8px 12px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
          {isUp != null ? (isUp ? "▲" : "▼") : "—"} {position.changePct != null ? fmtPct(position.changePct) : "--"}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
          {position.price != null ? fmtUsdPrice(position.price) : "--"}
        </span>
      </div>
    </div>
  );
}

function TerminalCard({
  position,
  panel,
  days,
  isDragging,
  onDragStart,
  onResizeStart,
}: {
  position: EnrichedPosition;
  panel: PanelState;
  days: number;
  isDragging: boolean;
  onDragStart: (e: React.MouseEvent | React.TouchEvent) => void;
  onResizeStart: (e: React.MouseEvent | React.TouchEvent, symbol: string, direction: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw") => void;
}) {
  const pnlColor = position.pnl != null && position.pnl >= 0 ? "var(--green)" : "var(--red)";
  const isUp = position.changePct != null ? position.changePct >= 0 : null;

  return (
    <div
      style={{
        position: "absolute",
        left: panel.x,
        top: panel.y,
        width: panel.width,
        height: panel.height,
        border: "1px solid var(--card-border)",
        borderRadius: 12,
        overflow: "hidden",
        background: "var(--card)",
        boxShadow: isDragging ? "0 8px 32px rgba(0,0,0,0.3)" : "0 2px 8px rgba(0,0,0,0.1)",
        userSelect: "none",
        zIndex: isDragging ? 1000 : 1,
        transition: isDragging ? "none" : "box-shadow 0.15s ease",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header - draggable */}
      <div
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
        style={{
          padding: "6px 10px",
          cursor: "grab",
          borderBottom: "1px solid var(--card-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--card)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{position.symbol}</span>
          <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: theme.mono }}>
            {position.qty != null ? fmtQty(position.qty) : "--"}
          </span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: theme.mono, fontSize: 11 }}>
            {position.value != null ? fmtUsd(position.value, 0) : "--"}
          </div>
          <div style={{ fontFamily: theme.mono, fontSize: 10, color: pnlColor }}>
            {position.pnl != null ? `${position.pnl >= 0 ? "+" : ""}${fmtUsd(position.pnl, 0)}` : "--"}
          </div>
        </div>
      </div>

      {/* P&L bar */}
      <div style={{ height: 4, background: "var(--card-border)" }}>
        {position.value != null && position.pnl != null && (
          <div
            style={{
              width: `${Math.min(100, Math.abs(position.pnl) / position.value * 100)}%`,
              height: "100%",
              background: pnlColor,
              marginLeft: position.pnl >= 0 ? "auto" : 0,
            }}
          />
        )}
      </div>

      {/* Chart */}
      <div style={{ 
        flex: 1,
        background: "rgba(0,0,0,0.15)", 
        overflow: "hidden",
      }}>
        <CandleChart symbol={position.symbol} height={panel.height - 70} priceLevels={position.hlMeta?.entryPx ? [{ price: position.hlMeta.entryPx, label: "Entry", color: "#f97316" }] : []} />
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "4px 10px",
          borderTop: "1px solid var(--card-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
          {isUp != null ? (isUp ? "▲" : "▼") : "—"} {position.changePct != null ? fmtPct(position.changePct) : "--"}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
          {position.price != null ? fmtUsdPrice(position.price) : "--"}
        </span>
      </div>

      {/* Resize handles */}
      <div onMouseDown={(e) => onResizeStart(e, position.symbol, "n")} onTouchStart={(e) => onResizeStart(e, position.symbol, "n")} style={{ position: "absolute", top: 0, left: 10, right: 10, height: 6, cursor: "ns-resize", zIndex: 10 }} />
      <div onMouseDown={(e) => onResizeStart(e, position.symbol, "s")} onTouchStart={(e) => onResizeStart(e, position.symbol, "s")} style={{ position: "absolute", bottom: 0, left: 10, right: 10, height: 6, cursor: "ns-resize", zIndex: 10 }} />
      <div onMouseDown={(e) => onResizeStart(e, position.symbol, "e")} onTouchStart={(e) => onResizeStart(e, position.symbol, "e")} style={{ position: "absolute", right: 0, top: 10, bottom: 10, width: 6, cursor: "ew-resize", zIndex: 10 }} />
      <div onMouseDown={(e) => onResizeStart(e, position.symbol, "w")} onTouchStart={(e) => onResizeStart(e, position.symbol, "w")} style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 6, cursor: "ew-resize", zIndex: 10 }} />
      <div onMouseDown={(e) => onResizeStart(e, position.symbol, "ne")} onTouchStart={(e) => onResizeStart(e, position.symbol, "ne")} style={{ position: "absolute", top: 0, right: 0, width: 10, height: 10, cursor: "nesw-resize", zIndex: 10 }} />
      <div onMouseDown={(e) => onResizeStart(e, position.symbol, "nw")} onTouchStart={(e) => onResizeStart(e, position.symbol, "nw")} style={{ position: "absolute", top: 0, left: 0, width: 10, height: 10, cursor: "nwse-resize", zIndex: 10 }} />
      <div onMouseDown={(e) => onResizeStart(e, position.symbol, "se")} onTouchStart={(e) => onResizeStart(e, position.symbol, "se")} style={{ position: "absolute", bottom: 0, right: 0, width: 10, height: 10, cursor: "nwse-resize", zIndex: 10 }} />
      <div onMouseDown={(e) => onResizeStart(e, position.symbol, "sw")} onTouchStart={(e) => onResizeStart(e, position.symbol, "sw")} style={{ position: "absolute", bottom: 0, left: 0, width: 10, height: 10, cursor: "nesw-resize", zIndex: 10 }} />
    </div>
  );
}