import { useState, useEffect, useCallback } from "react";
import type { Quote } from "@/types";
import { getQuotes } from "@/api/finnhub";

export function useQuotes(symbols: string[], intervalMs = 10000) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  const refresh = useCallback(async () => {
    if (symbols.length === 0) return;
    try {
      const data = await getQuotes(symbols);
      setQuotes(data);
    } catch (e) {
      console.error("Quote refresh failed:", e);
    }
  }, [symbols]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { quotes, refresh };
}
