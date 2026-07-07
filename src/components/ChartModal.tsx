import { X } from "lucide-react";
import { CandleChart } from "./CandleChart";
import { labelFromSymbol } from "@/lib/constants";

interface Props {
  symbol: string | null;
  onClose: () => void;
}

export function ChartModal({ symbol, onClose }: Props) {
  if (!symbol) return null;

  const label = labelFromSymbol(symbol);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card)",
          borderRadius: 16,
          width: "100%",
          maxWidth: 800,
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid var(--card-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>{label}</span>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{symbol}</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-dim)",
              cursor: "pointer",
              padding: 4,
              display: "flex",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Chart */}
        <div style={{ flex: 1, minHeight: 400 }}>
          <CandleChart symbol={symbol} height={400} />
        </div>
      </div>
    </div>
  );
}