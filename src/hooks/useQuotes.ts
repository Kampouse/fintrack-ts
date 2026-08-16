import { useState, useEffect, useRef } from "react";
import type { Quote } from "@/types";
import { getQuotes } from "@/api/finnhub";

const WS_URL = "wss://fintrack-ws.kj95hgdgnn.workers.dev/ws";

export function useQuotes(symbols: string[]) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const symbolsKey = symbols.join(",");
  const wsRef = useRef<WebSocket | null>(null);
  const binanceWsRef = useRef<WebSocket | null>(null);

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

  // WebSocket: live price ticks (Finnhub proxy)
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

  // Binance WebSocket: live ticker for BINANCE:* symbols
  useEffect(() => {
    const binanceSyms = symbols.filter((s) => s.startsWith("BINANCE:"));
    if (binanceSyms.length === 0) return;

    let reconnectDelay = 1000;
    let closed = false;

    const connect = () => {
      if (closed) return;
      // Combined stream: wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/zecusdt@ticker
      const streams = binanceSyms
        .map((s) => s.replace("BINANCE:", "").toLowerCase() + "@ticker")
        .join("/");
      const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      binanceWsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const d = msg.data;
          if (!d || !d.s) return;
          const sym = `BINANCE:${d.s}`;
          setQuotes((prev) => {
            const existing = prev[sym];
            return {
              ...prev,
              [sym]: {
                price: Number(d.c),
                change: Number(d.p),
                changePct: Number(d.P),
                high: Number(d.h),
                low: Number(d.l),
                open: Number(d.o),
                prevClose: Number(d.pc),
                ts: Number(d.E),
                // Keep live WS price from Finnhub if available
                ...(existing ? {} : {}),
              },
            };
          });
        } catch {}
      };

      ws.onopen = () => {
        reconnectDelay = 1000;
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
      binanceWsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  // HL REST poll: fetch mids for HL: prefixed symbols
  useEffect(() => {
    const hlSyms = symbols.filter((s) => s.startsWith("HL:"));
    if (hlSyms.length === 0) return;
    const refresh = async () => {
      try {
        const mids = await getAllMids();
        const coins = hlSyms.map((s) => s.replace("HL:", ""));
        setQuotes((prev) => {
          const next = { ...prev };
          for (const coin of coins) {
            const sym = `HL:${coin}`;
            const mid = Number(mids[coin]);
            if (mid > 0) {
              next[sym] = {
                price: mid,
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
      } catch {}
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  return { quotes };
}
import { getAllMids } from "@/api/hyperliquid";
