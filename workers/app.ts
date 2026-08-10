/**
 * Cloudflare Worker entry: same-origin scrape/HLS proxies + static SPA assets.
 * Keeps /api/* behavior aligned with the Vercel Edge handlers in /api.
 */
import proxyHandler from "../api/proxy";
import m3u8ProxyHandler from "../api/m3u8-proxy";
import tsProxyHandler from "../api/ts-proxy";

export interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/proxy") {
      return proxyHandler(request);
    }
    if (pathname === "/api/m3u8-proxy") {
      return m3u8ProxyHandler(request);
    }
    if (pathname === "/api/ts-proxy") {
      return tsProxyHandler(request);
    }

    // Non-API (or unknown /api) — static assets / SPA fallback.
    return env.ASSETS.fetch(request);
  },
};
