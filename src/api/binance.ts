// Binance market data — public API, no key needed, CORS-friendly

export interface BinanceTicker {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  quoteVolume: number;
  high: number;
  low: number;
  open: number;
}

export interface MarketTicker extends BinanceTicker {
  baseAsset: string;
  quoteAsset: string;
  marketCap?: number; // derived from volume
}

// Cache for 30 seconds
let cache: MarketTicker[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 30000;

export async function getMarketTickers(): Promise<MarketTicker[]> {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) {
    return cache;
  }

  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/24hr");
    if (!res.ok) {
      console.error("Binance API error:", res.status);
      return cache || [];
    }
    
    const data = await res.json();
    
    // Filter to USDT pairs only (stable pricing)
    const usdtPairs = data.filter((t: any) => 
      t.symbol.endsWith("USDT") && 
      !t.symbol.includes("UP") && 
      !t.symbol.includes("DOWN") &&
      !t.symbol.includes("BEAR") &&
      !t.symbol.includes("BULL") &&
      parseFloat(t.quoteVolume) > 100000 // $100k+ daily volume
    );
    
    const tickers: MarketTicker[] = usdtPairs.map((t: any) => ({
      symbol: `BINANCE:${t.symbol}`,
      price: parseFloat(t.lastPrice),
      change: parseFloat(t.priceChange),
      changePercent: parseFloat(t.priceChangePercent),
      volume: parseFloat(t.volume),
      quoteVolume: parseFloat(t.quoteVolume),
      high: parseFloat(t.highPrice),
      low: parseFloat(t.lowPrice),
      open: parseFloat(t.openPrice),
      baseAsset: t.symbol.replace("USDT", ""),
      quoteAsset: "USDT",
      // Use quote volume as proxy for market cap ranking
      marketCap: parseFloat(t.quoteVolume),
    }));
    
    cache = tickers;
    cacheTime = now;
    return tickers;
  } catch (err) {
    console.error("Failed to fetch Binance tickers:", err);
    return cache || [];
  }
}

export function getTopGainers(tickers: MarketTicker[], limit = 10): MarketTicker[] {
  return [...tickers]
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, limit);
}

export function getTopLosers(tickers: MarketTicker[], limit = 10): MarketTicker[] {
  return [...tickers]
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, limit);
}

export function getTopVolume(tickers: MarketTicker[], limit = 10): MarketTicker[] {
  return [...tickers]
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, limit);
}

export function getVolumeSpikes(tickers: MarketTicker[], threshold = 3): MarketTicker[] {
  // This would need historical data for proper comparison
  // For now, just return top volume
  return getTopVolume(tickers, 10);
}