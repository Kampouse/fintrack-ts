import { useState, useEffect, useRef } from "react";
import type { Quote } from "@/types";
import { getQuotes } from "@/api/finnhub";

const WS_URL = "wss://fintrack-ws.kj95hgdgnn.workers.dev/ws";

export function useQuotes(symbols: string[]) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const symbolsKey = symbols.join(",");
  const wsRef = useRef<WebSocket | null>(null);

  // REST fetch: initial load + periodic refresh for day-change data
  useEffect(() => {
    if (symbols.length === 0) return;
    const refresh = async () => {
      try {
        const data = await getQuotes(symbols);
        setQuotes((prev) => {
          // Merge: keep live WS price if newer, update everything else
          const next: Record<string, Quote> = {};
          for (const sym of symbols) {
            const rest = data[sym];
            const live = prev[sym];
            if (rest && live && live.price !== 0) {
              next[sym] = { ...rest, price: live.price };
            } else {
              next[sym] = rest ?? live;
            }
          }
          return { ...prev, ...next };
        });
      } catch (e) {
        console.error("REST quote fetch failed:", e);
      }
    };
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  // WebSocket: live price ticks
  useEffect(() => {
    if (symbols.length === 0) return;

    let reconnectDelay = 1000;
    let closed = false;

    const connect = () => {
      if (closed) return;
      const params = symbols.map((s) => `symbol=${encodeURIComponent(s)}`).join("&");
      const ws = new WebSocket(`${WS_URL}?${params}`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectDelay = 1000;
        ws.send(JSON.stringify({ type: "subscribe", symbols }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "trade" && msg.prices) {
            setQuotes((prev) => {
              const next = { ...prev };
              for (const [sym, price] of Object.entries(msg.prices)) {
                if (next[sym]) {
                  next[sym] = { ...next[sym], price: price as number };
                } else {
                  next[sym] = {
                    price: price as number,
                    change: null,
                    changePct: null,
                    high: null,
                    low: null,
                    open: null,
                    prevClose: null,
                    ts: null,
                  };
                }
              }
              return next;
            });
          }
        } catch {}
      };

      ws.onclose = () => {
        if (closed) return;
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 10000);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      closed = true;
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  return { quotes };
}
