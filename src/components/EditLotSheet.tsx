import { useState } from "react";
import { X } from "lucide-react";
import type { Transaction } from "@/types";
import { fmtUsd, fmtDate, toLocalInput, fromLocalInput } from "@/lib/format";
import { card, input } from "@/lib/styles";

interface Props {
  lot: Transaction;
  onClose: () => void;
  onSave: (updates: Partial<Omit<Transaction, "id">>) => void;
}

export function EditLotSheet({ lot, onClose, onSave }: Props) {
  const [qty, setQty] = useState(String(lot.qty));
  const [price, setPrice] = useState(String(lot.price));
  const [ts, setTs] = useState(toLocalInput(lot.ts));

  const valid = parseFloat(qty) > 0 && parseFloat(price) > 0 && ts;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 99 }} />
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--bg)",
          borderTop: "1px solid var(--card-border)",
          borderRadius: "24px 24px 0 0",
          padding: "20px 16px 32px",
          zIndex: 260,
          maxWidth: "480px",
          margin: "0 auto",
        }}
        className="sheet-enter"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 600 }}>Edit Lot</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px" }}>
            <X size={20} color="var(--text-dim)" />
          </button>
        </div>

        <div style={{ ...card, padding: "10px 14px", marginBottom: "16px", fontSize: "13px", color: "var(--text-dim)" }}>
          Editing: {fmtNum(parseFloat(qty) || 0)} @ {fmtUsd(parseFloat(price) || 0)} - {fmtDate(fromLocalInput(ts))}
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "6px", display: "block" }}>Quantity</label>
          <input type="number" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} style={input} />
        </div>
        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "6px", display: "block" }}>Buy price (USD)</label>
          <input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} style={input} />
        </div>
        <div style={{ marginBottom: "20px" }}>
          <label style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "6px", display: "block" }}>Date</label>
          <input type="datetime-local" value={ts} onChange={(e) => setTs(e.target.value)} style={input} />
        </div>

        <button
          onClick={() => valid && onSave({ qty: parseFloat(qty), price: parseFloat(price), ts: fromLocalInput(ts) })}
          disabled={!valid}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "12px",
            border: "none",
            background: valid ? "var(--lime)" : "var(--card-border)",
            color: valid ? "#0a0a0a" : "var(--text-dim)",
            fontSize: "15px",
            fontWeight: 600,
            cursor: valid ? "pointer" : "default",
          }}
        >
          Save Changes
        </button>
      </div>
    </>
  );
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}
