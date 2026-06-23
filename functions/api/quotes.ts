// Cloudflare Pages Function: quote proxy.
// BINANCE:* symbols → Binance public API (no key, no rate limit).
// Everything else → Finnhub (key lives in CF secret).

interface Env {
  FINNHUB_KEY: string;
}

interface FinnhubRaw {
  c: number;
  d: number | null;
  dp: number | null;
  h: number | null;
  l: number | null;
  o: number | null;
  pc: number | null;
  t: number | null;
}

interface BinanceTicker {
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  prevClosePrice: number;
  closeTime: number;
}

async function fetchBinance(sym: string): Promise<[string, Quote] | null> {
  // BINANCE:BTCUSDT → BTCUSDT
  const pair = sym.replace("BINANCE:", "");
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`);
    if (!res.ok) return null;
    const d: BinanceTicker = await res.json();
    return [
      sym,
      {
        price: d.lastPrice,
        change: d.priceChange,
        changePct: d.priceChangePercent,
        high: d.highPrice,
        low: d.lowPrice,
        open: d.openPrice,
        prevClose: d.prevClosePrice,
        ts: d.closeTime,
      },
    ];
  } catch {
    return null;
  }
}

async function fetchFinnhub(sym: string, key: string): Promise<[string, Quote] | null> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${key}`
    );
    if (!res.ok) return null;
    const d: FinnhubRaw = await res.json();
    return [
      sym,
      {
        price: d.c,
        change: d.d,
        changePct: d.dp,
        high: d.h,
        low: d.l,
        open: d.o,
        prevClose: d.pc,
        ts: d.t,
      },
    ];
  } catch {
    return null;
  }
}

interface Quote {
  price: number;
  change: number | null;
  changePct: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  prevClose: number | null;
  ts: number | null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const symbols = url.searchParams.getAll("symbol");

  if (symbols.length === 0) {
    return new Response(JSON.stringify({ error: "Missing symbol param" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results = await Promise.all(
    symbols.map(async (sym) => {
      if (sym.startsWith("BINANCE:")) {
        return (await fetchBinance(sym)) ?? [sym, null] as const;
      }
      const key = env.FINNHUB_KEY;
      if (!key) return [sym, null] as const;
      return (await fetchFinnhub(sym, key)) ?? [sym, null] as const;
    })
  );

  const data = Object.fromEntries(results);

  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=5",
    },
  });
};
