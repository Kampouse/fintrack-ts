import { useRef, useState, useCallback } from "react";

export function usePullRefresh(onRefresh: () => Promise<void>) {
  const startY = useRef(0);
  const [pulling, setPulling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Only pull from top of scroll
    const target = e.currentTarget as HTMLElement;
    if (target.scrollTop <= 0) {
      startY.current = e.touches[0].clientY;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) {
      const p = Math.min(dy / 100, 1);
      setPulling(true);
      setProgress(p);
    }
  }, [refreshing]);

  const onTouchEnd = useCallback(async () => {
    if (refreshing) return;
    setPulling(false);
    if (progress >= 1) {
      setRefreshing(true);
      try { await onRefresh(); } catch {}
      setRefreshing(false);
    }
    setProgress(0);
  }, [progress, refreshing, onRefresh]);

  return {
    pulling: pulling || refreshing,
    progress,
    refreshing,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  };
}
