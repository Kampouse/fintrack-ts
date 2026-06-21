import { useRef, useEffect } from "react";

interface Slice {
  label: string;
  value: number;
  color: string;
}

interface Props {
  slices: Slice[];
  size?: number;
}

const COLORS = [
  "#f59e0b", "#3b82f6", "#a78bfa", "#34d399",
  "#f472b6", "#fb923c", "#38bdf8", "#e879f9",
  "#4ade80", "#f87171",
];

export function AllocationDonut({ slices, size = 80 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || slices.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 3;
    const inner = r * 0.62;
    const total = slices.reduce((s, sl) => s + sl.value, 0);
    if (total === 0) return;

    let angle = -Math.PI / 2;
    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];
      const sweep = (slice.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, angle, angle + sweep);
      ctx.arc(cx, cy, inner, angle + sweep, angle, true);
      ctx.closePath();
      ctx.fillStyle = slice.color || COLORS[i % COLORS.length];
      ctx.fill();
      angle += sweep;
    }
  }, [slices, size]);

  if (slices.length === 0) return null;

  return <canvas ref={canvasRef} style={{ width: size, height: size, display: "block" }} />;
}
