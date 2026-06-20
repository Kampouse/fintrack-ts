import { useEffect, useRef, useState, useCallback } from "react";
import { cgIdFromSymbol } from "@/lib/constants";

export interface PriceLevel {
  price: number;
  label: string;
  color: string;
}

interface Props {
  symbol: string;
  height?: number;
  priceLevels?: PriceLevel[];
}

const TF = [
  { days: 0, label: "5m" },
  { days: -1, label: "1m" },
  { days: 1, label: "24H" },
  { days: 7, label: "1W" },
  { days: 30, label: "1M" },
  { days: 90, label: "3M" },
] as const;

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
  barWidth: number;
  bodyWidth: number;
  viewStart: number;
  viewEnd: number;
  visibleBars: Bar[];
  volScale: number;
}

async function fetchOHLC(symbol: string, days: number) {
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
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].close;
    sma.set(i, sum / period);
  }
  return sma;
}

function buildDrawState(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bars: Bar[],
  subDaily: boolean,
  viewStart: number,
  viewEnd: number,
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
      maxVol: 1, priceToY: () => 0, barWidth: 0, bodyWidth: 0,
      viewStart, viewEnd, visibleBars: [], volScale: 0,
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
  lo -= pricePad;
  hi += pricePad;
  const totalRange = hi - lo;

  const priceToY = (p: number) => padTop + chartH - ((p - lo) / totalRange) * chartH;
  const barWidth = chartW / visible.length;
  const bodyWidth = Math.max(1, barWidth * 0.6);
  const volScale = maxVol > 0 ? volH / maxVol : 0;

  return {
    bars, subDaily, padLeft, padRight, padTop, padBottom,
    chartW, chartH, volH, lo, hi, totalRange,
    maxVol, priceToY, barWidth, bodyWidth,
    viewStart: vs, viewEnd: ve, visibleBars: visible, volScale,
  };
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
) {
  const s = buildDrawState(ctx, w, h, bars, subDaily, viewStart, viewEnd);
  const { padLeft, padRight, padTop, padBottom, chartW, chartH, volH,
    lo, hi, totalRange, priceToY, barWidth, bodyWidth,
    visibleBars, volScale, viewStart: vs } = s;

  if (!visibleBars.length) return;

  ctx.clearRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const y = padTop + (chartH / 4) * i;
    ctx.beginPath(); ctx.moveTo(padLeft, y); ctx.lineTo(w - padRight, y); ctx.stroke();
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

  // SMAs — 200 only on daily timeframes with enough bars
  const sma20 = computeSMA(bars, Math.min(20, Math.floor(bars.length / 3)));
  const show200 = bars.length >= 200;
  const sma200 = show200 ? computeSMA(bars, 200) : new Map();
  const smas: { color: string; map: Map<number, number> }[] = [
    { color: "rgba(255,255,100,0.4)", map: sma20 },
    ...(show200 ? [{ color: "rgba(147,130,220,0.55)", map: sma200 }] : []),
  ];
  for (const { color, map } of smas) {
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

  // Candlesticks
  for (let i = 0; i < visibleBars.length; i++) {
    const b = visibleBars[i];
    const x = padLeft + barWidth * i + barWidth / 2;
    const isUp = b.close >= b.open;
    const color = isUp ? "#53ff84" : "#f87171";
    const bodyTop = priceToY(Math.max(b.open, b.close));
    const bodyBot = priceToY(Math.min(b.open, b.close));
    const bodyH = Math.max(1, bodyBot - bodyTop);

    // Wick
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, priceToY(b.high));
    ctx.lineTo(x, bodyTop);
    ctx.moveTo(x, bodyBot);
    ctx.lineTo(x, priceToY(b.low));
    ctx.stroke();

    // Body (hollow for down candles)
    if (isUp) {
      ctx.fillStyle = color;
      ctx.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyH);
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyH);
    }
  }

  // Current price line (last visible bar close)
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

  // Custom price levels (entry prices, averages)
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
    // Find which bar
    const localIdx = Math.floor((crossX - padLeft) / barWidth);
    if (localIdx >= 0 && localIdx < visibleBars.length) {
      const b = visibleBars[localIdx];
      const snapX = padLeft + barWidth * localIdx + barWidth / 2;

      // Vertical line
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(snapX, padTop); ctx.lineTo(snapX, h - padBottom); ctx.stroke();
      // Horizontal line at close
      const cY = priceToY(b.close);
      ctx.beginPath(); ctx.moveTo(padLeft, cY); ctx.lineTo(w - padRight, cY); ctx.stroke();
      ctx.setLineDash([]);

      // Tooltip background
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

  // MA legend (top-left)
  if (smas.length > 0) {
    ctx.font = "9px ui-monospace, SFMono-Regular, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    let legendX = padLeft + 4;
    const legendY = padTop + 2;
    smas.forEach(({ color }, idx) => {
      ctx.fillStyle = color;
      const label = idx === 0 ? "SMA20" : "SMA200";
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

    const t0 = parseTime(visibleBars[0].time);
    const tN = parseTime(visibleBars[visibleBars.length - 1].time);

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
    // Last label
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

export function CandleChart({ symbol, height = 220, priceLevels = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [days, setDays] = useState(1);
  const [loading, setLoading] = useState(true);
  const hasLoaded = useRef(false);
  const [error, setError] = useState(false);
  const [empty, setEmpty] = useState(false);

  const cgId = cgIdFromSymbol(symbol);
  const canChart = !!cgId;

  const barsRef = useRef<Bar[]>([]);
  const viewRef = useRef({ start: 0, end: 0 });
  const crossXRef = useRef<number | null>(null);
  const pinchRef = useRef({ active: false, dist: 0, startView: [0, 0] as [number, number] });
  const panRef = useRef({ active: false, startX: 0, startView: [0, 0] as [number, number] });

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

    drawChart(ctx, w, h, bars, subDaily, vs, ve, crossX ?? crossXRef.current, priceLevels);
  }, [priceLevels]);

  useEffect(() => {
    if (!canChart) return;

    let cancelled = false;
    if (!hasLoaded.current) setLoading(true);
    setError(false);

    fetchOHLC(symbol, days)
      .then((data) => {
        if (cancelled) return;
        barsRef.current = data;
        hasLoaded.current = true;
        viewRef.current = { start: 0, end: 0 };
        setLoading(false);
        requestAnimationFrame(() => render(data, days <= 1));
      })
      .catch(() => {
        if (!cancelled) { setError(true); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [cgId, symbol, days, canChart, render]);

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

  // Touch + mouse handlers for crosshair, pinch-zoom, pan
  const handlePointerMove = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    if (!barsRef.current.length || pinchRef.current.active || panRef.current.active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e as React.PointerEvent).clientX - rect.left;
    crossXRef.current = x;
    render(barsRef.current, days <= 1, x);
  }, [days, render]);

  const handlePointerLeave = useCallback(() => {
    crossXRef.current = null;
    if (barsRef.current.length) render(barsRef.current, days <= 1, null);
  }, [days, render]);

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
      panRef.current = {
        active: true,
        startX: e.touches[0].clientX,
        startView: [viewRef.current.start, viewRef.current.end || barsRef.current.length],
      };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const bars = barsRef.current;
    if (!bars.length) return;

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
  }, [days, render]);

  const handleTouchEnd = useCallback(() => {
    pinchRef.current = { active: false, dist: 0, startView: [0, 0] };
    panRef.current = { active: false, startX: 0, startView: [0, 0] };
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const bars = barsRef.current;
    if (!bars.length) return;
    e.preventDefault();
    const [curStart, curEnd] = [viewRef.current.start, viewRef.current.end || bars.length];
    const range = curEnd - curStart;
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const newRange = Math.max(5, Math.min(bars.length, Math.round(range * zoomFactor)));

    // Zoom toward mouse position
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const center = curStart + range * mx;
    let newStart = Math.round(center - newRange * mx);
    newStart = Math.max(0, Math.min(bars.length - newRange, newStart));

    viewRef.current = { start: newStart, end: newStart + newRange };
    render(bars, days <= 1, null);
  }, [render]);

  if (!canChart) return null;

  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
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
      </div>
      <div
        style={{
          borderRadius: "12px",
          overflow: "hidden",
          background: "rgba(255,255,255,0.02)",
          position: "relative",
          height,
          touchAction: "none",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: "100%" }}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
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
    </div>
  );
}
