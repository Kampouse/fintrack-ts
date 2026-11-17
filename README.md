# fintrack-ts

Mobile-first portfolio tracker: manual lots + live Hyperliquid positions, charts, and a trading terminal. React SPA on Cloudflare Pages, with a NEAR-wallet login and optional cloud sync of positions.

## Features

- **Portfolio** (`/`) — buy/sell lots tracked locally (avg cost, P&L), merged with live **Hyperliquid** perps positions; sort by value / P&L / 24h change; source filter (All / Local / HL)
- **Position detail** (`/position/:symbol`) — equity curve, basis chart, allocation donut, TP/SL helpers (`src/lib/tpsl.ts`), edit-lot sheet
- **Terminal** (`/terminal`) — Vela terminal view with candlestick charts (lightweight-charts + echarts), volume profile, orderbook, market heatmap, watchlist
- **Sync** — sign in with a NEAR wallet (`@hot-labs/near-connect` + `near-kit`) to pull/push lots to NEAR KV (`contextual.near` via `kv.main.fastnear.com`, same `__fastdata_kv` pattern as near-cli). Sync can be toggled off entirely (local-only mode)
- Mobile UX throughout: sheets, swipe navigation, pull-to-refresh, tab bar

## Architecture

```
src/            React 18 + Vite app (HashRouter: / , /terminal , /position/:symbol)
  contexts/     NearAuth (wallet login) · HLContext (Hyperliquid positions)
  hooks/        useTransactions (lots) · usePositions · useHLPositions · useQuotes ...
  lib/          kv (NEAR KV sync) · tpsl · format · constants
functions/api/  Cloudflare Pages Functions (server-side proxies, no client keys):
  quotes.ts     Finnhub quote proxy (FINNHUB_KEY pages secret)
  search.ts     symbol search
  candles.ts    Yahoo candles (shared/yahoo-candles.ts)
  kiyotaka/*    volume profile + orderbook
worker/         Quotes WebSocket worker: QuotesDO Durable Object at /ws
```

## Setup

```bash
npm install
npm run dev        # vite dev server (vite-dev-api.ts wires /api to local functions)
```

No client-side API keys. The Finnhub key is a Cloudflare Pages secret only:

```bash
npx wrangler pages secret put FINNHUB_KEY --project-name fintrack
```

## Deploy

```bash
npm run build      # tsc -b && vite build -> dist/
npm run deploy     # wrangler pages deploy dist --project-name fintrack
```

The quotes worker deploys separately from `worker/` (wrangler.toml, needs `FINNHUB_KEY` + a `QUOTES_DO` Durable Object binding).

## Stack

React 18 · Vite · TypeScript · react-router-dom (hash) · near-api-js / near-kit / @hot-labs/near-connect · @luxalgo/vela · echarts · lightweight-charts · lucide-react · Cloudflare Pages Functions + Durable Objects
