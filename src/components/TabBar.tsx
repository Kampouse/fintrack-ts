import { TrendingUp, Wallet, Plus } from "lucide-react";

type Tab = "portfolio";

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
  onAdd?: () => void;
  onWatch?: () => void;
}

export function TabBar({ active, onChange, onAdd, onWatch }: Props) {
  return (
    <div>
      <style>{`
        .desktop-bar {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 44px;
          z-index: 200;
          background: #0a0a0a;
          border-bottom: 1px solid var(--card-border);
          align-items: center;
          padding-left: 12px;
        }
        .mobile-nav {
          display: none;
        }
        .fab-btn {
          transition: transform 0.15s ease;
        }
        .fab-btn:active {
          transform: scale(0.9);
        }
        @media (min-width: 768px) {
          .desktop-bar { display: flex; }
        }
        @media (max-width: 767px) {
          .mobile-nav {
            display: flex;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: calc(60px + env(safe-area-inset-bottom, 0px));
            padding-bottom: env(safe-area-inset-bottom, 0px);
            z-index: 200;
            background: rgba(10,10,10,0.95);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-top: 1px solid var(--card-border);
            align-items: stretch;
            justify-content: space-around;
          }
        }
      `}</style>

      {/* Desktop top bar */}
      <div className="desktop-bar">
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--lime)", marginRight: 8 }}>F</span>
        <button
          onClick={() => onChange("portfolio")}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "var(--lime-dim)", border: "none", cursor: "pointer",
            padding: "6px 10px", borderRadius: 6,
            color: "var(--lime)", transition: "color 0.15s ease, background 0.15s ease",
          }}
        >
          <TrendingUp size={14} />
          <span style={{ fontSize: "11px", fontWeight: 600 }}>Portfolio</span>
        </button>
      </div>

      {/* Mobile bottom nav */}
      <div className="mobile-nav">
        <button
          onClick={() => onChange("portfolio")}
          aria-label="Portfolio"
          style={{
            flex: 1,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "none", border: "none", cursor: "pointer",
            color: active === "portfolio" ? "var(--lime)" : "var(--text-dim)",
            paddingBottom: 4,
            transition: "color 0.15s ease",
          }}
        >
          <Wallet size={22} />
        </button>

        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <button
            className="fab-btn"
            onClick={() => onAdd?.()}
            aria-label="Add position"
            style={{
              width: 56, height: 56,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--lime)", border: "none", cursor: "pointer",
              borderRadius: "50%",
              color: "#0a0a0a",
              marginBottom: 20,
              boxShadow: "0 4px 16px rgba(190,242,100,0.35), 0 0 0 4px rgba(10,10,10,0.95)",
            }}
          >
            <Plus size={26} strokeWidth={2.5} />
          </button>
        </div>

        <button
          onClick={() => onWatch?.()}
          aria-label="Markets"
          style={{
            flex: 1,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-dim)",
            paddingBottom: 4,
            transition: "color 0.15s ease",
          }}
        >
          <TrendingUp size={22} />
        </button>
      </div>
    </div>
  );
}
