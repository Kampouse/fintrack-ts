import { X } from "lucide-react";
import { card, btnIcon } from "@/lib/styles";

interface Props {
  open: boolean;
  onClose: () => void;
}

const tips = [
  { title: "Add a buy", body: "Tap + or search any stock, crypto, or ETF. Price auto-fills from live quotes — edit if needed." },
  { title: "Track positions", body: "Each buy is a separate lot. Tap a position card to see per-lot P&L, cost basis chart, and running average." },
  { title: "Edit or delete", body: "In a position, tap ✏️ to edit a lot's qty, price, or date. Tap 🗑️ to remove it." },
  { title: "Search anything", body: "Type in the search field to find any asset on Finnhub — stocks, ETFs, crypto. Or use the quick-pick crypto grid." },
];

export function HelpSheet({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 250 }}
      />
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          maxWidth: "480px",
          margin: "0 auto",
          background: "var(--card-bg)",
          borderRadius: "20px 20px 0 0",
          padding: "20px 20px 32px",
          zIndex: 260,
          maxHeight: "70vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <span style={{ fontSize: "16px", fontWeight: 600 }}>How to use</span>
          <button onClick={onClose} style={btnIcon} aria-label="Close">
            <X size={18} color="var(--text-dim)" />
          </button>
        </div>
        {tips.map((t) => (
          <div key={t.title} style={{ ...card, padding: "12px 14px", marginBottom: "8px" }}>
            <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>{t.title}</div>
            <div style={{ fontSize: "13px", color: "var(--text-dim)" }}>{t.body}</div>
          </div>
        ))}
      </div>
    </>
  );
}
