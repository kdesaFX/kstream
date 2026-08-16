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
  browserFriendly: boolean,
): string {
  const path = isPlaylist ? "/api/m3u8-proxy" : "/api/ts-proxy";
  const u = new URL(path, requestOrigin);
  u.searchParams.set("url", absolute);
  if (clientHeadersJson) u.searchParams.set("headers", clientHeadersJson);
  if (browserFriendly && isPlaylist) u.searchParams.set("browser", "1");
  return u.toString();
}

type Variant = {
  tags: string[]; // comment lines belonging to this variant (e.g. # 4K)
  info: string; // EXT-X-STREAM-INF
  uri: string;
  height: number;
  hevc: boolean;
  avc: boolean;
};

function parseHeight(info: string): number {
  const m = /RESOLUTION=\d+x(\d+)/i.exec(info);
  return m ? Number(m[1]) || 0 : 0;
}

function isHevcCodecs(info: string): boolean {
  const m = /CODECS="([^"]+)"/i.exec(info);
  const codecs = (m?.[1] || "").toLowerCase();
  return codecs.includes("hev1") || codecs.includes("hvc1") || codecs.includes("hevc");
}

function isAvcCodecs(info: string): boolean {
  const m = /CODECS="([^"]+)"/i.exec(info);
  const codecs = (m?.[1] || "").toLowerCase();
  return codecs.includes("avc1") || codecs.includes("avc3");
}

/**
 * Reorder master playlist variants so native Safari / hls.js start on a
 * playable AVC ≤1080p rung instead of 4K HEVC (common Reyna hang).
 */
function preferBrowserVariants(body: string): string {
  const lines = body.split(/\r?\n/);
  const head: string[] = [];
  const variants: Variant[] = [];
  const tail: string[] = [];
  let i = 0;
  let seenStreamInf = false;
  let pendingTags: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      seenStreamInf = true;
      const info = line;
      const uri = lines[i + 1] || "";
      variants.push({
        tags: pendingTags,
        info,
        uri,
        height: parseHeight(info),
        hevc: isHevcCodecs(info),
        avc: isAvcCodecs(info),
      });
      pendingTags = [];
      i += 2;
      continue;
    }

    if (!seenStreamInf) {
      // Keep media/audio/header lines in head; stash blank/comment tags before variants
      if (
        line.startsWith("#") &&
        !line.startsWith("#EXT") &&
        line.trim() !== ""
      ) {
        pendingTags.push(line);
      } else {
        if (pendingTags.length) {
          head.push(...pendingTags);
          pendingTags = [];
        }
        head.push(line);
      }
      i += 1;
      continue;
    }

    // After variants — keep remaining lines
    if (pendingTags.length) {
      tail.push(...pendingTags);
      pendingTags = [];
    }
    tail.push(line);
    i += 1;
  }

  if (!variants.length) return body;

  const score = (v: Variant) => {
    // Higher is better for browser start order — prefer ~720p AVC (fast first frame
    // through the same-origin proxy; 1080p init segments are multi‑MB).
    let s = 0;
    if (v.avc) s += 1000;
    if (v.hevc) s -= 500;
    if (v.height > 1080) s -= 200;
    if (v.height > 0 && v.height <= 720) {
      s += 300;
      // Closest to 720 wins
      s += 1 - Math.abs(v.height - 720) / 720;
    } else if (v.height > 720 && v.height <= 1080) {
      s += 100;
      s += (1080 - v.height) / 1080;
    }
    return s;
  };

  const sorted = [...variants].sort((a, b) => score(b) - score(a));

  // Drop 4K+ HEVC when an AVC alternative exists (native iOS often sticks on it)
  const hasAvc = sorted.some((v) => v.avc);
  const filtered = hasAvc
    ? sorted.filter((v) => !(v.hevc && v.height > 1080))
    : sorted;

  const out = [...head];
  for (const v of filtered.length ? filtered : sorted) {
    out.push(...v.tags, v.info, v.uri);
  }
  out.push(...tail);
  return out.join("\n");
}

/**
 * Tags whose URI attribute names another playlist. EXT-X-KEY, EXT-X-SESSION-KEY
 * and EXT-X-MAP also use URI=, but those are a decryption key and an init
 * segment, so they belong on the segment proxy.
 */
const PLAYLIST_URI_TAGS = ["#EXT-X-MEDIA:", "#EXT-X-I-FRAME-STREAM-INF:"];

function tagNamesAPlaylist(line: string): boolean {
  const upper = line.toUpperCase();
  return PLAYLIST_URI_TAGS.some((tag) => upper.startsWith(tag));
}

export function rewritePlaylist(
  body: string,
  playlistUrl: string,
  requestOrigin: string,
  clientHeadersJson: string,
  browserFriendly: boolean,
): string {
  const lines = body.split(/\r?\n/);
  const out: string[] = [];
  /**
   * HLS puts no meaning in file extensions, so the tag introducing a URI is the
   * only reliable way to tell a nested playlist from a segment. Guessing from
   * the URL sent extensionless variants (Nova serves them as
   * `worker.dev/?e=<blob>`) to the segment proxy, which streams bytes through
   * untouched — so their segment URLs stayed absolute and cross-origin, every
   * one failed CORS, and hls.js retried forever without ever going fatal.
   */
  let afterStreamInf = false;

  for (const line of lines) {
    if (!line || line.startsWith("#")) {
      if (line.includes("URI=")) {
        const namesAPlaylist = tagNamesAPlaylist(line);
        out.push(
          line.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
            const absolute = resolvePlaylistUri(uri, playlistUrl);
            if (!absolute) return `URI="${uri}"`;
            const proxied = buildSegmentOrNestedProxy(
              absolute,
              requestOrigin,
              clientHeadersJson,
              namesAPlaylist || absolute.includes(".m3u8"),
              browserFriendly,
            );
            return `URI="${proxied}"`;
          }),
        );
      } else {
        out.push(line);
      }
      if (line.toUpperCase().startsWith("#EXT-X-STREAM-INF:")) {
        afterStreamInf = true;
      }
      continue;
    }

    const absolute = resolvePlaylistUri(line.trim(), playlistUrl);
    if (!absolute) {
      out.push(line);
      afterStreamInf = false;
      continue;
    }

    out.push(
      buildSegmentOrNestedProxy(
        absolute,
        requestOrigin,
        clientHeadersJson,
        afterStreamInf || absolute.includes(".m3u8"),
        browserFriendly,
      ),
    );
    afterStreamInf = false;
  }

  let rewritten = out.join("\n");
  if (browserFriendly && rewritten.includes("#EXT-X-STREAM-INF:")) {
    rewritten = preferBrowserVariants(rewritten);
  }
  return rewritten;
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
    const browserFriendly = reqUrl.searchParams.get("browser") === "1";

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
      ? rewritePlaylist(
          text,
          finalUrl,
          reqUrl.origin,
          clientHeadersJson,
          browserFriendly,
        )
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
