/**
 * Per-symbol TP/SL levels drawn on Vela charts (VelaTerminal / position view).
 * Persisted in localStorage so they survive reloads. Entry/liquidation lines
 * come from position data — this store only holds USER-placed levels.
 */

export interface TpslLevel {
  label: string; // unique per symbol: "TP", "TP 2", "SL", ...
  price: number;
  kind: "tp" | "sl";
}

const KEY = "fintrack_tpsl_v1";

type Store = Record<string, TpslLevel[]>;

function readStore(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Store;
  } catch {
    return {};
  }
}

export function loadTpsl(symbol: string): TpslLevel[] {
  return readStore()[symbol] ?? [];
}

export function saveTpsl(symbol: string, levels: TpslLevel[]): void {
  const store = readStore();
  if (levels.length === 0) delete store[symbol];
  else store[symbol] = levels;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota — non-fatal */
  }
}

/** next free label of a kind: "TP", "TP 2", "TP 3", ... */
export function nextTpslLabel(levels: TpslLevel[], kind: "tp" | "sl"): string {
  const prefix = kind === "tp" ? "TP" : "SL";
  const taken = new Set(levels.map((l) => l.label));
  if (!taken.has(prefix)) return prefix;
  let n = 2;
  while (taken.has(`${prefix} ${n}`)) n++;
  return `${prefix} ${n}`;
}
