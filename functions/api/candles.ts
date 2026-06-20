// Cloudflare Pages Function: proxy Binance public klines for candlestick data.
// Binance blocks CF Workers (403 WAF), so this is now a passthrough redirect
// that tells the client to fetch directly from Binance (CORS-allowed).

interface Env {}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const symbol = url.searchParams.get("symbol"); // e.g. BTCUSDT
  const days = parseInt(url.searchParams.get("days") || "90", 10);

  if (!symbol) {
    return new Response(JSON.stringify({ error: "Missing symbol" }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }

  let interval = "1d";
  let limit = 90;
  if (days < 0) { interval = "1m"; limit = 30; }
  else if (days === 0) { interval = "5m"; limit = 30; }
  else if (days <= 1) { interval = "5m"; limit = 48; }
  else if (days <= 7) { interval = "1h"; limit = 48; }

  return new Response(JSON.stringify({ interval, limit, symbol }), {
    headers: { "Content-Type": "application/json" },
  });
};
