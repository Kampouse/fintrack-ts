import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY = "fintrack_equity_curve";
const SAMPLE_INTERVAL = 60_000; // 1 min
const MAX_POINTS = 1008; // 7 days of minute samples

export interface EquityPoint {
  t: number; // timestamp ms
  v: number; // total value
}

function loadPoints(): EquityPoint[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as EquityPoint[];
  } catch { return []; }
}

function savePoints(pts: EquityPoint[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pts.slice(-MAX_POINTS)));
  } catch { /* quota */ }
}

/** Samples totalValue periodically, returns history + current. */
export function useEquityCurve(totalValue: number) {
  const [points, setPoints] = useState<EquityPoint[]>(() => loadPoints());
  const valueRef = useRef(totalValue);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialized = useRef(false);

  // Keep valueRef in sync
  useEffect(() => {
    valueRef.current = totalValue;
  }, [totalValue]);

  // Sample periodically
  useEffect(() => {
    // Add current value on mount
    const addSample = () => {
      const now = Date.now();
      setPoints((prev) => {
        const last = prev.length > 0 ? prev[prev.length - 1] : null;
        // Skip if same value within 30s
        if (last && last.v === valueRef.current && (now - last.t) < 30_000) return prev;
        const next = [...prev, { t: now, v: valueRef.current }];
        savePoints(next);
        return next;
      });
    };

    // Initial sample
    if (!initialized.current) {
      initialized.current = true;
      addSample();
    }

    timerRef.current = setInterval(addSample, SAMPLE_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const clear = useCallback(() => {
    setPoints([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { points, clear };
}
