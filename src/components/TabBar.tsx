import { TrendingUp } from "lucide-react";

type Tab = "portfolio";

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
}

export function TabBar({ active, onChange }: Props) {
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
        @media (min-width: 768px) {
          .desktop-bar { display: flex; }
        }
      `}</style>

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
    </div>
  );
}
