import { useEffect, useRef } from "react";
import type { EquityPoint } from "@/hooks/useEquityCurve";

interface Props {
  points: EquityPoint[];
  width?: number;
  height?: number;
}

export function EquityCurve({ points, width = 320, height = 64 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length < 2) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const values = points.map((p) => p.v);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const range = hi - lo || 1;
    const pad = range * 0.05;

    const toX = (i: number) => (i / (points.length - 1)) * width;
    const toY = (v: number) => height - ((v - lo + pad) / (range + pad * 2)) * height;

    const isUp = values[values.length - 1] >= values[0];
    const color = isUp ? "#4ade80" : "#f87171";
    const fillColor = isUp ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)";

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, fillColor);
    grad.addColorStop(1, "transparent");

    // Line
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
      const x = toX(i);
      const y = toY(values[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill under
    ctx.fillStyle = grad;
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    // Pct change label
    const pct = lo > 0 ? ((values[values.length - 1] - values[0]) / lo) * 100 : 0;
    ctx.font = "600 10px ui-monospace, SFMono-Regular, monospace";
    ctx.fillStyle = color;
    ctx.textAlign = "right";
    ctx.fillText(`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, width - 2, 10);
  }, [points, width, height]);

  if (points.length < 2) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: "block" }}
    />
  );
}
