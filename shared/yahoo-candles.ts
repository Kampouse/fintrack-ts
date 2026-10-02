// Shared candle-fetch core: used by BOTH the Cloudflare Pages Function
// (functions/api/candles.ts) and the vite dev middleware (vite-dev-api.ts),
// so local dev and production return byte-identical data.
//
// Contract: given symbol/resolution/from/to, return
//   { status, body, contentType, cacheControl }
// Crypto symbols are handled client-side (Binance is CORS-open) — this core
// proxies Yahoo Finance for everything else (stocks, NEAR-USD, XPR-USD, ...).

export interface CandleResponse {
  status: number;
  body: string;
  contentType: string;
  cacheControl?: string;
}

export const RESOLUTION_MAP: Record<string, string> = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "60": "1h",
  "D": "1d",
};

const INTERVAL_SECONDS: Record<string, number> = {
  "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "1d": 86400,
};

export async function handleCandlesRequest(params: {
  symbol: string | null;
  resolution: string | null;
  from: string | null;
  to: string | null;
}): Promise<CandleResponse> {
  const { symbol, resolution } = params;
  const empty = (cache = false): CandleResponse => ({
    status: 200,
    body: "[]",
    contentType: "application/json",
    cacheControl: cache ? "public, s-maxage=60" : undefined,
  });

  if (!symbol) {
    return { status: 400, body: JSON.stringify({ error: "Missing symbol" }), contentType: "application/json" };
  }

  const interval = RESOLUTION_MAP[resolution || "D"] || "1d";
  const sec = INTERVAL_SECONDS[interval] || 86400;
  const now = Math.floor(Date.now() / 1000);
  const from = params.from ? parseInt(params.from, 10) : now - 250 * sec;
  const to = params.to ? parseInt(params.to, 10) : now;

  // Yahoo Finance chart v8 API
  const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&period1=${from}&period2=${to}`;
  try {
    const res = await fetch(yfUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (!res.ok) return empty(true);
    const json: any = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return empty(true);
    const timestamps = result.timestamp as number[];
    const quote = result.indicators?.quote?.[0];
    if (!timestamps?.length || !quote?.open?.length) return empty(true);
    const candles = timestamps.map((t: number, i: number) => ({
      t,
      o: quote.open[i],
      h: quote.high[i],
      l: quote.low[i],
      c: quote.close[i],
      v: quote.volume?.[i] ?? 0,
    }));
    return {
      status: 200,
      body: JSON.stringify(candles),
      contentType: "application/json",
      cacheControl: "public, s-maxage=60",
    };
  } catch {
    return empty();
  }
}
