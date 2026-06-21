import { useState, useEffect, useRef } from "react";

export function useAnimatedValue(target: number, decimals = 2, duration = 600): string {
  const [display, setDisplay] = useState(target);
  const startRef = useRef(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (target === fromRef.current) return;
    const from = fromRef.current;
    const start = performance.now();
    startRef.current = target;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (target - from) * eased;
      setDisplay(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        setDisplay(target);
      }
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  // Update fromRef when target changes externally
  useEffect(() => {
    fromRef.current = target;
  }, [target]);

  return target.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function useTickFlash(value: number | null): "up" | "down" | null {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevRef = useRef(value);

  useEffect(() => {
    if (value == null || prevRef.current == null) { prevRef.current = value; return; }
    if (value > prevRef.current) setFlash("up");
    else if (value < prevRef.current) setFlash("down");
    prevRef.current = value;
    const t = setTimeout(() => setFlash(null), 400);
    return () => clearTimeout(t);
  }, [value]);

  return flash;
}
