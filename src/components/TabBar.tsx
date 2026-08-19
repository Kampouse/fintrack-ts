import { Wallet, LayoutGrid, TrendingUp } from "lucide-react";

type Tab = "portfolio" | "terminal";

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
  onAdd?: () => void;
  onWatch?: () => void;
}

export function TabBar({ active, onChange, onWatch }: Props) {
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
        .nav-btn {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-dim);
          padding-bottom: 4px;
          transition: color 0.15s ease;
        }
        .nav-btn.active { color: var(--lime); }
      `}</style>

      <div className="mobile-nav">
        <button
          className={`nav-btn ${active === "portfolio" ? "active" : ""}`}
          onClick={() => onChange("portfolio")}
          aria-label="Portfolio"
        >
          <Wallet size={22} />
        </button>
        <button
          className={`nav-btn ${active === "terminal" ? "active" : ""}`}
          onClick={() => onChange("terminal")}
          aria-label="Terminal"
        >
          <LayoutGrid size={22} />
        </button>
        <button
          className="nav-btn"
          onClick={() => onWatch?.()}
          aria-label="Markets"
        >
          <TrendingUp size={22} />
        </button>
      </div>
    </div>
  );
}