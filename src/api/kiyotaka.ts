// Kiyotaka Volume Profile API — client-side, calls our proxy at /api/kiyotaka/volume-profile.
// Key lives server-side only. Only works for BINANCE:* symbols (crypto).

export interface VPRow {
  price: number;
  buy: number;
  sell: number;
}

export async function fetchVolumeProfile(
  symbol: string,
  resolution: string,
  from: number,
  to: number,
): Promise<VPRow[]> {
  if (!symbol.startsWith("BINANCE:")) return [];
  const res = await fetch(
    `/api/kiyotaka/volume-profile?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}`,
  );
  if (!res.ok) return [];
  return res.json();
}

export interface OrderbookLevel {
  price: number;
  volume: number;
}

export interface OrderbookSnapshot {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: number;
}

export async function fetchOrderbook(
  symbol: string,
  maxDepth = 500,
): Promise<OrderbookSnapshot> {
  if (!symbol.startsWith("BINANCE:")) return { bids: [], asks: [], timestamp: 0 };
  const res = await fetch(
    `/api/kiyotaka/orderbook?symbol=${encodeURIComponent(symbol)}&maxDepth=${maxDepth}`,
  );
  if (!res.ok) return { bids: [], asks: [], timestamp: 0 };
  return res.json();
}
