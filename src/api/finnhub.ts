import type { Quote } from "@/types";

// Client-side API: calls OUR proxy at /api/quotes, never touches Finnhub directly.
// The Finnhub key lives only server-side in the Cloudflare Pages secret.

export async function getQuote(symbol: string): Promise<Quote> {
  const res = await fetch(`/api/quotes?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(`Quote failed: ${res.status}`);
  const data: Record<string, Quote> = await res.json();
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
  const params = symbols.map((s) => `symbol=${encodeURIComponent(s)}`).join("&");
  const res = await fetch(`/api/quotes?${params}`);
  if (!res.ok) throw new Error(`Quotes batch failed: ${res.status}`);
  return res.json();
}
