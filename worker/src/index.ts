interface Env {
  QUOTES_DO: DurableObjectNamespace;
  FINNHUB_KEY: string;
}

export { QuotesDO } from "./quotes-do";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws" || url.pathname === "/") {
      const id = env.QUOTES_DO.idFromName("fintrack");
      const stub = env.QUOTES_DO.get(id);
      return stub.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
};
