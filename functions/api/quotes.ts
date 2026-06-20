// Cloudflare Pages Function: server-side proxy for Finnhub quotes.
// The API key lives ONLY here as an environment secret — never sent to the client.
// Set the secret: npx wrangler pages secret put FINNHUB_KEY --project-name fintrack

interface Env {
  FINNHUB_KEY: string;
}

interface FinnhubRaw {
  c: number;
  d: number | null;
  dp: number | null;
  h: number | null;
  l: number | null;
  o: number | null;
  pc: number | null;
  t: number | null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const symbols = url.searchParams.getAll("symbol");

  if (symbols.length === 0) {
    return new Response(JSON.stringify({ error: "Missing symbol param" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const key = env.FINNHUB_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch all symbols in parallel server-side
  const results = await Promise.all(
    symbols.map(async (sym) => {
      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${key}`
        );
        if (!res.ok) return [sym, null];
        const d: FinnhubRaw = await res.json();
        return [
          sym,
          {
            price: d.c,
            change: d.d,
            changePct: d.dp,
            high: d.h,
            low: d.l,
            open: d.o,
            prevClose: d.pc,
            ts: d.t,
          },
        ] as const;
      } catch {
        return [sym, null] as const;
      }
    })
  );

  const data = Object.fromEntries(results);

  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=5",
    },
  });
};
