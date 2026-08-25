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
    const url = new URL(request.url);
    const { pathname } = url;

    // Edge HTTPS redirect (also covered by CF Always Use HTTPS when enabled).
    if (url.protocol === "http:") {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    if (pathname === "/api/proxy") {
      return withSecurityHeaders(await proxyHandler(request));
    }
    if (pathname === "/api/m3u8-proxy") {
      return withSecurityHeaders(await m3u8ProxyHandler(request));
    }
    if (pathname === "/api/ts-proxy") {
      return withSecurityHeaders(await tsProxyHandler(request));
    }

    // Explicit security.txt in case static asset headers are stripped.
    if (pathname === "/.well-known/security.txt") {
      const asset = await env.ASSETS.fetch(request);
      return withSecurityHeaders(asset);
    }

    // Non-API (or unknown /api) — static assets / SPA fallback.
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  if (!headers.has("Strict-Transport-Security")) {
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }
  if (!headers.has("X-Content-Type-Options")) {
    headers.set("X-Content-Type-Options", "nosniff");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
