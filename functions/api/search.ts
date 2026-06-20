// Cloudflare Pages Function: server-side proxy for Finnhub symbol search.
// Key stays server-side only. Mirrors the quotes.ts proxy pattern.

interface Env {
  FINNHUB_KEY: string;
}

interface FinnhubSearchResult {
  description: string;
  displaySymbol: string;
  symbol: string;
  type: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();

  if (!q || q.length < 1) {
    return new Response(JSON.stringify({ count: 0, result: [] }), {
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

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${key}`
    );
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Finnhub ${res.status}` }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    const data: { count: number; result: FinnhubSearchResult[] } = await res.json();

    // Trim to top 15, strip noise fields
    const trimmed = (data.result || []).slice(0, 15).map((r) => ({
      symbol: r.symbol,
      displaySymbol: r.displaySymbol,
      description: r.description,
      type: r.type,
    }));

    return new Response(
      JSON.stringify({ count: trimmed.length, result: trimmed }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=30",
        },
      }
    );
  } catch {
    return new Response(JSON.stringify({ error: "Search failed" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};
