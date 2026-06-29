import { useEffect, useRef, useState, useCallback } from "react";
import { cgIdFromSymbol } from "@/lib/constants";
import { fetchVolumeProfile, type VPRow, type Trade, fetchTrades } from "@/api/kiyotaka";

interface OrderbookLevel { price: number; volume: number; }
interface OrderbookSnapshot { bids: OrderbookLevel[]; asks: OrderbookLevel[]; }

export interface PriceLevel {
  price: number;
  label: string;
  color: string;
}

export interface TrendLine {
  id: number;
  startTime: number;  // bar timestamp (ms)
  startPrice: number;
  endTime: number;    // bar timestamp (ms)
  endPrice: number;
  color: string;
}

interface Props {
  symbol: string;
  height?: number;
  resizable?: boolean;
  onHeightChange?: (h: number) => void;
  priceLevels?: PriceLevel[];
  trendlines?: TrendLine[];
  onTrendlineAdd?: (tl: TrendLine) => void;
  onTrendlineUpdate?: (tl: TrendLine) => void;
  onTrendlineRemove?: (id: number) => void;
}

const TF = [
  { days: 0, label: "5m" },
  { days: -1, label: "1m" },
  { days: 1, label: "24H" },
  { days: 7, label: "1W" },
  { days: 30, label: "1M" },
  { days: 90, label: "3M" },
] as const;

const TL_COLORS = ["#ff6b6b", "#fbbf24", "#38bdf8", "#a78bfa", "#34d399", "#f472b6", "#fb923c", "#67e8f9"];

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toFixed(0);
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function fmtVol(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(0);
}

interface Bar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface DrawState {
  bars: Bar[];
  subDaily: boolean;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
  chartW: number;
  chartH: number;
  volH: number;
  lo: number;
  hi: number;
  totalRange: number;
  maxVol: number;
  priceToY: (p: number) => number;
  yToPrice: (y: number) => number;
  barWidth: number;
  bodyWidth: number;
  viewStart: number;
  viewEnd: number;
  visibleBars: Bar[];
  volScale: number;
  idxToX: (idx: number) => number;
  xToIdx: (x: number) => number;
}

async function fetchOHLC(symbol: string, days: number) {
  // Stocks: use Finnhub candle API
  if (!symbol.startsWith("BINANCE:")) {
    let resolution = "D";
    let count = 250;
    if (days < 0 || days === 0) { resolution = "5"; count = 60; }
    else if (days <= 1) { resolution = "5"; count = 72; }
    else if (days <= 7) { resolution = "60"; count = 250; }
    else if (days <= 30) { resolution = "D"; count = 30; }
    else { resolution = "D"; count = 250; }
    const now = Math.floor(Date.now() / 1000);
    const from = days <= 1 ? now - count * 300 : days <= 7 ? now - count * 3600 : now - count * 86400;
    try {
      const res = await fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${now}`);
      if (!res.ok) return [];
      const json = await res.json();
      if (!json?.length) return [];
      // API returns array of {t, o, h, l, c}
      return json.map((k: { t: number; o: number; h: number; l: number; c: number; v?: number }) => ({
        time: resolution === "D"
          ? new Date(k.t * 1000).toISOString().split("T")[0]
          : new Date(k.t * 1000).toISOString().substring(0, 19),
        open: k.o,
        high: k.h,
        low: k.l,
        close: k.c,
        volume: k.v ?? 0,
      }));
    } catch { return []; }
  }

  // Crypto: Binance
  const binanceSymbol = symbol.replace("BINANCE:", "").replace("USDT", "USDT");

  let interval = "1d";
  let limit = 250;
  if (days < 0) { interval = "1m"; limit = 60; }
  else if (days === 0) { interval = "5m"; limit = 60; }
  else if (days <= 1) { interval = "5m"; limit = 72; }
  else if (days <= 7) { interval = "1h"; limit = 250; }
  else if (days <= 30) { interval = "1d"; limit = 30; }
  else { interval = "1d"; limit = 250; }

  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(binanceSymbol)}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data: unknown[][] = await res.json();
  if (!data?.length) return [];

  const isSubDaily = interval.includes("m") || interval.includes("h");
  return data.map((k) => {
    const d = new Date(k[0] as number);
    const time = isSubDaily
      ? d.toISOString().substring(0, 19)
      : d.toISOString().split("T")[0];
    return {
      time,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    };
  });
}

function parseTime(t: string) {
  const d = new Date(t);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function computeSMA(bars: Bar[], period: number): Map<number, number> {
  const sma = new Map<number, number>();
  if (bars.length < period) return sma;
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= period - 1) {
      sma.set(i, sum / period);
      sum -= bars[i - period + 1].close;
    }
  }
  return sma;
}

function computeEMA(bars: Bar[], period: number): Map<number, number> {
  const ema = new Map<number, number>();
  if (bars.length < period) return ema;
  const k = 2 / (period + 1);
  // Seed with SMA
  let sum = 0;
  for (let i = 0; i < period; i++) sum += bars[i].close;
  ema.set(period - 1, sum / period);
  for (let i = period; i < bars.length; i++) {
    const prev = ema.get(i - 1)!;
    ema.set(i, bars[i].close * k + prev * (1 - k));
  }
  return ema;
}

function computeMACD(bars: Bar[]): { macd: Map<number, number>; signal: Map<number, number>; histogram: Map<number, number> } {
  const ema12 = computeEMA(bars, 12);
  const ema26 = computeEMA(bars, 26);
  const macd = new Map<number, number>();
  const macdLine: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const v12 = ema12.get(i);
    const v26 = ema26.get(i);
    if (v12 != null && v26 != null) {
      const val = v12 - v26;
      macd.set(i, val);
      macdLine.push(val);
    } else {
      macdLine.push(0);
    }
  }
  // Signal: 9-period EMA of MACD line
  const signal = new Map<number, number>();
  if (macdLine.length >= 9) {
    const k = 2 / 10;
    let sum = 0;
    for (let j = 0; j < 9; j++) sum += macdLine[j];
    signal.set(25, sum / 9); // first signal at index 25 (where ema26 starts)
    for (let i = 26; i < bars.length; i++) {
      const prev = signal.get(i - 1) ?? 0;
      signal.set(i, macdLine[i] * k + prev * (1 - k));
    }
  }
  const histogram = new Map<number, number>();
  for (const [i, m] of macd) {
    const s = signal.get(i);
    if (s != null) histogram.set(i, m - s);
  }
  return { macd, signal, histogram };
}

function computeRSI(bars: Bar[], period = 14): Map<number, number> {
  const rsi = new Map<number, number>();
  if (bars.length < period + 1) return rsi;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = bars[i].close - bars[i - 1].close;
    if (delta > 0) gainSum += delta; else lossSum -= delta;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  rsi.set(period, avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < bars.length; i++) {
    const delta = bars[i].close - bars[i - 1].close;
    avgGain = (avgGain * (period - 1) + (delta > 0 ? delta : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (delta < 0 ? -delta : 0)) / period;
    rsi.set(i, avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

function computeZScore(bars: Bar[], period = 20): Map<number, number> {
  const z = new Map<number, number>();
  if (bars.length < period) return z;
  const closes = bars.map(b => b.close);
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    const mean = sum / period;
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (closes[j] - mean) ** 2;
    const std = Math.sqrt(sumSq / period);
    z.set(i, std === 0 ? 0 : (closes[i] - mean) / std);
  }
  return z;
}

function buildDrawState(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bars: Bar[],
  subDaily: boolean,
  viewStart: number,
  viewEnd: number,
  priceOverride?: { lo: number; hi: number } | null,
): DrawState {
  const padRight = 56;
  const padBottom = 22;
  const padTop = 6;
  const padLeft = 4;
  const volH = 28;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom - volH;

  if (!bars.length || chartW < 20 || chartH < 20) {
    return {
      bars, subDaily, padLeft, padRight, padTop, padBottom,
      chartW, chartH, volH, lo: 0, hi: 1, totalRange: 1,
      maxVol: 1, priceToY: () => 0, yToPrice: () => 0, barWidth: 0, bodyWidth: 0,
      viewStart, viewEnd, visibleBars: [], volScale: 0,
      idxToX: () => 0, xToIdx: () => 0,
    };
  }

  const vs = Math.max(0, Math.min(viewStart, bars.length - 1));
  const ve = Math.max(1, Math.min(viewEnd, bars.length));
  const visible = bars.slice(vs, ve);

  let lo = Infinity, hi = -Infinity, maxVol = 0;
  for (const b of visible) {
    if (b.low < lo) lo = b.low;
    if (b.high > hi) hi = b.high;
    if (b.volume > maxVol) maxVol = b.volume;
  }
  const priceRange = hi - lo || 1;
  const pricePad = priceRange * 0.08;

  if (priceOverride) {
    lo = priceOverride.lo;
    hi = priceOverride.hi;
  } else {
    lo -= pricePad;
    hi += pricePad;
  }
  const totalRange = hi - lo;

  const priceToY = (p: number) => padTop + chartH - ((p - lo) / totalRange) * chartH;
  const yToPrice = (y: number) => lo + ((padTop + chartH - y) / chartH) * totalRange;
  const barWidth = chartW / visible.length;
  const bodyWidth = Math.max(1, barWidth * 0.6);
  const volScale = maxVol > 0 ? volH / maxVol : 0;

  // Map absolute bar index to pixel X and back
  const idxToX = (idx: number) => padLeft + (idx - vs + 0.5) * barWidth;
  const xToIdx = (x: number) => vs + (x - padLeft) / barWidth - 0.5;

  return {
    bars, subDaily, padLeft, padRight, padTop, padBottom,
    chartW, chartH, volH, lo, hi, totalRange,
    maxVol, priceToY, yToPrice, barWidth, bodyWidth,
    viewStart: vs, viewEnd: ve, visibleBars: visible, volScale,
    idxToX, xToIdx,
  };
}

function drawVolumeProfile(
  ctx: CanvasRenderingContext2D,
  s: DrawState,
  vpData: VPRow[],
) {
  if (!vpData.length) return;
  const { padLeft, padTop, chartH, chartW, lo, hi, priceToY } = s;
  const rightEdgeX = chartW + padLeft;

  // Find max total volume for scaling
  let maxVol = 0;
  for (const row of vpData) {
    const total = row.buy + row.sell;
    if (total > maxVol) maxVol = total;
  }
  if (maxVol === 0) return;

  // Bar height: map VP price step (~$3) to pixel height
  // Get the pixel span for one VP price step
  const vpStep = vpData.length > 1 ? vpData[1].price - vpData[0].price : 3;
  const barH = Math.max(1, Math.abs(priceToY(vpData[0].price) - priceToY(vpData[0].price + vpStep)));

  // Max bar width = 25% of chart width (so candles remain readable)
  const vpWidth = chartW * 0.25;

  for (const row of vpData) {
    if (row.price < lo || row.price > hi) continue;
    const y = priceToY(row.price);
    const barTop = y - barH / 2;
    if (barTop < padTop || barTop + barH > padTop + chartH) continue;

    const total = row.buy + row.sell;
    const buyRatio = row.buy / total;
    const barW = Math.max(1, (total / maxVol) * vpWidth);
    const buyW = barW * buyRatio;
    const sellW = barW - buyW;

    const x = rightEdgeX - barW;

    // Sell side (left portion)
    if (sellW > 0) {
      ctx.fillStyle = "rgba(248,113,113,0.18)";
      ctx.fillRect(x, barTop, sellW, barH);
    }
    // Buy side (right portion)
    if (buyW > 0) {
      ctx.fillStyle = "rgba(83,255,132,0.18)";
      ctx.fillRect(x + sellW, barTop, buyW, barH);
    }
  }
}

// Heatmap color: intensity 0..1 -> green (bid) or red (ask)
function obHeatColor(volume: number, maxVol: number, isBid: boolean): string {
  const intensity = Math.min(1, Math.sqrt(volume / maxVol));
  const alpha = 0.15 + intensity * 0.65;
  return isBid
    ? `rgba(83,255,132,${alpha.toFixed(3)})`
    : `rgba(248,113,113,${alpha.toFixed(3)})`;
}

function drawOrderbookHeatmap(
  ctx: CanvasRenderingContext2D,
  s: DrawState,
  obData: OrderbookSnapshot | null,
) {
  if (!obData || (!obData.bids.length && !obData.asks.length)) return;
  const { padLeft, padTop, chartH, chartW, lo, hi, priceToY } = s;

  let maxVol = 0;
  for (const lvl of [...obData.bids, ...obData.asks]) {
    if (lvl.volume > maxVol) maxVol = lvl.volume;
  }
  if (maxVol === 0) return;

  const rightEdge = padLeft + chartW;
  const obWidth = chartW * 0.35;
  const allLevels = [...obData.bids, ...obData.asks];
  if (allLevels.length < 2) return;

  const prices = allLevels.map(l => l.price).sort((a, b) => a - b);
  const priceStep = prices.length > 1 ? prices[1] - prices[0] : 1;
  const barH = Math.max(1.5, Math.abs(priceToY(prices[0]) - priceToY(prices[0] + priceStep)));

  const bidSet = new Set(obData.bids);

  for (const lvl of allLevels) {
    if (lvl.price < lo || lvl.price > hi) continue;
    const y = priceToY(lvl.price);
    const barTop = y - barH / 2;
    if (barTop < padTop - barH || barTop > padTop + chartH) continue;

    const isBid = bidSet.has(lvl);
    const barW = Math.max(2, (lvl.volume / maxVol) * obWidth);

    ctx.fillStyle = obHeatColor(lvl.volume, maxVol, isBid);
    // Draw from right edge going left
    ctx.fillRect(rightEdge - barW, barTop, barW, barH + 0.5);
  }

  // Label
  ctx.font = "9px ui-monospace, SFMono-Regular, monospace";
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText("OB Depth", rightEdge - 4, padTop + 2);
  ctx.textAlign = "left";
}

function drawDepthChart(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  obData: OrderbookSnapshot | null,
) {
  ctx.clearRect(0, 0, w, h);

  const padRight = 56;
  const padLeft = 4;
  const padTop = 4;
  const padBottom = 4;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  if (chartW < 20 || chartH < 10 || !obData) return;

  // Background fill
  ctx.fillStyle = "rgba(255,255,255,0.015)";
  ctx.fillRect(padLeft, padTop, chartW, chartH);

  if (!obData.bids.length && !obData.asks.length) return;

  // Build cumulative depth
  const bids = [...obData.bids].sort((a, b) => b.price - a.price); // descending from mid
  const asks = [...obData.asks].sort((a, b) => a.price - b.price); // ascending from mid

  let cumBid = 0;
  const bidCurve: { price: number; cum: number }[] = [];
  for (const b of bids) { cumBid += b.volume; bidCurve.push({ price: b.price, cum: cumBid }); }

  let cumAsk = 0;
  const askCurve: { price: number; cum: number }[] = [];
  for (const a of asks) { cumAsk += a.volume; askCurve.push({ price: a.price, cum: cumAsk }); }

  const maxCum = Math.max(cumBid, cumAsk);
  if (maxCum === 0) return;

  // Price range: compute from OB data itself, zoom around mid price
  const midPrice = (bids[0]?.price + asks[0]?.price) / 2;
  // Use the price spread of the inner ~80% of levels to determine visible range
  const allPrices = [...bids.map(b => b.price), ...asks.map(a => a.price)].sort((a, b) => a - b);
  const p5 = allPrices[Math.floor(allPrices.length * 0.05)] ?? midPrice;
  const p95 = allPrices[Math.floor(allPrices.length * 0.95)] ?? midPrice;
  const dataSpread = Math.max(p95 - p5, midPrice * 0.001); // at least 0.1% of price
  const lo = midPrice - dataSpread;
  const hi = midPrice + dataSpread;
  const totalRange = hi - lo || 1;

  const priceToY = (p: number) => padTop + chartH - ((p - lo) / totalRange) * chartH;
  const cumToX = (c: number) => padLeft + (c / maxCum) * chartW;

  // Draw cumulative bid area (green) — step curve for classic depth look
  if (bidCurve.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(padLeft, priceToY(bidCurve[0].price));
    for (let i = 0; i < bidCurve.length; i++) {
      const pt = bidCurve[i];
      const x = cumToX(pt.cum);
      const y = priceToY(pt.price);
      if (i > 0) {
        ctx.lineTo(x, priceToY(bidCurve[i - 1].price));
      }
      ctx.lineTo(x, y);
    }
    ctx.lineTo(padLeft, priceToY(bidCurve[bidCurve.length - 1].price));
    ctx.closePath();
    ctx.fillStyle = "rgba(83,255,132,0.18)";
    ctx.fill();

    ctx.strokeStyle = "rgba(83,255,132,0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cumToX(bidCurve[0].cum), priceToY(bidCurve[0].price));
    for (let i = 1; i < bidCurve.length; i++) {
      const pt = bidCurve[i];
      ctx.lineTo(cumToX(pt.cum), priceToY(bidCurve[i - 1].price));
      ctx.lineTo(cumToX(pt.cum), priceToY(pt.price));
    }
    ctx.stroke();
  }

  // Draw cumulative ask area (red)
  if (askCurve.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(padLeft, priceToY(askCurve[0].price));
    for (let i = 0; i < askCurve.length; i++) {
      const pt = askCurve[i];
      const x = cumToX(pt.cum);
      const y = priceToY(pt.price);
      if (i > 0) {
        ctx.lineTo(x, priceToY(askCurve[i - 1].price));
      }
      ctx.lineTo(x, y);
    }
    ctx.lineTo(padLeft, priceToY(askCurve[askCurve.length - 1].price));
    ctx.closePath();
    ctx.fillStyle = "rgba(248,113,113,0.18)";
    ctx.fill();

    ctx.strokeStyle = "rgba(248,113,113,0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cumToX(askCurve[0].cum), priceToY(askCurve[0].price));
    for (let i = 1; i < askCurve.length; i++) {
      const pt = askCurve[i];
      ctx.lineTo(cumToX(pt.cum), priceToY(askCurve[i - 1].price));
      ctx.lineTo(cumToX(pt.cum), priceToY(pt.price));
    }
    ctx.stroke();
  }

  // Mid price line
  const midY = priceToY(midPrice);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.setLineDash([2, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padLeft, midY);
  ctx.lineTo(padLeft + chartW, midY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Legend
  ctx.font = "9px ui-monospace, SFMono-Regular, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const bidShare = (cumBid / (cumBid + cumAsk) * 100).toFixed(0);
  ctx.fillStyle = "rgba(83,255,132,0.8)";
  ctx.fillText(`B ${fmtVol(cumBid)}`, padLeft + 4, padTop + 1);
  ctx.fillStyle = "rgba(248,113,113,0.8)";
  ctx.fillText(`A ${fmtVol(cumAsk)}`, padLeft + 70, padTop + 1);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillText(`${bidShare}% bid`, padLeft + 130, padTop + 1);
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bars: Bar[],
  subDaily: boolean,
  viewStart: number,
  viewEnd: number,
  crossX: number | null,
  priceLevels: PriceLevel[],
  trendlines: TrendLine[],
  drawingLine: never | null,  // no longer used
  selectedTlId: number | null,
  priceOverride?: { lo: number; hi: number } | null,
  vpData?: VPRow[],
  obData?: OrderbookSnapshot | null,
) {
  const s = buildDrawState(ctx, w, h, bars, subDaily, viewStart, viewEnd, priceOverride);
  const { padLeft, padRight, padTop, padBottom, chartW, chartH, volH,
    lo, hi, totalRange, priceToY, yToPrice, barWidth, bodyWidth,
    visibleBars, volScale, viewStart: vs, idxToX, xToIdx } = s;

  // Helper: find bar index closest to a timestamp (ms)
  const timeToIdx = (ts: number): number => {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < bars.length; i++) {
      const bt = parseTime(bars[i].time);
      const d = Math.abs(bt - ts);
      if (d < bestDist) { bestDist = d; best = i; }
      if (bt > ts) break;
    }
    return best;
  };

  if (!visibleBars.length) return;

  ctx.clearRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const y = padTop + (chartH / 4) * i;
    ctx.beginPath(); ctx.moveTo(padLeft, y); ctx.lineTo(w - padRight, y); ctx.stroke();
  }

  // Volume Profile (behind candles)
  if (vpData?.length) {
    drawVolumeProfile(ctx, s, vpData);
  }

  // Trendlines (drawn behind candles)
  const allTrendlines = [...trendlines];
  for (const tl of allTrendlines) {
    const x1 = idxToX(timeToIdx(tl.startTime));
    const y1 = priceToY(tl.startPrice);
    const x2 = idxToX(timeToIdx(tl.endTime));
    const y2 = priceToY(tl.endPrice);

    if (x1 === x2 && y1 === y2) continue;

    // Draw line segment between endpoints
    ctx.strokeStyle = tl.color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Small circles at endpoints — larger + filled for selected line
    const isSelected = tl.id === selectedTlId;
    const handleR = isSelected ? 5 : 3;
    for (const [px, py] of [[x1, y1], [x2, y2]]) {
      if (px >= padLeft && px <= w - padRight && py >= padTop && py <= padTop + chartH) {
        ctx.fillStyle = isSelected ? "#fff" : tl.color;
        ctx.beginPath();
        ctx.arc(px, py, handleR, 0, Math.PI * 2);
        ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = tl.color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }
  }

  // Volume bars
  const volBase = padTop + chartH + volH;
  for (let i = 0; i < visibleBars.length; i++) {
    const b = visibleBars[i];
    const x = padLeft + barWidth * i + barWidth / 2;
    const isUp = b.close >= b.open;
    const volBarH = b.volume * volScale;
    ctx.fillStyle = isUp ? "rgba(83,255,132,0.15)" : "rgba(248,113,113,0.15)";
    ctx.fillRect(x - bodyWidth / 2, volBase - volBarH, bodyWidth, volBarH);
  }

  // Volume separator
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath(); ctx.moveTo(padLeft, volBase); ctx.lineTo(w - padRight, volBase); ctx.stroke();

  // EMAs
  const ema20 = computeEMA(bars, 20);
  const ema50 = computeEMA(bars, 50);
  const emas: { color: string; map: Map<number, number>; label: string }[] = [
    { color: "rgba(255,255,100,0.5)", map: ema20, label: "EMA 20" },
    { color: "rgba(147,130,220,0.6)", map: ema50, label: "EMA 50" },
  ];
  for (const { color, map } of emas) {
    if (map.size > 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      let started = false;
      for (let i = vs; i < s.viewEnd; i++) {
        const val = map.get(i);
        if (val == null) continue;
        const localIdx = i - vs;
        const x = padLeft + barWidth * localIdx + barWidth / 2;
        const y = priceToY(val);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // Candlesticks with wick glow
  for (let i = 0; i < visibleBars.length; i++) {
    const b = visibleBars[i];
    const x = padLeft + barWidth * i + barWidth / 2;
    const isUp = b.close >= b.open;
    const color = isUp ? "#53ff84" : "#f87171";
    const bodyTop = priceToY(Math.max(b.open, b.close));
    const bodyBot = priceToY(Math.min(b.open, b.close));
    const bodyH = Math.max(1, bodyBot - bodyTop);

    // Subtle wick glow
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, priceToY(b.high));
    ctx.lineTo(x, priceToY(b.low));
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, priceToY(b.high));
    ctx.lineTo(x, bodyTop);
    ctx.moveTo(x, bodyBot);
    ctx.lineTo(x, priceToY(b.low));
    ctx.stroke();

    if (isUp) {
      ctx.fillStyle = color;
      ctx.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyH);
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyH);
    }
  }

  // Current price line
  const lastBar = visibleBars[visibleBars.length - 1];
  const lastY = priceToY(lastBar.close);
  const isUp = lastBar.close >= lastBar.open;
  const priceColor = isUp ? "rgba(83,255,132,0.5)" : "rgba(248,113,113,0.5)";

  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = priceColor;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padLeft, lastY); ctx.lineTo(w - padRight, lastY); ctx.stroke();
  ctx.setLineDash([]);

  // Price tag on right axis
  const tagLabel = lastBar.close >= 1000 ? lastBar.close.toFixed(0) : lastBar.close.toFixed(2);
  ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
  const tagW = ctx.measureText(tagLabel).width + 10;
  ctx.fillStyle = isUp ? "#53ff84" : "#f87171";
  const tagH = 16;
  const tagR = 3;
  const tagX = w - padRight + 2;
  const tagY = lastY - tagH / 2;
  ctx.beginPath();
  ctx.roundRect(tagX, tagY, tagW, tagH, tagR);
  ctx.fill();
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(tagLabel, tagX + tagW / 2, lastY);

  // Custom price levels
  for (const level of priceLevels) {
    if (level.price < lo || level.price > hi) continue;
    const ly = priceToY(level.price);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = level.color;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padLeft, ly); ctx.lineTo(w - padRight, ly); ctx.stroke();
    ctx.setLineDash([]);

    const lvlLabel = level.price >= 1000 ? level.price.toFixed(0) : level.price.toFixed(2);
    ctx.font = "9px ui-monospace, SFMono-Regular, monospace";
    const lvlText = level.label + " " + lvlLabel;
    const lvlW = ctx.measureText(lvlText).width + 8;
    ctx.fillStyle = level.color + "33";
    ctx.beginPath();
    ctx.roundRect(w - padRight + 2, ly - 8, lvlW, 16, 3);
    ctx.fill();
    ctx.fillStyle = level.color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(lvlText, w - padRight + 6, ly);
  }

  // Crosshair
  if (crossX != null && crossX >= padLeft && crossX <= w - padRight) {
    const localIdx = Math.floor((crossX - padLeft) / barWidth);
    if (localIdx >= 0 && localIdx < visibleBars.length) {
      const b = visibleBars[localIdx];
      const snapX = padLeft + barWidth * localIdx + barWidth / 2;

      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(snapX, padTop); ctx.lineTo(snapX, h - padBottom); ctx.stroke();
      const cY = priceToY(b.close);
      ctx.beginPath(); ctx.moveTo(padLeft, cY); ctx.lineTo(w - padRight, cY); ctx.stroke();
      ctx.setLineDash([]);

      const tooltipW = 130;
      const tooltipH = 52;
      let tx = snapX + 12;
      if (tx + tooltipW > w - padRight) tx = snapX - tooltipW - 12;
      let ty = padTop + 4;
      if (ty + tooltipH > padTop + chartH) ty = padTop + chartH - tooltipH;

      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.beginPath();
      ctx.roundRect(tx, ty, tooltipW, tooltipH, 6);
      ctx.fill();

      ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const ts = parseTime(b.time);
      const timeLabel = subDaily
        ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
        : new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });

      ctx.fillText(timeLabel, tx + 8, ty + 6);
      ctx.fillStyle = "#53ff84";
      ctx.fillText(`O ${b.open.toFixed(2)}`, tx + 8, ty + 20);
      ctx.fillStyle = "#f87171";
      ctx.fillText(`H ${b.high.toFixed(2)}`, tx + 72, ty + 20);
      ctx.fillStyle = "#53ff84";
      ctx.fillText(`L ${b.low.toFixed(2)}`, tx + 8, ty + 34);
      ctx.fillStyle = "#f87171";
      ctx.fillText(`C ${b.close.toFixed(2)}`, tx + 72, ty + 34);
    }
  }

  // EMA legend
  if (emas.length > 0) {
    ctx.font = "9px ui-monospace, SFMono-Regular, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    let legendX = padLeft + 4;
    const legendY = padTop + 2;
    emas.forEach(({ color, label }) => {
      ctx.fillStyle = color;
      ctx.fillText(label, legendX, legendY);
      legendX += ctx.measureText(label).width + 10;
    });
  }

  // Price labels (right axis)
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 3; i++) {
    const p = lo + (totalRange / 3) * i;
    const y = priceToY(p);
    const label = p >= 1000 ? p.toFixed(0) : p.toFixed(2);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(label, w - padRight + 6, y);
  }

  // Time labels
  if (visibleBars.length > 1) {
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const labelCount = visibleBars.length <= 8 ? visibleBars.length : Math.min(4, Math.floor(chartW / 80));
    const step = Math.max(1, Math.floor(visibleBars.length / labelCount));

    for (let i = 0; i < visibleBars.length; i += step) {
      const t = parseTime(visibleBars[i].time);
      const x = padLeft + barWidth * i + barWidth / 2;
      const label = subDaily
        ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
        : new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
      ctx.fillText(label, x, h - padBottom + 4);
    }
    const lastX = padLeft + barWidth * (visibleBars.length - 1) + barWidth / 2;
    const lastT = parseTime(visibleBars[visibleBars.length - 1].time);
    const lastLabel = subDaily
      ? new Date(lastT).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
      : new Date(lastT).toLocaleDateString([], { month: "short", day: "numeric" });
    ctx.fillText(lastLabel, lastX, h - padBottom + 4);
  }

  // Right axis separator
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(w - padRight, padTop); ctx.lineTo(w - padRight, h - padBottom); ctx.stroke();
}

function drawIndicator(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bars: Bar[],
  viewStart: number,
  viewEnd: number,
  type: "macd" | "rsi" | "zscore",
  subDaily: boolean,
) {
  ctx.clearRect(0, 0, w, h);
  const padRight = 56;
  const padLeft = 4;
  const padTop = 4;
  const padBottom = 18;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  if (chartW < 20 || chartH < 10 || !bars.length) return;

  const vs = Math.max(0, Math.min(viewStart, bars.length - 1));
  const ve = Math.max(1, Math.min(viewEnd, bars.length));
  const barWidth = chartW / (ve - vs);

  // Separator
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath(); ctx.moveTo(padLeft, padTop); ctx.lineTo(w - padRight, padTop); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w - padRight, padTop); ctx.lineTo(w - padRight, h - padBottom); ctx.stroke();

  if (type === "rsi") {
    const rsi = computeRSI(bars);
    if (rsi.size < 2) return;

    // Overbought/oversold zones
    const yToVal = (y: number) => 100 - ((y - padTop) / chartH) * 100;
    const valToY = (v: number) => padTop + chartH - (v / 100) * chartH;

    // 70/30 zones
    ctx.fillStyle = "rgba(248,113,113,0.04)";
    ctx.fillRect(padLeft, valToY(100), chartW, valToY(70) - valToY(100));
    ctx.fillStyle = "rgba(83,255,132,0.04)";
    ctx.fillRect(padLeft, valToY(30), chartW, valToY(0) - valToY(30));

    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 0.5;
    for (const v of [70, 30, 50]) {
      const y = valToY(v);
      ctx.beginPath(); ctx.moveTo(padLeft, y); ctx.lineTo(w - padRight, y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // RSI line
    ctx.strokeStyle = "rgba(168,85,247,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    let started = false;
    for (let i = vs; i < ve; i++) {
      const val = rsi.get(i);
      if (val == null) continue;
      const x = padLeft + (i - vs + 0.5) * barWidth;
      const y = valToY(val);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Labels
    ctx.font = "9px ui-monospace, SFMono-Regular, monospace";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const v of [30, 50, 70]) {
      ctx.fillText(v.toString(), w - padRight + 6, valToY(v));
    }

    // Legend
    ctx.fillStyle = "rgba(168,85,247,0.6)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("RSI 14", padLeft + 4, padTop + 1);

  } else if (type === "macd") {
    // MACD
    const { macd, signal, histogram } = computeMACD(bars);
    if (macd.size < 2) return;

    let minV = Infinity, maxV = -Infinity;
    for (const v of macd.values()) { if (v < minV) minV = v; if (v > maxV) maxV = v; }
    for (const v of signal.values()) { if (v < minV) minV = v; if (v > maxV) maxV = v; }
    for (const v of histogram.values()) { if (v < minV) minV = v; if (v > maxV) maxV = v; }
    const range = maxV - minV || 1;
    const pad = range * 0.1;
    minV -= pad; maxV += pad;
    const totalRange = maxV - minV;
    const valToY = (v: number) => padTop + chartH - ((v - minV) / totalRange) * chartH;
    const zeroY = valToY(0);

    // Zero line
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(padLeft, zeroY); ctx.lineTo(w - padRight, zeroY); ctx.stroke();

    // Histogram
    for (let i = vs; i < ve; i++) {
      const v = histogram.get(i);
      if (v == null) continue;
      const x = padLeft + (i - vs + 0.5) * barWidth;
      const y1 = valToY(0);
      const y2 = valToY(v);
      ctx.fillStyle = v >= 0 ? "rgba(83,255,132,0.3)" : "rgba(248,113,113,0.3)";
      ctx.fillRect(x - barWidth * 0.3, Math.min(y1, y2), barWidth * 0.6, Math.abs(y2 - y1));
    }

    // MACD line
    ctx.strokeStyle = "rgba(56,189,248,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    let started = false;
    for (let i = vs; i < ve; i++) {
      const val = macd.get(i);
      if (val == null) continue;
      const x = padLeft + (i - vs + 0.5) * barWidth;
      const y = valToY(val);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Signal line
    ctx.strokeStyle = "rgba(251,191,36,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    started = false;
    for (let i = vs; i < ve; i++) {
      const val = signal.get(i);
      if (val == null) continue;
      const x = padLeft + (i - vs + 0.5) * barWidth;
      const y = valToY(val);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Labels
    ctx.font = "9px ui-monospace, SFMono-Regular, monospace";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("0", w - padRight + 6, zeroY);

    // Legend
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(56,189,248,0.6)";
    ctx.fillText("MACD", padLeft + 4, padTop + 1);
    ctx.fillStyle = "rgba(251,191,36,0.6)";
    ctx.fillText("Signal", padLeft + 42, padTop + 1);
  } else {
    // Z-Score
    const zscore = computeZScore(bars);
    if (zscore.size < 2) return;

    const range = 5; // -3 to +3 is typical, pad to ±4
    const valToY = (v: number) => padTop + chartH - ((v + range) / (2 * range)) * chartH;

    // ±2 zones (overbought/oversold)
    ctx.fillStyle = "rgba(248,113,113,0.04)";
    ctx.fillRect(padLeft, valToY(range), chartW, valToY(2) - valToY(range));
    ctx.fillStyle = "rgba(83,255,132,0.04)";
    ctx.fillRect(padLeft, valToY(-2), chartW, valToY(-range) - valToY(-2));

    // Grid lines at ±1, ±2, 0
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 0.5;
    for (const v of [-2, -1, 0, 1, 2]) {
      const y = valToY(v);
      ctx.beginPath(); ctx.moveTo(padLeft, y); ctx.lineTo(w - padRight, y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Zero line (stronger)
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 0.8;
    const zeroY = valToY(0);
    ctx.beginPath(); ctx.moveTo(padLeft, zeroY); ctx.lineTo(w - padRight, zeroY); ctx.stroke();

    // Z-score line
    ctx.strokeStyle = "rgba(251,191,36,0.8)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let started = false;
    for (let i = vs; i < ve; i++) {
      const val = zscore.get(i);
      if (val == null) continue;
      const x = padLeft + (i - vs + 0.5) * barWidth;
      const y = valToY(Math.max(-range, Math.min(range, val)));
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Labels
    ctx.font = "9px ui-monospace, SFMono-Regular, monospace";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const v of [-2, 0, 2]) {
      ctx.fillText(v.toString(), w - padRight + 6, valToY(v));
    }

    // Legend
    ctx.fillStyle = "rgba(251,191,36,0.6)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Z-Score 20", padLeft + 4, padTop + 1);
  }
}

export function CandleChart({
  symbol,
  height = 220,
  resizable = false,
  onHeightChange,
  priceLevels = [],
  trendlines = [],
  onTrendlineAdd,
  onTrendlineUpdate,
  onTrendlineRemove,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const indicatorCanvasRef = useRef<HTMLCanvasElement>(null);
  const [days, setDays] = useState(1);
  const [loading, setLoading] = useState(true);
  const hasLoaded = useRef(false);
  const [error, setError] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [internalTrendlines, setInternalTrendlines] = useState<TrendLine[]>([]);
  const [selectedTlId, setSelectedTlId] = useState<number | null>(null);
  const [indicator, setIndicator] = useState<"none" | "macd" | "rsi" | "zscore">("none");
  const [showVP, setShowVP] = useState(false);
  const vpDataRef = useRef<VPRow[]>([]);
  const [showTape, setShowTape] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const nextIdRef = useRef(1);
  const priceZoomRef = useRef<{ lo: number; hi: number } | null>(null);
  const priceZoomAnchorRef = useRef<{ y: number; lo: number; hi: number } | null>(null);

  const activeTrendlines = onTrendlineAdd ? trendlines : internalTrendlines;
  const updateTl = (tl: TrendLine) => {
    if (onTrendlineUpdate) onTrendlineUpdate(tl);
    else setInternalTrendlines(prev => prev.map(t => t.id === tl.id ? tl : t));
  };
  const removeTl = (id: number) => {
    setSelectedTlId(null);
    if (onTrendlineRemove) onTrendlineRemove(id);
    else setInternalTrendlines(prev => prev.filter(t => t.id !== id));
  };

  const cgId = cgIdFromSymbol(symbol);
  const canChart = !!cgId;

  const barsRef = useRef<Bar[]>([]);
  const viewRef = useRef({ start: 0, end: 0 });
  const crossXRef = useRef<number | null>(null);
  const pinchRef = useRef({ active: false, dist: 0, startView: [0, 0] as [number, number] });
  const panRef = useRef({ active: false, startX: 0, startView: [0, 0] as [number, number] });

  // Drag state for trendlines: which tl, which endpoint ("start"/"end"/"move")
  const dragRef = useRef<{ tlId: number; mode: "start" | "end" | "move"; startTs: number; startPrice: number; origTl: TrendLine } | null>(null);
  // Overlay ref: when set, render uses this instead of activeTrendlines (avoids stale-canvas during drag)
  const dragTrendlinesRef = useRef<TrendLine[] | null>(null);

  // Helper: pixel coords to bar index + price
  const pixelToData = useCallback((px: number, py: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !barsRef.current.length) return null;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const s = buildDrawState(
      { scale: () => {} } as unknown as CanvasRenderingContext2D, w, h,
      barsRef.current, days <= 1, viewRef.current.start, viewRef.current.end || barsRef.current.length,
      priceZoomRef.current
    );
    const idx = Math.round(s.xToIdx(px));
    const price = s.yToPrice(py);
    const ts = parseTime(barsRef.current[Math.max(0, Math.min(idx, barsRef.current.length - 1))].time) || Date.now();
    return { idx, price, ts };
  }, [days]);

  // Helper: find trendline + hit-test which part
  const hitTestTrendline = useCallback((px: number, py: number): { tl: TrendLine; mode: "start" | "end" | "move" } | null => {
    const canvas = canvasRef.current;
    if (!canvas || !barsRef.current.length) return null;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const s = buildDrawState(
      { scale: () => {} } as unknown as CanvasRenderingContext2D, w, h,
      barsRef.current, days <= 1, viewRef.current.start, viewRef.current.end || barsRef.current.length,
      priceZoomRef.current
    );

    const timeToIdx = (ts: number): number => {
      const bars = barsRef.current;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < bars.length; i++) {
        const bt = parseTime(bars[i].time);
        const d = Math.abs(bt - ts);
        if (d < bestDist) { bestDist = d; best = i; }
        if (bt > ts) break;
      }
      return best;
    };

    let best: { tl: TrendLine; mode: "start" | "end" | "move"; dist: number } | null = null;

    for (const tl of activeTrendlines) {
      const x1 = s.idxToX(timeToIdx(tl.startTime));
      const y1 = s.priceToY(tl.startPrice);
      const x2 = s.idxToX(timeToIdx(tl.endTime));
      const y2 = s.priceToY(tl.endPrice);

      // Endpoints: 12px radius
      for (const [mode, ex, ey] of [["start", x1, y1], ["end", x2, y2]] as const) {
        const d = Math.sqrt((px - ex) ** 2 + (py - ey) ** 2);
        if (d < 12 && (!best || d < best.dist)) {
          best = { tl, mode, dist: d };
        }
      }

      // Line body: point-to-line distance, 8px threshold
      const lenSq = (x2 - x1) ** 2 + (y2 - y1) ** 2;
      if (lenSq > 0) {
        const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lenSq));
        const projX = x1 + t * (x2 - x1);
        const projY = y1 + t * (y2 - y1);
        const d = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
        if (d < 8 && (!best || d < best.dist)) {
          best = { tl, mode: "move", dist: d };
        }
      }
    }

    return best ? { tl: best.tl, mode: best.mode } : null;
  }, [activeTrendlines, days]);

  // Create a new trendline button handler
  const handleCreateTrendline = useCallback(() => {
    const bars = barsRef.current;
    if (!bars.length) return;
    const ve = viewRef.current.end || bars.length;
    const vs = viewRef.current.start;
    const mid = Math.floor((vs + ve) / 2);
    const span = Math.max(3, Math.floor((ve - vs) / 6));
    const midPrice = (s => { // use midpoint of visible price range
      const canvas = canvasRef.current;
      if (!canvas) return bars[Math.min(mid, bars.length - 1)].close;
      const rect = canvas.getBoundingClientRect();
      const st = buildDrawState(
        { scale: () => {} } as unknown as CanvasRenderingContext2D, rect.width, rect.height,
        bars, days <= 1, vs, ve, priceZoomRef.current
      );
      return (st.lo + st.hi) / 2;
    })();

    const newTl: TrendLine = {
      id: nextIdRef.current++,
      startTime: parseTime(bars[Math.max(0, mid - span)].time),
      startPrice: midPrice,
      endTime: parseTime(bars[Math.min(bars.length - 1, mid + span)].time),
      endPrice: midPrice,
      color: TL_COLORS[(onTrendlineAdd ? trendlines.length : internalTrendlines.length) % TL_COLORS.length],
    };
    if (onTrendlineAdd) {
      onTrendlineAdd(newTl);
    } else {
      setInternalTrendlines(prev => [...prev, newTl]);
    }
    setSelectedTlId(newTl.id);
  }, [days, onTrendlineAdd, trendlines, internalTrendlines]);

  const render = useCallback((bars: Bar[], subDaily: boolean, crossX?: number | null) => {
    if (!bars.length) {
      setEmpty(true);
      setLoading(false);
      return;
    }
    setEmpty(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w < 10 || h < 10) {
      requestAnimationFrame(() => render(bars, subDaily, crossX));
      return;
    }
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const v = viewRef.current;
    const vs = v.end === 0 ? 0 : v.start;
    const ve = v.end === 0 ? bars.length : v.end;

    const tls = dragTrendlinesRef.current ?? activeTrendlines;
    drawChart(ctx, w, h, bars, subDaily, vs, ve, crossX ?? crossXRef.current, priceLevels, tls, null, selectedTlId, priceZoomRef.current, vpDataRef.current);

    // Draw indicator panel
    if (indicator !== "none") {
      const indCanvas = indicatorCanvasRef.current;
      if (indCanvas) {
        const indRect = indCanvas.getBoundingClientRect();
        indCanvas.width = indRect.width * dpr;
        indCanvas.height = indRect.height * dpr;
        const indCtx = indCanvas.getContext("2d");
        if (indCtx) {
          indCtx.scale(dpr, dpr);
          drawIndicator(indCtx, indRect.width, indRect.height, bars, vs, ve, indicator, subDaily);
        }
      }
    }

  }, [priceLevels, activeTrendlines, selectedTlId, indicator]);

  // Keep a ref to latest render so the fetch effect doesn't re-fire on trendline changes
  const renderRef = useRef(render);
  renderRef.current = render;

  useEffect(() => {
    if (!canChart) return;

    let cancelled = false;
    if (!hasLoaded.current) setLoading(true);
    setError(false);

    const load = (initial: boolean) => {
      fetchOHLC(symbol, days)
        .then((data) => {
          if (cancelled) return;
          barsRef.current = data;
          hasLoaded.current = true;
          if (initial) {
            const visibleCount = days <= 1 ? 80 : data.length;
            const start = Math.max(0, data.length - visibleCount);
            viewRef.current = { start, end: data.length };
            priceZoomRef.current = null;
          } else {
            // If user was at the right edge, scroll to keep latest visible
            const v = viewRef.current;
            const prevLen = barsRef.current.length;
            if (v.end === 0 || v.end >= prevLen) {
              const range = v.end === 0 ? data.length : (v.end - v.start);
              const newStart = Math.max(0, data.length - range);
              viewRef.current = { start: newStart, end: data.length };
            }
          }
          setLoading(false);
          requestAnimationFrame(() => renderRef.current(data, days <= 1));
        })
        .catch(() => {
          if (!cancelled) { setError(true); setLoading(false); }
        });
    };

    const refreshMs = days <= 1 ? 5_000 : 15_000;
    load(true);
    const interval = setInterval(() => load(false), refreshMs);

    return () => { cancelled = true; clearInterval(interval); };
  }, [cgId, symbol, days, canChart]);

  // Re-render when trendlines change
  useEffect(() => {
    if (barsRef.current.length) render(barsRef.current, days <= 1);
  }, [activeTrendlines, render, days]);

  // ResizeObserver
  useEffect(() => {
    if (!canChart) return;
    let raf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (barsRef.current.length) render(barsRef.current, days <= 1);
      });
    });
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => { observer.disconnect(); cancelAnimationFrame(raf); };
  }, [canChart, days, render]);

  // Volume Profile fetch (crypto only)
  useEffect(() => {
    if (!showVP || !symbol.startsWith("BINANCE:") || !barsRef.current.length) {
      vpDataRef.current = [];
      return;
    }
    let cancelled = false;
    const bars = barsRef.current;
    const loadVP = () => {
      const from = Math.floor(parseTime(bars[0].time) / 1000);
      const to = Math.floor(parseTime(bars[bars.length - 1].time) / 1000);
      const resMap: Record<string, string> = { "1": "5", "5": "5", "15": "15", "60": "60", "D": "60" };
      fetchVolumeProfile(symbol, resMap[String(days)] || "60", from, to + 300)
        .then((data) => {
          if (cancelled) return;
          vpDataRef.current = data;
          if (barsRef.current.length) render(barsRef.current, days <= 1);
        });
    };
    loadVP();
    const interval = setInterval(loadVP, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [showVP, symbol, days, canChart, render]);

  // Tape fetch (crypto only) — poll every 2s
  useEffect(() => {
    if (!showTape || !symbol.startsWith("BINANCE:")) {
      setTrades([]);
      return;
    }
    let cancelled = false;
    const loadTape = () => {
      fetchTrades(symbol, 50).then((data) => {
        if (cancelled) return;
        setTrades(data.reverse()); // newest first
      });
    };
    loadTape();
    const interval = setInterval(loadTape, 2_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [showTape, symbol]);

  // Chart resize via drag handle
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { startY: e.clientY, startH: height };
  }, [height]);
  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current || !onHeightChange) return;
    const dy = e.clientY - resizeRef.current.startY;
    const newH = Math.max(120, Math.min(600, resizeRef.current.startH + dy));
    onHeightChange(newH);
  }, [onHeightChange]);
  const handleResizeEnd = useCallback(() => {
    resizeRef.current = null;
  }, []);

  // Pointer handlers: move/resize trendlines, crosshair, select
  const handlePointerMove = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    if (!barsRef.current.length) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e as React.PointerEvent).clientX - rect.left;
    const y = (e as React.PointerEvent).clientY - rect.top;
    const bars = barsRef.current;

    // Price axis zoom drag (desktop)
    if (priceZoomAnchorRef.current && !dragRef.current && !panRef.current.active) {
      const pe = e as React.PointerEvent;
      const dy = pe.clientY - priceZoomAnchorRef.current.y;
      const anchor = priceZoomAnchorRef.current;
      const origRange = anchor.hi - anchor.lo;
      const zoomFactor = Math.exp(-dy * 0.005);
      const newRange = Math.max(origRange * 0.02, Math.min(origRange * 50, origRange * zoomFactor));
      const mid = (anchor.lo + anchor.hi) / 2;
      priceZoomRef.current = { lo: mid - newRange / 2, hi: mid + newRange / 2 };
      render(bars, days <= 1, null);
      return;
    }

    // Panning (desktop)
    if (panRef.current.active && (e as React.PointerEvent).buttons === 1) {
      const dx = (e as React.PointerEvent).clientX - panRef.current.startX;
      const chartW = rect.width - 60;
      const barW = chartW / (panRef.current.startView[1] - panRef.current.startView[0]);
      const shift = Math.round(-dx / barW);
      const range = panRef.current.startView[1] - panRef.current.startView[0];
      let newStart = panRef.current.startView[0] + shift;
      newStart = Math.max(0, Math.min(bars.length - range, newStart));
      viewRef.current = { start: newStart, end: newStart + range };
      render(bars, days <= 1, null);
      return;
    }

    // Dragging a trendline
    if (dragRef.current && (e as React.PointerEvent).buttons === 1) {
      const data = pixelToData(x, y);
      if (!data) return;
      const drag = dragRef.current;
      const orig = drag.origTl;
      const dt = data.ts - drag.startTs;
      const dy = data.price - drag.startPrice;

      const updated: TrendLine = { ...orig };
      if (drag.mode === "start") {
        updated.startTime = orig.startTime + dt;
        updated.startPrice = orig.startPrice + dy;
      } else if (drag.mode === "end") {
        updated.endTime = orig.endTime + dt;
        updated.endPrice = orig.endPrice + dy;
      } else {
        updated.startTime = orig.startTime + dt;
        updated.endTime = orig.endTime + dt;
        updated.startPrice = orig.startPrice + dy;
        updated.endPrice = orig.endPrice + dy;
      }
      updateTl(updated);
      dragTrendlinesRef.current = activeTrendlines.map(t => t.id === updated.id ? updated : t);
      render(barsRef.current, days <= 1);
      return;
    }

    crossXRef.current = x;
    render(barsRef.current, days <= 1, x);
  }, [days, render, pixelToData, updateTl, activeTrendlines]);

  const handlePointerLeave = useCallback(() => {
    crossXRef.current = null;
    if (barsRef.current.length) render(barsRef.current, days <= 1, null);
  }, [days, render]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const data = pixelToData(x, y);

    // Hit-test trendlines
    if (data) {
      const hit = hitTestTrendline(x, y);
      if (hit) {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setSelectedTlId(hit.tl.id);
        dragRef.current = {
          tlId: hit.tl.id,
          mode: hit.mode,
          startTs: data.ts,
          startPrice: data.price,
          origTl: { ...hit.tl },
        };
        return;
      }
    }

    // Price axis zone: start price zoom drag (desktop)
    if (x > rect.width - 56) {
      const s = buildDrawState(
        { scale: () => {} } as unknown as CanvasRenderingContext2D, rect.width, rect.height,
        barsRef.current, days <= 1, viewRef.current.start, viewRef.current.end || barsRef.current.length,
        priceZoomRef.current
      );
      priceZoomAnchorRef.current = {
        y: e.clientY,
        lo: s.lo,
        hi: s.hi,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Empty space — start pan (desktop)
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedTlId(null);
    dragRef.current = null;
    panRef.current = {
      active: true,
      startX: e.clientX,
      startView: [viewRef.current.start, viewRef.current.end || barsRef.current.length],
    };
  }, [pixelToData, hitTestTrendline, days]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    panRef.current = { active: false, startX: 0, startView: [0, 0] };
    priceZoomAnchorRef.current = null;
    dragRef.current = null;
    dragTrendlinesRef.current = null;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = {
        active: true,
        dist: Math.sqrt(dx * dx + dy * dy),
        startView: [viewRef.current.start, viewRef.current.end || barsRef.current.length],
      };
    } else if (e.touches.length === 1 && !pinchRef.current.active) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const x = e.touches[0].clientX - rect.left;
        const y = e.touches[0].clientY - rect.top;
        const hit = hitTestTrendline(x, y);
        if (hit) {
          setSelectedTlId(hit.tl.id);
          dragRef.current = {
            tlId: hit.tl.id,
            mode: hit.mode,
            startTs: pixelToData(x, y)?.ts ?? Date.now(),
            startPrice: pixelToData(x, y)?.price ?? 0,
            origTl: { ...hit.tl },
          };
          return; // Don't start pan — this is a trendline drag
        }

        // Price axis zone: start price zoom drag
        if (x > rect.width - 56) {
          const s = buildDrawState(
            { scale: () => {} } as unknown as CanvasRenderingContext2D, rect.width, rect.height,
            barsRef.current, days <= 1, viewRef.current.start, viewRef.current.end || barsRef.current.length,
            priceZoomRef.current
          );
          priceZoomAnchorRef.current = {
            y: e.touches[0].clientY,
            lo: s.lo,
            hi: s.hi,
          };
          return; // Don't start pan
        }
      }
      panRef.current = {
        active: true,
        startX: e.touches[0].clientX,
        startView: [viewRef.current.start, viewRef.current.end || barsRef.current.length],
      };
    }
  }, [hitTestTrendline, pixelToData, days]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const bars = barsRef.current;
    if (!bars.length) return;

    // Price axis zoom drag
    if (priceZoomAnchorRef.current && e.touches.length === 1) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dy = e.touches[0].clientY - priceZoomAnchorRef.current.y;
      const anchor = priceZoomAnchorRef.current;
      const origRange = anchor.hi - anchor.lo;
      const zoomFactor = Math.exp(-dy * 0.005); // drag up = zoom in
      const newRange = Math.max(origRange * 0.02, Math.min(origRange * 50, origRange * zoomFactor));
      // Anchor at center of original range
      const mid = (anchor.lo + anchor.hi) / 2;
      priceZoomRef.current = { lo: mid - newRange / 2, hi: mid + newRange / 2 };
      render(bars, days <= 1, null);
      return;
    }

    // Trendline drag (takes priority over pan)
    if (dragRef.current && e.touches.length === 1) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      const y = e.touches[0].clientY - rect.top;
      const data = pixelToData(x, y);
      if (!data) return;
      const drag = dragRef.current;
      const orig = drag.origTl;
      const dt = data.ts - drag.startTs;
      const dy = data.price - drag.startPrice;

      const updated: TrendLine = { ...orig };
      if (drag.mode === "start") {
        updated.startTime = orig.startTime + dt;
        updated.startPrice = orig.startPrice + dy;
      } else if (drag.mode === "end") {
        updated.endTime = orig.endTime + dt;
        updated.endPrice = orig.endPrice + dy;
      } else {
        updated.startTime = orig.startTime + dt;
        updated.endTime = orig.endTime + dt;
        updated.startPrice = orig.startPrice + dy;
        updated.endPrice = orig.endPrice + dy;
      }
      updateTl(updated);
      dragTrendlinesRef.current = activeTrendlines.map(t => t.id === updated.id ? updated : t);
      render(bars, days <= 1);
      return;
    }

    if (pinchRef.current.active && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = pinchRef.current.dist / dist;
      const [sStart, sEnd] = pinchRef.current.startView;
      const range = sEnd - sStart;
      const center = sStart + range / 2;
      const newRange = Math.max(5, Math.min(bars.length, Math.round(range * scale)));
      const newStart = Math.max(0, Math.min(bars.length - newRange, Math.round(center - newRange / 2)));
      viewRef.current = { start: newStart, end: newStart + newRange };
      render(bars, days <= 1, null);
    } else if (panRef.current.active && e.touches.length === 1) {
      const dx = e.touches[0].clientX - panRef.current.startX;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const chartW = canvas.getBoundingClientRect().width - 60;
      const barW = chartW / (panRef.current.startView[1] - panRef.current.startView[0]);
      const shift = Math.round(-dx / barW);
      const range = panRef.current.startView[1] - panRef.current.startView[0];
      let newStart = panRef.current.startView[0] + shift;
      newStart = Math.max(0, Math.min(bars.length - range, newStart));
      viewRef.current = { start: newStart, end: newStart + range };
      render(bars, days <= 1, null);
    }
  }, [days, render, pixelToData, updateTl]);

  const handleTouchEnd = useCallback(() => {
    pinchRef.current = { active: false, dist: 0, startView: [0, 0] };
    panRef.current = { active: false, startX: 0, startView: [0, 0] };
    dragRef.current = null;
    priceZoomAnchorRef.current = null;
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const bars = barsRef.current;
    if (!bars.length) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;

    // Price axis zone: right padRight (56px)
    if (mx > rect.width - 56) {
      const s = buildDrawState(
        { scale: () => {} } as unknown as CanvasRenderingContext2D, rect.width, rect.height,
        bars, days <= 1, viewRef.current.start, viewRef.current.end || bars.length,
        priceZoomRef.current
      );
      const priceAtY = s.yToPrice(e.clientY - rect.top);
      const zoomFactor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const curRange = s.hi - s.lo;
      const newRange = Math.max(curRange * 0.02, Math.min(curRange * 50, curRange * zoomFactor));
      const ratio = (priceAtY - s.lo) / (s.hi - s.lo);
      const newLo = priceAtY - newRange * ratio;
      const newHi = priceAtY + newRange * (1 - ratio);
      priceZoomRef.current = { lo: newLo, hi: newHi };
      render(bars, days <= 1, null);
      return;
    }

    // Time axis zoom
    const [curStart, curEnd] = [viewRef.current.start, viewRef.current.end || bars.length];
    const range = curEnd - curStart;
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const newRange = Math.max(5, Math.min(bars.length, Math.round(range * zoomFactor)));

    const mxNorm = mx / rect.width;
    const center = curStart + range * mxNorm;
    let newStart = Math.round(center - newRange * mxNorm);
    newStart = Math.max(0, Math.min(bars.length - newRange, newStart));

    viewRef.current = { start: newStart, end: newStart + newRange };
    render(bars, days <= 1, null);
  }, [days, render]);

  if (!canChart) return null;

  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", gap: "6px", marginBottom: "8px", alignItems: "center", minHeight: 28 }}
        onPointerDown={e => e.stopPropagation()}
      >
        {TF.map((t) => (
          <button
            key={t.days}
            onClick={() => setDays(t.days)}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              border: "none",
              background: days === t.days ? "var(--lime-dim)" : "transparent",
              color: days === t.days ? "var(--lime)" : "var(--text-dim)",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={handleCreateTrendline}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              border: "none",
              background: "rgba(255,107,107,0.1)",
              color: "#ff6b6b",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
            }}
          >
            + Line
          </button>
          <button
            onClick={() => removeTl(selectedTlId!)}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              border: "none",
              background: "transparent",
              color: "var(--text-dim)",
              fontSize: "12px",
              fontWeight: 500,
              cursor: selectedTlId != null ? "pointer" : "default",
              visibility: selectedTlId != null ? "visible" : "hidden",
            }}
          >
            Del
          </button>
          <button
            onClick={() => setIndicator(indicator === "macd" ? "none" : "macd")}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              border: "none",
              background: indicator === "macd" ? "rgba(56,189,248,0.12)" : "transparent",
              color: indicator === "macd" ? "rgba(56,189,248,0.8)" : "var(--text-dim)",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
            }}
          >
            MACD
          </button>
          <button
            onClick={() => setIndicator(indicator === "rsi" ? "none" : "rsi")}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              border: "none",
              background: indicator === "rsi" ? "rgba(168,85,247,0.12)" : "transparent",
              color: indicator === "rsi" ? "rgba(168,85,247,0.8)" : "var(--text-dim)",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
            }}
          >
            RSI
          </button>
          <button
            onClick={() => setIndicator(indicator === "zscore" ? "none" : "zscore")}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              border: "none",
              background: indicator === "zscore" ? "rgba(251,191,36,0.12)" : "transparent",
              color: indicator === "zscore" ? "rgba(251,191,36,0.8)" : "var(--text-dim)",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
            }}
          >
            Z
          </button>
          {symbol.startsWith("BINANCE:") && (
            <button
              onClick={() => setShowVP(v => !v)}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                border: "none",
                background: showVP ? "rgba(132,204,22,0.12)" : "transparent",
                color: showVP ? "rgba(163,230,53,0.8)" : "var(--text-dim)",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
              }}
            >
              VP
            </button>
          )}
          {symbol.startsWith("BINANCE:") && (
            <button
              onClick={() => setShowTape(v => !v)}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                border: "none",
                background: showTape ? "rgba(56,189,248,0.12)" : "transparent",
                color: showTape ? "rgba(56,189,248,0.8)" : "var(--text-dim)",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
              }}
            >
              TAPE
            </button>
          )}
        </div>
      </div>
      <div
        style={{
          borderRadius: "12px",
          overflow: "hidden",
          background: "rgba(255,255,255,0.02)",
          position: "relative",
          height,
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        <canvas
          ref={canvasRef}
          draggable={false}
          onDragStart={e => e.preventDefault()}
          style={{ display: "block", width: "100%", height: "100%" }}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
        />
        {loading && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-dim)", fontSize: "13px", zIndex: 1,
          }}>Loading chart...</div>
        )}
        {error && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-dim)", fontSize: "13px", zIndex: 1,
          }}>Chart unavailable</div>
        )}
        {empty && !loading && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-dim)", fontSize: "13px", zIndex: 1,
          }}>No chart data</div>
        )}
      </div>
      {/* Indicator panel */}
      {indicator !== "none" && (
        <div style={{
          borderRadius: "0 0 12px 12px",
          overflow: "hidden",
          background: "rgba(255,255,255,0.02)",
          height: 80,
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}>
          <canvas
            ref={indicatorCanvasRef}
            draggable={false}
            onDragStart={e => e.preventDefault()}
            style={{ display: "block", width: "100%", height: "100%" }}
          />
        </div>
      )}
      {resizable && (
        <div
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          style={{
            height: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "ns-resize",
            userSelect: "none",
            WebkitUserSelect: "none",
            touchAction: "none",
          }}
        >
          <div style={{ width: 32, height: 3, borderRadius: 2, background: "var(--text-dim)", opacity: 0.3 }} />
        </div>
      )}
      {/* Tape — trade feed below chart */}
      {showTape && symbol.startsWith("BINANCE:") && trades.length > 0 && (() => {
        const fmtP = (p: number) => p >= 1000 ? p.toFixed(0) : p >= 1 ? p.toFixed(2) : p.toFixed(4);
        const fmtT = (t: number) => {
          const d = new Date(t);
          return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
        };
        const buys = trades.filter(t => !t.isBuyerMaker).length;
        const sells = trades.length - buys;
        return (
          <div style={{
            marginTop: "8px",
            borderRadius: "12px",
            overflow: "hidden",
            background: "rgba(255,255,255,0.02)",
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
          }}>
            {/* Header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "6px 12px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Tape</span>
              <div style={{ display: "flex", gap: "12px" }}>
                <span style={{ fontSize: "9px", color: "rgba(83,255,132,0.6)" }}>{buys} buys</span>
                <span style={{ fontSize: "9px", color: "rgba(248,113,113,0.6)" }}>{sells} sells</span>
              </div>
            </div>
            {/* Column labels */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "3px 12px", fontSize: "9px", color: "rgba(255,255,255,0.3)", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <span>Time</span>
              <span style={{ textAlign: "right" }}>Price</span>
              <span style={{ textAlign: "right" }}>Size</span>
            </div>
            {/* Trade rows */}
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              {trades.map((t, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                  padding: "2px 12px", fontSize: "11px",
                  borderBottom: "1px solid rgba(255,255,255,0.02)",
                }}>
                  <span style={{ color: "rgba(255,255,255,0.3)" }}>{fmtT(t.time)}</span>
                  <span style={{ textAlign: "right", color: t.isBuyerMaker ? "rgba(248,113,113,0.9)" : "rgba(83,255,132,0.9)" }}>{fmtP(t.price)}</span>
                  <span style={{ textAlign: "right", color: "rgba(255,255,255,0.5)" }}>{t.qty.toFixed(t.qty >= 100 ? 0 : t.qty >= 1 ? 2 : 4)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
