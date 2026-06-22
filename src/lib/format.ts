export function fmtUsd(n: number | null, decimals = 2): string {
  if (n == null) return "--";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtUsdPrice(n: number | null): string {
  if (n == null) return "--";
  if (n >= 1_000) return fmtUsd(n, 0);
  if (n >= 1) return fmtUsd(n, 2);
  if (n >= 0.01) return fmtUsd(n, 4);
  return fmtUsd(n, 6);
}

export function fmtPct(n: number | null): string {
  if (n == null) return "--";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function fmtNum(n: number | null, decimals = 4): string {
  if (n == null) return "--";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtCompact(n: number | null): string {
  if (n == null) return "--";
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function toLocalInput(ts: number): string {
  const d = new Date(ts);
  const off = d.getTimezoneOffset();
  return new Date(ts - off * 60000).toISOString().slice(0, 16);
}

export function fromLocalInput(val: string): number {
  return new Date(val).getTime();
}
