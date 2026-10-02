// vite dev middleware: serves /api/candles locally using the SAME handler core
// as the production Cloudflare Pages Function, so non-Binance symbols
// (stocks, NEAR-USD, XPR-USD, ...) chart correctly in local dev.
import type { Plugin } from "vite";
import { handleCandlesRequest } from "./shared/yahoo-candles";

export function devApiPlugin(): Plugin {
  return {
    name: "dev-api-candles",
    configureServer(server) {
      server.middlewares.use("/api/candles", (req, res) => {
        const url = new URL(req.url || "/", "http://localhost");
        handleCandlesRequest({
          symbol: url.searchParams.get("symbol"),
          resolution: url.searchParams.get("resolution"),
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
        })
          .then((r) => {
            res.statusCode = r.status;
            res.setHeader("Content-Type", r.contentType);
            if (r.cacheControl) res.setHeader("Cache-Control", r.cacheControl);
            res.end(r.body);
          })
          .catch(() => {
            res.statusCode = 500;
            res.end("[]");
          });
      });
    },
  };
}
