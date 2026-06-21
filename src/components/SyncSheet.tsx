import { Cloud, CloudOff, Download, X } from "lucide-react";
import { card, btnIcon } from "@/lib/styles";

const SYNC_KEY = "fintrack_sync_enabled";

export function isSyncEnabled(): boolean {
  try { return localStorage.getItem(SYNC_KEY) === "1"; } catch { return false; }
}

export function setSyncEnabled(v: boolean) {
  localStorage.setItem(SYNC_KEY, v ? "1" : "0");
}

interface Props {
  open: boolean;
  enabled: boolean;
  syncing: boolean;
  lastSync: number | null;
  remoteCount: number | null;
  onToggle: () => void;
  onPull: () => void;
  onPush: () => void;
  onClose: () => void;
}

export function SyncSheet({ open, enabled, syncing, lastSync, remoteCount, onToggle, onPull, onPush, onClose }: Props) {
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "17px", fontWeight: 600 }}>Cloud Sync</h2>
          <button onClick={onClose} style={btnIcon} aria-label="Close">
            <X size={18} color="var(--text-dim)" />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Toggle */}
          <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {enabled ? <Cloud size={18} color="var(--lime)" /> : <CloudOff size={18} color="var(--text-dim)" />}
              <span style={{ fontSize: "14px", color: "var(--text)" }}>
                {enabled ? "Sync enabled" : "Sync disabled"}
              </span>
            </div>
            <button
              onClick={onToggle}
              disabled={syncing}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                border: "none",
                cursor: syncing ? "wait" : "pointer",
                background: enabled ? "var(--lime)" : "rgba(255,255,255,0.15)",
                position: "relative",
                transition: "background 0.15s",
                flexShrink: 0,
              }}
            >
              <div style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "#0a0a0a",
                position: "absolute",
                top: 2,
                left: enabled ? 22 : 2,
                transition: "left 0.15s",
              }} />
            </button>
          </div>

          {/* Info */}
          {enabled && (
            <>
              <div style={{ fontSize: "12px", color: "var(--text-dim)", lineHeight: 1.5 }}>
                {remoteCount !== null && remoteCount === 0
                  ? "No remote data found. Push to create a backup."
                  : remoteCount !== null
                  ? `Remote has ${remoteCount} lot${remoteCount !== 1 ? "s" : ""}.`
                  : "Connect your wallet to use sync."}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={onPush}
                  disabled={syncing}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 12,
                    border: "none",
                    cursor: syncing ? "wait" : "pointer",
                    background: "var(--lime-dim)",
                    color: "var(--lime)",
                    fontSize: "13px",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Cloud size={15} />
                  Push
                </button>
                <button
                  onClick={onPull}
                  disabled={syncing || remoteCount === 0}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 12,
                    border: "none",
                    cursor: syncing || remoteCount === 0 ? "not-allowed" : "pointer",
                    background: remoteCount === 0 ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.08)",
                    color: remoteCount === 0 ? "var(--text-dim)" : "var(--text)",
                    fontSize: "13px",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Download size={15} />
                  Pull
                </button>
              </div>
            </>
          )}

          {/* Last sync */}
          {lastSync && (
            <div style={{ fontSize: "11px", color: "var(--text-dim)", textAlign: "center" }}>
              Last synced {new Date(lastSync).toLocaleString()}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
