import { useRef, useState, useCallback } from "react";

interface SwipeHandlers {
  onSwipeLeft?: () => void;
}

export function useSwipe({ onSwipeLeft }: SwipeHandlers) {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentDx = useRef(0);
  const [offset, setOffset] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const direction = useRef<"left" | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (revealed) return; // already revealed, ignore new swipes
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentDx.current = 0;
    direction.current = null;
  }, [revealed]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (revealed) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Lock direction after 10px
    if (direction.current === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      if (Math.abs(dx) > Math.abs(dy) && dx < 0) {
        direction.current = "left";
      } else {
        direction.current = null; // not a horizontal left swipe
        return;
      }
    }
    if (direction.current !== "left") return;

    currentDx.current = Math.max(dx, -80); // clamp to -80px
    setOffset(currentDx.current);
  }, [revealed]);

  const onTouchEnd = useCallback(() => {
    if (direction.current !== "left") return;
    if (currentDx.current < -50) {
      setOffset(-80);
      setRevealed(true);
    } else {
      setOffset(0);
    }
    direction.current = null;
  }, []);

  const onActionTap = useCallback(() => {
    onSwipeLeft?.();
    setOffset(0);
    setRevealed(false);
  }, [onSwipeLeft]);

  const reset = useCallback(() => {
    setOffset(0);
    setRevealed(false);
  }, []);

  return {
    offset,
    revealed,
    onActionTap,
    reset,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  };
}
