/**
 * Cloudflare Worker entry: same-origin scrape/HLS proxies + static SPA assets.
 * Keeps /api/* behavior aligned with the Vercel Edge handlers in /api.
 */
import proxyHandler from "../api/proxy";
import m3u8ProxyHandler from "../api/m3u8-proxy";
import tsProxyHandler from "../api/ts-proxy";
import mangaPagesHandler from "../api/manga-pages";

export interface Env {
  ASSETS: Fetcher;
}

function isHashedAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith("/assets/") ||
    /\.(?:js|css|map|woff2?|ttf|eot|png|jpe?g|gif|webp|svg|ico|wasm)(?:$|\?)/i.test(
      pathname,
    )
  );
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

    if (pathname === "/api/proxy" || pathname === "/api/proxy/") {
      return withSecurityHeaders(await proxyHandler(request));
    }
    if (pathname === "/api/m3u8-proxy") {
      return withSecurityHeaders(await m3u8ProxyHandler(request));
    }
    if (pathname === "/api/ts-proxy") {
      return withSecurityHeaders(await tsProxyHandler(request));
    }
    if (pathname === "/api/manga/pages" || pathname === "/api/manga/pages/") {
      return withSecurityHeaders(await mangaPagesHandler(request));
    }

    // Explicit security.txt in case static asset headers are stripped.
    if (pathname === "/.well-known/security.txt") {
      const asset = await env.ASSETS.fetch(request);
      return withSecurityHeaders(asset);
    }

    const asset = await env.ASSETS.fetch(request);

    // SPA not_found_handling serves index.html for missing /assets/*.js.
    // Browsers then fail dynamic imports with a confusing TypeError — return
    // a real 404 so clients can detect a stale deploy and reload.
    if (
      isHashedAssetPath(pathname) &&
      (asset.status === 404 ||
        (asset.headers.get("content-type") || "")
          .toLowerCase()
          .includes("text/html"))
    ) {
      return withSecurityHeaders(
        new Response("Not Found", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
      );
    }

    return withSecurityHeaders(asset);
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
