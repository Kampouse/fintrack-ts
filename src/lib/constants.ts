export interface CryptoAsset {
  symbol: string;
  label: string;
  name: string;
  cmcId: number;
}

export const CRYPTO_SYMBOLS: CryptoAsset[] = [
  { symbol: "BINANCE:BTCUSDT", label: "BTC", name: "Bitcoin", cmcId: 1 },
  { symbol: "BINANCE:ETHUSDT", label: "ETH", name: "Ethereum", cmcId: 1027 },
  { symbol: "BINANCE:SOLUSDT", label: "SOL", name: "Solana", cmcId: 5426 },
  { symbol: "BINANCE:NEARUSDT", label: "NEAR", name: "NEAR Protocol", cmcId: 4256 },
  { symbol: "BINANCE:BNBUSDT", label: "BNB", name: "BNB", cmcId: 1839 },
  { symbol: "BINANCE:XRPUSDT", label: "XRP", name: "XRP", cmcId: 52 },
  { symbol: "BINANCE:ADAUSDT", label: "ADA", name: "Cardano", cmcId: 2010 },
  { symbol: "BINANCE:DOGEUSDT", label: "DOGE", name: "Dogecoin", cmcId: 74 },
  { symbol: "BINANCE:AVAXUSDT", label: "AVAX", name: "Avalanche", cmcId: 5805 },
  { symbol: "BINANCE:LINKUSDT", label: "LINK", name: "Chainlink", cmcId: 1975 },
  { symbol: "BINANCE:DOTUSDT", label: "DOT", name: "Polkadot", cmcId: 6636 },
  { symbol: "BINANCE:MATICUSDT", label: "MATIC", name: "Polygon", cmcId: 3890 },
  { symbol: "BINANCE:LTCUSDT", label: "LTC", name: "Litecoin", cmcId: 2 },
  { symbol: "BINANCE:UNIUSDT", label: "UNI", name: "Uniswap", cmcId: 7083 },
  { symbol: "BINANCE:ATOMUSDT", label: "ATOM", name: "Cosmos", cmcId: 3794 },
  { symbol: "BINANCE:APTUSDT", label: "APT", name: "Aptos", cmcId: 21714 },
  { symbol: "BINANCE:ARBUSDT", label: "ARB", name: "Arbitrum", cmcId: 11841 },
  { symbol: "BINANCE:OPUSDT", label: "OP", name: "Optimism", cmcId: 24178 },
  { symbol: "BINANCE:INJUSDT", label: "INJ", name: "Injective", cmcId: 20887 },
  { symbol: "BINANCE:SUIUSDT", label: "SUI", name: "Sui", cmcId: 20947 },
  { symbol: "BINANCE:ZECUSDT", label: "ZEC", name: "Zcash", cmcId: 1437 },
];

const _labelCache = new Map<string, string>();
for (const c of CRYPTO_SYMBOLS) _labelCache.set(c.symbol, c.label);

export function labelFromSymbol(symbol: string): string {
  return _labelCache.get(symbol) ?? symbol.split(":").pop()?.replace("USDT", "") ?? symbol;
}

export function tokenIcon(symbol: string, size = 64): string | null {
  const id = CRYPTO_SYMBOLS.find((c) => c.symbol === symbol)?.cmcId;
  if (!id) return null;
  return `https://s2.coinmarketcap.com/static/img/coins/${size}x${size}/${id}.png`;
}
