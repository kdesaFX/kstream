/**
 * Shared helpers for the built-in scrape / stream proxies.
 * Protocol matches p-stream simple-proxy (destination query + X-* header remaps).
 */

export const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:93.0) Gecko/20100101 Firefox/93.0";

const HEADER_MAP: Record<string, string> = {
  "x-cookie": "Cookie",
  "x-referer": "Referer",
  "x-origin": "Origin",
  "x-user-agent": "User-Agent",
  "x-x-real-ip": "X-Real-Ip",
};

export function corsHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "*",
    Vary: "Origin, Accept-Encoding",
    // Never let CDN cache scrape/proxy GETs — destination is in the query string
    // and a shared cache was serving one Vidrock payload for every title.
    "Cache-Control": "no-store, no-cache, must-revalidate",
    ...extra,
  });
}

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders({
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    }),
  });
}

export function assertSafeDestination(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid destination URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Destination must be http(s)");
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "::1" ||
    /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
  ) {
    throw new Error("Destination host is not allowed");
  }
  return parsed;
}

const PASSTHROUGH_HEADERS = new Set([
  "content-type",
  "accept",
  "accept-language",
  // Anikoto / TQQ ajax endpoints require this; browsers send it as-is (not X-*)
  "x-requested-with",
  "hx-request",
  "range",
]);

/** Build upstream headers from the simple-proxy X-* remaps + safe passthrough. */
export function buildUpstreamHeaders(incoming: Headers): Headers {
  const out = new Headers();
  out.set("User-Agent", DEFAULT_UA);

  for (const [key, value] of incoming.entries()) {
    const lower = key.toLowerCase();
    const mapped = HEADER_MAP[lower];
    if (mapped) {
      out.set(mapped, value);
      continue;
    }
    if (PASSTHROUGH_HEADERS.has(lower)) {
      out.set(key, value);
    }
  }

  return out;
}

export function afterResponseHeaders(
  upstream: Headers,
  finalUrl: string,
): Headers {
  const headers = corsHeaders({
    "X-Final-Destination": finalUrl,
  });
  const setCookie = upstream.get("set-cookie");
  if (setCookie) headers.set("X-Set-Cookie", setCookie);

  const contentType = upstream.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  return headers;
}

/** Resolve relative playlist URIs against a base playlist URL. */
export function resolvePlaylistUri(
  uri: string,
  baseUrl: string,
): string | null {
  try {
    return new URL(uri, baseUrl).href;
  } catch {
    return null;
  }
}
