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
  // Check known mappings first
  const known = _cgIdCache.get(symbol);
  if (known) return known;
  
  // Fallback: try to construct CoinGecko ID from symbol
  // e.g., BINANCE:PEPEUSDT -> "pepe", BINANCE:WIFUSDT -> "dogwifhat"
  const base = symbol.replace("BINANCE:", "").replace("USDT", "").toLowerCase();
  
  // Common mappings for popular but not hardcoded symbols
  const commonIds: Record<string, string> = {
    "pepe": "pepe",
    "wif": "dogwifhat",
    "bonk": "bonk",
    "floki": "floki",
    "shib": "shiba-inu",
    "shibainu": "shiba-inu",
    "rndr": "render-token",
    "tao": "bittensor",
    "jup": "jupiter-exchange-solana",
    "pyth": "pyth-network",
    "ondo": "ondo-finance",
    "sei": "sei-network",
    "tia": "celestia",
    "strk": "starknet",
    "manta": "manta-network",
    "aevo": "aevo",
    "ena": "ethena",
    "w": "wormhole",
    "wormhole": "wormhole",
    "fetch": "fetch-ai",
    "fet": "fetch-ai",
    "agix": "singularitynet",
    "ocean": "ocean-protocol",
    "cfx": "conflux-token",
    "hbar": "hedera-hashgraph",
    "kas": "kaspa",
    "kaspa": "kaspa",
    "fil": "filecoin",
    "ar": "arweave",
    "theta": "theta-token",
    "ftm": "fantom",
    "gmx": "gmx",
    "dydx": "dydx",
    "blur": "blur",
    "ape": "apecoin",
    "meme": "memecoin",
    "1000pepe": "pepe",
    "1000bonk": "bonk",
    "1000shib": "shiba-inu",
    "1000floki": "floki",
    "btc": "bitcoin",
    "eth": "ethereum",
    "bnb": "binancecoin",
    "sol": "solana",
    "near": "near",
    "xrp": "ripple",
    "ada": "cardano",
    "doge": "dogecoin",
    "avax": "avalanche-2",
    "link": "chainlink",
    "dot": "polkadot",
    "matic": "matic-network",
    "ltc": "litecoin",
    "uni": "uniswap",
    "atom": "cosmos",
    "apt": "aptos",
    "arb": "arbitrum",
    "op": "optimism",
    "inj": "injective-protocol",
    "sui": "sui",
    "zec": "zcash",
  };
  
  return commonIds[base] ?? base;
}

const _labelCache = new Map<string, string>();
for (const c of ALL_SYMBOLS) _labelCache.set(c.symbol, c.label);

export function labelFromSymbol(symbol: string): string {
  return _labelCache.get(symbol) ?? symbol.split(":").pop()?.replace(/USDT$/, "")?.replace(/BUSDT$/, "")?.replace(/\//g, "") ?? symbol;
}

export function tokenIcon(symbol: string, size = 64): string | null {
  // Try TradingView CDN first
  const asset = ALL_SYMBOLS.find((c) => c.symbol === symbol);
  if (asset?.type === "stock" && asset.cgId) {
    return `https://s3-symbol-logo.tradingview.com/${asset.cgId}.svg`;
  }
  // Crypto: try TradingView crypto CDN
  const baseSymbol = symbol.replace("BINANCE:", "").replace("BUSDT", "").replace("USDT", "");
  if (baseSymbol) {
    return `https://s3-symbol-logo.tradingview.com/crypto/XTVC${baseSymbol}.svg`;
  }
  // Fallback to CMC
  const id = asset?.cmcId;
  if (id) return `https://s2.coinmarketcap.com/static/img/coins/${size}x${size}/${id}.png`;
  return null;
}

export function isStock(symbol: string): boolean {
  return !symbol.startsWith("BINANCE:") && !symbol.startsWith("HL:");
}
