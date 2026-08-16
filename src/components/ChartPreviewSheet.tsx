import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { CandleChart } from "./CandleChart";
import { labelFromSymbol } from "@/lib/constants";

interface Props {
  symbol: string;
  entryPrice?: number;
  onClose: () => void;
}

export function ChartPreviewSheet({ symbol, entryPrice, onClose }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(() => window.innerWidth >= 680);
  const isDesktop = wide;
  useEffect(() => {
    const handler = () => setWide(window.innerWidth >= 680);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  const label = labelFromSymbol(symbol);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (backdropRef.current === e.target) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      ref={backdropRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 350,
        display: "flex",
        alignItems: isDesktop ? "center" : "flex-end",
        justifyContent: "center",
        padding: isDesktop ? 16 : 0,
        background: "rgba(0,0,0,0.6)",
      }}
      onClick={e => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div style={{
        width: "100%",
        maxWidth: 736,
        height: isDesktop ? "80vh" : "100dvh",
        maxHeight: isDesktop ? 700 : "100dvh",
        background: "var(--bg)",
        borderRadius: isDesktop ? 12 : 0,
        border: "1px solid var(--card-border)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--card-border)",
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--mono)" }}>{label}</span>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 6, border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", background: "transparent",
            }}
          >
            <X size={16} color="var(--text-dim)" />
          </button>
        </div>
        {/* Chart fills remaining space */}
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <CandleChart symbol={symbol} height={600} priceLevels={entryPrice ? [{ price: entryPrice, label: "Entry", color: "#f97316" }] : []} />
        </div>
      </div>
    </div>
  );
}
