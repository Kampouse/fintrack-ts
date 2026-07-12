// @ts-nocheck
// This file is a 1:1 port of kiyotaka-chart (vanilla JS) — echarts 5 type defs are incomplete for graphic API
import { useEffect, useRef, useCallback, useState } from "react";
import * as echarts from "echarts";
import { Line as ZrLine, Rect as ZrRect, Text as ZrText, Polyline as ZrPolyline } from "zrender";
import { labelFromSymbol } from "@/lib/constants";

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

interface KiyotakaTerminalProps {
  symbol: string;
  onBack: () => void;
}

interface ChartState {
  sidebarOpen: boolean;
  chartStyle: "candles" | "line" | "area" | "heikinAshi";
  indicators: { sma: boolean; ema: boolean; bollinger: boolean; vwap: boolean };
  subIndicators: { rsi: boolean; macd: boolean };
  dataSources: { momentum: boolean; bodyRatio: boolean; volume: boolean };
}

interface ParsedBar {
  date: string;
  ohlc: number[]; // [open, close, low, high]
  volume: number;
  bodyRatio: number;
}

interface GraphicEl {
  _resizeAbove?: string;
  _resizeBelow?: string;
}

/* ═══════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════ */

const GREEN = "#00EC97";
const RED = "#FF4D4D";
const BG = "#0f0f11";
const GRID = "rgba(255,255,255,.04)";
const AXIS_LABEL = "#777";
const MOMENTUM_THRESHOLD = 0.85;
const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif";

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_LABELS = ["0%", "23.6%", "38.2%", "50%", "61.8%", "78.6%", "100%"];
const FIB_COLORS = [
  "rgba(255,77,77,.6)", "rgba(255,160,50,.6)", "rgba(0,236,151,.6)",
  "rgba(100,149,237,.6)", "rgba(0,236,151,.6)", "rgba(255,160,50,.6)", "rgba(255,77,77,.6)",
];
const DRAW_COLOR = "#00EC97";
const MIN_HEIGHT = 6;
const RESIZE_ZONE = 4;

/* ═══════════════════════════════════════════════════════════════
   Pure indicator calculation functions (ported from kiyotaka)
   ═══════════════════════════════════════════════════════════════ */

function calcSMA(data: number[], period: number): (number | string)[] {
  const result: (number | string)[] = data.map(() => "-");
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j];
    result[i] = +(sum / period).toFixed(4);
  }
  return result;
}

function calcEMA(data: (number | string)[], period: number): (number | string)[] {
  const result: (number | string)[] = data.map(() => "-");
  const k = 2 / (period + 1);
  const valid: { idx: number; val: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== "-") valid.push({ idx: i, val: data[i] as number });
  }
  if (valid.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += valid[i].val;
  let ema = sum / period;
  result[valid[period - 1].idx] = +ema.toFixed(6);
  for (let i = period; i < valid.length; i++) {
    ema = valid[i].val * k + ema * (1 - k);
    result[valid[i].idx] = +ema.toFixed(6);
  }
  return result;
}

function calcBollinger(
  data: number[],
  period: number,
  mult: number,
): { mid: (number | string)[]; upper: (number | string)[]; lower: (number | string)[] } {
  const mid = calcSMA(data, period);
  const upper: (number | string)[] = data.map(() => "-");
  const lower: (number | string)[] = data.map(() => "-");
  for (let i = period - 1; i < data.length; i++) {
    if (mid[i] === "-") continue;
    let sumSq = 0;
    for (let j = 0; j < period; j++) sumSq += (data[i - j] - (mid[i] as number)) ** 2;
    const std = Math.sqrt(sumSq / period);
    upper[i] = +((mid[i] as number) + mult * std).toFixed(4);
    lower[i] = +((mid[i] as number) - mult * std).toFixed(4);
  }
  return { mid, upper, lower };
}

function calcVWAP(ohlc: number[][], volumes: number[]): (number | string)[] {
  const result: (number | string)[] = [];
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < ohlc.length; i++) {
    const tp = (ohlc[i][0] + ohlc[i][1] + ohlc[i][2] + ohlc[i][3]) / 4;
    cumPV += tp * volumes[i];
    cumV += volumes[i];
    result.push(cumV > 0 ? +(cumPV / cumV).toFixed(4) : "-");
  }
  return result;
}

function calcRSI(data: number[], period: number): (number | string)[] {
  const result: (number | string)[] = data.map(() => "-");
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
        const rs = avgLoss === 0 ? 999 : avgGain / avgLoss;
        result[i] = +(100 - 100 / (1 + rs)).toFixed(2);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgLoss === 0 ? 999 : avgGain / avgLoss;
      result[i] = +(100 - 100 / (1 + rs)).toFixed(2);
    }
  }
  return result;
}

function calcMACD(
  data: number[],
  fast: number,
  slow: number,
  sig: number,
): { macd: (number | string)[]; signal: (number | string)[]; histogram: (number | string)[] } {
  const emaFast = calcEMA(data, fast);
  const emaSlow = calcEMA(data, slow);
  const macdLine: (number | string)[] = data.map(() => "-");
  for (let i = 0; i < data.length; i++) {
    if (emaFast[i] === "-" || emaSlow[i] === "-") continue;
    macdLine[i] = +((emaFast[i] as number) - (emaSlow[i] as number)).toFixed(6);
  }
  const signalLine = calcEMA(macdLine, sig);
  const histogram: (number | string)[] = data.map(() => "-");
  for (let i = 0; i < data.length; i++) {
    if (macdLine[i] === "-" || signalLine[i] === "-") continue;
    histogram[i] = +((macdLine[i] as number) - (signalLine[i] as number)).toFixed(6);
  }
  return { macd: macdLine, signal: signalLine, histogram };
}

function calcHeikinAshi(ohlc: number[][]): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < ohlc.length; i++) {
    const [o, c, l, h] = ohlc[i];
    const haC = (o + c + l + h) / 4;
    const haO = i === 0 ? (o + c) / 2 : (result[i - 1][0] + result[i - 1][1]) / 2;
    const haH = Math.max(h, haO, haC);
    const haL = Math.min(l, haO, haC);
    result.push([+haO.toFixed(4), +haC.toFixed(4), +haL.toFixed(4), +haH.toFixed(4)]);
  }
  return result;
}

/* ═══════════════════════════════════════════════════════════════
   Data fetcher — supports multiple intervals
   ═══════════════════════════════════════════════════════════════ */
/* ── Downsample algorithms (from kiyotaka renderer) ── */

// minmaxDownSample: merge N bars into 1, preserving OHLC wicks
function minmaxDownSample(bars: ParsedBar[], factor: number): ParsedBar[] {
  if (factor <= 1 || bars.length <= 1) return bars;
  const out: ParsedBar[] = [];
  const bucketSize = Math.max(1, Math.round(factor));
  for (let i = 0; i < bars.length; i += bucketSize) {
    const end = Math.min(i + bucketSize, bars.length);
    let o = bars[i].ohlc[0], c = bars[end - 1].ohlc[1];
    let h = -Infinity, l = Infinity;
    let vol = 0;
    for (let j = i; j < end; j++) {
      if (bars[j].ohlc[3] > h) h = bars[j].ohlc[3];
      if (bars[j].ohlc[2] < l) l = bars[j].ohlc[2];
      vol += bars[j].volume;
    }
    out.push({
      date: bars[i].date,
      ohlc: [o, c, l, h],
      volume: vol,
      bodyRatio: +((Math.abs(c - o) / (h - l || 1)) * 100).toFixed(1),
    });
  }
  return out;
}

// ltbDownSample: Largest Triangle Three Buckets — visually accurate decimation
function lttbDownSample(bars: ParsedBar[], targetCount: number): ParsedBar[] {
  if (targetCount >= bars.length || bars.length <= 3) return bars;
  const n = bars.length;
  // Use close price as the Y value for area calculation
  const dataX: number[] = [];
  const dataY: number[] = [];
  for (let i = 0; i < n; i++) {
    dataX.push(i);
    dataY.push(bars[i].ohlc[1]); // close
  }

  const sampled: ParsedBar[] = [];
  sampled.push(bars[0]); // Always keep first

  // Bucket size (each bucket = one output point)
  const bucketSize = (n - 2) / (targetCount - 2);

  let a = 0; // Previous selected point index
  for (let i = 0; i < targetCount - 2; i++) {
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);
    const bucketMid = Math.floor((bucketStart + bucketEnd) / 2);

    // Calculate average Y of next bucket (for triangle area)
    const nextBucketStart = bucketEnd;
    const nextBucketEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, n);
    let avgY = 0, avgCount = 0;
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      avgY += dataY[j]; avgCount++;
    }
    if (avgCount === 0) avgY = dataY[bucketMid];
    else avgY /= avgCount;

    // Find point in current bucket with max triangle area
    let maxArea = -1, maxIdx = bucketStart;
    for (let j = bucketStart; j < bucketEnd; j++) {
      const area = Math.abs(
        (dataX[a] - dataX[j]) * (avgY - dataY[a]) -
        (dataX[a] - dataX[bucketMid]) * (dataY[j] - dataY[a])
      ) * 0.5;
      if (area > maxArea) { maxArea = area; maxIdx = j; }
    }
    sampled.push(bars[maxIdx]);
    a = maxIdx;
  }

  sampled.push(bars[n - 1]); // Always keep last
  return sampled;
}

// Adaptive downsampling: pick the best algorithm based on factor
function adaptiveDownsample(bars: ParsedBar[], targetBars: number): ParsedBar[] {
  if (targetBars >= bars.length) return bars;
  const factor = bars.length / targetBars;
  // For moderate downsampling (2-8x), minmax preserves wicks better
  // For extreme downsampling (>8x), lttb is more visually accurate
  if (factor <= 8) return minmaxDownSample(bars, factor);
  return lttbDownSample(bars, targetBars);
}

// Bar width target: bars per pixel at which candles start looking like lines
const MIN_BAR_WIDTH_PX = 3; // at least 3px per candle

// TfInterval type for finer-grained fetch
type TfInterval = "1d" | "4h" | "1h" | "15m";

// Zoom-in: fetch finer data when visible bars < 10% of total available
// ~36 bars on 365 daily candles — user can clearly see individual candles
const ZOOM_IN_FETCH_PCT = 0.10;

// Tier order for zoom-in upgrades: 1d → 4h → 1h → 15m
const TF_ZOOM_IN_ORDER: TfInterval[] = ["1d", "4h", "1h", "15m"];

function nextFinerInterval(current: TfInterval): TfInterval | null {
  const idx = TF_ZOOM_IN_ORDER.indexOf(current);
  return idx < TF_ZOOM_IN_ORDER.length - 1 ? TF_ZOOM_IN_ORDER[idx + 1] : null;
}

async function fetchKlines(symbol: string, interval: TfInterval = "1d", startTime?: number, endTime?: number): Promise<ParsedBar[]> {
  const binanceSymbol = symbol.replace("BINANCE:", "");
  let url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(binanceSymbol)}&interval=${interval}&limit=1000`;
  if (startTime) url += `&startTime=${startTime}`;
  if (endTime) url += `&endTime=${endTime}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const raw: unknown[][] = await res.json();
  if (!raw?.length) return [];

  const bars: ParsedBar[] = [];
  const isSubDaily = interval !== "1d";

  for (const row of raw) {
    const d = row[0] as number;
    const o = +(row[1]);
    const h = +(row[2]);
    const l = +(row[3]);
    const c = +(row[4]);
    const v = +(row[5]);
    // Sub-daily: show time, daily: show date
    const dateStr = isSubDaily
      ? new Date(d).toISOString().slice(0, 16).replace("T", " ")
      : new Date(d).toISOString().slice(0, 10);
    const body = Math.abs(c - o);
    const range = h - l;
    const ratio = range > 0 ? body / range : 0;
    bars.push({
      date: dateStr,
      ohlc: [o, c, l, h],
      volume: v,
      bodyRatio: +(ratio * 100).toFixed(1),
    });
  }

  return bars;
}

/* ═══════════════════════════════════════════════════════════════
   Inline CSS as a string (injected once)
   ═══════════════════════════════════════════════════════════════ */

const KIYOTAKA_CSS = `
  .kt-root, .kt-root *, .kt-root *::before, .kt-root *::after {
    box-sizing: border-box; margin: 0; padding: 0;
  }
  .kt-root {
    position: fixed; inset: 0;
    display: flex; flex-direction: column;
    width: 100%; height: 100vh; height: 100dvh;
    background: #0f0f11;
    color: #e0e0e0;
    font-family: ${FONT};
    -webkit-font-smoothing: antialiased;
    z-index: 9999;
    overflow: hidden;
  }
  .kt-root ::-webkit-scrollbar { display: none; }
  .kt-root { -ms-overflow-style: none; scrollbar-width: none; }

  /* Header */
  .kt-header {
    flex-shrink: 0;
    display: flex; align-items: center; gap: 16px;
    padding: 12px 20px;
    background: #0f0f11;
    border-bottom: 1px solid #1e1e22;
    min-height: 56px;
  }
  .kt-back-btn {
    width: 36px; height: 36px;
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: 1px solid #1e1e22; border-radius: 8px;
    color: #888; cursor: pointer; transition: all .15s;
    flex-shrink: 0;
  }
  .kt-back-btn:hover { background: rgba(255,255,255,.06); color: #ccc; }
  .kt-back-btn svg { width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; }

  .kt-sidebar-toggle {
    width: 36px; height: 36px;
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: 1px solid #1e1e22; border-radius: 8px;
    color: #888; cursor: pointer; transition: all .15s;
    flex-shrink: 0;
  }
  .kt-sidebar-toggle:hover { background: rgba(255,255,255,.06); color: #ccc; }
  .kt-sidebar-toggle.active { background: rgba(0,236,151,.12); color: #00EC97; border-color: rgba(0,236,151,.3); }
  .kt-sidebar-toggle svg { width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; }

  .kt-symbol-badge { display: flex; align-items: baseline; gap: 8px; }
  .kt-tf-badge {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
  }
  .kt-tf-btn {
    font-size: 11px;
    color: #666;
    background: rgba(255, 255, 255, .03);
    border: 1px solid transparent;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 600;
    letter-spacing: .5px;
    cursor: pointer;
    transition: all .15s;
  }
  .kt-tf-btn:hover { color: #aaa; background: rgba(255,255,255,.06); }
  .kt-tf-btn.active { color: #00EC97; background: rgba(0,236,151,.12); border-color: rgba(0,236,151,.25); }
  .kt-symbol { font-size: 18px; font-weight: 700; color: #fff; letter-spacing: .3px; }
  .kt-pair-label { font-size: 13px; color: #888; font-weight: 500; }
  .kt-price-block { display: flex; align-items: baseline; gap: 10px; }
  .kt-price { font-size: 22px; font-weight: 700; color: #fff; font-variant-numeric: tabular-nums; }
  .kt-change { font-size: 13px; font-weight: 600; padding: 3px 8px; border-radius: 4px; font-variant-numeric: tabular-nums; }
  .kt-change.up { color: #00EC97; background: rgba(0,236,151,.1); }
  .kt-change.down { color: #FF4D4D; background: rgba(255,77,77,.1); }

  .kt-stats {
    margin-left: auto;
    display: flex; gap: 20px; font-size: 12px; color: #666;
  }
  .kt-stats span { font-variant-numeric: tabular-nums; }
  .kt-stats .kt-label { color: #555; margin-right: 4px; }

  .kt-loader {
    display: flex; align-items: center; justify-content: center;
    width: 100%; flex: 1;
    color: #00EC97; font-size: 14px; letter-spacing: 1px;
  }
  .kt-loader::before {
    content: ''; display: inline-block; width: 14px; height: 14px;
    border: 2px solid #00EC97; border-top-color: transparent;
    border-radius: 50%; animation: kt-spin .7s linear infinite; margin-right: 10px;
  }
  @keyframes kt-spin { to { transform: rotate(360deg); } }

  /* Main area */
  .kt-main-area { display: flex; flex: 1; overflow: hidden; position: relative; }

  /* Sidebar */
  .kt-sb-wrapper {
    width: 0; flex-shrink: 0; overflow: hidden;
    transition: width .3s cubic-bezier(.4,0,.2,1);
  }
  .kt-sb-wrapper.open { width: 280px; }

  .kt-sidebar {
    width: 280px; height: 100%;
    background: rgba(15,15,17,.96);
    border-right: 1px solid #1e1e22;
    backdrop-filter: blur(12px);
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .kt-sb-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 16px 12px;
    border-bottom: 1px solid #1e1e22;
    flex-shrink: 0;
  }
  .kt-sb-title { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: .3px; }
  .kt-sb-close {
    width: 32px; height: 32px;
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; border-radius: 6px;
    color: #666; cursor: pointer; transition: all .15s;
  }
  .kt-sb-close:hover { background: rgba(255,255,255,.08); color: #ccc; }
  .kt-sb-close svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; }

  .kt-sb-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 8px 0; }

  /* Category */
  .kt-sb-cat { border-bottom: 1px solid rgba(255,255,255,.04); }
  .kt-sb-cat-toggle {
    width: 100%; display: flex; align-items: center; gap: 10px;
    padding: 12px 16px;
    background: transparent; border: none;
    color: #ccc; font-size: 12px; font-weight: 600;
    text-transform: uppercase; letter-spacing: .8px;
    cursor: pointer; transition: all .15s;
  }
  .kt-sb-cat-toggle:hover { background: rgba(255,255,255,.03); color: #fff; }
  .kt-sb-cat-icon { font-size: 14px; flex-shrink: 0; }
  .kt-sb-cat-label { flex: 1; text-align: left; }
  .kt-sb-chevron {
    width: 16px; height: 16px; stroke: #666; fill: none;
    stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
    transition: transform .25s ease;
  }
  .kt-sb-cat-toggle.collapsed .kt-sb-chevron { transform: rotate(-90deg); }

  .kt-sb-cat-items {
    max-height: 400px; overflow: hidden;
    transition: max-height .3s ease, opacity .2s;
    opacity: 1;
  }
  .kt-sb-cat-items.collapsed { max-height: 0; opacity: 0; }

  /* Item */
  .kt-sb-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 16px;
    cursor: pointer; transition: background .15s;
  }
  .kt-sb-item:hover { background: rgba(255,255,255,.03); }
  .kt-sb-item-color {
    width: 10px; height: 10px; border-radius: 50%;
    flex-shrink: 0;
  }
  .kt-sb-item-color.line { border-radius: 3px; height: 3px; width: 16px; }
  .kt-sb-item-info { flex: 1; min-width: 0; }
  .kt-sb-item-name { font-size: 13px; font-weight: 600; color: #ddd; line-height: 1.3; }
  .kt-sb-item-desc { font-size: 11px; color: #666; line-height: 1.3; margin-top: 1px; }

  /* Toggle switch */
  .kt-sb-toggle {
    width: 38px; height: 22px; border-radius: 11px;
    background: #2a2a2e; position: relative;
    flex-shrink: 0; cursor: pointer;
    transition: background .2s;
  }
  .kt-sb-toggle.active { background: rgba(0,236,151,.5); }
  .kt-sb-toggle-thumb {
    width: 18px; height: 18px; border-radius: 50%;
    background: #888; position: absolute; top: 2px; left: 2px;
    transition: all .2s;
  }
  .kt-sb-toggle.active .kt-sb-toggle-thumb {
    left: 18px; background: #00EC97;
  }

  /* Radio dot */
  .kt-sb-radio-dot {
    width: 18px; height: 18px; border-radius: 50%;
    border: 2px solid #444; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: all .2s; cursor: pointer;
  }
  .kt-sb-radio-dot.active {
    border-color: #00EC97;
    box-shadow: inset 0 0 0 3px #00EC97;
  }

  /* Backdrop */
  .kt-sb-backdrop {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,.5); z-index: 149;
  }

  /* Chart area */
  .kt-chart { flex: 1; position: relative; min-width: 0; }

  /* Drawing Toolbar */
  .kt-draw-toolbar {
    position: absolute; top: 10px; left: 60px; z-index: 100;
    display: flex; gap: 2px; padding: 4px;
    background: rgba(15,15,17,.92);
    border: 1px solid #1e1e22;
    border-radius: 8px;
    backdrop-filter: blur(8px);
  }
  .kt-draw-btn {
    width: 36px; height: 36px;
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; border-radius: 6px;
    color: #888; cursor: pointer; font-size: 18px;
    transition: all .15s;
  }
  .kt-draw-btn:hover { background: rgba(255,255,255,.06); color: #ccc; }
  .kt-draw-btn.active { background: rgba(0,236,151,.15); color: #00EC97; }
  .kt-draw-btn svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .kt-draw-sep { width: 1px; background: #1e1e22; margin: 4px 2px; }

  /* Mobile */
  @media (max-width: 640px) {
    .kt-header { padding: 10px 14px; gap: 10px; }
    .kt-draw-toolbar { left: 6px; padding: 3px; gap: 1px; }
    .kt-draw-btn { width: 42px; height: 42px; }
    .kt-draw-btn svg { width: 22px; height: 22px; }
    .kt-symbol { font-size: 15px; }
    .kt-price { font-size: 18px; }
    .kt-stats { display: none; }
    .kt-pair-label { display: none; }
    .kt-sb-wrapper { position: fixed; left: 0; top: 0; bottom: 0; z-index: 200; width: 0 !important; }
    .kt-sb-wrapper.open { width: 100% !important; }
    .kt-sidebar { width: 300px; max-width: 85vw; }
    .kt-sb-backdrop.show { display: block; }
    .kt-draw-toolbar { left: 10px; }
  }
`;

/* ═══════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════ */

let cssInjected = false;

export default function KiyotakaTerminal({ symbol, onBack }: KiyotakaTerminalProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const stateRef = useRef<ChartState>({
    sidebarOpen: false,
    chartStyle: "candles",
    indicators: { sma: false, ema: false, bollinger: false, vwap: false },
    subIndicators: { rsi: false, macd: false },
    dataSources: { momentum: true, bodyRatio: true, volume: true },
  });
  const dataRef = useRef<{
    bars: ParsedBar[];
    dates: string[];
    ohlc: number[][];
    volumes: number[];
    bodyRatios: number[];
    closePrices: number[];
    bullMarkers: number[][];
    bearMarkers: number[][];
    momentumCount: number;
    smaData: (number | string)[];
    emaData: (number | string)[];
    bb: { mid: (number | string)[]; upper: (number | string)[]; lower: (number | string)[] };
    vwapData: (number | string)[];
    rsiData: (number | string)[];
    macd: { macd: (number | string)[]; signal: (number | string)[]; histogram: (number | string)[] };
    heikinAshiOHLC: number[][];
  } | null>(null);
  const panelHeightsRef = useRef({ main: 72, volume: 9, bodyRatio: 9, rsi: 12, macd: 12 });
  const zoomRef = useRef({ start: 60, end: 100, startVal: 0, endVal: 0 });
  const currentTfRef = useRef<TfInterval>("1d"); // current timeframe
  const [tfDisplay, setTfDisplay] = useState<TfInterval>("1d"); // for JSX re-render
  const rawBarsRef = useRef<ParsedBar[]>([]); // raw bars before downsampling
  const tfCacheRef = useRef<Map<string, ParsedBar[]>>(new Map()); // cache per interval
  const tfFetchRef = useRef<Promise<void> | null>(null); // dedup in-flight fetches
  const chartWidthRef = useRef(0); // chart pixel width for downsampling calc
  const binSymbolRef = useRef("");
  const drawingsRef = useRef<unknown[]>([]);
  const currentToolRef = useRef("cursor");
  const isDrawingRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number; idx: number; price: number } | null>(null);
  const drawPointsRef = useRef<{ x: number; y: number }[]>([]);
  const drawPreviewRef = useRef<unknown[]>([]);
  const resizeHandleIdsRef = useRef<unknown[]>([]);
  const isResizingRef = useRef(false);
  const resizePanelAboveRef = useRef<string | null>(null);
  const resizePanelBelowRef = useRef<string | null>(null);
  const resizeStartYRef = useRef(0);
  const resizeStartHeightsRef = useRef<Record<string, number>>({});
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(false);

  // ── getBinanceSymbol ──
  const getBinanceSymbol = useCallback(() => {
    return symbol.replace("BINANCE:", "");
  }, [symbol]);

  // ── processBars: convert ParsedBar[] into dataRef shape ──
  const processBars = useCallback((bars: ParsedBar[]) => {
    const dates: string[] = [];
    const ohlc: number[][] = [];
    const volumes: number[] = [];
    const bodyRatios: number[] = [];
    const bullMarkers: number[][] = [];
    const bearMarkers: number[][] = [];
    let momentumCount = 0;
    for (const b of bars) {
      dates.push(b.date);
      ohlc.push(b.ohlc);
      volumes.push(b.volume);
      bodyRatios.push(b.bodyRatio);
      if (b.bodyRatio >= 85) {
        momentumCount++;
        if (b.ohlc[1] > b.ohlc[0]) bullMarkers.push([dates.length - 1, b.ohlc[2]]);
        else bearMarkers.push([dates.length - 1, b.ohlc[3]]);
      }
    }
    const closePrices = ohlc.map(c => c[1]);
    return {
      bars, dates, ohlc, volumes, bodyRatios, closePrices,
      bullMarkers, bearMarkers, momentumCount,
      smaData: calcSMA(closePrices, 20),
      emaData: calcEMA(closePrices, 20),
      bb: calcBollinger(closePrices, 20, 2),
      vwapData: calcVWAP(ohlc, volumes),
      rsiData: calcRSI(closePrices, 14),
      macd: calcMACD(closePrices, 12, 26, 9),
      heikinAshiOHLC: calcHeikinAshi(ohlc),
    };
  }, []);

  // ── swapToTf: switch to a new timeframe, fetching + updating chart ──
  // This is set inside useEffect but declared here so it can be referenced in deps
  const swapToTfRef = useRef<(interval: TfInterval) => Promise<void>>(() => Promise.resolve());

  // ── buildGridLayout (from kiyotaka) ──
  const buildGridLayout = useCallback(() => {
    const s = stateRef.current;
    const ph = panelHeightsRef.current;
    const panels: string[] = [];
    if (s.dataSources.volume) panels.push("volume");
    if (s.dataSources.bodyRatio) panels.push("bodyRatio");
    if (s.subIndicators.rsi) panels.push("rsi");
    if (s.subIndicators.macd) panels.push("macd");

    const numSubs = panels.length;
    const TOP = 4, BOT = 8, avail = 100 - TOP - BOT;
    const gap = numSubs > 0 ? 1 : 0;
    const totalGap = gap * (numSubs > 0 ? numSubs - 1 : 0);

    const defaultMainH = numSubs === 0 ? avail : numSubs === 1 ? 74 : numSubs === 2 ? 68 : numSubs === 3 ? 58 : 50;
    const defaultSubH = numSubs === 1 ? 18 : numSubs === 2 ? 12 : numSubs === 3 ? 12 : 10;

    let sumH = ph.main + panels.reduce((acc, p) => acc + (ph as Record<string, number>)[p], 0);
    let mainH: number, subHs: number[];

    if (Math.abs(sumH - avail) < 2 && panels.every(p => (ph as Record<string, number>)[p] >= MIN_HEIGHT)) {
      mainH = (ph.main / sumH) * (avail - totalGap);
      subHs = panels.map(p => ((ph as Record<string, number>)[p] / sumH) * (avail - totalGap));
    } else {
      mainH = defaultMainH;
      subHs = panels.map(() => defaultSubH);
    }

    const grids: echarts.GridComponentOption[] = [{ left: 50, right: 60, top: TOP + "%", height: mainH + "%" }];
    const gridMap: Record<string, number> = { main: 0 };

    let top = TOP + mainH + gap;
    panels.forEach((id, i) => {
      gridMap[id] = grids.length;
      grids.push({ left: 50, right: 60, top: top + "%", height: subHs[i] + "%" });
      top += subHs[i] + (i < numSubs - 1 ? gap : 0);
    });

    return { grids, gridMap, panels };
  }, []);

  // ── buildOption (from kiyotaka) ──
  const buildOption = useCallback((): echarts.EChartsOption => {
    const d = dataRef.current;
    if (!d) return {};
    const s = stateRef.current;
    const { grids, gridMap, panels } = buildGridLayout();
    const allIdx = grids.map((_, i) => i);

    // xAxis
    const isSubDaily = currentTfRef.current !== "1d";
    const xAxis: echarts.XAXisComponentOption[] = grids.map((g, i) => ({
      type: "category" as const,
      data: d.dates,
      boundaryGap: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        show: i === 0 || i === grids.length - 1,
        color: AXIS_LABEL,
        fontSize: 10,
        formatter: isSubDaily
          ? (val: string) => {
              // "2026-07-08 14:00" → "14:00", show date on first bar or day boundary
              const parts = val.split(" ");
              if (parts.length === 2) return parts[1]; // HH:MM
              return val;
            }
          : (val: string) => {
              // "2026-07-08" → "Jul 8"
              const d = new Date(val + "T00:00:00Z");
              const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
              return months[d.getUTCMonth()] + " " + d.getUTCDate();
            },
        interval: isSubDaily ? Math.max(0, Math.floor(d.dates.length / 12)) : "auto" as any,
      },
      splitLine: { show: false },
      gridIndex: i,
    }));

    // yAxis
    const yAxis: echarts.YAXisComponentOption[] = [
      {
        type: "value",
        position: "right",
        gridIndex: 0,
        scale: true,
        splitNumber: 4,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: AXIS_LABEL, fontSize: 10 },
        splitLine: { lineStyle: { color: GRID } },
        // Auto-scale: fit visible candles with padding (KT-03)
        min: (value: { min: number; max: number }) => {
          const pad = (value.max - value.min) * 0.05 || 1;
          return +(value.min - pad).toFixed(2);
        },
        max: (value: { min: number; max: number }) => {
          const pad = (value.max - value.min) * 0.05 || 1;
          return +(value.max + pad).toFixed(2);
        },
      },
    ];

    panels.forEach(panel => {
      const gi = gridMap[panel];
      if (panel === "volume") {
        yAxis.push({
          type: "value", position: "right", gridIndex: gi, scale: true, splitNumber: 2,
          axisLine: { show: false }, axisTick: { show: false },
          axisLabel: { color: AXIS_LABEL, fontSize: 9,
            formatter: (v: number) => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "K" : v,
          },
          splitLine: { lineStyle: { color: GRID } },
        });
      } else if (panel === "bodyRatio") {
        yAxis.push({
          type: "value", position: "right", gridIndex: gi, min: 0, max: 100, splitNumber: 2,
          axisLine: { show: false }, axisTick: { show: false },
          axisLabel: { color: AXIS_LABEL, fontSize: 9, formatter: "{value}%" },
          splitLine: { lineStyle: { color: GRID } },
        });
      } else if (panel === "rsi") {
        yAxis.push({
          type: "value", position: "right", gridIndex: gi, min: 0, max: 100, splitNumber: 2,
          axisLine: { show: false }, axisTick: { show: false },
          axisLabel: { color: AXIS_LABEL, fontSize: 9 },
          splitLine: { lineStyle: { color: GRID } },
        });
      } else if (panel === "macd") {
        yAxis.push({
          type: "value", position: "right", gridIndex: gi, splitNumber: 2,
          axisLine: { show: false }, axisTick: { show: false },
          axisLabel: { color: AXIS_LABEL, fontSize: 9 },
          splitLine: { lineStyle: { color: GRID } },
        });
      }
    });

    // Series
    const series: echarts.SeriesOption[] = [];
    const gi0 = gridMap.main;

    if (s.chartStyle === "candles" || s.chartStyle === "heikinAshi") {
      const cData = s.chartStyle === "heikinAshi" ? d.heikinAshiOHLC : d.ohlc;
      series.push({
        name: "ZEC", type: "candlestick", data: cData,
        xAxisIndex: gi0, yAxisIndex: gi0,
        itemStyle: { color: GREEN, color0: RED, borderColor: GREEN, borderColor0: RED, borderWidth: 1 },
      });
    } else if (s.chartStyle === "line") {
      series.push({
        name: "ZEC", type: "line", data: d.closePrices,
        xAxisIndex: gi0, yAxisIndex: gi0,
        lineStyle: { color: GREEN, width: 2 }, symbol: "none",
      });
    } else if (s.chartStyle === "area") {
      series.push({
        name: "ZEC", type: "line", data: d.closePrices,
        xAxisIndex: gi0, yAxisIndex: gi0,
        lineStyle: { color: GREEN, width: 2 }, symbol: "none",
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(0,236,151,0.25)" },
            { offset: 1, color: "rgba(0,236,151,0.02)" },
          ]),
        },
      });
    }

    // Overlay indicators
    if (s.indicators.sma) {
      series.push({ name: "SMA (20)", type: "line", data: d.smaData, xAxisIndex: gi0, yAxisIndex: gi0, lineStyle: { color: "#FFD700", width: 1.5 }, symbol: "none", smooth: true });
    }
    if (s.indicators.ema) {
      series.push({ name: "EMA (20)", type: "line", data: d.emaData, xAxisIndex: gi0, yAxisIndex: gi0, lineStyle: { color: "#FF6B6B", width: 1.5 }, symbol: "none", smooth: true });
    }
    if (s.indicators.bollinger) {
      series.push({ name: "BB Upper", type: "line", data: d.bb.upper, xAxisIndex: gi0, yAxisIndex: gi0, lineStyle: { color: "rgba(153,160,255,.6)", width: 1, type: "dashed" }, symbol: "none" });
      series.push({ name: "BB Mid", type: "line", data: d.bb.mid, xAxisIndex: gi0, yAxisIndex: gi0, lineStyle: { color: "rgba(153,160,255,.9)", width: 1 }, symbol: "none", smooth: true });
      series.push({ name: "BB Lower", type: "line", data: d.bb.lower, xAxisIndex: gi0, yAxisIndex: gi0, lineStyle: { color: "rgba(153,160,255,.6)", width: 1, type: "dashed" }, symbol: "none" });
      series.push({ name: "BB Area", type: "line", data: d.bb.upper.map((v, i) => [v, d.bb.lower[i]]), xAxisIndex: gi0, yAxisIndex: gi0, lineStyle: { opacity: 0 }, symbol: "none", areaStyle: { color: "rgba(153,160,255,.06)" } });
    }
    if (s.indicators.vwap) {
      series.push({ name: "VWAP", type: "line", data: d.vwapData, xAxisIndex: gi0, yAxisIndex: gi0, lineStyle: { color: "#E040FB", width: 1.5 }, symbol: "none", smooth: true });
    }

    // Momentum markers
    if (s.dataSources.momentum) {
      series.push({
        name: "Bull Momentum", type: "scatter",
        data: d.bullMarkers.map(m => ({ value: [d.dates[m[0]], m[1]], symbol: "circle", symbolSize: 8, itemStyle: { color: GREEN, borderColor: "#0f0f11", borderWidth: 1.5 } })),
        xAxisIndex: gi0, yAxisIndex: gi0, z: 10, tooltip: { show: false },
      });
      series.push({
        name: "Bear Momentum", type: "scatter",
        data: d.bearMarkers.map(m => ({ value: [d.dates[m[0]], m[1]], symbol: "circle", symbolSize: 8, itemStyle: { color: RED, borderColor: "#0f0f11", borderWidth: 1.5 } })),
        xAxisIndex: gi0, yAxisIndex: gi0, z: 10, tooltip: { show: false },
      });
    }

    // Sub-panel series
    panels.forEach(panel => {
      const pi = gridMap[panel];
      if (panel === "volume") {
        series.push({
          name: "Volume", type: "bar",
          data: d.volumes.map((v, i) => ({ value: v, itemStyle: { color: d.ohlc[i][1] >= d.ohlc[i][0] ? "rgba(0,236,151,.35)" : "rgba(255,77,77,.35)" } })),
          xAxisIndex: pi, yAxisIndex: pi,
        });
      } else if (panel === "bodyRatio") {
        series.push({
          name: "Body %", type: "bar",
          data: d.bodyRatios.map((r, i) => ({ value: r, itemStyle: { color: r >= 85 ? (d.ohlc[i][1] >= d.ohlc[i][0] ? "rgba(0,236,151,.7)" : "rgba(255,77,77,.7)") : "rgba(255,255,255,.08)" } })),
          xAxisIndex: pi, yAxisIndex: pi,
        });
        series.push({
          name: "Threshold", type: "line", data: new Array(d.dates.length).fill(85),
          xAxisIndex: pi, yAxisIndex: pi,
          lineStyle: { color: "rgba(0,236,151,.4)", width: 1, type: "dashed" }, symbol: "none", tooltip: { show: false }, z: 5,
        });
      } else if (panel === "rsi") {
        series.push({
          name: "RSI (14)", type: "line", data: d.rsiData, xAxisIndex: pi, yAxisIndex: pi,
          lineStyle: { color: "#7C4DFF", width: 1.5 }, symbol: "none",
          markLine: { silent: true, symbol: "none", label: { show: false }, data: [
            { yAxis: 70, lineStyle: { color: "rgba(255,77,77,.35)", type: "dashed", width: 1 } },
            { yAxis: 30, lineStyle: { color: "rgba(0,236,151,.35)", type: "dashed", width: 1 } },
          ] },
        });
      } else if (panel === "macd") {
        series.push({
          name: "MACD Hist", type: "bar",
          data: d.macd.histogram.map(v => ({ value: v, itemStyle: { color: (v as number) >= 0 ? "rgba(0,236,151,.5)" : "rgba(255,77,77,.5)" } })),
          xAxisIndex: pi, yAxisIndex: pi,
        });
        series.push({ name: "MACD Line", type: "line", data: d.macd.macd, xAxisIndex: pi, yAxisIndex: pi, lineStyle: { color: "#00BCD4", width: 1.5 }, symbol: "none" });
        series.push({ name: "Signal", type: "line", data: d.macd.signal, xAxisIndex: pi, yAxisIndex: pi, lineStyle: { color: "#FF9800", width: 1.5 }, symbol: "none" });
      }
    });

    return {
      backgroundColor: BG,
      animation: false,
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
          crossStyle: { color: "#333" },
          label: {
            backgroundColor: "#222",
            color: "#ccc",
            fontSize: 11,
            fontFamily: FONT,
            formatter: (params: any) => {
              // Y-axis label: show OHLC of hovered candle
              if (params.axisDimension === "y" && params.value != null && dataRef.current) {
                const idx = params.seriesData ? Object.values(params.seriesData)[0]?.dataIndex : null;
                if (idx != null && dataRef.current.ohlc[idx]) {
                  const o = dataRef.current.ohlc[idx];
                  return `O:${o[0].toFixed(2)} H:${o[3].toFixed(2)} L:${o[2].toFixed(2)} C:${o[1].toFixed(2)}`;
                }
              }
              return params.value?.toFixed?.(2) ?? params.value ?? "";
            },
          },
        },
        backgroundColor: "#1a1a1e", borderColor: "#2a2a2e",
        textStyle: { color: "#ccc", fontSize: 12 },
        formatter: (params: unknown) => {
          const p = params as { dataIndex: number; seriesName: string; value: unknown }[];
          if (!p?.length) return "";
          const idx = p[0].dataIndex;
          const o = d.ohlc[idx]; const v = d.volumes[idx]; const br = d.bodyRatios[idx];
          const change = ((o[1] - o[0]) / o[0] * 100).toFixed(2);
          const clr = o[1] >= o[0] ? GREEN : RED;
          let h = `<div style="font-weight:600;margin-bottom:4px">${d.dates[idx]}</div>`;
          h += `<div>O <span style="float:right;color:#aaa">${o[0].toFixed(2)}</span></div>`;
          h += `<div>H <span style="float:right;color:#aaa">${o[3].toFixed(2)}</span></div>`;
          h += `<div>L <span style="float:right;color:#aaa">${o[2].toFixed(2)}</span></div>`;
          h += `<div>C <span style="float:right;color:${clr}">${o[1].toFixed(2)}</span></div>`;
          h += `<div>Vol <span style="float:right;color:#888">${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>`;
          h += `<div>Body% <span style="float:right;color:${br >= 85 ? GREEN : "#888"}">${br}%</span></div>`;
          const indColors: Record<string, string> = { "SMA (20)": "#FFD700", "EMA (20)": "#FF6B6B", "BB Upper": "#99A0FF", "BB Mid": "#99A0FF", "BB Lower": "#99A0FF", "VWAP": "#E040FB" };
          for (const pp of p) {
            if (indColors[pp.seriesName] && pp.value != null && pp.value !== "-") {
              h += `<div>${pp.seriesName} <span style="float:right;color:${indColors[pp.seriesName]}">${typeof pp.value === "number" ? pp.value.toFixed(2) : pp.value}</span></div>`;
            }
          }
          for (const pp of p) {
            if (pp.seriesName === "RSI (14)" && pp.value != null && pp.value !== "-") h += `<div>RSI <span style="float:right;color:#7C4DFF">${typeof pp.value === "number" ? pp.value.toFixed(1) : pp.value}</span></div>`;
            if (pp.seriesName === "MACD Line" && pp.value != null && pp.value !== "-") h += `<div>MACD <span style="float:right;color:#00BCD4">${typeof pp.value === "number" ? pp.value.toFixed(4) : pp.value}</span></div>`;
            if (pp.seriesName === "Signal" && pp.value != null && pp.value !== "-") h += `<div>Signal <span style="float:right;color:#FF9800">${typeof pp.value === "number" ? pp.value.toFixed(4) : pp.value}</span></div>`;
          }
          h += `<div>Chg <span style="float:right;color:${clr}">${change}%</span></div>`;
          return h;
        },
      },
      axisPointer: { link: [{ xAxisIndex: "all" }], label: { backgroundColor: "#222" } },
      grid: grids,
      xAxis,
      yAxis,
      dataZoom: [
        {
          type: "inside", id: "__kt_inside",
          xAxisIndex: allIdx,
          start: zoomRef.current.start,
          end: zoomRef.current.end,
          zoomOnMouseWheel: false,   // scroll = pan, not zoom (like kiyotaka)
          moveOnMouseMove: true,     // drag = pan
          moveOnMouseWheel: true,    // scroll wheel = pan
          moveOnMouseMoveLock: true,
        },
        {
          type: "slider", xAxisIndex: allIdx, bottom: 4, height: 20,
          borderColor: "transparent", backgroundColor: "#161618",
          fillerColor: "rgba(0,236,151,.12)",
          handleStyle: { color: GREEN, borderColor: GREEN },
          moveHandleStyle: { color: GREEN },
          textStyle: { color: "#555", fontSize: 10 },
          dataBackground: { lineStyle: { color: "#333" }, areaStyle: { color: "rgba(0,236,151,.05)" } },
          selectedDataBackground: { lineStyle: { color: "#444" }, areaStyle: { color: "rgba(0,236,151,.1)" } },
        },
      ],
      series,
    };
  }, [buildGridLayout]);

  // ── Drawing helpers ──
  const pixelToData = useCallback((px: number, py: number) => {
    const chart = chartRef.current;
    if (!chart || !dataRef.current) return null;
    const pricePt = chart.convertFromPixel({ gridIndex: 0 }, [px, py]);
    if (!pricePt) return null;
    const d = dataRef.current;
    return { idx: Math.max(0, Math.min(d.dates.length - 1, Math.round(pricePt[0] as number))), price: pricePt[1] as number };
  }, []);

  const dataToPixel = useCallback((idx: number, price: number) => {
    return chartRef.current?.convertToPixel({ gridIndex: 0 }, [idx, price]) as [number, number] | undefined;
  }, []);

  const renderDrawing = useCallback((drawing: Record<string, unknown>) => {
    const d = dataRef.current;
    if (!d) return [];
    const elements: echarts.GraphicElementOption[] = [];
    const baseStyle: echarts.GraphicElementOption = { stroke: DRAW_COLOR, fill: "none", lineWidth: 1.5 };

    const type = drawing.type as string;
    if (type === "hline" || type === "horizray") {
      const y1 = dataToPixel(0, drawing.price as number);
      const y2 = dataToPixel(d.dates.length - 1, drawing.price as number);
      if (!y1 || !y2) return elements;
      if (type === "hline") {
        elements.push({ ...baseStyle, type: "line", shape: { x1: y1[0], y1: y1[1], x2: y2[0], y2: y2[1] }, z: 50 });
      } else {
        const start = dataToPixel(drawing.startIdx as number, drawing.price as number);
        if (!start) return elements;
        elements.push({ ...baseStyle, type: "line", shape: { x1: start[0], y1: start[1], x2: y2[0], y2: y2[1] }, z: 50 });
        elements.push({ type: "text", style: { text: (drawing.price as number).toFixed(2), fill: DRAW_COLOR, fontSize: 10, x: start[0] + 4, y: start[1] - 4 }, z: 51 });
      }
    } else if (type === "trendline") {
      const p1 = dataToPixel(drawing.startIdx as number, drawing.startPrice as number);
      const p2 = dataToPixel(drawing.endIdx as number, drawing.endPrice as number);
      if (!p1 || !p2) return elements;
      elements.push({ ...baseStyle, type: "line", shape: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] }, z: 50 });
      elements.push({ type: "text", style: { text: (drawing.startPrice as number).toFixed(2), fill: DRAW_COLOR, fontSize: 10, x: p1[0] + 4, y: p1[1] - 4 }, z: 51 });
      elements.push({ type: "text", style: { text: (drawing.endPrice as number).toFixed(2), fill: DRAW_COLOR, fontSize: 10, x: p2[0] + 4, y: p2[1] - 4 }, z: 51 });
    } else if (type === "rect") {
      const p1 = dataToPixel(drawing.startIdx as number, drawing.startPrice as number);
      const p2 = dataToPixel(drawing.endIdx as number, drawing.endPrice as number);
      if (!p1 || !p2) return elements;
      elements.push({ type: "rect", stroke: DRAW_COLOR, fill: "rgba(0,236,151,.06)", lineWidth: 1.5, shape: { x: Math.min(p1[0], p2[0]), y: Math.min(p1[1], p2[1]), width: Math.abs(p2[0] - p1[0]), height: Math.abs(p2[1] - p1[1]) }, z: 50 });
    } else if (type === "fib") {
      const p1 = dataToPixel(drawing.startIdx as number, drawing.startPrice as number);
      const p2 = dataToPixel(drawing.endIdx as number, drawing.endPrice as number);
      if (!p1 || !p2) return elements;
      const xLeft = Math.min(p1[0], p2[0]), xRight = Math.max(p1[0], p2[0]);
      elements.push({ type: "line", stroke: "rgba(255,255,255,.2)", lineWidth: 1, lineDash: [2, 2], shape: { x1: xLeft, y1: p1[1], x2: xLeft, y2: p2[1] }, z: 50 });
      const priceRange = (drawing.endPrice as number) - (drawing.startPrice as number);
      const basePrice = Math.min(drawing.startPrice as number, drawing.endPrice as number);
      for (let i = 0; i < FIB_LEVELS.length; i++) {
        const fp = basePrice + priceRange * FIB_LEVELS[i];
        const py = dataToPixel(0, fp);
        if (!py) continue;
        elements.push({ type: "line", stroke: FIB_COLORS[i], lineWidth: 1, lineDash: [2, 2], shape: { x1: xLeft, y1: py[1], x2: xRight, y2: py[1] }, z: 50 });
        elements.push({ type: "text", style: { text: FIB_LABELS[i] + "  " + fp.toFixed(2), fill: FIB_COLORS[i], fontSize: 10, x: xRight + 4, y: py[1] - 4 }, z: 51 });
      }
    } else if (type === "brush") {
      const pts = drawing.points as { x: number; y: number }[];
      if (pts.length < 2) return elements;
      elements.push({ ...baseStyle, type: "polyline", shape: { points: pts }, z: 50 });
    }
    return elements;
  }, [dataToPixel]);

  const graphicElementsRef = useRef<any[]>([]);

  const syncGraphics = useCallback((extra?: unknown[]) => {
    const chart = chartRef.current;
    if (!chart) return;
    const zr = chart.getZr();
    // Remove old graphic elements from zrender
    graphicElementsRef.current.forEach(el => { try { zr.remove(el); } catch (_e) { /* noop */ } });
    // Build new elements
    const drawings = drawingsRef.current as Record<string, unknown>[];
    const els: any[] = [];
    drawings.forEach(d => els.push(...renderDrawing(d)));
    if (extra) els.push(...extra);
    // Create zrender elements directly
    const zrEls: any[] = [];
    els.forEach(opt => {
      let el: any;
      const s = (opt.style || opt) as any;
      if (opt.type === "line") {
        el = new ZrLine({ shape: opt.shape, style: { stroke: opt.stroke || s.stroke || "#00EC97", fill: "none", lineWidth: opt.lineWidth || s.lineWidth || 1.5, lineDash: opt.lineDash || s.lineDash } });
      } else if (opt.type === "rect") {
        el = new ZrRect({ shape: opt.shape, style: { stroke: opt.stroke || s.stroke || "#00EC97", fill: opt.fill || s.fill || "none", lineWidth: opt.lineWidth || s.lineWidth || 1.5 } });
      } else if (opt.type === "text") {
        el = new ZrText({ style: { text: s.text, fill: s.fill || "#00EC97", fontSize: s.fontSize || 10, x: s.x, y: s.y } });
      } else if (opt.type === "polyline") {
        el = new ZrPolyline({ shape: opt.shape, style: { stroke: opt.stroke || s.stroke || "#00EC97", fill: "none", lineWidth: opt.lineWidth || s.lineWidth || 1.5 } });
      }
      if (el) {
        el.z = (opt.z || 50) as number;
        el.silent = true;
        zr.add(el);
        zrEls.push(el);
      }
    });
    graphicElementsRef.current = zrEls;
  }, [renderDrawing]);

  const addDrawingToChart = useCallback((drawing: Record<string, unknown>) => {
    (drawingsRef.current as Record<string, unknown>[]).push(drawing);
    syncGraphics();
  }, [syncGraphics]);

  const rebuildAllDrawings = useCallback(() => { syncGraphics(); }, [syncGraphics]);

  // ── Init chart ──
  useEffect(() => {
    if (!cssInjected) {
      const style = document.createElement("style");
      style.textContent = KIYOTAKA_CSS;
      document.head.appendChild(style);
      cssInjected = true;
    }
    mountedRef.current = true;
    let cancelled = false;
    let momentumRaf: number | null = null; // KT-04: accessible in cleanup

    const container = chartContainerRef.current;
    if (!container) return;

    async function init() {
      const binSymbol = getBinanceSymbol();
      binSymbolRef.current = binSymbol;
      currentTfRef.current = "1d";
      setTfDisplay("1d");

      const bars = await fetchKlines(binSymbol, "1d");
      if (!mountedRef.current || !container || cancelled) return;
      if (!bars.length) {
        container.innerHTML = '<div class="kt-loader">No data</div>';
        return;
      }

      // Cache initial data
      tfCacheRef.current.set("1d", bars);
      rawBarsRef.current = bars; // store raw bars for downsampling

      // Process bars into dataRef shape
      const data = processBars(bars);
      dataRef.current = data;
      const { dates, ohlc, volumes, momentumCount } = data;

      // Initialize zoom range as data indices
      const totalBars = dates.length - 1;
      zoomRef.current.startVal = Math.round((zoomRef.current.start / 100) * totalBars);
      zoomRef.current.endVal = Math.round((zoomRef.current.end / 100) * totalBars);

      const loader = container.querySelector(".kt-loader");
      if (loader) loader.remove();
      if (cancelled) return;
      let chart: any;
      try {
        chart = echarts.init(container, null, { renderer: "canvas" });
        chartRef.current = chart;
      } catch (e) {
        container.innerHTML = '<div class="kt-loader" style="color:#ff4d4d">Chart init failed</div>';
        return;
      }

      // Set header values
      const lastCandle = ohlc[ohlc.length - 1];
      const prevClose = ohlc.length >= 2 ? ohlc[ohlc.length - 2][1] : lastCandle[0];
      const price = lastCandle[1];
      const pctChange = ((price - prevClose) / prevClose * 100);
      const isUp = pctChange >= 0;

      const priceEl = rootRef.current?.querySelector(".kt-price-val");
      const changeEl = rootRef.current?.querySelector(".kt-change-val");
      const highEl = rootRef.current?.querySelector(".kt-high-val");
      const lowEl = rootRef.current?.querySelector(".kt-low-val");
      const volEl = rootRef.current?.querySelector(".kt-vol-val");
      const momEl = rootRef.current?.querySelector(".kt-mom-val");
      if (priceEl) priceEl.textContent = price.toFixed(2);
      if (changeEl) {
        changeEl.textContent = (isUp ? "+" : "") + pctChange.toFixed(2) + "%";
        changeEl.className = "kt-change kt-change-val " + (isUp ? "up" : "down");
      }
      if (highEl) highEl.textContent = Math.max(...ohlc.map(c => c[3])).toFixed(2);
      if (lowEl) lowEl.textContent = Math.min(...ohlc.map(c => c[2])).toFixed(2);
      if (volEl) volEl.textContent = volumes[volumes.length - 1].toLocaleString(undefined, { maximumFractionDigits: 0 });
      if (momEl) momEl.textContent = momentumCount + " candles";

      // Initial render
      const option = buildOption();
      chart.setOption(option, true);
      chart.setOption({ animation: true, animationDuration: 400 });

      // Get zrender instance — needed by zoom/pan AND drawing handlers
      const zr = chart.getZr();

      // ── Zoom: scroll=pan, drag=pan via dataZoom inside ──
      // ── KT-06: Ctrl/Cmd+scroll = zoom (anchored at cursor) ──
      // ── KT-04: Gesture momentum after pan release ──
      const zoomRebuildTimer = { id: null as ReturnType<typeof setTimeout> | null };
      const scheduleRebuild = () => {
        if (zoomRebuildTimer.id) clearTimeout(zoomRebuildTimer.id);
        zoomRebuildTimer.id = setTimeout(() => { rebuildAllDrawings(); zoomRebuildTimer.id = null; }, 80);
      };

      // Ctrl/Cmd+wheel → zoom anchored at cursor
      let lastCtrlWheelTime = 0;
      zr.on("mousewheel", (e: any) => {
        const raw = e.event as WheelEvent;
        if (!raw.ctrlKey && !raw.metaKey) return; // let native dataZoom handle scroll=pan
        e.stop();
        const now = performance.now();
        if (now - lastCtrlWheelTime < 16) return;
        lastCtrlWheelTime = now;

        // Read actual dataZoom state from ECharts
        const opt = chart.getOption() as any;
        const dz = ((opt.dataZoom || []).find((d: any) => d.id === "__kt_inside"));
        if (!dz) return;
        const start = dz.start as number;
        const end = dz.end as number;
        const range = end - start;
        const factor = raw.deltaY > 0 ? 1.1 : 1 / 1.1;
        const newRange = Math.max(2, Math.min(98, range * factor));

        // Grid has left:50 right:60 (px). Compute cursor fraction within plot area.
        const rect = container.getBoundingClientRect();
        const plotLeft = 50;
        const plotWidth = rect.width - 50 - 60;
        const cursorFrac = plotWidth > 0 ? Math.max(0, Math.min(1, (raw.clientX - rect.left - plotLeft) / plotWidth)) : 0.5;

        const cursorPct = start + range * cursorFrac;
        let ns = cursorPct - newRange * cursorFrac;
        let ne = ns + newRange;
        if (ns < 0) { ns = 0; ne = newRange; }
        if (ne > 100) { ne = 100; ns = 100 - newRange; }

        chart.setOption({ dataZoom: [{ id: "__kt_inside", start: ns, end: ne }] });
        zoomRef.current.start = ns;
        zoomRef.current.end = ne;
        const d = dataRef.current;
        if (d) {
          const total = d.dates.length - 1;
          zoomRef.current.startVal = Math.round((ns / 100) * total);
          zoomRef.current.endVal = Math.round((ne / 100) * total);
        }
        scheduleRebuild();
        scheduleResCheck();
      });

      // KT-04: Gesture momentum — track velocity during pan, apply inertia on release
      let lastPanStart = 0;
      let lastPanTime = 0;
      let panVelocity = 0; // % per ms

      const applyMomentum = () => {
        if (Math.abs(panVelocity) < 0.0005) { momentumRaf = null; return; }
        const dt = 16; // ~1 frame at 60fps
        const delta = panVelocity * dt;
        panVelocity *= 0.95; // decay factor per frame
        let { start, end } = zoomRef.current;
        let ns = start + delta;
        let ne = end + delta;
        // Clamp at edges — stop momentum if we hit a wall
        if (ns < 0) { ns = 0; ne = end - start; panVelocity = 0; }
        if (ne > 100) { ne = 100; ns = 100 - (end - start); panVelocity = 0; }
        chart.setOption({ dataZoom: [{ id: "__kt_inside", start: ns, end: ne }] });
        zoomRef.current.start = ns;
        zoomRef.current.end = ne;
        const d = dataRef.current;
        if (d) {
          const total = d.dates.length - 1;
          zoomRef.current.startVal = Math.round((ns / 100) * total);
          zoomRef.current.endVal = Math.round((ne / 100) * total);
        }
        scheduleRebuild();
        momentumRaf = requestAnimationFrame(applyMomentum);
      };

      chart.on("dataZoom", (params: any) => {
        try {
          const opt = chart.getOption();
          if (opt.dataZoom && opt.dataZoom[0]) {
            const newStart = opt.dataZoom[0].start as number;
            const newEnd = opt.dataZoom[0].end as number;
            zoomRef.current.start = newStart;
            zoomRef.current.end = newEnd;
            const d = dataRef.current;
            if (d) {
              const total = d.dates.length - 1;
              zoomRef.current.startVal = Math.round((newStart / 100) * total);
              zoomRef.current.endVal = Math.round((newEnd / 100) * total);
            }
            // Track velocity for momentum (only for pan moves, not slider)
            const now = performance.now();
            if (lastPanTime > 0) {
              const dt = now - lastPanTime;
              if (dt > 0 && dt < 200) {
                panVelocity = (newStart - lastPanStart) / dt;
              }
            }
            lastPanStart = newStart;
            lastPanTime = now;
          }
        } catch (_e) { /* noop */ }
        scheduleRebuild();
        scheduleResCheck(); // adaptive downsample/fetch check
      });

      // Start momentum on mouseup/touchend (when pan was happening)
      const startMomentum = () => {
        if (Math.abs(panVelocity) > 0.0005 && !momentumRaf) {
          lastPanTime = 0; // reset velocity tracking
          momentumRaf = requestAnimationFrame(applyMomentum);
        }
      };
      zr.on("mouseup", startMomentum);
      container.addEventListener("touchend", startMomentum);

      // ── Adaptive resolution: downsample on zoom-out, fetch on zoom-in ──
      const tfBadge = rootRef.current?.querySelector(".kt-tf-val");
      const updateTfBadge = (label: string) => { if (tfBadge) tfBadge.textContent = label; };
      updateTfBadge("1D");

      // Measure chart width for downsampling calc
      const measureChartWidth = () => {
        try {
          const rect = container.getBoundingClientRect();
          chartWidthRef.current = Math.max(100, rect.width - 110); // minus left/right grid padding
        } catch (_e) { /* noop */ }
      };
      measureChartWidth();
      window.addEventListener("resize", measureChartWidth);

      // Check if we need finer data (zoom-in only) or to downsample (zoom-out)
      const checkResolution = () => {
        const chart = chartRef.current;
        const d = dataRef.current;
        if (!chart || !d) return;

        measureChartWidth();
        // Read actual dataZoom state from ECharts (not zoomRef, which only updates from manual handlers)
        const opt = chart.getOption() as any;
        const dzArray = (opt.dataZoom || []).filter((dz: any) => dz.id === "__kt_inside");
        const dz = dzArray.length > 0 ? dzArray[0] : null;
        if (!dz) return;
        const start = dz.start as number;
        const end = dz.end as number;
        const visibleRange = (end - start) / 100; // 0..1
        const chartW = chartWidthRef.current;
        const totalBars = d.dates.length - 1;
        const visibleBars = Math.round(visibleRange * totalBars);
        const rawBars = rawBarsRef.current;

        // ── Zoom-in check: fetch finer data if zoomed to < 10% of raw bars ──
        const rawTotal = rawBars.length > 0 ? rawBars.length - 1 : totalBars;
        if (rawTotal > 0 && visibleBars / rawTotal < ZOOM_IN_FETCH_PCT) {
          const finer = nextFinerInterval(currentTfRef.current);
          if (finer) {
            swapToTf(finer);
            return;
          }
        }

        // ── Zoom-out check: downsample if bars are too dense ──
        if (rawBars.length > 0 && chartW > 0) {
          const maxBars = Math.floor(chartW / MIN_BAR_WIDTH_PX);

          if (totalBars > maxBars && rawBars.length > totalBars) {
            // Already showing a subset — no action needed
          } else if (totalBars > maxBars && rawBars.length <= totalBars) {
            const downsampled = adaptiveDownsample(rawBars, maxBars);
            if (downsampled.length < rawBars.length) {
              const data = processBars(downsampled);
              dataRef.current = data;
              chart.setOption(buildOption(), true);
              const newTotal = data.dates.length - 1;
              zoomRef.current.startVal = Math.round((start / 100) * newTotal);
              zoomRef.current.endVal = Math.round((end / 100) * newTotal);
            }
          } else if (totalBars <= maxBars && rawBars.length > totalBars) {
            if (rawBars.length !== totalBars) {
              const data = processBars(rawBars);
              dataRef.current = data;
              chart.setOption(buildOption(), true);
              const newTotal = data.dates.length - 1;
              zoomRef.current.startVal = Math.round((start / 100) * newTotal);
              zoomRef.current.endVal = Math.round((end / 100) * newTotal);
            }
          }
        }
      };

      // Debounce resolution checks
      const resCheckTimer = { id: null as ReturnType<typeof setTimeout> | null };
      const scheduleResCheck = () => {
        if (resCheckTimer.id) clearTimeout(resCheckTimer.id);
        resCheckTimer.id = setTimeout(checkResolution, 200);
      };

      const swapToTf = async (newInterval: TfInterval) => {
        const chart = chartRef.current;
        if (!chart || !mountedRef.current) return;

        if (tfFetchRef.current) return;
        const fetchPromise = (async () => {
          try {
            let bars = tfCacheRef.current.get(newInterval);
            if (!bars) {
              const d = dataRef.current;
              if (!d || !d.bars.length) return;
              const firstBar = d.bars[0];
              const lastBar = d.bars[d.bars.length - 1];
              const startMs = new Date(firstBar.date + (newInterval === "1d" ? "T00:00:00Z" : "Z")).getTime();
              const endMs = new Date(lastBar.date + (newInterval === "1d" ? "T23:59:59Z" : "Z")).getTime();
              const range = endMs - startMs;
              bars = await fetchKlines(binSymbolRef.current, newInterval, Math.max(0, startMs - range * 0.5), endMs + range * 0.5);
              if (!bars.length) return;
              tfCacheRef.current.set(newInterval, bars);
            }

            if (!mountedRef.current || !chart) return;

            currentTfRef.current = newInterval;
            setTfDisplay(newInterval);
            rawBarsRef.current = bars;

            // Downsample if needed based on current zoom
            measureChartWidth();
            const { start, end } = zoomRef.current;
            const visibleRange = (end - start) / 100;
            const totalAvailable = bars.length - 1;
            const visibleBars = Math.round(visibleRange * totalAvailable);
            const maxBars = chartWidthRef.current > 0 ? Math.floor(chartWidthRef.current / MIN_BAR_WIDTH_PX) : totalAvailable;

            const displayBars = totalAvailable > maxBars ? adaptiveDownsample(bars, maxBars) : bars;
            const data = processBars(displayBars);
            dataRef.current = data;

            chart.setOption(buildOption(), true);
            chart.setOption({ animation: true, animationDuration: 200 });

            // Update header
            const label = newInterval.toUpperCase() === "1D" ? "1D" : newInterval.toUpperCase();
            updateTfBadge(label);
            const { ohlc } = data;
            const lastCandle = ohlc[ohlc.length - 1];
            const prevClose = ohlc.length >= 2 ? ohlc[ohlc.length - 2][1] : lastCandle[0];
            const price = lastCandle[1];
            const pctChange = ((price - prevClose) / prevClose * 100);
            const isUp = pctChange >= 0;
            const priceEl = rootRef.current?.querySelector(".kt-price-val");
            const changeEl = rootRef.current?.querySelector(".kt-change-val");
            const highEl = rootRef.current?.querySelector(".kt-high-val");
            const lowEl = rootRef.current?.querySelector(".kt-low-val");
            const volEl = rootRef.current?.querySelector(".kt-vol-val");
            if (priceEl) priceEl.textContent = price.toFixed(2);
            if (changeEl) {
              changeEl.textContent = (isUp ? "+" : "") + pctChange.toFixed(2) + "%";
              changeEl.className = "kt-change kt-change-val " + (isUp ? "up" : "down");
            }
            if (highEl) highEl.textContent = Math.max(...ohlc.map(c => c[3])).toFixed(2);
            if (lowEl) lowEl.textContent = Math.min(...ohlc.map(c => c[2])).toFixed(2);
            if (volEl) volEl.textContent = data.volumes[data.volumes.length - 1].toLocaleString(undefined, { maximumFractionDigits: 0 });

            drawingsRef.current = [];
            syncGraphics();

            // Reset zoom to show all new bars
            const newTotal = data.dates.length - 1;
            zoomRef.current.start = 0;
            zoomRef.current.end = 100;
            zoomRef.current.startVal = 0;
            zoomRef.current.endVal = newTotal;
            chart.setOption({ dataZoom: [{ id: "__kt_inside", start: 0, end: 100 }] });
          } catch (_e) { /* noop */ }
          tfFetchRef.current = null;
        })();
        tfFetchRef.current = fetchPromise;
        await fetchPromise;
      };

      swapToTfRef.current = swapToTf;

      // Pinch zoom — handled natively by zrender GestureMgr + ECharts RoamController.
      // We only listen for touchend to trigger resolution check (zoom-in fetch / zoom-out downsample).
      const onResTouchEnd = () => { scheduleResCheck(); };
      container.addEventListener("touchend", onResTouchEnd, { passive: true });

      // Drawing events
      const getPos = (e: MouseEvent | TouchEvent) => {
        // zrender wraps DOM events — use e.event to access original DOM event
        const raw = (e as any).event || e;
        const src = raw.touches ? raw.touches[0] : raw;
        // zrender provides offsetX/Y relative to canvas element
        if ((e as any).offsetX != null) {
          return { x: (e as any).offsetX, y: (e as any).offsetY };
        }
        const rect = container.getBoundingClientRect();
        return { x: src.clientX - rect.left, y: src.clientY - rect.top };
      };

      const onStart = (e: MouseEvent | TouchEvent) => {
        if (currentToolRef.current === "cursor") return;
        (e as MouseEvent).stopPropagation?.();
        // On mobile, prevent scroll/zoom when drawing
        if ((e as TouchEvent).touches) {
          (e as TouchEvent).preventDefault?.();
        }
        const pos = getPos(e);
        const data = pixelToData(pos.x, pos.y);
        if (!data) return;
        isDrawingRef.current = true;
        drawStartRef.current = { ...pos, ...data };
        drawPointsRef.current = [pos];
      };

      const onMove = (e: MouseEvent | TouchEvent) => {
        if (!isDrawingRef.current || currentToolRef.current === "cursor") return;
        const pos = getPos(e);
        const data = pixelToData(pos.x, pos.y);
        if (!data && currentToolRef.current !== "brush") return;

        const preview: unknown[] = [];
        const baseStyle = { stroke: DRAW_COLOR, fill: "none", lineWidth: 1.5 };
        const tool = currentToolRef.current;
        const ds = drawStartRef.current;

        if (tool === "hline" && ds) {
          const y1 = dataToPixel(0, ds.price);
          const y2 = dataToPixel(dates.length - 1, ds.price);
          if (y1 && y2) preview.push({ ...baseStyle, type: "line", shape: { x1: y1[0], y1: y1[1], x2: y2[0], y2: y2[1] }, z: 50 });
        } else if (tool === "horizray" && ds) {
          const start = dataToPixel(ds.idx, ds.price);
          const end = dataToPixel(dates.length - 1, ds.price);
          if (start && end) preview.push({ ...baseStyle, type: "line", shape: { x1: start[0], y1: start[1], x2: end[0], y2: end[1] }, z: 50 });
        } else if (tool === "trendline" && ds) {
          preview.push({ ...baseStyle, type: "line", shape: { x1: ds.x, y1: ds.y, x2: pos.x, y2: pos.y }, z: 50 });
        } else if (tool === "rect" && ds) {
          preview.push({ type: "rect", stroke: DRAW_COLOR, fill: "rgba(0,236,151,.06)", lineWidth: 1.5, shape: { x: Math.min(ds.x, pos.x), y: Math.min(ds.y, pos.y), width: Math.abs(pos.x - ds.x), height: Math.abs(pos.y - ds.y) }, z: 50 });
        } else if (tool === "fib" && ds) {
          preview.push({ type: "line", stroke: "rgba(255,255,255,.3)", lineWidth: 1, lineDash: [2, 2], shape: { x1: ds.x, y1: ds.y, x2: pos.x, y2: pos.y }, z: 50 });
        } else if (tool === "brush") {
          drawPointsRef.current.push(pos);
          preview.push({ ...baseStyle, type: "polyline", shape: { points: [...drawPointsRef.current] }, z: 50 });
        }

        syncGraphics(preview);
      };

      const onEnd = (e: MouseEvent | TouchEvent) => {
        if (!isDrawingRef.current || currentToolRef.current === "cursor") return;
        isDrawingRef.current = false;
        const ev = (e as TouchEvent).changedTouches ? ((e as TouchEvent).changedTouches[0] || e) : e;
        const pos = getPos(ev as MouseEvent);
        const data = pixelToData(pos.x, pos.y);
        const ds = drawStartRef.current;
        let drawing: Record<string, unknown> | null = null;
        const tool = currentToolRef.current;

        if (tool === "hline" && ds) drawing = { type: "hline", price: ds.price };
        else if (tool === "horizray" && ds) drawing = { type: "horizray", price: ds.price, startIdx: ds.idx };
        else if (tool === "trendline" && ds && data) drawing = { type: "trendline", startIdx: ds.idx, startPrice: ds.price, endIdx: data.idx, endPrice: data.price };
        else if (tool === "rect" && ds && data) drawing = { type: "rect", startIdx: ds.idx, startPrice: ds.price, endIdx: data.idx, endPrice: data.price };
        else if (tool === "fib" && ds && data) drawing = { type: "fib", startIdx: ds.idx, startPrice: ds.price, endIdx: data.idx, endPrice: data.price };
        else if (tool === "brush") {
          if (drawPointsRef.current.length >= 2) drawing = { type: "brush", points: [...drawPointsRef.current] };
        }

        if (drawing) {
          addDrawingToChart(drawing);
        }
        drawStartRef.current = null;
        drawPointsRef.current = [];
        syncGraphics();
      };

      zr.on("mousedown", onStart);
      zr.on("mousemove", onMove);
      zr.on("mouseup", onEnd);
      // On mobile, native touch listeners with passive:false so we can preventDefault
      // before the browser handles scroll/pinch. zrender's HandlerProxy already converts
      // touch→mousedown/mousemove/mouseup internally, so we just need to prevent scroll.
      const onTouchStartFn = (e: TouchEvent) => { if (currentToolRef.current !== "cursor") e.preventDefault(); };
      const onTouchMoveFn = (e: TouchEvent) => { if (isDrawingRef.current) e.preventDefault(); };
      const onTouchEndFn = (_e: TouchEvent) => {};
      onTouchStart = onTouchStartFn;
      onTouchMove = onTouchMoveFn;
      onTouchEnd = onTouchEndFn;
      container.addEventListener("touchstart", onTouchStart, { passive: false });
      container.addEventListener("touchmove", onTouchMove, { passive: false });
      container.addEventListener("touchend", onTouchEnd, { passive: false });

      // Keyboard shortcuts
      const onKeyDown = (e: KeyboardEvent) => {
        if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
        const key = e.key.toLowerCase();
        if (e.ctrlKey && key === "z") { e.preventDefault(); undoDrawing(); return; }
        if (key === "c") setTool("cursor");
        else if (key === "h") setTool("hline");
        else if (key === "t") setTool("trendline");
        else if (key === "r" && !e.shiftKey) setTool("horizray");
        else if (key === "r" && e.shiftKey) setTool("rect");
        else if (key === "f") setTool("fib");
        else if (key === "b") setTool("brush");
        else if (key === "escape") { isDrawingRef.current = false; syncGraphics(); }
      };
      window.addEventListener("keydown", onKeyDown);

      // Resize
      let resizeTimer: ReturnType<typeof setTimeout>;
      const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (mountedRef.current) chart.resize(); }, 80); };
      window.addEventListener("resize", onResize);

      // Auto-refresh every 5s
      refreshTimerRef.current = setInterval(async () => {
        if (!mountedRef.current) return;
        const newBars = await fetchKlines(binSymbol);
        if (!mountedRef.current || !newBars.length) return;
        // Re-derive all data
        const newDates: string[] = [];
        const newOhlc: number[][] = [];
        const newVolumes: number[] = [];
        const newBodyRatios: number[] = [];
        const newBull: number[][] = [];
        const newBear: number[][] = [];
        let newMom = 0;
        for (const b of newBars) {
          newDates.push(b.date);
          newOhlc.push(b.ohlc);
          newVolumes.push(b.volume);
          newBodyRatios.push(b.bodyRatio);
          if (b.bodyRatio >= 85) {
            newMom++;
            if (b.ohlc[1] > b.ohlc[0]) newBull.push([newDates.length - 1, b.ohlc[2]]);
            else newBear.push([newDates.length - 1, b.ohlc[3]]);
          }
        }
        const newClose = newOhlc.map(c => c[1]);
        dataRef.current = {
          bars: newBars, dates: newDates, ohlc: newOhlc, volumes: newVolumes, bodyRatios: newBodyRatios,
          closePrices: newClose, bullMarkers: newBull, bearMarkers: newBear, momentumCount: newMom,
          smaData: calcSMA(newClose, 20), emaData: calcEMA(newClose, 20),
          bb: calcBollinger(newClose, 20, 2), vwapData: calcVWAP(newOhlc, newVolumes),
          rsiData: calcRSI(newClose, 14), macd: calcMACD(newClose, 12, 26, 9),
          heikinAshiOHLC: calcHeikinAshi(newOhlc),
        };
        setTimeout(() => rebuildAllDrawings, 150);
        const opt = buildOption();
        chart.setOption(opt, true);
        chart.setOption({ animation: true, animationDuration: 400 });
        syncGraphics();

        // Update header
        const lc = newOhlc[newOhlc.length - 1];
        const pc = newOhlc.length >= 2 ? newOhlc[newOhlc.length - 2][1] : lc[0];
        const p = lc[1];
        const chg = ((p - pc) / pc * 100);
        const up = chg >= 0;
        if (priceEl) priceEl.textContent = p.toFixed(2);
        if (changeEl) { changeEl.textContent = (up ? "+" : "") + chg.toFixed(2) + "%"; changeEl.className = "kt-change kt-change-val " + (up ? "up" : "down"); }
        if (highEl) highEl.textContent = Math.max(...newOhlc.map(c => c[3])).toFixed(2);
        if (lowEl) lowEl.textContent = Math.min(...newOhlc.map(c => c[2])).toFixed(2);
        if (volEl) volEl.textContent = newVolumes[newVolumes.length - 1].toLocaleString(undefined, { maximumFractionDigits: 0 });
        if (momEl) momEl.textContent = newMom + " candles";
      }, 5000);
    }

    function setTool(tool: string) {
      currentToolRef.current = tool;
      document.querySelectorAll(".kt-draw-btn[data-tool]").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-tool") === tool);
      });
      // Custom zoom/pan handlers already check currentToolRef, no need to disable dataZoom
    }

    function undoDrawing() {
      const drawings = drawingsRef.current as Record<string, unknown>[];
      if (!drawings.length) return;
      drawings.pop();
      syncGraphics();
    }

    // Touch listener refs for cleanup
    let onTouchStart: ((e: TouchEvent) => void) | null = null;
    let onTouchMove: ((e: TouchEvent) => void) | null = null;
    let onTouchEnd: ((e: TouchEvent) => void) | null = null;

    init();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (momentumRaf) { cancelAnimationFrame(momentumRaf); momentumRaf = null; }
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      const chart = chartRef.current;
      if (chart) {
        const c = chartContainerRef.current;
        if (c) {
          if (onTouchStart) c.removeEventListener("touchstart", onTouchStart as EventListener);
          if (onTouchMove) c.removeEventListener("touchmove", onTouchMove as EventListener);
          if (onTouchEnd) c.removeEventListener("touchend", onTouchEnd as EventListener);
          c.removeEventListener("touchend", startMomentum as EventListener);
        }
        chart.dispose();
        chartRef.current = null;
      }
      window.removeEventListener("resize", () => {});
    };
  }, [symbol, getBinanceSymbol, buildOption, pixelToData, addDrawingToChart, rebuildAllDrawings, dataToPixel]);

  // ── Sidebar toggle handlers ──
  const toggleSidebar = useCallback(() => {
    const s = stateRef.current;
    s.sidebarOpen = !s.sidebarOpen;
    const wrapper = rootRef.current?.querySelector(".kt-sb-wrapper");
    const backdrop = rootRef.current?.querySelector(".kt-sb-backdrop");
    const toggle = rootRef.current?.querySelector(".kt-sidebar-toggle");
    wrapper?.classList.toggle("open", s.sidebarOpen);
    backdrop?.classList.toggle("show", s.sidebarOpen);
    toggle?.classList.toggle("active", s.sidebarOpen);
    setTimeout(() => chartRef.current?.resize(), 350);
  }, []);

  const closeSidebar = useCallback(() => {
    stateRef.current.sidebarOpen = false;
    const wrapper = rootRef.current?.querySelector(".kt-sb-wrapper");
    const backdrop = rootRef.current?.querySelector(".kt-sb-backdrop");
    const toggle = rootRef.current?.querySelector(".kt-sidebar-toggle");
    wrapper?.classList.remove("open");
    backdrop?.classList.remove("show");
    toggle?.classList.remove("active");
    setTimeout(() => chartRef.current?.resize(), 350);
  }, []);

  // ── Indicator toggle handler ──
  const toggleIndicator = useCallback((e: React.MouseEvent) => {
    const target = e.currentTarget as HTMLElement;
    const ind = target.getAttribute("data-ind");
    if (!ind) return;
    target.classList.toggle("active");
    const isActive = target.classList.contains("active");
    const s = stateRef.current;
    if (ind in s.indicators) (s.indicators as Record<string, boolean>)[ind] = isActive;
    else if (ind in s.subIndicators) (s.subIndicators as Record<string, boolean>)[ind] = isActive;
    else if (ind in s.dataSources) (s.dataSources as Record<string, boolean>)[ind] = isActive;
    setTimeout(() => {
      const chart = chartRef.current;
      if (!chart) return;
      const opt = buildOption();
      chart.setOption(opt, true);
      chart.setOption({ animation: true, animationDuration: 400 });
      setTimeout(rebuildAllDrawings, 150);
    }, 0);
  }, [buildOption, rebuildAllDrawings]);

  // ── Chart style handler ──
  const setChartStyle = useCallback((e: React.MouseEvent) => {
    const target = e.currentTarget as HTMLElement;
    const style = target.getAttribute("data-style") as ChartState["chartStyle"];
    if (!style) return;
    stateRef.current.chartStyle = style;
    rootRef.current?.querySelectorAll(".kt-sb-radio-dot").forEach(d => d.classList.remove("active"));
    target.querySelector(".kt-sb-radio-dot")?.classList.add("active");
    setTimeout(() => {
      const chart = chartRef.current;
      if (!chart) return;
      const opt = buildOption();
      chart.setOption(opt, true);
      chart.setOption({ animation: true, animationDuration: 400 });
      setTimeout(rebuildAllDrawings, 150);
    }, 0);
  }, [buildOption, rebuildAllDrawings]);

  // ── Drawing toolbar handler ──
  const onToolbarClick = useCallback((e: React.MouseEvent) => {
    const btn = (e.target as HTMLElement).closest(".kt-draw-btn");
    if (!btn) return;
    const tool = btn.getAttribute("data-tool");
    const action = btn.getAttribute("data-action");
    if (action === "undo") {
      const drawings = drawingsRef.current as Record<string, unknown>[];
      if (!drawings.length) return;
      drawings.pop();
      syncGraphics();
      return;
    }
    if (action === "clear") {
      (drawingsRef.current as Record<string, unknown>[]) = [];
      syncGraphics();
      return;
    }
    if (tool) {
      currentToolRef.current = tool;
      rootRef.current?.querySelectorAll(".kt-draw-btn[data-tool]").forEach(b => b.classList.toggle("active", b.getAttribute("data-tool") === tool));
    }
  }, []);

  // ── Category collapse toggle ──
  const toggleCategory = useCallback((e: React.MouseEvent) => {
    const btn = e.currentTarget as HTMLElement;
    const cat = btn.getAttribute("data-cat");
    if (!cat) return;
    btn.classList.toggle("collapsed");
    rootRef.current?.querySelector(`.kt-sb-cat-items[data-cat="${cat}"]`)?.classList.toggle("collapsed");
  }, []);

  const displaySymbol = labelFromSymbol(symbol);

  return (
    <div className="kt-root" ref={rootRef}>
      {/* Header */}
      <div className="kt-header">
        <button className="kt-back-btn" onClick={onBack} title="Back">
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <button className="kt-sidebar-toggle" onClick={toggleSidebar} title="Indicators">
          <svg viewBox="0 0 24 24"><line x1="4" y1="6" x2="20" y2="6" /><circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none" /><line x1="4" y1="12" x2="20" y2="12" /><circle cx="16" cy="12" r="1.5" fill="currentColor" stroke="none" /><line x1="4" y1="18" x2="20" y2="18" /><circle cx="10" cy="18" r="1.5" fill="currentColor" stroke="none" /></svg>
        </button>
        <div className="kt-symbol-badge">
          <span className="kt-symbol">{displaySymbol}</span>
          <span className="kt-pair-label">/ USDT</span>
          <div className="kt-tf-badge">
            {TF_ZOOM_IN_ORDER.map(tf => (
              <button
                key={tf}
                className={"kt-tf-btn" + (tfDisplay === tf ? " active" : "")}
                onClick={() => swapToTfRef.current(tf)}
              >{tf.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div className="kt-price-block">
          <span className="kt-price kt-price-val">—</span>
          <span className="kt-change kt-change-val">—</span>
        </div>
        <div className="kt-stats">
          <span><span className="kt-label">H</span><span className="kt-high-val">—</span></span>
          <span><span className="kt-label">L</span><span className="kt-low-val">—</span></span>
          <span><span className="kt-label">Vol</span><span className="kt-vol-val">—</span></span>
          <span><span className="kt-label">Momentum</span><span className="kt-mom-val">—</span></span>
        </div>
      </div>

      {/* Main area */}
      <div className="kt-main-area">
        <div className="kt-sb-backdrop" onClick={closeSidebar} />
        <div className="kt-sb-wrapper">
          <aside className="kt-sidebar">
            <div className="kt-sb-header">
              <span className="kt-sb-title">Indicators</span>
              <button className="kt-sb-close" onClick={closeSidebar}>
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="kt-sb-scroll">
              {/* Indicators */}
              <div className="kt-sb-cat">
                <button className="kt-sb-cat-toggle" data-cat="indicators" onClick={toggleCategory}>
                  <span className="kt-sb-cat-icon">📊</span>
                  <span className="kt-sb-cat-label">Indicators</span>
                  <svg className="kt-sb-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                <div className="kt-sb-cat-items" data-cat="indicators">
                  <div className="kt-sb-item"><div className="kt-sb-item-color" style={{ background: "#FFD700" }} /><div className="kt-sb-item-info"><div className="kt-sb-item-name">SMA (20)</div><div className="kt-sb-item-desc">Simple Moving Average</div></div><div className="kt-sb-toggle" data-ind="sma" onClick={toggleIndicator}><div className="kt-sb-toggle-thumb" /></div></div>
                  <div className="kt-sb-item"><div className="kt-sb-item-color" style={{ background: "#FF6B6B" }} /><div className="kt-sb-item-info"><div className="kt-sb-item-name">EMA (20)</div><div className="kt-sb-item-desc">Exponential Moving Average</div></div><div className="kt-sb-toggle" data-ind="ema" onClick={toggleIndicator}><div className="kt-sb-toggle-thumb" /></div></div>
                  <div className="kt-sb-item"><div className="kt-sb-item-color line" style={{ background: "#99A0FF" }} /><div className="kt-sb-item-info"><div className="kt-sb-item-name">Bollinger Bands</div><div className="kt-sb-item-desc">20-period, 2 StdDev</div></div><div className="kt-sb-toggle" data-ind="bollinger" onClick={toggleIndicator}><div className="kt-sb-toggle-thumb" /></div></div>
                  <div className="kt-sb-item"><div className="kt-sb-item-color" style={{ background: "#E040FB" }} /><div className="kt-sb-item-info"><div className="kt-sb-item-name">VWAP</div><div className="kt-sb-item-desc">Volume Weighted Avg Price</div></div><div className="kt-sb-toggle" data-ind="vwap" onClick={toggleIndicator}><div className="kt-sb-toggle-thumb" /></div></div>
                </div>
              </div>
              {/* Sub-indicators */}
              <div className="kt-sb-cat">
                <button className="kt-sb-cat-toggle" data-cat="subIndicators" onClick={toggleCategory}>
                  <span className="kt-sb-cat-icon">📈</span>
                  <span className="kt-sb-cat-label">Sub-indicators</span>
                  <svg className="kt-sb-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                <div className="kt-sb-cat-items" data-cat="subIndicators">
                  <div className="kt-sb-item"><div className="kt-sb-item-color" style={{ background: "#7C4DFF" }} /><div className="kt-sb-item-info"><div className="kt-sb-item-name">RSI (14)</div><div className="kt-sb-item-desc">Relative Strength Index</div></div><div className="kt-sb-toggle" data-ind="rsi" onClick={toggleIndicator}><div className="kt-sb-toggle-thumb" /></div></div>
                  <div className="kt-sb-item"><div className="kt-sb-item-color" style={{ background: "#00BCD4" }} /><div className="kt-sb-item-info"><div className="kt-sb-item-name">MACD (12, 26, 9)</div><div className="kt-sb-item-desc">Moving Avg Convergence Divergence</div></div><div className="kt-sb-toggle" data-ind="macd" onClick={toggleIndicator}><div className="kt-sb-toggle-thumb" /></div></div>
                </div>
              </div>
              {/* Data Sources */}
              <div className="kt-sb-cat">
                <button className="kt-sb-cat-toggle" data-cat="dataSources" onClick={toggleCategory}>
                  <span className="kt-sb-cat-icon">🔢</span>
                  <span className="kt-sb-cat-label">Data Sources</span>
                  <svg className="kt-sb-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                <div className="kt-sb-cat-items" data-cat="dataSources">
                  <div className="kt-sb-item"><div className="kt-sb-item-color" style={{ background: "#00EC97" }} /><div className="kt-sb-item-info"><div className="kt-sb-item-name">Momentum Candles</div><div className="kt-sb-item-desc">Body/Range ≥ 85%</div></div><div className="kt-sb-toggle active" data-ind="momentum" onClick={toggleIndicator}><div className="kt-sb-toggle-thumb" /></div></div>
                  <div className="kt-sb-item"><div className="kt-sb-item-color" style={{ background: "#555" }} /><div className="kt-sb-item-info"><div className="kt-sb-item-name">Body Ratio</div><div className="kt-sb-item-desc">Body% histogram subplot</div></div><div className="kt-sb-toggle active" data-ind="bodyRatio" onClick={toggleIndicator}><div className="kt-sb-toggle-thumb" /></div></div>
                  <div className="kt-sb-item"><div className="kt-sb-item-color" style={{ background: "#3a5a8a" }} /><div className="kt-sb-item-info"><div className="kt-sb-item-name">Volume</div><div className="kt-sb-item-desc">Volume bars subplot</div></div><div className="kt-sb-toggle active" data-ind="volume" onClick={toggleIndicator}><div className="kt-sb-toggle-thumb" /></div></div>
                </div>
              </div>
              {/* Chart Style */}
              <div className="kt-sb-cat">
                <button className="kt-sb-cat-toggle" data-cat="chartStyle" onClick={toggleCategory}>
                  <span className="kt-sb-cat-icon">🎨</span>
                  <span className="kt-sb-cat-label">Chart Style</span>
                  <svg className="kt-sb-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                <div className="kt-sb-cat-items" data-cat="chartStyle">
                  <div className="kt-sb-item" data-style="candles" onClick={setChartStyle}><div className="kt-sb-item-info"><div className="kt-sb-item-name">Candles</div><div className="kt-sb-item-desc">Japanese candlestick</div></div><div className="kt-sb-radio-dot active" data-style="candles" /></div>
                  <div className="kt-sb-item" data-style="line" onClick={setChartStyle}><div className="kt-sb-item-info"><div className="kt-sb-item-name">Line</div><div className="kt-sb-item-desc">Close price line</div></div><div className="kt-sb-radio-dot" data-style="line" /></div>
                  <div className="kt-sb-item" data-style="area" onClick={setChartStyle}><div className="kt-sb-item-info"><div className="kt-sb-item-name">Area</div><div className="kt-sb-item-desc">Close price area fill</div></div><div className="kt-sb-radio-dot" data-style="area" /></div>
                  <div className="kt-sb-item" data-style="heikinAshi" onClick={setChartStyle}><div className="kt-sb-item-info"><div className="kt-sb-item-name">Heikin Ashi</div><div className="kt-sb-item-desc">Smoothed candlestick</div></div><div className="kt-sb-radio-dot" data-style="heikinAshi" /></div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Chart area */}
        <div className="kt-chart" ref={chartContainerRef}>
          <div className="kt-loader">Loading {displaySymbol}…</div>
        </div>
        {/* Drawing toolbar — outside chart container so innerHTML="" doesn't destroy it */}
        <div className="kt-draw-toolbar" onClick={onToolbarClick}>
            <button className="kt-draw-btn active" data-tool="cursor" title="Cursor (C)">
              <svg viewBox="0 0 24 24"><path d="m5 3-3 18h2.5l1.5-7 3 4.5 3-4.5 1.5 7H16L13 3h-2l-1.5 7L7 5.5 5.5 10 4 17" /></svg>
            </button>
            <div className="kt-draw-sep" />
            <button className="kt-draw-btn" data-tool="hline" title="Horizontal Line (H)">
              <svg viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12" /></svg>
            </button>
            <button className="kt-draw-btn" data-tool="trendline" title="Trend Line (T)">
              <svg viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="4" /></svg>
            </button>
            <button className="kt-draw-btn" data-tool="horizray" title="Horizontal Ray (R)">
              <svg viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12" /><polyline points="17,9 21,12 17,15" /></svg>
            </button>
            <button className="kt-draw-btn" data-tool="rect" title="Rectangle (Shift+R)">
              <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="1" /></svg>
            </button>
            <button className="kt-draw-btn" data-tool="fib" title="Fibonacci Retracement (F)">
              <svg viewBox="0 0 24 24"><line x1="4" y1="4" x2="4" y2="20" /><line x1="4" y1="8" x2="20" y2="8" strokeDasharray="2 2" /><line x1="4" y1="12" x2="20" y2="12" strokeDasharray="2 2" /><line x1="4" y1="16" x2="20" y2="16" strokeDasharray="2 2" /></svg>
            </button>
            <div className="kt-draw-sep" />
            <button className="kt-draw-btn" data-tool="brush" title="Freehand Brush (B)">
              <svg viewBox="0 0 24 24"><path d="M3 21c1-2 3-4 6-6s6-3 9-3c2 0 3 1 3 3s-2 4-5 6-6 3-9 3-4-1-4-3z" /></svg>
            </button>
            <div className="kt-draw-sep" />
            <button className="kt-draw-btn" data-action="undo" title="Undo (Ctrl+Z)">
              <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
            </button>
            <button className="kt-draw-btn" data-action="clear" title="Clear All">
              <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </button>
          </div>
      </div>
    </div>
  );
}