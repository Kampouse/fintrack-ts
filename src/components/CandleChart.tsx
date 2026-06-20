import { useEffect, useRef, useState, useCallback } from "react";
import { cgIdFromSymbol } from "@/lib/constants";

interface Props {
  symbol: string;
  height?: number;
}

const TF = [
  { days: 0, label: "5m" },
  { days: -1, label: "1m" },
  { days: 1, label: "24H" },
  { days: 7, label: "1W" },
] as const;

interface Bar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

async function fetchOHLC(symbol: string, days: number) {
  const binanceSymbol = symbol.replace("BINANCE:", "").replace("USDT", "USDT");

  let interval = "1d";
  let limit = 90;
  if (days < 0) { interval = "1m"; limit = 30; }
  else if (days === 0) { interval = "5m"; limit = 30; }
  else if (days <= 1) { interval = "5m"; limit = 48; }
  else if (days <= 7) { interval = "1h"; limit = 48; }

  // Fetch directly from Binance — CORS allowed, no keys needed
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
    };
  });
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bars: Bar[],
  subDaily: boolean,
) {
  const dpr = window.devicePixelRatio || 1;

  // Paddings
  const padRight = 52;
  const padBottom = 22;
  const padTop = 6;
  const padLeft = 4;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  if (!bars.length || chartW < 20 || chartH < 20) return;

  // Price range
  let lo = Infinity, hi = -Infinity;
  for (const b of bars) {
    if (b.low < lo) lo = b.low;
    if (b.high > hi) hi = b.high;
  }
  const priceRange = hi - lo || 1;
  const pricePad = priceRange * 0.08;
  lo -= pricePad;
  hi += pricePad;
  const totalRange = hi - lo;

  // Map helpers
  const priceToY = (p: number) => padTop + chartH - ((p - lo) / totalRange) * chartH;
  const barWidth = chartW / bars.length;
  const bodyWidth = Math.max(1, barWidth * 0.6);

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Grid lines (3 horizontal)
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const y = padTop + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();
  }

  // Bars
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
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

    // Body
    ctx.fillStyle = color;
    ctx.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyH);
  }

  // Price labels (right axis, 4 labels)
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 3; i++) {
    const p = lo + (totalRange / 3) * i;
    const y = priceToY(p);
    const label = p >= 1000 ? p.toFixed(0) : p.toFixed(2);
    ctx.fillText(label, w - padRight + 6, y);
  }

  // Time labels (x-axis)
  if (bars.length > 1) {
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    // Parse first and last bar times
    const parseTime = (t: string) => {
      // Accepts "YYYY-MM-DDTHH:mm:ss", "YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD"
      const d = new Date(t);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    };

    const t0 = parseTime(bars[0].time);
    const tN = parseTime(bars[bars.length - 1].time);
    const span = tN - t0 || 1;

    // Show 3-4 time labels evenly
    const labelCount = bars.length <= 8 ? bars.length : Math.min(4, Math.floor(chartW / 80));
    const step = Math.max(1, Math.floor(bars.length / labelCount));

    for (let i = 0; i < bars.length; i += step) {
      const t = parseTime(bars[i].time);
      const x = padLeft + barWidth * i + barWidth / 2;
      let label: string;
      if (subDaily) {
        label = new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      } else {
        label = new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
      }
      ctx.fillText(label, x, h - padBottom + 4);
    }
    // Always show last label
    const lastX = padLeft + barWidth * (bars.length - 1) + barWidth / 2;
    const lastT = parseTime(bars[bars.length - 1].time);
    const lastLabel = subDaily
      ? new Date(lastT).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
      : new Date(lastT).toLocaleDateString([], { month: "short", day: "numeric" });
    ctx.fillText(lastLabel, lastX, h - padBottom + 4);
  }

  // Right axis separator
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w - padRight, padTop);
  ctx.lineTo(w - padRight, h - padBottom);
  ctx.stroke();
}

export function CandleChart({ symbol, height = 220 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [days, setDays] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [empty, setEmpty] = useState(false);

  const cgId = cgIdFromSymbol(symbol);
  const canChart = !!cgId;

  const barsRef = useRef<Bar[]>([]);
  const render = useCallback((bars: Bar[], subDaily: boolean) => {
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
      // Canvas not laid out yet, retry after paint
      requestAnimationFrame(() => render(bars, subDaily));
      return;
    }
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    drawChart(ctx, w, h, bars, subDaily);
  }, []);

  useEffect(() => {
    if (!canChart) return;

    let cancelled = false;
    setLoading(true);
    setError(false);

    fetchOHLC(symbol, days)
      .then((data) => {
        if (cancelled) return;
        barsRef.current = data;
        setLoading(false);
        requestAnimationFrame(() => render(data, days <= 1));
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [cgId, symbol, days, canChart, render]);

  // ResizeObserver re-renders on container size change (bottom sheet, orientation)
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

  if (!canChart) return null;

  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", marginBottom: "8px" }}>
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
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
          }}
        />
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-dim)",
              fontSize: "13px",
              zIndex: 1,
            }}
          >
            Loading chart...
          </div>
        )}
        {error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-dim)",
              fontSize: "13px",
              zIndex: 1,
            }}
          >
            Chart unavailable
          </div>
        )}
        {empty && !loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-dim)",
              fontSize: "13px",
              zIndex: 1,
            }}
          >
            No chart data
          </div>
        )}
      </div>
    </div>
  );
}
