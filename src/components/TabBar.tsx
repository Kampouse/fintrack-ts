import { TrendingUp, Wallet, LayoutGrid } from "lucide-react";

type Tab = "portfolio" | "terminal";

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
        .mobile-nav {
          display: none;
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

      {/* Bottom navigation - mobile & desktop */}
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

        <button
          onClick={() => onChange("terminal")}
          aria-label="Terminal"
          style={{
            flex: 1,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "none", border: "none", cursor: "pointer",
            color: active === "terminal" ? "var(--lime)" : "var(--text-dim)",
            paddingBottom: 4,
            transition: "color 0.15s ease",
          }}
        >
          <LayoutGrid size={22} />
        </button>

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