import { useState, useCallback, useEffect } from "react";
import type { Transaction } from "@/types";
import { uid } from "@/lib/format";

const TX_KEY = "fintrack_transactions";

function loadTransactions(): Transaction[] {
  try {
    const raw = JSON.parse(localStorage.getItem(TX_KEY) || "[]") as Transaction[];
    // Migrate: old txs without `side` are buys
    for (const t of raw) {
      if (!t.side) t.side = "buy";
    }
    return raw;
  } catch {
    return [];
  }
}

export function useTransactions() {
  const [txs, setTxs] = useState<Transaction[]>(loadTransactions);

  useEffect(() => {
    localStorage.setItem(TX_KEY, JSON.stringify(txs));
  }, [txs]);

  const addLot = useCallback((symbol: string, qty: number, price: number, note?: string, ts?: number) => {
    setTxs((prev) => [
      ...prev,
      { id: uid(), symbol, side: "buy" as const, qty, price, ts: ts ?? Date.now(), ...(note?.trim() ? { note: note.trim() } : {}) },
    ]);
  }, []);

  const sellLot = useCallback((symbol: string, qty: number, price: number, note?: string, ts?: number) => {
    setTxs((prev) => [
      ...prev,
      { id: uid(), symbol, side: "sell" as const, qty, price, ts: ts ?? Date.now(), ...(note?.trim() ? { note: note.trim() } : {}) },
    ]);
  }, []);

  const updateLot = useCallback((id: string, updates: Partial<Omit<Transaction, "id">>) => {
    setTxs((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const removeLot = useCallback((id: string) => {
    setTxs((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { txs, setTxs, addLot, sellLot, updateLot, removeLot };
}
