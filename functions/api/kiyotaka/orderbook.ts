// Cloudflare Pages Function: Kiyotaka orderbook heatmap proxy.
// Fetches BLOCK_BOOK_SNAPSHOT_AGG — latest orderbook depth snapshot.
// Key lives ONLY here as an environment secret.
// Set the secret: npx wrangler pages secret put KIYOTAKA_KEY --project-name fintrack

interface Env {
  KIYOTAKA_KEY: string;
}

export interface OrderbookLevel {
  price: number;
  volume: number;
}

export interface OrderbookSnapshot {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: number;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol");
  const maxDepth = parseInt(url.searchParams.get("maxDepth") || "500", 10);
  const resolution = url.searchParams.get("resolution") || "hd"; // hd or 4k

  if (!symbol) {
    return new Response(JSON.stringify({ error: "Missing symbol" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!symbol.startsWith("BINANCE:")) {
    return new Response(JSON.stringify({ bids: [], asks: [], timestamp: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const key = env.KIYOTAKA_KEY;
  if (!key) {
    return new Response(JSON.stringify({ bids: [], asks: [], timestamp: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const binanceSymbol = symbol.replace("BINANCE:", "");

  try {
    // Step 1: Get recommended block size
    const bsUrl = `https://api.kiyotaka.ai/v1/block-sizes?exchange=BINANCE_FUTURES&rawSymbol=${encodeURIComponent(binanceSymbol)}&type=BLOCK_BOOK_SNAPSHOT_AGG`;
    const bsRes = await fetch(bsUrl, { headers: { "X-Kiyotaka-Key": key } });
    let baseBlockSize = 5; // fallback for BTC
    if (bsRes.ok) {
      const bsData = await bsRes.json();
      // Response: { blockSizes: [{blockSize: 5, ...}] } or { blockSize: 5 }
      if (bsData?.blockSizes?.[0]?.blockSize) {
        baseBlockSize = bsData.blockSizes[0].blockSize;
      } else if (bsData?.blockSize) {
        baseBlockSize = bsData.blockSize;
      } else if (typeof bsData === "number") {
        baseBlockSize = bsData;
      }
    }

    // HD = 5x base, 4K = base
    const blockSize = resolution === "4k" ? baseBlockSize : baseBlockSize * 5;

    // Step 2: Fetch latest orderbook snapshot
    // Use a short period (60s) with MINUTE interval to get the most recent snapshot
    const now = Math.floor(Date.now() / 1000);
    const apiUrl = `https://api.kiyotaka.ai/v1/points?type=BLOCK_BOOK_SNAPSHOT_AGG&exchange=BINANCE_FUTURES&rawSymbol=${encodeURIComponent(binanceSymbol)}&interval=MINUTE&from=${now - 120}&period=120&blockSize=${blockSize}&maxDepth=${maxDepth}&sortDirection=SORT_DIRECTION_DESC`;

    const res = await fetch(apiUrl, { headers: { "X-Kiyotaka-Key": key } });
    if (!res.ok) {
      return new Response(JSON.stringify({ bids: [], asks: [], timestamp: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    const data = await res.json();

    // Get the latest point (first point since sortDirection=DESC)
    const series = data?.series?.[0];
    const points = series?.points || [];
    if (!points.length) {
      return new Response(JSON.stringify({ bids: [], asks: [], timestamp: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const point = points[0]?.Point;
    if (!point) {
      return new Response(JSON.stringify({ bids: [], asks: [], timestamp: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse flat [price, volume, price, volume, ...] arrays
    const parseLevels = (flat: number[]): OrderbookLevel[] => {
      const levels: OrderbookLevel[] = [];
      for (let i = 0; i < flat.length - 1; i += 2) {
        levels.push({ price: flat[i], volume: flat[i + 1] });
      }
      return levels;
    };

    const result: OrderbookSnapshot = {
      bids: parseLevels(point.bids || []),
      asks: parseLevels(point.asks || []),
      timestamp: point.timestamp?.s || now,
    };

    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=15",
      },
    });
  } catch {
    return new Response(JSON.stringify({ bids: [], asks: [], timestamp: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }
};
