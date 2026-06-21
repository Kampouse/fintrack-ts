import { TrendingUp, Search, Settings } from "lucide-react";

type Tab = "portfolio" | "search" | "settings";

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const tabs: { id: Tab; icon: typeof TrendingUp; label: string }[] = [
  { id: "portfolio", icon: TrendingUp, label: "Portfolio" },
  { id: "search", icon: Search, label: "Search" },
  { id: "settings", icon: Settings, label: "Settings" },
];

export function TabBar({ active, onChange }: Props) {
  return (
    <div
      className="tab-bar"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        height: "56px",
        zIndex: 200,
        maxWidth: "720px",
        margin: "0 auto",
      }}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "2px",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "6px 16px",
              color: isActive ? "var(--lime)" : "var(--text-dim)",
              transition: "color 0.15s ease",
            }}
          >
            <Icon size={20} />
            <span style={{ fontSize: "10px", fontWeight: isActive ? 600 : 400 }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
