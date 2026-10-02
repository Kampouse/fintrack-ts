// Cloudflare Pages Function: candle data proxy.
// Delegates to the shared Yahoo Finance core (shared/yahoo-candles.ts),
// which is also used by the vite dev middleware (vite-dev-api.ts) so local
// dev returns byte-identical data to production.

import { handleCandlesRequest, type CandleResponse } from "../../shared/yahoo-candles";

interface Env {}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const r: CandleResponse = await handleCandlesRequest({
    symbol: url.searchParams.get("symbol"),
    resolution: url.searchParams.get("resolution"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  const headers: Record<string, string> = { "Content-Type": r.contentType };
  if (r.cacheControl) headers["Cache-Control"] = r.cacheControl;
  return new Response(r.body, { status: r.status, headers });
};
