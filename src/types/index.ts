export type Side = "buy" | "sell";

export interface Transaction {
  id: string;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  ts: number;
  note?: string;
}

export interface Quote {
  price: number;
  change: number | null;
  changePct: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  prevClose: number | null;
  ts: number | null;
}

export interface RealizedSale {
  id: string;
  ts: number;
  qty: number;
  price: number;
  costBasis: number;
  realized: number;
  realizedPct: number;
}

export interface Position {
  symbol: string;
  label: string;
  qty: number;
  totalCost: number;
  avgCost: number;
  lots: Transaction[];
  realized: RealizedSale[];
}

export interface EnrichedPosition extends Position {
  price: number | null;
  value: number | null;
  pnl: number | null;
  pnlPct: number | null;
  dayChange: number | null;
  changePct: number | null;
}
