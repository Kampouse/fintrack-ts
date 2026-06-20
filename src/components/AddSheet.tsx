import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Quote } from "@/types";
import { CRYPTO_SYMBOLS, tokenIcon, labelFromSymbol } from "@/lib/constants";
import { getQuote } from "@/api/finnhub";
import { TokenIcon } from "./TokenIcon";
import { card, input } from "@/lib/styles";
import { fmtUsd } from "@/lib/format";

interface Props {
  onClose: () => void;
  onSave: (symbol: string, qty: number, price: number) => void;
  preselect?: string | null;
}

export function AddSheet({ onClose, onSave, preselect }: Props) {
  const [symbol, setSymbol] = useState(preselect || "");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [liveQuote, setLiveQuote] = useState<Quote | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const priceRef = useRef(false);

  // Auto-fetch live price when symbol changes
  useEffect(() => {
    if (!symbol) {
      setLiveQuote(null);
      return;
    }
    setPriceLoading(true);
    priceRef.current = false;
    getQuote(symbol)
      .then((q) => {
        if (!priceRef.current) {
          setLiveQuote(q);
          setPrice(String(q.price));
        }
      })
      .catch(() => {})
      .finally(() => setPriceLoading(false));
  }, [symbol]);

  const handlePriceChange = (v: string) => {
    priceRef.current = true;
    setPrice(v);
  };

  const valid = symbol && parseFloat(qty) > 0 && parseFloat(price) > 0;
  const label = preselect ? labelFromSymbol(symbol) : null;

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
          zIndex: 100,
          maxWidth: "480px",
          margin: "0 auto",
          maxHeight: "85vh",
          overflow: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 600 }}>Add Buy</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px" }}>
            <X size={20} color="var(--text-dim)" />
          </button>
        </div>

        {preselect && label ? (
          <div style={{ ...card, padding: "12px 14px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
            <TokenIcon symbol={symbol} size={28} />
            <span style={{ fontSize: "16px", fontWeight: 600 }}>{label}</span>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
            {CRYPTO_SYMBOLS.map((c) => (
              <button
                key={c.symbol}
                onClick={() => setSymbol(c.symbol)}
                style={{
                  padding: "10px 8px",
                  borderRadius: "12px",
                  border: symbol === c.symbol ? "1px solid var(--lime)" : "1px solid var(--card-border)",
                  background: symbol === c.symbol ? "var(--lime-dim)" : "transparent",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <TokenIcon symbol={c.symbol} size={20} />
                <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text)" }}>{c.label}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ marginBottom: "12px" }}>
          <input type="number" inputMode="decimal" placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} style={input} />
        </div>
        <div style={{ marginBottom: "8px" }}>
          {priceLoading && <div style={{ fontSize: "11px", color: "var(--lime)", marginBottom: "6px", paddingLeft: "4px" }}>fetching live price...</div>}
          {!priceLoading && liveQuote && price && !priceRef.current && (
            <div style={{ fontSize: "11px", color: "var(--lime)", marginBottom: "6px", paddingLeft: "4px" }}>
              {`\u25CF live: ${fmtUsd(liveQuote.price)}`}
            </div>
          )}
          <input
            type="number"
            inputMode="decimal"
            placeholder="Buy price (USD)"
            value={price}
            onChange={(e) => handlePriceChange(e.target.value)}
            style={input}
          />
        </div>

        <button
          onClick={() => valid && onSave(symbol, parseFloat(qty), parseFloat(price))}
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
            marginTop: "12px",
          }}
        >
          Add Buy
        </button>
      </div>
    </>
  );
}
