import { useEffect, useRef, useState, useCallback } from "react";
import * as echarts from "echarts";
import { cgIdFromSymbol } from "@/lib/constants";
import { fetchVolumeProfile, type VPRow, type Trade, fetchTrades } from "@/api/kiyotaka";

// ─── Exported types ───

export interface PriceLevel {
  price: number;
  label: string;
  color: string;
}

export interface TrendLine {
  id: number;
  startTime: number;
  startPrice: number;
  endTime: number;
  endPrice: number;
  color: string;
  kind?: "line" | "fib";
}

export interface Props {
  symbol: string;
  height?: number;
  resizable?: boolean;
  onHeightChange?: (h: number) => void;
  priceLevels?: PriceLevel[];
  trendlines?: TrendLine[];
  onTrendlineAdd?: (tl: TrendLine) => void;
  onTrendlineUpdate?: (tl: TrendLine) => void;
  onTrendlineRemove?: (id: number) => void;
  /** When true, render only the chart canvas + indicator div — no toolbar rows, no resize handle, no marginBottom wrapper. */
  chromeless?: boolean;
  /** Optional callback to expose chart control API (e.g. from terminal toolbar). */
  onApi?: (api: ChartAPI) => void;
}

/** Imperative API exposed by CandleChart for external toolbar control. */
export interface ChartAPI {
  setDays: (days: number) => void;
  getDays: () => number;
  setIndicator: (type: "none" | "macd" | "rsi" | "zscore") => void;
  getIndicator: () => string;
  toggleVP: () => void;
  getVP: () => boolean;
  toggleTape: () => void;
  getTape: () => boolean;
  toggleLog: () => void;
  getLog: () => boolean;
  toggleMagnet: () => void;
  getMagnet: () => boolean;
  toggleHA: () => void;
  getHA: () => boolean;
  toggleFib: () => void;
  getDrawTool: () => string;
  createLine: () => void;
  removeSelected: () => void;
  getHasSelection: () => boolean;
  /** Force a re-render of consuming component when chart state changes. */
  subscribe: (cb: () => void) => () => void;
}

// ─── Constants ───

const TF = [
  { days: 0, label: "5m" },
  { days: -1, label: "1m" },
  { days: 1, label: "24H" },
  { days: 7, label: "1W" },
  { days: 30, label: "1M" },
  { days: 90, label: "3M" },
] as const;

const TL_COLORS = ["#ff6b6b", "#fbbf24", "#38bdf8", "#a78bfa", "#34d399", "#f472b6", "#fb923c", "#67e8f9"];

const FIB_LEVELS = [
  { r: 0, label: "0" },
  { r: 0.236, label: "0.236" },
  { r: 0.382, label: "0.382" },
  { r: 0.5, label: "0.5" },
  { r: 0.618, label: "0.618" },
  { r: 0.786, label: "0.786" },
  { r: 1, label: "1" },
  { r: 1.618, label: "1.618" },
];

const FIB_COLORS: Record<string, string> = {
  "0": "#f87171", "0.236": "#fb923c", "0.382": "#fbbf24",
  "0.5": "#a78bfa", "0.618": "#34d399", "0.786": "#38bdf8",
  "1": "#f87171", "1.618": "#f472b6",
};

// ─── Helpers ───

export function fmtPrice(p: number): string {
  if (p == null || isNaN(p)) return "";
  if (p >= 1000) return p.toFixed(2);
  if (p >= 100) return p.toFixed(2);
  if (p >= 1) return p.toFixed(3);
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(6);
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

function toHeikinAshi(bars: Bar[]): Bar[] {
  if (!bars.length) return [];
  const result: Bar[] = [];
  let prevOpen = (bars[0].open + bars[0].close) / 2;
  let prevClose = (bars[0].open + bars[0].high + bars[0].low + bars[0].close) / 4;
  result.push({
    time: bars[0].time, open: prevOpen, close: prevClose,
    high: Math.max(bars[0].high, prevOpen, prevClose),
    low: Math.min(bars[0].low, prevOpen, prevClose),
    volume: bars[0].volume,
  });
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const haClose = (b.open + b.high + b.low + b.close) / 4;
    const haOpen = (prevOpen + prevClose) / 2;
    const haHigh = Math.max(b.high, haOpen, haClose);
    const haLow = Math.min(b.low, haOpen, haClose);
    result.push({ time: b.time, open: haOpen, high: haHigh, low: haLow, close: haClose, volume: b.volume });
    prevOpen = haOpen;
    prevClose = haClose;
  }
  return result;
}

function parseTime(t: string): number {
  const d = new Date(t);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function computeEMA(bars: Bar[], period: number): Map<number, number> {
  const ema = new Map<number, number>();
  if (bars.length < period) return ema;
  const k = 2 / (period + 1);
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
      macd.set(i, v12 - v26);
      macdLine.push(v12 - v26);
    } else {
      macdLine.push(0);
    }
  }
  const signal = new Map<number, number>();
  if (macdLine.length >= 9) {
    const k = 2 / 10;
    let sum = 0;
    for (let j = 0; j < 9; j++) sum += macdLine[j];
    signal.set(25, sum / 9);
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

<<<<<<< HEAD
// ── Buy the Dip / Sell the Rip signals ──────────────────────────────────────
function computeBtSrSignals(
  bars: Bar[],
  rsiLen = 14,
  rsiOB = 70,
  rsiOS = 30,
  volLen = 20,
): { dips: number[]; rips: number[] } {
  const rsi = computeRSI(bars, rsiLen);
  const dips: number[] = [];
  const rips: number[] = [];

  // Volume SMA
  const volSma = new Map<number, number>();
  if (bars.length >= volLen) {
    let sum = 0;
    for (let i = 0; i < bars.length; i++) {
      sum += bars[i].volume;
      if (i >= volLen - 1) {
        volSma.set(i, sum / volLen);
        sum -= bars[i - volLen + 1].volume;
      }
    }
  }

  for (let i = rsiLen + 1; i < bars.length; i++) {
    const r = rsi.get(i);
    const vma = volSma.get(i);
    if (r == null || vma == null) continue;

    const priceUp = bars[i].close > bars[i - 1].close;
    const priceDown = bars[i].close < bars[i - 1].close;
    const volConfirm = bars[i].volume > vma;

    if (r < rsiOS && priceUp && volConfirm) dips.push(i);
    if (r > rsiOB && priceDown && volConfirm) rips.push(i);
  }
  return { dips, rips };
}

function drawBtSrSignals(
  ctx: CanvasRenderingContext2D,
  s: DrawState,
  bars: Bar[],
) {
  const { padLeft, barWidth, priceToY, viewStart: vs, viewEnd: ve } = s;
  const signals = computeBtSrSignals(bars);
  const triSize = Math.max(4, Math.min(7, barWidth * 0.35));

  // Dip signals — green up-triangles below bar lows
  for (const idx of signals.dips) {
    if (idx < vs || idx >= ve) continue;
    const bar = bars[idx];
    const x = padLeft + (idx - vs + 0.5) * barWidth;
    const y = priceToY(bar.low) + triSize + 5;

    // Glow halo
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.arc(x, y, triSize + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Triangle pointing up
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.moveTo(x, y - triSize);
    ctx.lineTo(x - triSize, y + triSize);
    ctx.lineTo(x + triSize, y + triSize);
    ctx.closePath();
    ctx.fill();

    if (barWidth > 18) {
      ctx.font = "700 8px ui-monospace, SFMono-Regular, monospace";
      ctx.fillStyle = "#22c55e";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("DIP", x, y + triSize + 2);
    }
  }

  // Rip signals — red down-triangles above bar highs
  for (const idx of signals.rips) {
    if (idx < vs || idx >= ve) continue;
    const bar = bars[idx];
    const x = padLeft + (idx - vs + 0.5) * barWidth;
    const y = priceToY(bar.high) - triSize - 5;

    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(x, y, triSize + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Triangle pointing down
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(x, y + triSize);
    ctx.lineTo(x - triSize, y - triSize);
    ctx.lineTo(x + triSize, y - triSize);
    ctx.closePath();
    ctx.fill();

    if (barWidth > 18) {
      ctx.font = "700 8px ui-monospace, SFMono-Regular, monospace";
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("RIP", x, y - triSize - 2);
    }
  }
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
  logScale?: boolean,
): DrawState {
  const padRight = 56;
  const padBottom = 22;
  const padTop = 6;
  const padLeft = 4;
  const volH = 28;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom - volH;

  if (!bars.length || chartW < 20 || chartH < 20) {
=======
async function fetchOHLC(symbol: string, days: number): Promise<Bar[]> {
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
      return json.map((k: { t: number; o: number; h: number; l: number; c: number; v?: number }) => ({
        time: resolution === "D"
          ? new Date(k.t * 1000).toISOString().split("T")[0]
          : new Date(k.t * 1000).toISOString().substring(0, 19),
        open: k.o, high: k.h, low: k.l, close: k.c, volume: k.v ?? 0,
      }));
    } catch { return []; }
  }
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
>>>>>>> d246df0 (fix: bypass broken ECharts 6 graphic component - draw directly on zrender canvas)
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

function findBarIndexByTime(bars: Bar[], ts: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < bars.length; i++) {
    const bt = parseTime(bars[i].time);
    const d = Math.abs(bt - ts);
    if (d < bestDist) { bestDist = d; best = i; }
    if (bt > ts) break;
  }
  return best;
}

// ─── ChartManager — vanilla JS ECharts management ───

interface ChartManagerConfig {
  symbol: string;
  height: number;
  onStatusChange?: (status: { loading: boolean; error: boolean; empty: boolean }) => void;
  onTrendlineUpdate?: (tl: TrendLine) => void;
  onTrendlineAdd?: (tl: TrendLine) => void;
  onTrendlineRemove?: (id: number) => void;
}

type IndicatorType = "none" | "macd" | "rsi" | "zscore";

class ChartManager {
  private chart: echarts.ECharts | null = null;
  private indChart: echarts.ECharts | null = null;
  private dom: HTMLElement;
  private indDom: HTMLElement | null = null;
  private _destroyed = false;
  private config: ChartManagerConfig;

  // Internal state
  private bars: Bar[] = [];
  private days = 1;
  private indicator: IndicatorType = "none";
  private logScale = false;
  private candleType: "candle" | "heikin" = "candle";
  private magnet = false;
  private showVP = false;
  private vpData: VPRow[] = [];
  private priceLevels: PriceLevel[] = [];
  private trendlines: TrendLine[] = [];
  private selectedTlId: number | null = null;
  private nextId = 1;
  private drawTool: "line" | "fib" = "line";

  // Zoom state
  private dz = { start: 0, end: 100 };
  private priceZoom: { min: number; max: number } | null = null;

  // Interaction state
  private pinchRef = { active: false, dist: 0, startDz: { start: 0, end: 0 } };
  private measureRef: { x1: number; x2: number } | null = null;
  private longPressRef: { x: number; y: number; timer: ReturnType<typeof setTimeout> | null } = { x: 0, y: 0, timer: null };
  private measureActive = false;
  private dragRef: { tlId: number; mode: "start" | "end" | "move"; startPixelX: number; startPixelY: number; origTl: TrendLine } | null = null;
  private priceZoomDragRef: { startY: number; origMin: number; origMax: number } | null = null;

  // Auto-refresh
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private vpTimer: ReturnType<typeof setInterval> | null = null;

  // Tracked event handler references for cleanup
  private boundHandlers: { [key: string]: ((e: any) => void) } = {};

  // Public callback for React to set trendlines
  public onTrendlineSelect: ((id: number | null) => void) | null = null;

  constructor(dom: HTMLElement, config: ChartManagerConfig) {
    this.dom = dom;
    this.config = config;
  }

  private init(): void {
    const existing = echarts.getInstanceByDom(this.dom);
    if (existing) { existing.dispose(); }
    this.chart = echarts.init(this.dom, null, { renderer: "canvas" });
    this.bindEvents();
  }

  scheduleInit(): void {
    setTimeout(() => {
      if (this._destroyed) return;
      this.init();
      this.doLoadBars(true);
      this.startAutoRefresh();
    }, 0);
  }

  setIndicatorDom(el: HTMLElement): void {
    this.indDom = el;
  }

  destroy(): void {
    this._destroyed = true;
    this.cleanupTimers();
    if (this._renderTimer) { clearTimeout(this._renderTimer); this._renderTimer = null; }
    this.unbindEvents();
    if (this.indChart) { this.indChart.dispose(); this.indChart = null; }
    if (this.chart) { this.chart.dispose(); this.chart = null; }
  }

  // ─── Public API (called by React component) ───

  setDays(d: number, resetZoom = true): void {
    this.days = d;
    if (resetZoom) this.priceZoom = null;
    this.scheduleRefresh();
  }

  setBars(bars: Bar[], initial = false): void {
    this.bars = bars;
    if (initial) {
      this.priceZoom = null;
      const visibleCount = this.days <= 1 ? 80 : bars.length;
      const start = Math.max(0, bars.length - visibleCount);
      const startPct = (start / bars.length) * 100;
      this.dz = { start: startPct, end: 100 };
    }
    this.scheduleRender();
  }

  setIndicator(type: IndicatorType): void {
    this.indicator = type;
    if (type === "none") {
      if (this.indChart) { this.indChart.dispose(); this.indChart = null; }
    } else if (this.indDom) {
      setTimeout(() => {
        if (!this.indDom) return;
        const existing = echarts.getInstanceByDom(this.indDom);
        if (existing) existing.dispose();
        this.indChart = echarts.init(this.indDom, null, { renderer: "canvas" });
        this.renderIndicator();
      }, 0);
    }
    this.scheduleRender();
  }

  setLogScale(v: boolean): void {
    if (v !== this.logScale) { this.logScale = v; this.priceZoom = null; this.scheduleRender(); }
  }

  setHeikinAshi(v: boolean): void {
    this.candleType = v ? "heikin" : "candle";
    this.scheduleRender();
  }

  setPriceLevels(levels: PriceLevel[]): void {
    this.priceLevels = levels;
    this.scheduleRender();
  }

  setTrendlines(tls: TrendLine[]): void {
    this.trendlines = tls;
    this.scheduleRender();
  }

  setSelectedTrendlineId(id: number | null): void {
    this.selectedTlId = id;
    this.scheduleRender();
  }

  setMagnet(v: boolean): void { this.magnet = v; }

  setDrawTool(tool: "line" | "fib"): void { this.drawTool = tool; }

  setShowVP(v: boolean): void { this.showVP = v; this.scheduleRender(); }

  setVpData(data: VPRow[]): void { this.vpData = data; this.scheduleRender(); }

  setHeight(h: number): void {
    this.config.height = h;
    this.scheduleRender();
  }

  addPriceLevel(level: PriceLevel): void {
    this.priceLevels = [...this.priceLevels, level];
    this.scheduleRender();
  }

  removePriceLevel(idx: number): void {
    this.priceLevels = this.priceLevels.filter((_, i) => i !== idx);
    this.scheduleRender();
  }

  createTrendline(): void {
    if (!this.bars.length) return;
    const bars = this.bars;
    const totalBars = bars.length;
    const startIdx = Math.round(this.dz.start / 100 * totalBars);
    const endIdx = Math.round(this.dz.end / 100 * totalBars);
    const mid = Math.floor((startIdx + endIdx) / 2);
    const span = Math.max(3, Math.floor((endIdx - startIdx) / 6));

    let stLo = bars[Math.min(mid, bars.length - 1)].close * 0.96;
    let stHi = bars[Math.min(mid, bars.length - 1)].close * 1.04;
    try {
      const opt = this.chart?.getOption() as any;
      if (opt?.yAxis?.[0]) {
        stLo = opt.yAxis[0].min ?? stLo;
        stHi = opt.yAxis[0].max ?? stHi;
      }
    } catch { /* skip */ }

    const newTl: TrendLine = {
      id: this.nextId++,
      startTime: parseTime(bars[Math.max(0, mid - span)].time),
      startPrice: stHi,
      endTime: parseTime(bars[Math.min(bars.length - 1, mid + span)].time),
      endPrice: stLo,
      color: TL_COLORS[this.trendlines.length % TL_COLORS.length],
      kind: this.drawTool,
    };

    if (this.config.onTrendlineAdd) {
      this.config.onTrendlineAdd(newTl);
    }
    this.trendlines = [...this.trendlines, newTl];
    this.selectedTlId = newTl.id;
    this.onTrendlineSelect?.(newTl.id);
    this.scheduleRender();
  }

  removeSelectedTrendline(): void {
    if (this.selectedTlId == null) return;
    const id = this.selectedTlId;
    this.selectedTlId = null;
    this.onTrendlineSelect?.(null);
    if (this.config.onTrendlineRemove) {
      this.config.onTrendlineRemove(id);
    }
    this.trendlines = this.trendlines.filter(t => t.id !== id);
    this.scheduleRender();
  }

  startAutoRefresh(): void {
    this.cleanupTimers();
    const refreshMs = this.days <= 1 ? 5_000 : 15_000;
    this.refreshTimer = setInterval(() => this.doLoadBars(false), refreshMs);
  }

  startVPRefresh(): void {
    if (this.vpTimer) clearInterval(this.vpTimer);
    this.loadVP();
    this.vpTimer = setInterval(() => this.loadVP(), 60_000);
  }

  stopVPRefresh(): void {
    if (this.vpTimer) { clearInterval(this.vpTimer); this.vpTimer = null; }
  }

  resize(): void {
    setTimeout(() => {
      this.chart?.resize();
      this.indChart?.resize();
    }, 80);
  }

  // ─── Internal: data loading ───

  private async doLoadBars(initial = true): Promise<void> {
    if (this._destroyed) return;
    try {
      this.setStatus({ loading: initial, error: false, empty: false });
      const bars = await fetchOHLC(this.config.symbol, this.days);
      this.setBars(bars, initial);
    } catch {
      this.setStatus({ loading: false, error: true, empty: false });
    }
  }

  private async loadVP(): Promise<void> {
    if (!this.showVP || !this.config.symbol.startsWith("BINANCE:") || !this.bars.length) {
      this.vpData = [];
      return;
    }
    const bars = this.bars;
    const from = Math.floor(parseTime(bars[0].time) / 1000);
    const to = Math.floor(parseTime(bars[bars.length - 1].time) / 1000);
    const resMap: Record<string, string> = { "1": "5", "5": "5", "15": "15", "60": "60", "D": "60" };
    try {
      const data = await fetchVolumeProfile(this.config.symbol, resMap[String(this.days)] || "60", from, to + 300);
      this.vpData = data;
      this.scheduleRender();
    } catch { /* skip */ }
  }

  // ─── Internal: pixel ↔ data conversion ───

  private pixelToData(px: number, _py: number): { idx: number; price: number } | null {
    const inst = this.chart;
    if (!inst || !this.bars.length) return null;
    try {
      const pt = inst.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [px, _py]);
      if (!pt || pt.length < 2) return null;
      const idx = Math.round(pt[0]);
      return { idx: Math.max(0, Math.min(this.bars.length - 1, idx)), price: pt[1] };
    } catch { return null; }
  }

  private dataToPixel(idx: number, price: number): [number, number] | null {
    const inst = this.chart;
    if (!inst) return null;
    try {
      const pt = inst.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [idx, price]);
      return pt && pt.length === 2 ? [pt[0], pt[1]] : null;
    } catch { return null; }
  }

  private snapToOHLC(idx: number, price: number): { idx: number; price: number } {
    const bars = this.bars;
    if (!bars.length) return { idx, price };
    const i = Math.max(0, Math.min(bars.length - 1, idx));
    const bar = bars[i];
    const candidates = [bar.open, bar.high, bar.low, bar.close];
    let best = candidates[0];
    let bestDist = Math.abs(price - best);
    for (const c of candidates) {
      const d = Math.abs(price - c);
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return { idx: i, price: best };
  }

  // ─── Internal: hit-test trendlines ───

  private hitTestTrendline(px: number, py: number): { tl: TrendLine; mode: "start" | "end" | "move" } | null {
    const bars = this.bars;
    if (!this.chart || !bars.length) return null;
    let best: { tl: TrendLine; mode: "start" | "end" | "move"; dist: number } | null = null;
    for (const tl of [...this.trendlines].reverse()) {
      const si = findBarIndexByTime(bars, tl.startTime);
      const ei = findBarIndexByTime(bars, tl.endTime);
      const p1 = this.dataToPixel(si, tl.startPrice);
      const p2 = this.dataToPixel(ei, tl.endPrice);
      if (!p1 || !p2) continue;
      for (const [mode, ex, ey] of [[ "start", p1[0], p1[1] ], [ "end", p2[0], p2[1] ]] as const) {
        const d = Math.sqrt((px - ex) ** 2 + (py - ey) ** 2);
        if (d < 26 && (!best || d < best.dist)) best = { tl, mode, dist: d };
      }
      const lenSq = (p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2;
      if (lenSq > 0) {
        const t = Math.max(0, Math.min(1, ((px - p1[0]) * (p2[0] - p1[0]) + (py - p1[1]) * (p2[1] - p1[1])) / lenSq));
        const projX = p1[0] + t * (p2[0] - p1[0]);
        const projY = p1[1] + t * (p2[1] - p1[1]);
        const d = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
        if (d < 18 && (!best || d < best.dist)) best = { tl, mode: "move", dist: d };
      }
    }
    return best ? { tl: best.tl, mode: best.mode } : null;
  }

  // ─── Internal: build main chart option ───

  private buildMainOption(): echarts.EChartsOption {
    const bars = this.bars;
    if (!bars.length) return {};

    const drawBars = this.candleType === "heikin" ? toHeikinAshi(bars) : bars;
    const times = drawBars.map(b => b.time);
    const candleData = drawBars.map(b => [b.open, b.close, b.low, b.high] as [number, number, number, number]);
    const volumeData = drawBars.map(b => ({
      value: b.volume,
      itemStyle: { color: b.close >= b.open ? "rgba(83,255,132,0.15)" : "rgba(248,113,113,0.15)" },
    }));

    const ema20 = computeEMA(drawBars, 20);
    const ema50 = computeEMA(drawBars, 50);
    const ema20Data = drawBars.map((_, i) => ema20.get(i) ?? null);
    const ema50Data = drawBars.map((_, i) => ema50.get(i) ?? null);

    const height = this.config.height;
    const padTop = 6;
    const padBottom = 22;
    const volSectionH = 28;
    const gap = 2;
    const candleH = Math.max(20, height - padTop - padBottom - volSectionH - gap);

    const subDaily = this.days <= 1;
    const priceLabelFormatter = (v: number) => fmtPrice(v);
    const timeLabelFormatter = (v: string) => {
      const t = parseTime(v);
      return subDaily
        ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
        : new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
    };

    const visibleBars = Math.round((this.dz.end - this.dz.start) / 100 * bars.length);
    const labelStep = visibleBars <= 8 ? 1 : Math.max(1, Math.floor(visibleBars / 4));

    const lastBar = drawBars[drawBars.length - 1];
    const currentPrice = lastBar?.close ?? 0;
    const isUp = lastBar ? lastBar.close >= lastBar.open : true;
    const priceColor = isUp ? "rgba(83,255,132,0.5)" : "rgba(248,113,113,0.5)";

    const priceLevelLines = this.priceLevels.map(l => ({
      yAxis: l.price,
      lineStyle: { color: l.color, type: "dashed" as const, width: 1, opacity: 0.6 },
      label: {
        show: true,
        position: "insideEndTop" as const,
        formatter: `${l.label} ${fmtPrice(l.price)}`,
        color: l.color,
        fontSize: 9,
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        backgroundColor: l.color + "33",
        padding: [2, 4],
        borderRadius: 3,
      },
      symbol: "none",
    }));

    return {
      animation: false,
      backgroundColor: "transparent",
      grid: [
        { left: 4, right: 56, top: padTop, height: candleH },
        { left: 4, right: 56, top: padTop + candleH + gap, height: volSectionH },
      ],
      xAxis: [
        {
          type: "category", data: times, gridIndex: 0, show: false, boundaryGap: true,
          axisTick: { show: false }, axisLine: { show: false },
        },
        {
          type: "category", data: times, gridIndex: 1, show: true, boundaryGap: true,
          position: "bottom",
          axisTick: { show: false },
          axisLine: { show: false, onZero: false },
          axisLabel: {
            show: true, color: "rgba(255,255,255,0.4)", fontSize: 10,
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            formatter: timeLabelFormatter, interval: labelStep - 1,
          },
          splitLine: { show: false },
        },
      ],
      yAxis: [
        {
          type: this.logScale ? "log" : "value", gridIndex: 0, scale: true,
          position: "right", splitNumber: 4,
          splitLine: { show: true, lineStyle: { color: "rgba(255,255,255,0.04)", type: "solid" } },
          axisLine: { show: true, lineStyle: { color: "rgba(255,255,255,0.06)" } },
          axisTick: { show: false },
          axisLabel: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontFamily: "ui-monospace, SFMono-Regular, monospace", formatter: priceLabelFormatter },
          min: this.priceZoom?.min,
          max: this.priceZoom?.max,
        },
        {
          type: "value", gridIndex: 1, show: false, splitNumber: 2,
          splitLine: { show: false }, axisLine: { show: false },
          axisTick: { show: false }, axisLabel: { show: false },
        },
      ],
      dataZoom: [
        {
          type: "inside", xAxisIndex: [0, 1],
          start: this.dz.start, end: this.dz.end,
          filterMode: "none", zoomLock: false,
          moveOnMouseMove: true, moveOnMouseWheel: false, zoomOnMouseWheel: true,
        },
      ],
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
          crossStyle: { color: "rgba(255,255,255,0.2)" },
          lineStyle: { color: "rgba(255,255,255,0.2)", type: "dashed", width: 1 },
          label: { show: false },
        },
        backgroundColor: "rgba(0,0,0,0.75)",
        borderColor: "transparent",
        textStyle: { color: "rgba(255,255,255,0.9)", fontSize: 10, fontFamily: "ui-monospace, SFMono-Regular, monospace" },
        formatter: (params: any) => {
          if (!params || !params.length) return "";
          const bar = params[0];
          const d = bar.data;
          if (!d || d.length < 4) return "";
          const idx = bar.dataIndex;
          const b = drawBars[idx];
          if (!b) return "";
          const ts = parseTime(b.time);
          const timeLabel = subDaily
            ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
            : new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
          return `<div style="min-width:120px">
            <div style="color:rgba(255,255,255,0.6);margin-bottom:2px">${timeLabel}</div>
            <div><span style="color:#53ff84">O ${fmtPrice(d[0])}</span>  <span style="color:#f87171">H ${fmtPrice(d[3])}</span></div>
            <div><span style="color:#53ff84">L ${fmtPrice(d[2])}</span>  <span style="color:#f87171">C ${fmtPrice(d[1])}</span></div>
          </div>`;
        },
      },
      series: [
        {
          name: "candle", type: "candlestick", xAxisIndex: 0, yAxisIndex: 0, data: candleData,
          itemStyle: {
            color: "#53ff84", color0: "rgba(255,255,255,0.02)",
            borderColor: "#53ff84", borderColor0: "#f87171", borderWidth: 1,
          },
        },
        {
          name: "ema20", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: ema20Data,
          smooth: false, symbol: "none",
          lineStyle: { color: "rgba(255,255,100,0.5)", width: 1 }, z: 1,
        },
        {
          name: "ema50", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: ema50Data,
          smooth: false, symbol: "none",
          lineStyle: { color: "rgba(147,130,220,0.6)", width: 1 }, z: 1,
        },
        {
          name: "volume", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: volumeData, barMaxWidth: 8,
        },
        {
          name: "currentPrice", type: "line", xAxisIndex: 0, yAxisIndex: 0,
          data: drawBars.map(() => currentPrice),
          markLine: {
            silent: true, symbol: "none", animation: false,
            data: [
              { yAxis: currentPrice, lineStyle: { color: priceColor, type: "dashed", width: 1 } },
              ...priceLevelLines,
            ],
            label: {
              show: true, position: "insideEndTop",
              formatter: () => fmtPrice(currentPrice),
              color: isUp ? "#53ff84" : "#f87171",
              fontSize: 10, fontFamily: "ui-monospace, SFMono-Regular, monospace",
              backgroundColor: isUp ? "#53ff84" : "#f87171",
              padding: [2, 6], borderRadius: 3,
            },
          },
          lineStyle: { opacity: 0 }, symbol: "none", z: 0,
        },
      ],
    };
  }

  // ─── Internal: build indicator option ───

  private buildIndicatorOption(): echarts.EChartsOption {
    const bars = this.bars;
    const type = this.indicator;
    if (!bars.length || type === "none") return {};

    const times = bars.map(b => b.time);
    const visibleBars = Math.round((this.dz.end - this.dz.start) / 100 * bars.length);
    const labelStep = visibleBars <= 8 ? 1 : Math.max(1, Math.floor(visibleBars / 4));
    const subDaily = this.days <= 1;
    const timeLabelFormatter = (v: string) => {
      const t = parseTime(v);
      return subDaily
        ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
        : new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
    };

    const baseOption: echarts.EChartsOption = {
      animation: false,
      backgroundColor: "transparent",
      grid: [{ left: 4, right: 56, top: 4, bottom: 18 }],
      xAxis: [{
        type: "category", data: times, show: true, position: "bottom",
        axisTick: { show: false }, axisLine: { show: false },
        axisLabel: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: "ui-monospace, SFMono-Regular, monospace", formatter: timeLabelFormatter, interval: labelStep - 1 },
        splitLine: { show: false },
      }],
      yAxis: [{
        type: "value", show: true, position: "right", splitNumber: 2,
        splitLine: { show: false },
        axisLine: { show: true, lineStyle: { color: "rgba(255,255,255,0.06)" } },
        axisTick: { show: false },
        axisLabel: { color: "rgba(255,255,255,0.3)", fontSize: 9, fontFamily: "ui-monospace, SFMono-Regular, monospace" },
      }],
      dataZoom: [{ type: "inside", xAxisIndex: 0, start: this.dz.start, end: this.dz.end, filterMode: "none" }],
      tooltip: { show: false },
    };

    if (type === "rsi") {
      const rsi = computeRSI(bars);
      const data = bars.map((_, i) => rsi.get(i) ?? null);
      return {
        ...baseOption,
        yAxis: [{ ...baseOption.yAxis as any, min: 0, max: 100, splitLine: { show: true, lineStyle: { color: "rgba(255,255,255,0.04)", type: "dashed" } } }] as any,
        graphic: [{
          type: "text", left: 8, top: 6,
          style: { text: "RSI 14", fill: "rgba(168,85,247,0.6)", fontSize: 9, fontFamily: "ui-monospace, SFMono-Regular, monospace" }, z: 10,
        }],
        series: [{
          type: "line", data, symbol: "none",
          lineStyle: { color: "rgba(168,85,247,0.7)", width: 1 },
          markArea: {
            silent: true,
            data: [
              [{ yAxis: 70, itemStyle: { color: "rgba(248,113,113,0.04)" } }, { yAxis: 100 }],
              [{ yAxis: 0, itemStyle: { color: "rgba(83,255,132,0.04)" } }, { yAxis: 30 }],
            ],
          },
          markLine: {
            silent: true, symbol: "none",
            data: [
              { yAxis: 70, lineStyle: { color: "rgba(255,255,255,0.1)", type: "dashed", width: 0.5 } },
              { yAxis: 30, lineStyle: { color: "rgba(255,255,255,0.1)", type: "dashed", width: 0.5 } },
              { yAxis: 50, lineStyle: { color: "rgba(255,255,255,0.1)", type: "dashed", width: 0.5 } },
            ],
            label: { show: true, position: "insideEndTop", fontSize: 9, fontFamily: "ui-monospace, SFMono-Regular, monospace", color: "rgba(255,255,255,0.3)" },
          },
        }],
      };
    }

    if (type === "macd") {
      const { macd, signal, histogram } = computeMACD(bars);
      const histData = bars.map((_, i) => histogram.get(i) ?? null);
      const macdData = bars.map((_, i) => macd.get(i) ?? null);
      const signalData = bars.map((_, i) => signal.get(i) ?? null);
      return {
        ...baseOption,
        graphic: [
          { type: "text", left: 8, top: 6, style: { text: "MACD", fill: "rgba(56,189,248,0.6)", fontSize: 9, fontFamily: "ui-monospace, SFMono-Regular, monospace" }, z: 10 },
          { type: "text", left: 46, top: 6, style: { text: "Signal", fill: "rgba(251,191,36,0.6)", fontSize: 9, fontFamily: "ui-monospace, SFMono-Regular, monospace" }, z: 10 },
        ],
        series: [
          {
            type: "bar",
            data: histData.map((v) => ({ value: v, itemStyle: { color: v != null && v >= 0 ? "rgba(83,255,132,0.3)" : "rgba(248,113,113,0.3)" } })),
          },
          { type: "line", data: macdData, symbol: "none", lineStyle: { color: "rgba(56,189,248,0.7)", width: 1 } },
          { type: "line", data: signalData, symbol: "none", lineStyle: { color: "rgba(251,191,36,0.7)", width: 1 } },
        ],
      };
    }

    // zscore
    const zscore = computeZScore(bars);
    const data = bars.map((_, i) => {
      const v = zscore.get(i);
      return v != null ? Math.max(-5, Math.min(5, v)) : null;
    });
    return {
      ...baseOption,
      yAxis: [{ ...baseOption.yAxis as any, min: -5, max: 5, splitLine: { show: true, lineStyle: { color: "rgba(255,255,255,0.1)", type: "dashed" } } }] as any,
      graphic: [{ type: "text", left: 8, top: 6, style: { text: "Z-Score 20", fill: "rgba(251,191,36,0.6)", fontSize: 9, fontFamily: "ui-monospace, SFMono-Regular, monospace" }, z: 10 }],
      series: [{
        type: "line", data, symbol: "none",
        lineStyle: { color: "rgba(251,191,36,0.8)", width: 1.2 },
        markArea: {
          silent: true,
          data: [
            [{ yAxis: 2, itemStyle: { color: "rgba(248,113,113,0.04)" } }, { yAxis: 5 }],
            [{ yAxis: -5, itemStyle: { color: "rgba(83,255,132,0.04)" } }, { yAxis: -2 }],
          ],
        },
        markLine: {
          silent: true, symbol: "none",
          data: [-2, -1, 0, 1, 2].map(v => ({
            yAxis: v,
            lineStyle: { color: v === 0 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.1)", type: "dashed", width: v === 0 ? 0.8 : 0.5 },
          })),
          label: { show: true, position: "insideEndTop", fontSize: 9, fontFamily: "ui-monospace, SFMono-Regular, monospace", color: "rgba(255,255,255,0.3)" },
        },
      }],
    };
  }

  // ─── Internal: build graphic elements (drawings overlay) ───

  private buildGraphicElements(): any[] {
    const inst = this.chart;
    const bars = this.bars;
    if (!inst || !bars.length) return [];

    const elems: any[] = [];

    // Get grid bounds for candlestick area
    try {
      const model = (inst as any).getModel();
      const gridModel = model.getComponent("grid", 0);
      if (gridModel) {
        const coordSys = (inst as any).coordinateSystem;
        if (coordSys) {
          const gridRect = gridModel.coordinateSystem.getRect();
          const leftX = gridRect.x;
          const topY = gridRect.y;

          // EMA legend
          elems.push({
            type: "text", left: leftX + 4, top: topY + 2,
            style: { text: "EMA 20", fill: "rgba(255,255,100,0.5)", fontSize: 9, fontFamily: "ui-monospace, SFMono-Regular, monospace" },
            z: 10, silent: true,
          });
          elems.push({
            type: "text", left: leftX + 56, top: topY + 2,
            style: { text: "EMA 50", fill: "rgba(147,130,220,0.6)", fontSize: 9, fontFamily: "ui-monospace, SFMono-Regular, monospace" },
            z: 10, silent: true,
          });
        }
      }
    } catch { /* skip legend */ }

    // Volume Profile overlay
    if (this.showVP && this.vpData.length > 0) {
      const vpData = this.vpData;
      let maxVol = 0;
      for (const row of vpData) {
        const total = row.buy + row.sell;
        if (total > maxVol) maxVol = total;
      }
      if (maxVol > 0) {
        const vpStep = vpData.length > 1 ? Math.abs(vpData[1].price - vpData[0].price) : 3;
        try {
          const model = (inst as any).getModel();
          const gridModel = model.getComponent("grid", 0);
          if (gridModel) {
            const rect = gridModel.coordinateSystem.getRect();
            const rightEdgeX = rect.x + rect.width;
            const vpWidth = rect.width * 0.25;

            for (const row of vpData) {
              const pY = this.dataToPixel(0, row.price);
              if (!pY) continue;
              const y = pY[1];
              const barH = Math.max(1, Math.abs(pY[1] - (this.dataToPixel(0, row.price + vpStep)?.[1] ?? y)));
              const total = row.buy + row.sell;
              const buyRatio = row.buy / total;
              const barW = Math.max(1, (total / maxVol) * vpWidth);
              const buyW = barW * buyRatio;
              const sellW = barW - buyW;
              const x = rightEdgeX - barW;

              if (sellW > 0) {
                elems.push({
                  type: "rect", shape: { x, y: y - barH / 2, width: sellW, height: barH },
                  style: { fill: "rgba(248,113,113,0.18)" }, z: -1, silent: true,
                });
              }
              if (buyW > 0) {
                elems.push({
                  type: "rect", shape: { x: x + sellW, y: y - barH / 2, width: buyW, height: barH },
                  style: { fill: "rgba(83,255,132,0.18)" }, z: -1, silent: true,
                });
              }
            }
          }
        } catch { /* skip VP */ }
      }
    }

    // Trendlines
    for (const tl of this.trendlines) {
      const si = findBarIndexByTime(bars, tl.startTime);
      const ei = findBarIndexByTime(bars, tl.endTime);
      const p1 = this.dataToPixel(si, tl.startPrice);
      const p2 = this.dataToPixel(ei, tl.endPrice);
      if (!p1 || !p2) continue;

      const isSelected = tl.id === this.selectedTlId;

      if (tl.kind === "fib") {
        const hi = Math.max(tl.startPrice, tl.endPrice);
        const lo = Math.min(tl.startPrice, tl.endPrice);
        const range = hi - lo;
        if (range <= 0) continue;

        try {
          const model = (inst as any).getModel();
          const gridModel = model.getComponent("grid", 0);
          if (gridModel) {
            const rect = gridModel.coordinateSystem.getRect();
            const fullLeft = rect.x;
            const fullRight = rect.x + rect.width;

            for (const { r, label } of FIB_LEVELS) {
              const price = hi - range * r;
              const py = this.dataToPixel(si, price);
              if (!py) continue;
              const y = py[1];
              const color = FIB_COLORS[label] || "#888";

              elems.push({
                type: "line", shape: { x1: fullLeft, y1: y, x2: fullRight, y2: y },
                style: { stroke: color + "55", lineWidth: 1 }, z: 2, silent: true, lineDash: [4, 3],
              });

              const labelText = `${label}  ${fmtPrice(price)}`;
              elems.push({
                type: "rect", shape: { x: fullRight - 90 - 2, y: y - 7, width: 92, height: 13, r: 3 },
                style: { fill: color + "20" }, z: 2, silent: true,
              });
              elems.push({
                type: "text", x: fullRight - 90 + 2, y: y - 0.5,
                style: { text: labelText, fill: color, fontSize: 9, fontFamily: "ui-monospace, SFMono-Regular, monospace", textVerticalAlign: "middle" },
                z: 3, silent: true,
              });
            }
          }
        } catch { /* skip fib grid */ }

        // Diagonal line
        elems.push({
          type: "line", shape: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] },
          style: { stroke: tl.color + "aa", lineWidth: 1.5 }, z: 3, silent: true,
        });
      }

      if (tl.kind !== "fib") {
        elems.push({
          type: "line", shape: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] },
          style: { stroke: tl.color, lineWidth: 1.5, opacity: 0.85 }, z: 3, silent: true,
        });
      }

      // Endpoint handles
      const handleR = isSelected ? 6 : 4;
      for (const [cx, cy] of [p1, p2]) {
        elems.push({
          type: "circle", shape: { cx, cy, r: handleR },
          style: { fill: isSelected ? "#fff" : tl.color, stroke: tl.color, lineWidth: isSelected ? 2 : 0 },
          z: 4, silent: true,
        });
      }
    }

<<<<<<< HEAD
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

const FIB_LEVELS = [
  { r: 0,    label: "0" },
  { r: 0.236, label: "0.236" },
  { r: 0.382, label: "0.382" },
  { r: 0.5,  label: "0.5" },
  { r: 0.618, label: "0.618" },
  { r: 0.786, label: "0.786" },
  { r: 1,    label: "1" },
  { r: 1.618, label: "1.618" },
];

const FIB_COLORS: Record<string, string> = {
  "0": "#f87171", "0.236": "#fb923c", "0.382": "#fbbf24",
  "0.5": "#a78bfa", "0.618": "#34d399", "0.786": "#38bdf8",
  "1": "#f87171", "1.618": "#f472b6",
};

function drawFib(
  ctx: CanvasRenderingContext2D,
  s: DrawState,
  tl: TrendLine,
  selected: boolean,
) {
  const { padLeft, chartW, priceToY } = s;
  const hi = Math.max(tl.startPrice, tl.endPrice);
  const lo = Math.min(tl.startPrice, tl.endPrice);
  const range = hi - lo;
  if (range <= 0) return;

  const x1 = s.idxToX(s.bars.findIndex((b, _i) => parseTime(b.time) === tl.startTime));
  const x2 = s.idxToX(s.bars.findIndex((b, _i) => parseTime(b.time) === tl.endTime));
  const leftX = Math.min(x1, x2);
  const rightX = Math.max(x1, x2);

  // Fib levels extend across the FULL chart width
  const fullLeft = padLeft;
  const fullRight = chartW;

  for (const { r, label } of FIB_LEVELS) {
    const price = hi - range * r;
    const y = priceToY(price);
    if (y < s.padTop - 20 || y > s.padTop + s.chartH + 20) continue;
    const color = FIB_COLORS[label] || "#888";

    // Full-width level line
    ctx.strokeStyle = color + "55";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(fullLeft, y);
    ctx.lineTo(fullRight, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Price label on the RIGHT side (like TradingView)
    ctx.font = "9px ui-monospace, SFMono-Regular, monospace";
    const labelText = `${label}  ${fmtPrice(price)}`;
    const lw = ctx.measureText(labelText).width + 8;
    ctx.fillStyle = color + "20";
    ctx.fillRect(fullRight - lw - 2, y - 7, lw, 13);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(labelText, fullRight - lw + 2, y - 0.5);
  }

  // Diagonal trend line between the two anchors
  ctx.strokeStyle = tl.color + "aa";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, priceToY(tl.startPrice));
  ctx.lineTo(x2, priceToY(tl.endPrice));
  ctx.stroke();

  // Anchor handles (always visible for fib, larger when selected)
  const handleR = selected ? 6 : 4;
  for (const [px, py] of [[x1, priceToY(tl.startPrice)], [x2, priceToY(tl.endPrice)]]) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(px, py, handleR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = tl.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
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
  logScale?: boolean,
  showSignals?: boolean,
) {
  const s = buildDrawState(ctx, w, h, bars, subDaily, viewStart, viewEnd, priceOverride, logScale);
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

  // Trendlines / Fib drawings (drawn behind candles)
  const allTrendlines = [...trendlines];
  for (const tl of allTrendlines) {
    if (tl.kind === "fib") {
      drawFib(ctx, s, tl, tl.id === selectedTlId);
      continue;
    }
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
=======
    // Measure overlay
    if (this.measureRef) {
      const { x1, x2 } = this.measureRef;
      const d1 = this.pixelToData(x1, 0);
      const d2 = this.pixelToData(x2, 0);
      if (d1 && d2 && d1.idx !== d2.idx) {
        const a = d1.idx < d2.idx ? d1.idx : d2.idx;
        const b = d1.idx < d2.idx ? d2.idx : d1.idx;
        const p1 = bars[a].close;
        const p2 = bars[b].close;
        const diff = p2 - p1;
        const pct = (diff / p1) * 100;
        const isUp = diff >= 0;
        const color = isUp ? "#22c55e" : "#f87171";
        const pa = this.dataToPixel(a, p1);
        const pb = this.dataToPixel(b, p2);
        if (pa && pb) {
          for (const px of [pa[0], pb[0]]) {
            elems.push({
              type: "line", shape: { x1: px, y1: pa[1] - 40, x2: px, y2: pb[1] + 40 },
              style: { stroke: color, lineDash: [4, 4], opacity: 0.45, lineWidth: 1 }, z: 5, silent: true,
            });
          }
          for (const [cx, cy] of [pa, pb]) {
            elems.push({ type: "circle", shape: { cx, cy, r: 3.5 }, style: { fill: color }, z: 5, silent: true });
          }
          elems.push({
            type: "line", shape: { x1: pa[0], y1: pa[1], x2: pb[0], y2: pb[1] },
            style: { stroke: color, lineWidth: 1.5 }, z: 5, silent: true,
          });
          const midX = (pa[0] + pb[0]) / 2;
          const midY = (pa[1] + pb[1]) / 2;
          const label = `${isUp ? "+" : ""}${pct.toFixed(2)}%`;
          elems.push({
            type: "rect", shape: { x: midX - 40, y: midY - 20, width: 80, height: 40, r: 6 },
            style: { fill: color }, z: 6, silent: true,
          });
          elems.push({
            type: "text", x: midX, y: midY - 6,
            style: { text: label, fill: "#0a0a0a", fontSize: 14, fontWeight: 700, fontFamily: "ui-monospace, SFMono-Regular, monospace", textAlign: "center", textVerticalAlign: "middle" },
            z: 7, silent: true,
          });
>>>>>>> d246df0 (fix: bypass broken ECharts 6 graphic component - draw directly on zrender canvas)
        }
      }
    }

    return elems;
  }

  // ─── Internal: render ───

  private _renderTimer: ReturnType<typeof setTimeout> | null = null;

  private scheduleRender(): void {
    if (this._destroyed) return;
    if (this._renderTimer) clearTimeout(this._renderTimer);
    this._renderTimer = setTimeout(() => {
      this._renderTimer = null;
      this.render();
    }, 16); // ~60fps debounce
  }

  private scheduleRefresh(): void {
    setTimeout(() => this.doLoadBars(true), 16);
  }

  private render(): void {
    const inst = this.chart;
    if (!inst || !this.bars.length) {
      this.setStatus({ loading: false, error: false, empty: true });
      return;
    }
    this.setStatus({ loading: false, error: false, empty: false });

    const option = this.buildMainOption();
    inst.setOption(option, true);

    // Update graphic elements after chart renders
    requestAnimationFrame(() => {
      if (!this.chart) return;
      const graphics = this.buildGraphicElements();
      if (graphics && Array.isArray(graphics) && graphics.length > 0) {
        this.chart!.setOption({ graphic: graphics as any });
      } else {
        this.chart!.setOption({ graphic: [] });
      }
<<<<<<< HEAD
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

  // Buy the Dip / Sell the Rip signals
  if (showSignals) {
    drawBtSrSignals(ctx, s, bars);
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
  const tagLabel = fmtPrice(lastBar.close);
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

    const lvlLabel = fmtPrice(level.price);
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
      ctx.fillText(`O ${fmtPrice(b.open)}`, tx + 8, ty + 20);
      ctx.fillStyle = "#f87171";
      ctx.fillText(`H ${fmtPrice(b.high)}`, tx + 72, ty + 20);
      ctx.fillStyle = "#53ff84";
      ctx.fillText(`L ${fmtPrice(b.low)}`, tx + 8, ty + 34);
      ctx.fillStyle = "#f87171";
      ctx.fillText(`C ${fmtPrice(b.close)}`, tx + 72, ty + 34);
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
=======
>>>>>>> d246df0 (fix: bypass broken ECharts 6 graphic component - draw directly on zrender canvas)
    });

    // Indicator chart
    if (this.indicator !== "none" && this.indChart) {
      const indOption = this.buildIndicatorOption();
      this.indChart.setOption(indOption, true);
    }
  }

<<<<<<< HEAD
  // Price labels (right axis) - skip some for small charts
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const numPriceLabels = chartH < 100 ? 2 : chartH < 150 ? 3 : 4;
  for (let i = 0; i <= numPriceLabels; i++) {
    const p = lo + (totalRange / numPriceLabels) * i;
    const y = priceToY(p);
    const label = fmtPrice(p);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(label, w - padRight + 6, y);
=======
  private renderIndicator(): void {
    if (this.indChart && this.indicator !== "none" && this.bars.length) {
      const indOption = this.buildIndicatorOption();
      this.indChart.setOption(indOption, true);
    }
>>>>>>> d246df0 (fix: bypass broken ECharts 6 graphic component - draw directly on zrender canvas)
  }

  // ─── Internal: event binding ───

  private getPos(e: any): { x: number; y: number } {
    const rect = this.dom.getBoundingClientRect();
    const touch = e.touches?.[0] || e;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  private updateTrendline(tl: TrendLine): void {
    if (this.config.onTrendlineUpdate) {
      this.config.onTrendlineUpdate(tl);
    } else {
      this.trendlines = this.trendlines.map(t => t.id === tl.id ? tl : t);
      this.scheduleRender();
    }
  }

  private bindEvents(): void {
    const zr = this.chart?.getZr();
    if (!zr) return;

    const onWheel = (e: any) => {
      const rect = this.dom.getBoundingClientRect();
      const mx = e.offsetX;
      const chartW = rect.width;
      const rightPad = 56;

      if (mx > chartW - rightPad) {
        try {
          const inst = this.chart;
          if (!inst) return;
          const opt = inst.getOption() as any;
          const yMin = opt.yAxis?.[0]?.min;
          const yMax = opt.yAxis?.[0]?.max;
          if (yMin == null || yMax == null) return;

          const priceAtMouse = inst.convertFromPixel({ yAxisIndex: 0 }, [0, e.offsetY])?.[1];
          if (priceAtMouse == null) return;

          const delta = e.event.deltaY || (e.event.wheelDelta || 0);
          const zoomFactor = delta > 0 ? 1.15 : 1 / 1.15;
          const currentRange = yMax - yMin;
          const newRange = Math.max(currentRange * 0.02, Math.min(currentRange * 50, currentRange * zoomFactor));
          const ratio = (priceAtMouse - yMin) / currentRange;
          const newYMin = priceAtMouse - newRange * ratio;
          const newYMax = priceAtMouse + newRange * (1 - ratio);

          this.priceZoom = { min: newYMin, max: newYMax };
          setTimeout(() => {
            if (!this.chart) return;
            this.chart.setOption({ yAxis: [{ min: newYMin, max: newYMax }] });
            const graphics = this.buildGraphicElements();
            this.chart.setOption({ graphic: graphics as any });
          }, 0);
        } catch { /* skip */ }
      }
    };

    const onMousedown = (e: any) => {
      const inst = this.chart;
      if (!inst || !this.bars.length) return;
      const pos = this.getPos(e);
      const { x, y } = pos;

      // Shift+click → measure tool
      if (e.event?.shiftKey || e.shiftKey) {
        this.measureRef = { x1: x, x2: x };
        this.measureActive = true;
        this.selectedTlId = null;
        this.onTrendlineSelect?.(null);
        this.scheduleRender();
        return;
      }

      // Hit-test trendlines
      const hit = this.hitTestTrendline(x, y);
      if (hit) {
        this.selectedTlId = hit.tl.id;
        this.onTrendlineSelect?.(hit.tl.id);
        this.dragRef = {
          tlId: hit.tl.id,
          mode: hit.mode,
          startPixelX: x,
          startPixelY: y,
          origTl: { ...hit.tl },
        };
        return;
      }

      // Price axis zone: start price zoom drag
      const rect = this.dom.getBoundingClientRect();
      if (x > rect.width - 56) {
        const opt = inst.getOption() as any;
        const yMin = opt.yAxis?.[0]?.min;
        const yMax = opt.yAxis?.[0]?.max;
        if (yMin != null && yMax != null) {
          this.priceZoomDragRef = { startY: e.offsetY ?? y, origMin: yMin, origMax: yMax };
        }
        return;
      }

      // Empty space — pan handled by ECharts' inside dataZoom
      this.selectedTlId = null;
      this.onTrendlineSelect?.(null);
      this.dragRef = null;
    };

    const onMousemove = (e: any) => {
      const inst = this.chart;
      if (!inst || !this.bars.length) return;
      const pos = this.getPos(e);
      const { x, y } = pos;

      // Price axis zoom drag
      if (this.priceZoomDragRef && (e.buttons === 1 || (e.event && e.event.buttons === 1))) {
        const dy = y - this.priceZoomDragRef.startY;
        const anchor = this.priceZoomDragRef;
        const origRange = anchor.origMax - anchor.origMin;
        const zoomFactor = Math.exp(-dy * 0.005);
        const newRange = Math.max(origRange * 0.02, Math.min(origRange * 50, origRange * zoomFactor));
        const mid = (anchor.origMin + anchor.origMax) / 2;
        const newYMin = mid - newRange / 2;
        const newYMax = mid + newRange / 2;
        this.priceZoom = { min: newYMin, max: newYMax };
        setTimeout(() => {
          if (!this.chart) return;
          this.chart.setOption({ yAxis: [{ min: newYMin, max: newYMax }] });
          const graphics = this.buildGraphicElements();
          this.chart.setOption({ graphic: graphics as any });
        }, 0);
        return;
      }

      // Measure drag
      if (this.measureActive && (e.buttons === 1 || (e.event && e.event.buttons === 1))) {
        this.measureRef = { x1: this.measureRef!.x1, x2: x };
        setTimeout(() => {
          if (!this.chart) return;
          const graphics = this.buildGraphicElements();
          this.chart.setOption({ graphic: graphics as any });
        }, 0);
        return;
      }

      // Trendline drag
      if (this.dragRef && (e.buttons === 1 || (e.event && e.event.buttons === 1))) {
        const data = this.pixelToData(x, y);
        if (!data) return;
        let { idx, price } = this.magnet ? this.snapToOHLC(data.idx, data.price) : data;
        const drag = this.dragRef;
        const orig = drag.origTl;

        const bars = this.bars;
        const clampIdx = Math.max(0, Math.min(bars.length - 1, idx));
        const barTime = parseTime(bars[clampIdx].time);

        const startData = this.pixelToData(drag.startPixelX, drag.startPixelY);
        const startIdx = startData ? Math.max(0, Math.min(bars.length - 1, startData.idx)) : clampIdx;
        const startBarTime = parseTime(bars[startIdx].time);
        const startPrice = startData?.price ?? orig.startPrice;
        const snapResult: { idx: number; price: number } = this.magnet ? this.snapToOHLC(startIdx, startPrice) : { idx: startIdx, price: startPrice };
        const startP = snapResult.price;

        const dt = barTime - startBarTime;
        const dp = price - startP;

        const updated: TrendLine = { ...orig };
        if (drag.mode === "start") {
          updated.startTime = orig.startTime + dt;
          updated.startPrice = orig.startPrice + dp;
        } else if (drag.mode === "end") {
          updated.endTime = orig.endTime + dt;
          updated.endPrice = orig.endPrice + dp;
        } else {
          updated.startTime = orig.startTime + dt;
          updated.endTime = orig.endTime + dt;
          updated.startPrice = orig.startPrice + dp;
          updated.endPrice = orig.endPrice + dp;
        }
        this.updateTrendline(updated);
        return;
      }
    };

    const onMouseup = (_e: any) => {
      this.priceZoomDragRef = null;
      this.dragRef = null;
      if (this.measureActive) {
        this.measureActive = false;
        this.measureRef = null;
        this.scheduleRender();
      }
    };

    const onTouchstart = (e: any) => {
      if (this.longPressRef.timer) {
        clearTimeout(this.longPressRef.timer);
        this.longPressRef.timer = null;
      }

      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.pinchRef = {
          active: true,
          dist: Math.sqrt(dx * dx + dy * dy),
          startDz: { ...this.dz },
        };
      } else if (e.touches.length === 1 && !this.pinchRef.active) {
        const pos = this.getPos(e);
        const { x, y } = pos;

        const hit = this.hitTestTrendline(x, y);
        if (hit) {
          this.selectedTlId = hit.tl.id;
          this.onTrendlineSelect?.(hit.tl.id);
          this.dragRef = {
            tlId: hit.tl.id,
            mode: hit.mode,
            startPixelX: x,
            startPixelY: y,
            origTl: { ...hit.tl },
          };
          return;
        }

        // Price axis zone
        const rect = this.dom.getBoundingClientRect();
        if (x > rect.width - 56) {
          const inst = this.chart;
          if (inst) {
            const opt = inst.getOption() as any;
            const yMin = opt.yAxis?.[0]?.min;
            const yMax = opt.yAxis?.[0]?.max;
            if (yMin != null && yMax != null) {
              this.priceZoomDragRef = { startY: y, origMin: yMin, origMax: yMax };
            }
          }
          return;
        }

        // Long-press → measure mode
        const cx = e.touches[0].clientX;
        const cy = e.touches[0].clientY;
        this.longPressRef = {
          x: cx, y: cy,
          timer: setTimeout(() => {
            if (this.bars.length) {
              const r = this.dom.getBoundingClientRect();
              const fx = cx - r.left;
              this.measureRef = { x1: fx, x2: fx };
              this.measureActive = true;
              this.scheduleRender();
            }
          }, 300),
        };
      }
    };

    const onTouchmove = (e: any) => {
      if (!this.chart || !this.bars.length) return;

      // Price axis zoom drag
      if (this.priceZoomDragRef && e.touches.length === 1) {
        const pos = this.getPos(e);
        const dy = pos.y - this.priceZoomDragRef.startY;
        const anchor = this.priceZoomDragRef;
        const origRange = anchor.origMax - anchor.origMin;
        const zoomFactor = Math.exp(-dy * 0.005);
        const newRange = Math.max(origRange * 0.02, Math.min(origRange * 50, origRange * zoomFactor));
        const mid = (anchor.origMin + anchor.origMax) / 2;
        this.priceZoom = { min: mid - newRange / 2, max: mid + newRange / 2 };
        this.chart.setOption({ yAxis: [{ min: mid - newRange / 2, max: mid + newRange / 2 }] });
        return;
      }

      // Trendline drag
      if (this.dragRef && e.touches.length === 1) {
        const pos = this.getPos(e);
        const data = this.pixelToData(pos.x, pos.y);
        if (!data) return;
        let { idx, price } = this.magnet ? this.snapToOHLC(data.idx, data.price) : data;
        const drag = this.dragRef;
        const orig = drag.origTl;
        const bars = this.bars;
        const clampIdx = Math.max(0, Math.min(bars.length - 1, idx));
        const barTime = parseTime(bars[clampIdx].time);

        const startData = this.pixelToData(drag.startPixelX, drag.startPixelY);
        const startIdx = startData ? Math.max(0, Math.min(bars.length - 1, startData.idx)) : clampIdx;
        const startBarTime = parseTime(bars[startIdx].time);
        const startPrice = startData?.price ?? orig.startPrice;
        const dt = barTime - startBarTime;
        const dp = price - startPrice;

        const updated: TrendLine = { ...orig };
        if (drag.mode === "start") {
          updated.startTime = orig.startTime + dt;
          updated.startPrice = orig.startPrice + dp;
        } else if (drag.mode === "end") {
          updated.endTime = orig.endTime + dt;
          updated.endPrice = orig.endPrice + dp;
        } else {
          updated.startTime = orig.startTime + dt;
          updated.endTime = orig.endTime + dt;
          updated.startPrice = orig.startPrice + dp;
          updated.endPrice = orig.endPrice + dp;
        }
        this.updateTrendline(updated);
        return;
      }

      if (this.measureActive && e.touches.length === 1) {
        const pos = this.getPos(e);
        this.measureRef = { x1: this.measureRef!.x1, x2: pos.x };
        setTimeout(() => {
          if (!this.chart) return;
          const graphics = this.buildGraphicElements();
          this.chart.setOption({ graphic: graphics as any });
        }, 0);
        return;
      }

      // Cancel long-press if moved > 10px
      if (this.longPressRef.timer) {
        const moved = Math.abs(e.touches[0].clientX - this.longPressRef.x) + Math.abs(e.touches[0].clientY - this.longPressRef.y);
        if (moved > 10) {
          clearTimeout(this.longPressRef.timer);
          this.longPressRef.timer = null;
        }
      }
    };

    const onTouchend = (_e: any) => {
      if (this.longPressRef.timer) {
        clearTimeout(this.longPressRef.timer);
        this.longPressRef.timer = null;
      }
      this.pinchRef = { active: false, dist: 0, startDz: { start: 0, end: 0 } };
      this.dragRef = null;
      this.priceZoomDragRef = null;
      if (this.measureActive) {
        this.measureActive = false;
        this.measureRef = null;
        this.scheduleRender();
      }
    };

    // Data zoom sync
    const onDataZoom = () => {
      requestAnimationFrame(() => {
        if (!this.chart) return;
        const opt = this.chart.getOption() as any;
        if (opt?.dataZoom?.[0]) {
          this.dz = {
            start: opt.dataZoom[0].start ?? 0,
            end: opt.dataZoom[0].end ?? 100,
          };
        }
        // Sync indicator chart
        if (this.indChart) {
          this.indChart.setOption({
            dataZoom: [{ start: this.dz.start, end: this.dz.end }],
          });
        }
        // Re-render graphics
        setTimeout(() => {
          if (!this.chart) return;
          const graphics = this.buildGraphicElements();
          this.chart.setOption({ graphic: graphics as any });
        }, 0);
      });
    };

    // Store references for cleanup
    this.boundHandlers = { onWheel, onMousedown, onMousemove, onMouseup, onTouchstart, onTouchmove, onTouchend, onDataZoom };

    zr.on("mousewheel", onWheel);
    zr.on("mousedown", onMousedown);
    zr.on("mousemove", onMousemove);
    zr.on("mouseup", onMouseup);
    zr.on("touchstart", onTouchstart);
    zr.on("touchmove", onTouchmove);
    zr.on("touchend", onTouchend);
    this.chart?.on("dataZoom", onDataZoom);
  }

  private unbindEvents(): void {
    const zr = this.chart?.getZr();
    if (zr) {
      zr.off("mousewheel", this.boundHandlers.onWheel);
      zr.off("mousedown", this.boundHandlers.onMousedown);
      zr.off("mousemove", this.boundHandlers.onMouseMove);
      zr.off("mouseup", this.boundHandlers.onMouseup);
      zr.off("touchstart", this.boundHandlers.onTouchstart);
      zr.off("touchmove", this.boundHandlers.onTouchmove);
      zr.off("touchend", this.boundHandlers.onTouchend);
    }
    this.chart?.off("dataZoom", this.boundHandlers.onDataZoom);
    this.boundHandlers = {};
  }

  private cleanupTimers(): void {
    if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
    if (this.vpTimer) { clearInterval(this.vpTimer); this.vpTimer = null; }
    if (this.longPressRef.timer) { clearTimeout(this.longPressRef.timer); this.longPressRef.timer = null; }
  }

  private _lastStatus = { loading: true, error: false, empty: false };

  private setStatus(status: { loading: boolean; error: boolean; empty: boolean }): void {
    const prev = this._lastStatus;
    if (prev.loading === status.loading && prev.error === status.error && prev.empty === status.empty) return;
    this._lastStatus = status;
    this.config.onStatusChange?.(status);
  }
}

// ─── React Component ───

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
  chromeless = false,
  onApi,
}: Props) {
  const mainChartRef = useRef<HTMLDivElement>(null);
  const indChartRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<ChartManager | null>(null);

  const [days, setDays] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [indicator, setIndicator] = useState<IndicatorType>("none");
  const [showVP, setShowVP] = useState(false);
  const [showTape, setShowTape] = useState(false);
  const [logScale, setLogScale] = useState(false);
  const [magnet, setMagnet] = useState(false);
  const [candleType, setCandleType] = useState<"candle" | "heikin">("candle");
  const [showSignals, setShowSignals] = useState(false);
  const [drawTool, setDrawTool] = useState<"line" | "fib">("line");
  const [selectedTlId, setSelectedTlId] = useState<number | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const subscribersRef = useRef<Set<() => void>>(new Set());

  const cgId = cgIdFromSymbol(symbol);
  const canChart = !!cgId;

  // Expose imperative API via onApi callback
  useEffect(() => {
    if (!onApi) return;
    const api: ChartAPI = {
      setDays: (d: number) => { setDays(d); managerRef.current?.setDays(d); },
      getDays: () => days,
      setIndicator: (t) => { setIndicator(t === indicator ? "none" as IndicatorType : t); },
      getIndicator: () => indicator,
      toggleVP: () => setShowVP(v => !v),
      getVP: () => showVP,
      toggleTape: () => setShowTape(v => !v),
      getTape: () => showTape,
      toggleLog: () => setLogScale(l => { managerRef.current?.setLogScale(!l); return !l; }),
      getLog: () => logScale,
      toggleMagnet: () => setMagnet(m => !m),
      getMagnet: () => magnet,
      toggleHA: () => setCandleType(c => c === "candle" ? "heikin" : "candle"),
      getHA: () => candleType === "heikin",
      toggleFib: () => setDrawTool(dt => dt === "line" ? "fib" : "line"),
      getDrawTool: () => drawTool,
      createLine: () => managerRef.current?.createTrendline(),
      removeSelected: () => managerRef.current?.removeSelectedTrendline(),
      getHasSelection: () => selectedTlId != null,
      subscribe: (cb: () => void) => {
        subscribersRef.current.add(cb);
        return () => { subscribersRef.current.delete(cb); };
      },
    };
    onApi(api);
  }, [onApi, days, indicator, showVP, showTape, logScale, magnet, candleType, drawTool, selectedTlId]);

  // Create/destroy ChartManager
  useEffect(() => {
    if (!canChart || !mainChartRef.current) return;
    const manager = new ChartManager(mainChartRef.current, {
      symbol,
      height,
      onStatusChange: (s) => {
        setLoading(s.loading);
        setError(s.error);
        setEmpty(s.empty);
      },
      onTrendlineAdd,
      onTrendlineUpdate,
      onTrendlineRemove,
    });
    manager.onTrendlineSelect = setSelectedTlId;

    // Defer init outside React's commit phase
    manager.scheduleInit();

    managerRef.current = manager;

    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, [canChart, symbol]);

  // Update indicator dom ref when indicator changes
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;
    setTimeout(() => {
      if (indicator === "none") {
        manager.setIndicator("none");
      } else if (indChartRef.current) {
        manager.setIndicatorDom(indChartRef.current);
        manager.setIndicator(indicator);
      }
    }, 0);
  }, [indicator]);

  // Sync external props to manager
  useEffect(() => {
    managerRef.current?.setHeight(height);
  }, [height]);

  useEffect(() => {
    managerRef.current?.setPriceLevels(priceLevels);
  }, [priceLevels]);

  useEffect(() => {
    managerRef.current?.setTrendlines(trendlines);
  }, [trendlines]);

  useEffect(() => {
    managerRef.current?.setSelectedTrendlineId(selectedTlId);
  }, [selectedTlId]);

  useEffect(() => {
    managerRef.current?.setLogScale(logScale);
  }, [logScale]);

  useEffect(() => {
    managerRef.current?.setHeikinAshi(candleType === "heikin");
  }, [candleType]);

  useEffect(() => {
    managerRef.current?.setMagnet(magnet);
  }, [magnet]);

  useEffect(() => {
    managerRef.current?.setDrawTool(drawTool);
  }, [drawTool]);

  useEffect(() => {
    managerRef.current?.setShowVP(showVP);
    if (showVP) {
      managerRef.current?.startVPRefresh();
    } else {
      managerRef.current?.stopVPRefresh();
    }
  }, [showVP]);

  // Days change (timeframe selector)
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;
    setDays(d => {
      // Use a ref approach — but manager handles it
      return d;
    });
  }, []);

  const handleDaysChange = useCallback((newDays: number) => {
    setDays(newDays);
    managerRef.current?.setDays(newDays);
  }, []);

  const handleIndicatorChange = useCallback((type: IndicatorType) => {
    setIndicator(prev => prev === type ? "none" : type);
  }, []);

  const handleCreateTrendline = useCallback(() => {
    managerRef.current?.createTrendline();
  }, []);

  const handleRemoveTrendline = useCallback(() => {
    managerRef.current?.removeSelectedTrendline();
  }, []);

<<<<<<< HEAD
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
    let h = rect.height;
    
    // If no explicit height and container has 0 height, check parent
    if (h < 10 && height === undefined) {
      const parent = canvas.parentElement;
      if (parent) {
        const parentRect = parent.getBoundingClientRect();
        h = parentRect.height > 10 ? parentRect.height : h;
      }
    }
    
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
    const drawBars = candleType === "heikin" ? toHeikinAshi(bars) : bars;
    drawChart(ctx, w, h, drawBars, subDaily, vs, ve, crossX ?? crossXRef.current, priceLevels, tls, null, selectedTlId, priceZoomRef.current, vpDataRef.current, undefined, logScale, showSignals);

    // Two-finger measurement overlay
    if (measureRef.current) {
      const ms = buildDrawState(ctx, w, h, bars, subDaily, vs, ve, priceZoomRef.current, logScale);
      drawMeasureOverlay(ctx, ms, bars, measureRef.current.x1, measureRef.current.x2);
    }

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

  }, [priceLevels, activeTrendlines, selectedTlId, indicator, candleType, logScale, showSignals]);

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
    
    // Also handle window resize
    const handleResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (barsRef.current.length) render(barsRef.current, days <= 1);
      });
    };
    window.addEventListener('resize', handleResize);
    
    return () => { observer.disconnect(); window.removeEventListener('resize', handleResize); cancelAnimationFrame(raf); };
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
=======
  // Tape fetch
>>>>>>> d246df0 (fix: bypass broken ECharts 6 graphic component - draw directly on zrender canvas)
  useEffect(() => {
    if (!showTape || !symbol.startsWith("BINANCE:")) {
      setTrades([]);
      return;
    }
    let cancelled = false;
    const loadTape = () => {
      fetchTrades(symbol, 50).then((data) => {
        if (cancelled) return;
        setTrades(data.reverse());
      });
    };
    loadTape();
    const interval = setInterval(loadTape, 2_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [showTape, symbol]);

  // Resize handle
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

  // Toolbar button style
  const toolBtn = (active: boolean, bg: string, fg: string): React.CSSProperties => ({
    padding: "3px 8px", borderRadius: "5px", border: "none",
    background: active ? bg : "transparent",
    color: active ? fg : "var(--text-dim)",
    fontSize: "11px", fontWeight: 500, cursor: "pointer",
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    flexShrink: 0, whiteSpace: "nowrap",
  });

  if (!canChart) return null;

  // ─── Chromeless path: only chart canvas + indicator div ───
  if (chromeless) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
        {/* Main chart */}
        <div style={{
          flex: 1,
          overflow: "hidden",
          background: "rgba(255,255,255,0.02)",
          position: "relative",
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}>
          <div ref={mainChartRef} style={{ width: "100%", height: "100%" }} />
          {loading && (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-dim)", fontSize: "13px", zIndex: 1, pointerEvents: "none",
            }}>Loading chart...</div>
          )}
          {error && (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-dim)", fontSize: "13px", zIndex: 1, pointerEvents: "none",
            }}>Chart unavailable</div>
          )}
          {empty && !loading && (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-dim)", fontSize: "13px", zIndex: 1, pointerEvents: "none",
            }}>No chart data</div>
          )}
        </div>

        {/* Indicator panel */}
        {indicator !== "none" && (
          <div style={{
            overflow: "hidden",
            background: "rgba(255,255,255,0.02)",
            height: 80,
            borderTop: "1px solid rgba(255,255,255,0.04)",
          }}>
            <div ref={indChartRef} style={{ width: "100%", height: "100%" }} />
          </div>
        )}
      </div>
    );
  }

  // ─── Normal path (with toolbar chrome) ───
  return (
    <div style={{ marginBottom: "16px", display: "flex", flexDirection: "column", height: height ? undefined : "100%", position: height ? undefined : "absolute", inset: height ? undefined : 0 }}>
      {/* Row 1: timeframes + indicators */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "4px", alignItems: "center", minHeight: 26, overflowX: "auto", scrollbarWidth: "none" }}
        onPointerDown={e => e.stopPropagation()}
      >
        {TF.map((t) => (
          <button
            key={t.days}
            onClick={() => handleDaysChange(t.days)}
            style={{
              padding: "3px 8px", borderRadius: "5px", border: "none",
              background: days === t.days ? "var(--lime-dim)" : "transparent",
              color: days === t.days ? "var(--lime)" : "var(--text-dim)",
              fontSize: "11px", fontWeight: 500, cursor: "pointer",
              flexShrink: 0, whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: "3px", alignItems: "center", flexShrink: 0 }}>
          <button
            onClick={() => handleIndicatorChange("macd")}
            style={toolBtn(indicator === "macd", "rgba(56,189,248,0.12)", "rgba(56,189,248,0.8)")}
          >MACD</button>
          <button
            onClick={() => handleIndicatorChange("rsi")}
            style={toolBtn(indicator === "rsi", "rgba(168,85,247,0.12)", "rgba(168,85,247,0.8)")}
          >RSI</button>
          <button
            onClick={() => handleIndicatorChange("zscore")}
            style={toolBtn(indicator === "zscore", "rgba(251,191,36,0.12)", "rgba(251,191,36,0.8)")}
          >Z</button>
          {symbol.startsWith("BINANCE:") && (
            <button
              onClick={() => setShowVP(v => !v)}
              style={toolBtn(showVP, "rgba(132,204,22,0.12)", "rgba(163,230,53,0.8)")}
            >VP</button>
          )}
          {symbol.startsWith("BINANCE:") && (
            <button
              onClick={() => setShowTape(v => !v)}
              style={toolBtn(showTape, "rgba(56,189,248,0.12)", "rgba(56,189,248,0.8)")}
            >TAPE</button>
          )}
        </div>
      </div>
      {/* Row 2: drawing + chart mode tools */}
      <div style={{ display: "flex", gap: "3px", marginBottom: "8px", alignItems: "center", minHeight: 26, overflowX: "auto", scrollbarWidth: "none" }}
        onPointerDown={e => e.stopPropagation()}
      >
        <button
          onClick={() => setDrawTool(dt => dt === "line" ? "fib" : "line")}
          style={toolBtn(drawTool === "fib", "rgba(168,85,247,0.12)", "rgba(168,85,247,0.8)")}
        >FIB</button>
        <button
          onClick={handleCreateTrendline}
          style={{
            padding: "3px 8px", borderRadius: "5px", border: "none",
            background: "rgba(255,107,107,0.1)", color: "#ff6b6b",
            fontSize: "11px", fontWeight: 500, cursor: "pointer",
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            flexShrink: 0, whiteSpace: "nowrap",
          }}
        >+ {drawTool === "fib" ? "Fib" : "Line"}</button>
        <button
          onClick={handleRemoveTrendline}
          style={{
            padding: "3px 8px", borderRadius: "5px", border: "none",
            background: "transparent", color: "var(--text-dim)",
            fontSize: "11px", fontWeight: 500,
            cursor: selectedTlId != null ? "pointer" : "default",
            visibility: selectedTlId != null ? "visible" : "hidden",
            flexShrink: 0,
          }}
        >Del</button>
        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />
        <button
          onClick={() => setMagnet(m => !m)}
          style={toolBtn(magnet, "rgba(163,230,53,0.12)", "rgba(163,230,53,0.8)")}
        >MAG</button>
        <button
          onClick={() => setLogScale(l => { managerRef.current?.setLogScale(!l); return !l; })}
          style={toolBtn(logScale, "rgba(56,189,248,0.12)", "rgba(56,189,248,0.8)")}
        >LOG</button>
        <button
          onClick={() => setCandleType(c => c === "candle" ? "heikin" : "candle")}
          style={toolBtn(candleType === "heikin", "rgba(251,191,36,0.12)", "rgba(251,191,36,0.8)")}
        >HA</button>
        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />
        <button
          onClick={() => setShowSignals(s => !s)}
          style={toolBtn(showSignals, "rgba(34,197,94,0.15)", "rgba(34,197,94,0.9)")}
        >BtSr</button>
      </div>

      {/* Main chart */}
      <div
        style={{
          borderRadius: "12px",
          overflow: "hidden",
          background: "rgba(255,255,255,0.02)",
          position: "relative",
          height: height ?? "100%",
          flex: height ? undefined : 1,
          minHeight: height ? undefined : 100,
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        <div ref={mainChartRef} style={{ width: "100%", height: "100%" }} />
        {loading && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-dim)", fontSize: "13px", zIndex: 1, pointerEvents: "none",
          }}>Loading chart...</div>
        )}
        {error && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-dim)", fontSize: "13px", zIndex: 1, pointerEvents: "none",
          }}>Chart unavailable</div>
        )}
        {empty && !loading && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-dim)", fontSize: "13px", zIndex: 1, pointerEvents: "none",
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
          <div ref={indChartRef} style={{ width: "100%", height: "100%" }} />
        </div>
      )}

      {/* Resize handle */}
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

      {/* Tape — trade feed */}
      {showTape && symbol.startsWith("BINANCE:") && trades.length > 0 && (() => {
        const fmtP = fmtPrice;
        const fmtQ = (n: number) => {
          const abs = Math.abs(n);
          if (abs >= 1000) return n.toFixed(0);
          if (abs >= 1) return n.toFixed(2);
          if (abs >= 0.01) return n.toFixed(4);
          return n.toFixed(6);
        };
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "3px 12px", fontSize: "9px", color: "rgba(255,255,255,0.3)", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <span>Time</span>
              <span style={{ textAlign: "right" }}>Price</span>
              <span style={{ textAlign: "right" }}>Size</span>
            </div>
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              {trades.map((t, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                  padding: "2px 12px", fontSize: "11px",
                  borderBottom: "1px solid rgba(255,255,255,0.02)",
                }}>
                  <span style={{ color: "rgba(255,255,255,0.3)" }}>{fmtT(t.time)}</span>
                  <span style={{ textAlign: "right", color: t.isBuyerMaker ? "rgba(248,113,113,0.9)" : "rgba(83,255,132,0.9)" }}>{fmtP(t.price)}</span>
                  <span style={{ textAlign: "right", color: "rgba(255,255,255,0.5)" }}>{fmtQ(t.qty)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
