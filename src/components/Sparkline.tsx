import { useEffect, useRef } from "react";

interface Props {
  symbol: string;
  width?: number;
  height?: number;
}

async function fetchMiniBars(symbol: string) {
  const binanceSymbol = symbol.replace("BINANCE:", "").replace("USDT", "USDT");
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(binanceSymbol)}&interval=5m&limit=48`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data: unknown[][] = await res.json();
  if (!data?.length) return null;
  return data.map((k) => ({
    time: new Date(k[0] as number).toISOString().substring(0, 19),
    close: parseFloat(k[4] as string),
  }));
}

export function Sparkline({ symbol, width = 64, height = 24 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<{ time: string; close: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchMiniBars(symbol).then((bars) => {
      if (cancelled || !bars?.length) return;
      dataRef.current = bars.map((b) => ({ time: b.time, close: b.close }));
      draw();
    });
    return () => { cancelled = true; };
  }, [symbol]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const closes = dataRef.current.map((d) => d.close);
    const lo = Math.min(...closes);
    const hi = Math.max(...closes);
    const range = hi - lo || 1;
    const pad = range * 0.1;

    const toY = (v: number) => height - ((v - lo + pad) / (range + pad * 2)) * height;

    // Determine color from first to last
    const isUp = closes[closes.length - 1] >= closes[0];
    const color = isUp ? "#4ade80" : "#f87171";

    // Draw line
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < closes.length; i++) {
      const x = (i / (closes.length - 1)) * width;
      const y = toY(closes[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Gradient fill under the line
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, isUp ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)");
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: "block" }}
    />
  );
}
