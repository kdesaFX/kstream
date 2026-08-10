import {
  assertSafeDestination,
  afterResponseHeaders,
  buildUpstreamHeaders,
  DEFAULT_UA,
  handleOptions,
  jsonResponse,
  resolvePlaylistUri,
} from "../lib/proxy-shared";

export const config = { runtime: "edge" };

function parseClientHeaders(raw: string | null): Headers {
  const out = new Headers();
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v) out.set(k, v);
    }
  } catch {
    // ignore malformed headers JSON
  }
  return out;
}

function buildSegmentOrNestedProxy(
  absolute: string,
  requestOrigin: string,
  clientHeadersJson: string,
  isPlaylist: boolean,
): string {
  const path = isPlaylist ? "/api/m3u8-proxy" : "/api/ts-proxy";
  const u = new URL(path, requestOrigin);
  u.searchParams.set("url", absolute);
  if (clientHeadersJson) u.searchParams.set("headers", clientHeadersJson);
  return u.toString();
}

function rewritePlaylist(
  body: string,
  playlistUrl: string,
  requestOrigin: string,
  clientHeadersJson: string,
): string {
  const lines = body.split(/\r?\n/);
  const out: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith("#")) {
      if (line.includes("URI=")) {
        out.push(
          line.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
            const absolute = resolvePlaylistUri(uri, playlistUrl);
            if (!absolute) return `URI="${uri}"`;
            const proxied = buildSegmentOrNestedProxy(
              absolute,
              requestOrigin,
              clientHeadersJson,
              absolute.includes(".m3u8"),
            );
            return `URI="${proxied}"`;
          }),
        );
      } else {
        out.push(line);
      }
      continue;
    }

    const absolute = resolvePlaylistUri(line.trim(), playlistUrl);
    if (!absolute) {
      out.push(line);
      continue;
    }

    out.push(
      buildSegmentOrNestedProxy(
        absolute,
        requestOrigin,
        clientHeadersJson,
        absolute.includes(".m3u8"),
      ),
    );
  }

  return out.join("\n");
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return handleOptions();

  try {
    const reqUrl = new URL(request.url);
    const targetRaw = reqUrl.searchParams.get("url");
    if (!targetRaw) {
      return jsonResponse({ error: "Missing url query parameter" }, 400);
    }

    const target = assertSafeDestination(targetRaw);
    const clientHeadersJson = reqUrl.searchParams.get("headers") || "";
    const clientHeaders = parseClientHeaders(clientHeadersJson);

    const upstreamHeaders = buildUpstreamHeaders(request.headers);
    for (const [k, v] of clientHeaders.entries()) {
      upstreamHeaders.set(k, v);
    }
    if (!upstreamHeaders.has("User-Agent")) {
      upstreamHeaders.set("User-Agent", DEFAULT_UA);
    }

    const upstream = await fetch(target.href, {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
    });

    const contentType = upstream.headers.get("content-type") || "";
    const text = await upstream.text();
    const finalUrl = upstream.url || target.href;

    const looksLikePlaylist =
      contentType.includes("mpegurl") ||
      contentType.includes("m3u8") ||
      text.trimStart().startsWith("#EXTM3U");

    const body = looksLikePlaylist
      ? rewritePlaylist(text, finalUrl, reqUrl.origin, clientHeadersJson)
      : text;

    const headers = afterResponseHeaders(upstream.headers, finalUrl);
    headers.set(
      "Content-Type",
      looksLikePlaylist
        ? "application/vnd.apple.mpegurl; charset=utf-8"
        : contentType || "text/plain; charset=utf-8",
    );
    headers.set("Cache-Control", "no-store");

    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "M3U8 proxy failed";
    return jsonResponse({ error: message }, 400);
  }
}
