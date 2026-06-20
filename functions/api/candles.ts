// Cloudflare Pages Function: proxy Alpaca crypto bars for candlestick data.
// Keys stored as CF secrets (APCA_API_KEY_ID, APCA_API_SECRET).

interface Env {
  APCA_API_KEY_ID: string;
  APCA_API_SECRET: string;
}

const TIMEFRAME_MAP: Record<string, string> = {
  "1h": "1Hour",
  "4h": "4Hour",
  "1d": "1Day",
  "1w": "1Week",
};

const DEFAULT_TIMEFRAME = "1Day";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const symbol = url.searchParams.get("symbol"); // e.g. BTC/USD
  const days = parseInt(url.searchParams.get("days") || "90", 10);

  if (!symbol) {
    return new Response(JSON.stringify({ error: "Missing symbol" }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }

  // Pick timeframe based on days range
  let timeframe = DEFAULT_TIMEFRAME;
  let limit = days;
  if (days <= 7) { timeframe = "1Hour"; limit = Math.min(days * 24, 1000); }
  else if (days <= 30) { timeframe = "4Hour"; limit = Math.min(days * 6, 1000); }

  const tf = TIMEFRAME_MAP[timeframe.toLowerCase()] || timeframe;

  const apiUrl = `https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=${encodeURIComponent(symbol)}&timeframe=${tf}&limit=${limit}`;

  const res = await fetch(apiUrl, {
    headers: {
      "APCA-API-KEY-ID": context.env.APCA_API_KEY_ID,
      "APCA-API-SECRET-KEY": context.env.APCA_API_SECRET,
    },
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: `Alpaca ${res.status}` }), {
      headers: { "Content-Type": "application/json" },
      status: 502,
    });
  }

  const data = await res.json();
  const bars = data.bars?.[symbol];

  if (!bars || bars.length === 0) {
    return new Response(JSON.stringify([]), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Map to lightweight-charts format: {time, open, high, low, close}
  const candles = bars.map((b: { t: string; o: number; h: number; l: number; c: number }) => ({
    time: Math.floor(new Date(b.t).getTime() / 1000),
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
  }));

  return new Response(JSON.stringify(candles), {
    headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=60" },
  });
};
