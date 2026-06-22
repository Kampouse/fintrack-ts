export interface CryptoAsset {
  symbol: string;
  label: string;
  name: string;
  cmcId: number;
  cgId: string; // CoinGecko coin ID for chart data
  type?: "crypto" | "stock";
}

export const CRYPTO_SYMBOLS: CryptoAsset[] = [
  { symbol: "BINANCE:BTCUSDT", label: "BTC", name: "Bitcoin", cmcId: 1, cgId: "bitcoin" },
  { symbol: "BINANCE:ETHUSDT", label: "ETH", name: "Ethereum", cmcId: 1027, cgId: "ethereum" },
  { symbol: "BINANCE:SOLUSDT", label: "SOL", name: "Solana", cmcId: 5426, cgId: "solana" },
  { symbol: "BINANCE:NEARUSDT", label: "NEAR", name: "NEAR Protocol", cmcId: 6535, cgId: "near" },
  { symbol: "BINANCE:BNBUSDT", label: "BNB", name: "BNB", cmcId: 1839, cgId: "binancecoin" },
  { symbol: "BINANCE:XRPUSDT", label: "XRP", name: "XRP", cmcId: 52, cgId: "ripple" },
  { symbol: "BINANCE:ADAUSDT", label: "ADA", name: "Cardano", cmcId: 2010, cgId: "cardano" },
  { symbol: "BINANCE:DOGEUSDT", label: "DOGE", name: "Dogecoin", cmcId: 74, cgId: "dogecoin" },
  { symbol: "BINANCE:AVAXUSDT", label: "AVAX", name: "Avalanche", cmcId: 5805, cgId: "avalanche-2" },
  { symbol: "BINANCE:LINKUSDT", label: "LINK", name: "Chainlink", cmcId: 1975, cgId: "chainlink" },
  { symbol: "BINANCE:DOTUSDT", label: "DOT", name: "Polkadot", cmcId: 6636, cgId: "polkadot" },
  { symbol: "BINANCE:MATICUSDT", label: "MATIC", name: "Polygon", cmcId: 3890, cgId: "matic-network" },
  { symbol: "BINANCE:LTCUSDT", label: "LTC", name: "Litecoin", cmcId: 2, cgId: "litecoin" },
  { symbol: "BINANCE:UNIUSDT", label: "UNI", name: "Uniswap", cmcId: 7083, cgId: "uniswap" },
  { symbol: "BINANCE:ATOMUSDT", label: "ATOM", name: "Cosmos", cmcId: 3794, cgId: "cosmos" },
  { symbol: "BINANCE:APTUSDT", label: "APT", name: "Aptos", cmcId: 21714, cgId: "aptos" },
  { symbol: "BINANCE:ARBUSDT", label: "ARB", name: "Arbitrum", cmcId: 11841, cgId: "arbitrum" },
  { symbol: "BINANCE:OPUSDT", label: "OP", name: "Optimism", cmcId: 24178, cgId: "optimism" },
  { symbol: "BINANCE:INJUSDT", label: "INJ", name: "Injective", cmcId: 20887, cgId: "injective-protocol" },
  { symbol: "BINANCE:SUIUSDT", label: "SUI", name: "Sui", cmcId: 20947, cgId: "sui" },
  { symbol: "BINANCE:ZECUSDT", label: "ZEC", name: "Zcash", cmcId: 1437, cgId: "zcash" },
];

export const STOCK_SYMBOLS: CryptoAsset[] = [
  { symbol: "AAPL", label: "AAPL", name: "Apple", cmcId: 0, cgId: "apple", type: "stock" },
  { symbol: "MSFT", label: "MSFT", name: "Microsoft", cmcId: 0, cgId: "microsoft", type: "stock" },
  { symbol: "GOOGL", label: "GOOGL", name: "Alphabet", cmcId: 0, cgId: "google", type: "stock" },
  { symbol: "AMZN", label: "AMZN", name: "Amazon", cmcId: 0, cgId: "amazon", type: "stock" },
  { symbol: "NVDA", label: "NVDA", name: "NVIDIA", cmcId: 0, cgId: "nvidia", type: "stock" },
  { symbol: "META", label: "META", name: "Meta", cmcId: 0, cgId: "meta", type: "stock" },
  { symbol: "TSLA", label: "TSLA", name: "Tesla", cmcId: 0, cgId: "tesla", type: "stock" },
  { symbol: "NFLX", label: "NFLX", name: "Netflix", cmcId: 0, cgId: "netflix", type: "stock" },
];

export const ALL_SYMBOLS = [...CRYPTO_SYMBOLS, ...STOCK_SYMBOLS];

const _cgIdCache = new Map<string, string>();
for (const c of ALL_SYMBOLS) _cgIdCache.set(c.symbol, c.cgId);

export function cgIdFromSymbol(symbol: string): string | null {
  return _cgIdCache.get(symbol) ?? null;
}

const _labelCache = new Map<string, string>();
for (const c of ALL_SYMBOLS) _labelCache.set(c.symbol, c.label);

export function labelFromSymbol(symbol: string): string {
  return _labelCache.get(symbol) ?? symbol.split(":").pop()?.replace("USDT", "") ?? symbol;
}

export function tokenIcon(symbol: string, size = 64): string | null {
  // Try TradingView CDN first
  const asset = ALL_SYMBOLS.find((c) => c.symbol === symbol);
  if (asset?.type === "stock" && asset.cgId) {
    return `https://s3-symbol-logo.tradingview.com/${asset.cgId}.svg`;
  }
  // Crypto: try TradingView crypto CDN
  const baseSymbol = symbol.replace("BINANCE:", "").replace("USDT", "");
  if (baseSymbol) {
    return `https://s3-symbol-logo.tradingview.com/crypto/XTVC${baseSymbol}.svg`;
  }
  // Fallback to CMC
  const id = asset?.cmcId;
  if (id) return `https://s2.coinmarketcap.com/static/img/coins/${size}x${size}/${id}.png`;
  return null;
}

export function isStock(symbol: string): boolean {
  return !symbol.startsWith("BINANCE:");
}
