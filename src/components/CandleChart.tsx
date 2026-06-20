import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, type IChartApi, type CandlestickData, ColorType } from "lightweight-charts";
import { cgIdFromSymbol } from "@/lib/constants";

interface Props {
  symbol: string;
  height?: number;
}

const TF = [
  { days: 7, label: "1W" },
  { days: 30, label: "1M" },
  { days: 90, label: "3M" },
  { days: 365, label: "1Y" },
] as const;

async function fetchOHLC(cgId: string, days: number) {
  // Fetch directly from CoinGecko in the browser — their CORS allows it.
  // CF Workers get 403'd by Binance/CoinGecko WAF, but browsers are fine.
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/${cgId}/ohlc?vs_currency=usd&days=${days}`,
  );
  if (!res.ok) throw new Error(`${res.status}`);
  const raw: number[][] = await res.json();
  return raw.map((k) => ({
    time: Math.floor(k[0] / 1000),
    open: k[1],
    high: k[2],
    low: k[3],
    close: k[4],
  }));
}

export function CandleChart({ symbol, height = 220 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const cgId = cgIdFromSymbol(symbol);
  const canChart = !!cgId;

  useEffect(() => {
    if (!containerRef.current || !canChart) return;

    let cancelled = false;
    setLoading(true);
    setError(false);

    fetchOHLC(cgId!, days)
      .then((data) => {
        if (cancelled) return;

        const candles: CandlestickData[] = data.map((c) => ({
          time: c.time as unknown as import("lightweight-charts").UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));

        if (!containerRef.current) return;

        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }

        const chart = createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height,
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: "rgba(255,255,255,0.4)",
            fontSize: 11,
          },
          grid: {
            vertLines: { color: "rgba(255,255,255,0.04)" },
            horzLines: { color: "rgba(255,255,255,0.04)" },
          },
          crosshair: { mode: 0 },
          rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
          timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: false },
          handleScroll: true,
          handleScale: true,
        });

        const series = chart.addSeries(CandlestickSeries, {
          upColor: "#53ff84",
          downColor: "#f87171",
          borderUpColor: "#53ff84",
          borderDownColor: "#f87171",
          wickUpColor: "#53ff84",
          wickDownColor: "#f87171",
        });
        series.setData(candles);
        chart.timeScale().fitContent();
        chartRef.current = chart;
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("[CandleChart] fetch failed", e);
          setError(true);
          setLoading(false);
        }
      });

    const onResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [cgId, days, height, canChart]);

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
        ref={containerRef}
        style={{
          borderRadius: "12px",
          overflow: "hidden",
          background: "rgba(255,255,255,0.02)",
          position: "relative",
        }}
      >
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
              height,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-dim)",
              fontSize: "13px",
            }}
          >
            Chart unavailable
          </div>
        )}
      </div>
    </div>
  );
}
