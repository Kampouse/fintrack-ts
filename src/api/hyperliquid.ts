// Hyperliquid market data — public API, no key needed, CORS-friendly
// Covers perps, spot pairs, and venue-listed tokens (e.g. xyz:DRAM)

const API = "https://api.hyperliquid.xyz/info";

export interface HLMid { coin: string; mid: number }
export interface HLSpotToken { name: string; fullName?: string; isCanonical: boolean }
export interface HLPerpInfo { name: string; szDecimals: number; onlyIsClosed?: boolean }

let _spotTokensCache: HLSpotToken[] = [];
let _perpNamesCache: string[] = [];

/** All spot tokens with metadata */
export async function getSpotTokens(): Promise<HLSpotToken[]> {
  if (_spotTokensCache.length > 0) return _spotTokensCache;
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "spotMetaAndAssetCtxs" }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  _spotTokensCache = data?.[0]?.tokens ?? [];
  return _spotTokensCache;
}

/** All perp names */
export async function getPerpNames(): Promise<string[]> {
  if (_perpNamesCache.length > 0) return _perpNamesCache;
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "metaAndAssetCtxs" }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  _perpNamesCache = (data?.[0]?.universe ?? []).map((u: HLPerpInfo) => u.name);
  return _perpNamesCache;
}

/** Bulk mid prices (perps + spot tokens). Does NOT include venue perps like xyz:DRAM. */
export async function getAllMids(): Promise<Record<string, number>> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "allMids" }),
  });
  if (!res.ok) return {};
  return await res.json();
}

/** Real-time mid price for a single coin (works for venue perps like xyz:DRAM) */
export async function getMid(coin: string): Promise<number | null> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "spotMetaAndAssetCtxs" }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  // Perp mid from allMids
  const allMids = await getAllMids();
  if (allMids[coin] != null) return allMids[coin];
  // Spot pair price (e.g. "PURR/USDC")
  const pairs = data?.[0]?.pairs ?? [];
  const assets = data?.[1] ?? {};
  const pair = pairs.find((p: any) =>
    p.base?.name === coin || p.quote?.name === coin ||
    (p.ticker?.split("/")[0] === coin)
  );
  if (pair) {
    const ctx = assets[pair.index] ?? {};
    return ctx?.markPx ?? ctx?.midPx ?? null;
  }
  return null;
}

/** OHLCV candle history — works for perps, spot, and venue perps */
export interface HLCandle {
  time: number; // ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function getCandles(
  coin: string,
  interval: "1m" | "15m" | "1h" | "4h" | "1d" | "1w",
  startTime: number, // ms
  endTime?: number,   // ms
  limit = 500,
): Promise<HLCandle[]> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "candleSnapshot",
      req: { coin, interval, startTime, endTime, limit },
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((k: any) => ({
    time: (k.t ?? k.startTime ?? 0) * 1000,
    open: Number(k.o),
    high: Number(k.h),
    low: Number(k.l),
    close: Number(k.c),
    volume: Number(k.v),
  }));
}

/** Perp metadata + asset context (mark prices, volume, funding, OI) */
export interface HLAssetCtx {
  dayNtlVlm: string;
  funding: string;
  openInterest: string;
  markPx: string;
  prevDayPx: string;
  midPx: string | null;
  oraclePx: string;
  premium: string;
  impactPxs: (string | null)[];
  highLeverageFeeBps: string | null;
}

export interface HLAssetEntry {
  name: string;
  szDecimals: number;
  onlyIsClosed: boolean;
  assetCtx: HLAssetCtx;
}

export async function getMetaAndAssetCtxs(): Promise<HLAssetEntry[]> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "metaAndAssetCtxs" }),
  });
  if (!res.ok) return [];
  const [meta, assetCtxs] = await res.json();
  const universe: HLPerpInfo[] = meta?.universe ?? [];
  const ctxs: HLAssetCtx[] = Array.isArray(assetCtxs) ? assetCtxs : [];
  return universe.map((u, i) => ({
    name: u.name,
    szDecimals: u.szDecimals,
    onlyIsClosed: u.onlyIsClosed ?? false,
    assetCtx: ctxs[i] ?? {} as HLAssetCtx,
  }));
}

/** Search across all HL coins (perps + spot tokens) for a query */
export async function searchHLCoins(query: string): Promise<HLMid[]> {
  const q = query.toLowerCase();
  const results: HLMid[] = [];

  // Search perps
  const perpNames = await getPerpNames();
  const allMids = await getAllMids();
  for (const name of perpNames) {
    if (name.toLowerCase().includes(q)) {
      results.push({ coin: `HL:${name}`, mid: allMids[name] ?? 0 });
    }
  }

  // Search spot tokens
  const tokens = await getSpotTokens();
  for (const t of tokens) {
    if (t.name.toLowerCase().includes(q) || (t.fullName ?? "").toLowerCase().includes(q)) {
      const mid = allMids[t.name] ?? 0;
      if (mid > 0) results.push({ coin: `HL:${t.name}`, mid });
    }
  }

  return results.slice(0, 20);
}

// ── Account state (read-only, wallet address only, no auth) ──

export interface HLUserPosition {
  position: {
    coin: string;
    szi: string;
    entryPx: string;
    margin: number | null;
    leverage: { type: string; value: number; rawUsd?: string } | undefined;
    liquidationPx: string | null;
    curAvgCost: string;
    cumFunding?: { allTime: string; sinceOpen: string; sinceChange: string } | null;
    positionValue?: string;
    unrealizedPnl?: string;
    returnOnEquity?: string;
    marginUsed?: string;
  };
  returnPnl: string;
  funding: number;
}

export interface HLUserTrade {
  coin: string;
  side: string;          // "B" or "A" (buy/sell)
  px: number;
  sz: number;
  hash: string;
  time: number;          // ms
  closedPnl?: number;
  fee: string;
}

export interface HLSpotBalance {
  coin: string;
  hold: number;
  total: number;
}

export interface HLMarginSummary {
  accountValue: number;
  totalNtlPos: number;
  totalRawUsd: number;
  totalMarginUsed: number;
}

export interface HLClearinghouseResult {
  positions: HLUserPosition[];
  marginSummary: HLMarginSummary | null;
}

/** Open perp positions for a wallet (native + venue perps via dex param) */
export async function getClearinghouseState(wallet: string): Promise<HLClearinghouseResult> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "clearinghouseState", user: wallet }),
  });
  if (!res.ok) return { positions: [], marginSummary: null };
  const native = await res.json();
  const nativePositions: HLUserPosition[] = native?.assetPositions ?? [];
  const nativeMargin: HLMarginSummary | null = native?.marginSummary ?? null;

  // Also fetch venue perps (dex="xyz") — e.g. xyz:CXMT, xyz:DRAM
  const resV = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "clearinghouseState", user: wallet, dex: "xyz" }),
  });
  let venuePositions: HLUserPosition[] = [];
  if (resV.ok) {
    const venue = await resV.json();
    venuePositions = venue?.assetPositions ?? [];
  }

  const all = [...nativePositions, ...venuePositions];
  return {
    positions: all.filter((p: HLUserPosition) => p.position && Math.abs(parseFloat(String(p.position.szi))) > 0),
    marginSummary: nativeMargin,
  };
}

/** Trade history for a wallet */
export async function getUserHistory(wallet: string): Promise<HLUserTrade[]> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "userHistory", user: wallet }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data.filter((t: HLUserTrade) => t && t.sz > 0) : [];
}

/** Spot balances for a wallet */
export async function getSpotUserState(wallet: string): Promise<HLSpotBalance[]> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "spotUserState", user: wallet }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data[0]?.balances ?? [] : [];
}

export interface HLOpenOrder {
  coin: string;
  side: string;          // "B" or "A"
  limitPx: string;
  sz: string;
  oid: number;
  timestamp: number;
  origSz: string;
  reduceOnly?: boolean;
}

/** Open orders for a wallet (native + venue) */
export async function getOpenOrders(wallet: string): Promise<HLOpenOrder[]> {
  const [resN, resV] = await Promise.all([
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "openOrders", user: wallet }),
    }),
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "openOrders", user: wallet, dex: "xyz" }),
    }),
  ]);
  const native = resN.ok ? await resN.json() : [];
  const venue = resV.ok ? await resV.json() : [];
  return [...(Array.isArray(native) ? native : []), ...(Array.isArray(venue) ? venue : [])];
}

export interface HLUserFill {
  coin: string;
  side: string;          // "B" or "A"
  px: string;
  sz: string;
  time: number;          // ms
  dir: string;           // "Open Long", "Close Short", etc.
  closedPnl: string;
  fee: string;
  hash: string;
  oid: number;
}

/** Recent fills for a wallet */
export async function getUserFills(wallet: string, limit = 20): Promise<HLUserFill[]> {
  const [resN, resV] = await Promise.all([
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "userFills", user: wallet }),
    }),
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "userFills", user: wallet, dex: "xyz" }),
    }),
  ]);
  const native = resN.ok ? await resN.json() : [];
  const venue = resV.ok ? await resV.json() : [];
  const all = [...(Array.isArray(native) ? native : []), ...(Array.isArray(venue) ? venue : [])];
  const seen = new Set<string>();
  return all
    .filter((f: any) => f && f.sz > 0 && f.hash && !seen.has(f.hash) && seen.add(f.hash))
    .sort((a: any, b: any) => (b.time ?? 0) - (a.time ?? 0))
    .slice(0, limit);
}
