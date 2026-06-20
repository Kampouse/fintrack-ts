interface DOEnv {
  FINNHUB_KEY: string;
}

interface FinnhubTrade {
  p: number;
  s: string;
  t: number;
  v: number;
}

// Single Durable Object that holds one outbound WebSocket to Finnhub
// and fans out trade ticks to all connected clients. The API key never
// leaves this server-side object.
export class QuotesDO {
  state: DurableObjectState;
  env: DOEnv;
  finnhubWs: WebSocket | null = null;
  clients: Set<WebSocket> = new Set();
  subscribed: Set<string> = new Set();
  reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(state: DurableObjectState, env: DOEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.clients.add(server);

    const url = new URL(request.url);
    const symbols = url.searchParams.getAll("symbol");
    if (symbols.length > 0) this.addSymbols(symbols);

    server.addEventListener("message", (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "subscribe" && Array.isArray(msg.symbols)) {
          this.addSymbols(msg.symbols);
        }
      } catch {}
    });

    server.addEventListener("close", () => {
      this.clients.delete(server);
      this.maybeCleanup();
    });
    server.addEventListener("error", () => {
      this.clients.delete(server);
      this.maybeCleanup();
    });

    this.connectFinnhub();
    return new Response(null, { status: 101, webSocket: client });
  }

  addSymbols(symbols: string[]) {
    const newOnes: string[] = [];
    for (const sym of symbols) {
      if (!this.subscribed.has(sym)) {
        this.subscribed.add(sym);
        newOnes.push(sym);
      }
    }
    if (this.finnhubWs) {
      for (const sym of newOnes) {
        this.finnhubWs.send(JSON.stringify({ type: "subscribe", symbol: sym }));
      }
    }
  }

  async connectFinnhub() {
    if (this.finnhubWs) return;
    const key = this.env.FINNHUB_KEY;
    if (!key) return;

    try {
      const resp = await fetch(`https://ws.finnhub.io?token=${key}`, {
        headers: { Upgrade: "websocket" },
      });
      const ws = resp.webSocket;
      if (!ws) {
        this.scheduleReconnect();
        return;
      }

      ws.accept();
      this.finnhubWs = ws;

      for (const sym of this.subscribed) {
        ws.send(JSON.stringify({ type: "subscribe", symbol: sym }));
      }

      ws.addEventListener("message", (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data.type === "trade" && Array.isArray(data.data)) {
            const prices: Record<string, number> = {};
            for (const trade of data.data as FinnhubTrade[]) {
              prices[trade.s] = trade.p;
            }
            const msg = JSON.stringify({ type: "trade", prices });
            for (const c of this.clients) {
              try { c.send(msg); } catch {}
            }
          }
        } catch {}
      });

      ws.addEventListener("close", () => {
        this.finnhubWs = null;
        if (this.clients.size > 0) this.scheduleReconnect();
      });

      ws.addEventListener("error", () => {
        this.finnhubWs = null;
      });
    } catch {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connectFinnhub(), 3000);
  }

  maybeCleanup() {
    if (this.clients.size === 0) {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (this.finnhubWs) {
        this.finnhubWs.close();
        this.finnhubWs = null;
      }
      this.subscribed.clear();
    }
  }
}
