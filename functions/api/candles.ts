// Cloudflare Pages Function: candle data proxy.
// Crypto → redirect to Binance (CORS-allowed, no server fetch needed).
// Stock → proxy via Yahoo Finance chart API (no key required).

interface Env {}

const RESOLUTION_MAP: Record<string, string> = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "60": "1h",
  "D": "1d",
};

const INTERVAL_SECONDS: Record<string, number> = {
  "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "1d": 86400,
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const symbol = url.searchParams.get("symbol");
  const resolution = url.searchParams.get("resolution") || "D";
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  if (!symbol) {
    return new Response(JSON.stringify({ error: "Missing symbol" }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }

  // Stock: Yahoo Finance proxy
  if (!symbol.startsWith("BINANCE:")) {
    const interval = RESOLUTION_MAP[resolution] || "1d";
    const sec = INTERVAL_SECONDS[interval] || 86400;
    const now = Math.floor(Date.now() / 1000);
    const from = fromParam ? parseInt(fromParam, 10) : now - 250 * sec;
    const to = toParam ? parseInt(toParam, 10) : now;

    // Yahoo Finance chart v8 API
    const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&period1=${from}&period2=${to}`;
    try {
      const res = await fetch(yfUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      if (!res.ok) return new Response("[]", { headers: { "Content-Type": "application/json" } });
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) return new Response("[]", { headers: { "Content-Type": "application/json" } });
      const timestamps = result.timestamp as number[];
      const quote = result.indicators?.quote?.[0];
      if (!timestamps?.length || !quote?.open?.length) {
        return new Response("[]", { headers: { "Content-Type": "application/json" } });
      }
      const candles = timestamps.map((t, i) => ({
        t,
        o: quote.open[i],
        h: quote.high[i],
        l: quote.low[i],
        c: quote.close[i],
        v: quote.volume?.[i] ?? 0,
      }));
      return new Response(JSON.stringify(candles), {
        headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=60" },
      });
    } catch {
      return new Response("[]", { headers: { "Content-Type": "application/json" } });
    }
  }

  // Crypto: return Binance fetch params (client fetches directly)
  const binanceSymbol = symbol.replace("BINANCE:", "");
  return new Response(JSON.stringify({ interval: "5m", limit: 48, symbol: binanceSymbol }), {
    headers: { "Content-Type": "application/json" },
  });
};
