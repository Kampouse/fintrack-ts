// Cloudflare Pages Function: Kiyotaka volume profile proxy.
// Key lives ONLY here as an environment secret — never sent to the client.
// Set the secret: npx wrangler pages secret put KIYOTAKA_KEY --project-name fintrack

interface Env {
  KIYOTAKA_KEY: string;
}

const INTERVAL_MAP: Record<string, string> = {
  "1": "MINUTE",
  "5": "MINUTE",
  "15": "MINUTE",
  "60": "HOUR",
  "D": "DAY",
};

const PERIOD_MAP: Record<string, number> = {
  "1": 300,
  "5": 300,
  "15": 900,
  "60": 3600,
  "D": 86400,
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol");
  const resolution = url.searchParams.get("resolution") || "60";
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  if (!symbol) {
    return new Response(JSON.stringify({ error: "Missing symbol" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Only support BINANCE:* symbols
  if (!symbol.startsWith("BINANCE:")) {
    return new Response("[]", {
      headers: { "Content-Type": "application/json" },
    });
  }

  const key = env.KIYOTAKA_KEY;
  if (!key) {
    return new Response("[]", {
      headers: { "Content-Type": "application/json" },
    });
  }

  const binanceSymbol = symbol.replace("BINANCE:", "");
  const interval = INTERVAL_MAP[resolution] || "HOUR";
  const period = PERIOD_MAP[resolution] || 3600;
  const now = Math.floor(Date.now() / 1000);
  const from = fromParam ? parseInt(fromParam, 10) : now - 86400;
  const to = toParam ? parseInt(toParam, 10) : now;

  const apiUrl = `https://api.kiyotaka.ai/v1/points?type=VOLUME_PROFILE_AGG&exchange=BINANCE_FUTURES&rawSymbol=${encodeURIComponent(binanceSymbol)}&interval=${interval}&from=${from}&period=${to - from}`;

  try {
    const res = await fetch(apiUrl, {
      headers: {
        "X-Kiyotaka-Key": key,
      },
    });
    if (!res.ok) return new Response("[]", { headers: { "Content-Type": "application/json" } });
    const data = await res.json();

    // Flatten profile arrays from all hourly points into aggregated profile
    const profileMap = new Map<number, { buy: number; sell: number }>();
    for (const series of data?.series || []) {
      for (const point of series.points || []) {
        const profile = point?.Point?.profile;
        if (!profile) continue;
        for (let i = 0; i < profile.length - 2; i += 3) {
          const price = profile[i] as number;
          const buyVol = profile[i + 1] as number;
          const sellVol = profile[i + 2] as number;
          const existing = profileMap.get(price) || { buy: 0, sell: 0 };
          existing.buy += buyVol;
          existing.sell += sellVol;
          profileMap.set(price, existing);
        }
      }
    }

    // Convert to sorted array
    const result = Array.from(profileMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([price, vol]) => ({ price, buy: Math.round(vol.buy * 100) / 100, sell: Math.round(vol.sell * 100) / 100 }));

    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=60",
      },
    });
  } catch {
    return new Response("[]", {
      headers: { "Content-Type": "application/json" },
    });
  }
};
