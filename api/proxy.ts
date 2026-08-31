import {
  assertSafeDestination,
  afterResponseHeaders,
  buildUpstreamHeaders,
  handleOptions,
  jsonResponse,
  parseClientHeaders,
} from "../lib/proxy-shared";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return handleOptions();

  try {
    const url = new URL(request.url);
    const destination = url.searchParams.get("destination");
    if (!destination) {
      return jsonResponse({ error: "Missing destination query parameter" }, 400);
    }

    const target = assertSafeDestination(destination);
    const upstreamHeaders = buildUpstreamHeaders(request.headers);
    const embedded = parseClientHeaders(url.searchParams.get("headers"));
    embedded.forEach((value, key) => upstreamHeaders.set(key, value));

    const host = target.hostname.toLowerCase();
    if (
      (host.endsWith(".mangadex.network") ||
        host === "uploads.mangadex.org") &&
      !upstreamHeaders.has("Referer")
    ) {
      // MangaDex page nodes 404 unless the referrer is their own site.
      upstreamHeaders.set("Referer", "https://mangadex.org/");
    }

    const init: RequestInit = {
      method: request.method,
      headers: upstreamHeaders,
      redirect: "follow",
    };

    // Buffer the body so Edge can re-send it without requiring duplex streaming.
    if (request.method !== "GET" && request.method !== "HEAD") {
      const buf = await request.arrayBuffer();
      if (buf.byteLength > 0) {
        init.body = buf;
      }
    }

    const upstream = await fetch(target.href, init);
    const headers = afterResponseHeaders(
      upstream.headers,
      upstream.url || target.href,
    );

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proxy request failed";
    return jsonResponse({ error: message }, 400);
  }
}
