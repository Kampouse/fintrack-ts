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
