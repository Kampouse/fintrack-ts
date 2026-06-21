import { AlertTriangle, X } from "lucide-react";
import { card, btnIcon } from "@/lib/styles";

interface Props {
  open: boolean;
  localCount: number;
  remoteCount: number;
  remoteDate: string;
  onReplace: () => void;
  onCancel: () => void;
}

export function ConflictSheet({ open, localCount, remoteCount, remoteDate, onReplace, onCancel }: Props) {
  if (!open) return null;
  return (
    <>
      <div
        onClick={onCancel}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 270 }}
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
          zIndex: 280,
          maxHeight: "50vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertTriangle size={16} color="var(--red)" />
            <h2 style={{ fontSize: "15px", fontWeight: 600 }}>Replace local data?</h2>
          </div>
          <button onClick={onCancel} style={btnIcon} aria-label="Close">
            <X size={18} color="var(--text-dim)" />
          </button>
        </div>

        <div style={{ fontSize: "13px", color: "var(--text-dim)", lineHeight: 1.6, marginBottom: "16px" }}>
          Remote has <span style={{ color: "var(--text)" }}>{remoteCount} lot{remoteCount !== 1 ? "s" : ""}</span> from {remoteDate}.
          Your local data has <span style={{ color: "var(--text)" }}>{localCount} lot{localCount !== 1 ? "s" : ""}</span>.
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              background: "rgba(255,255,255,0.08)",
              color: "var(--text)",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onReplace}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              background: "rgba(248,113,113,0.15)",
              color: "var(--red)",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            Replace local
          </button>
        </div>
      </div>
    </>
  );
}
