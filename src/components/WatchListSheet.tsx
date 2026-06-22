import { useEffect, useRef, useState } from "react";
import { WatchList } from "./WatchList";

interface Props {
  onClose: () => void;
  onSelect: (sym: string) => void;
}

export function WatchListSheet({ onClose, onSelect }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(() => window.innerWidth >= 680);

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 680);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Close on backdrop click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (backdropRef.current === e.target) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const isDesktop = wide;

  return (
    <div
      ref={backdropRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        display: "flex",
        alignItems: isDesktop ? "flex-start" : "flex-end",
        justifyContent: isDesktop ? "center" : "center",
        padding: isDesktop ? "calc(27.5vh) 20px 20px" : 0,
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={e => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div style={{
        width: "100%",
        maxWidth: isDesktop ? 736 : "100%",
        height: isDesktop ? undefined : "100dvh",
        maxHeight: isDesktop ? "calc(100vh - 40px)" : "100dvh",
        borderRadius: isDesktop ? 8 : 0,
        border: "1px solid var(--card-border)",
        borderBottom: isDesktop ? "1px solid var(--card-border)" : "none",
        background: "var(--bg)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", WebkitOverflowScrolling: "touch" }}>
          <WatchList onSelect={onSelect} onClose={onClose} compact />
        </div>
      </div>
    </div>
  );
}
