import type { Quote } from "@/types";

// Client-side API: calls OUR proxy at /api/quotes, never touches Finnhub directly.
// The Finnhub key lives only server-side in the Cloudflare Pages secret.

export async function getQuote(symbol: string): Promise<Quote> {
  // Delegate to getQuotes which handles Binance (crypto) vs Finnhub (stocks) routing
  const data = await getQuotes([symbol]);
  return data[symbol] ?? { price: 0, change: null, changePct: null, high: null, low: null, open: null, prevClose: null, ts: null };
}

export interface SearchResult {
  symbol: string;
  displaySymbol: string;
  description: string;
  type: string;
}

export async function searchSymbols(q: string): Promise<SearchResult[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const data: { count: number; result: SearchResult[] } = await res.json();
  return data.result ?? [];
}

export async function getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  if (symbols.length === 0) return {};
  
  // Split: BINANCE:* → client-side fetch (Binance has CORS), rest → our proxy
  const binanceSyms = symbols.filter(s => s.startsWith("BINANCE:"));
  const finnhubSyms = symbols.filter(s => !s.startsWith("BINANCE:"));
  
  const results: Record<string, Quote> = {};
  
  // Binance: client-side (CORS allowed, no key needed)
  if (binanceSyms.length > 0) {
    const pairs = binanceSyms.map(s => s.replace("BINANCE:", ""));
    const batchUrl = `https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(pairs)}`;
    const batchRes = await fetch(batchUrl);
    if (batchRes.ok) {
      const tickers = await batchRes.json();
      for (const t of tickers) {
        const sym = `BINANCE:${t.symbol}`;
        results[sym] = {
          price: Number(t.lastPrice),
          change: Number(t.priceChange),
          changePct: Number(t.priceChangePercent),
          high: Number(t.highPrice),
          low: Number(t.lowPrice),
          open: Number(t.openPrice),
          prevClose: Number(t.prevClosePrice),
          ts: Number(t.closeTime),
        };
      }
    }
  }
  
  // Non-Binance: server-side proxy (Finnhub key hidden)
  if (finnhubSyms.length > 0) {
    const params = finnhubSyms.map((s) => `symbol=${encodeURIComponent(s)}`).join("&");
    const res = await fetch(`/api/quotes?${params}`);
    if (res.ok) {
      const data = await res.json();
      Object.assign(results, data);
    }
  }
  
  return results;
}
