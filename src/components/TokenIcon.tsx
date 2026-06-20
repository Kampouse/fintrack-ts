import { useState } from "react";
import { tokenIcon, labelFromSymbol } from "@/lib/constants";

interface Props {
  symbol: string;
  size?: number;
}

export function TokenIcon({ symbol, size = 24 }: Props) {
  const [err, setErr] = useState(false);
  const src = tokenIcon(symbol, 64);
  const label = labelFromSymbol(symbol);

  if (!src || err) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "var(--lime-dim)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.4,
          fontWeight: 700,
          color: "var(--lime)",
          flexShrink: 0,
        }}
      >
        {label.slice(0, 3)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={label}
      width={size}
      height={size}
      onError={() => setErr(true)}
      style={{ borderRadius: "50%", flexShrink: 0 }}
    />
  );
}
