import { RunOutput, Stream } from "@p-stream/providers";

import { requiresSameOriginProxy } from "@/components/player/utils/convertRunoutputToSource";
import { createM3U8ProxyUrl } from "@/components/player/utils/proxy";
import { orderStreamsForPlayback } from "@/stores/player/utils/qualityStreams";
import { isIndianTitle } from "@/utils/media/indianSources";
import {
  hasProvenZeroHit,
  type SourceOrderContext,
} from "@/utils/media/sourceOrder";

const VALIDATE_TIMEOUT_MS = 8_000;
const VALIDATE_RANGE = "bytes=0-4095";

function mergeStreamHeaders(stream: Stream): Record<string, string> {
  return {
    ...(stream.preferredHeaders || {}),
    ...(stream.headers || {}),
  };
}

/** URLs that scrape as hits but cannot play. */
export function isKnownBadStreamUrl(url: string): string | null {
  if (/\/api\/decoy\//i.test(url)) return "decoy playlist";
  return null;
}

export function validatePlaylistBody(
  text: string,
): { ok: true } | { ok: false; reason: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "empty playlist" };
  if (/#EXTM3U/i.test(trimmed)) return { ok: true };
  if (/<html/i.test(trimmed)) return { ok: false, reason: "HTML error page" };
  if (/\b403\b|forbidden/i.test(trimmed)) return { ok: false, reason: "blocked" };
  return { ok: false, reason: "not an HLS playlist" };
}

export async function validateHlsPlaylistUrl(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const bad = isKnownBadStreamUrl(url);
  if (bad) return { ok: false, reason: bad };

  let fetchUrl = url;
  if (Object.keys(headers).length > 0) {
    try {
      fetchUrl = createM3U8ProxyUrl(url, headers);
    } catch {
      // Direct fetch below — may still work in extension/desktop.
    }
  }

  try {
    const response = await fetch(fetchUrl, {
      headers: { Range: VALIDATE_RANGE },
      signal: AbortSignal.timeout(VALIDATE_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, reason: `playlist HTTP ${response.status}` };
    }
    return validatePlaylistBody(await response.text());
  } catch (err) {
    const message = err instanceof Error ? err.message : "playlist fetch failed";
    return { ok: false, reason: message };
  }
}

export async function validateStream(
  stream: Stream,
  opts?: { strictProxyPlaylist?: boolean },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (stream.type === "hls") {
    const bad = isKnownBadStreamUrl(stream.playlist);
    if (bad) return { ok: false, reason: bad };
    // Way2 / Nova / Reyna playlists 403 bare page fetches and rate-limit under
    // burst auto-resume. The scraper already returned a hit; playback stamps
    // Origin/Referer through /api/m3u8-proxy — unless goon shows 0% hit here.
    if (
      requiresSameOriginProxy(stream.playlist) &&
      !opts?.strictProxyPlaylist
    ) {
      return { ok: true };
    }
    return validateHlsPlaylistUrl(stream.playlist, mergeStreamHeaders(stream));
  }
  if (stream.type === "file") {
    for (const file of Object.values(stream.qualities)) {
      if (!file?.url) continue;
      const bad = isKnownBadStreamUrl(file.url);
      if (bad) return { ok: false, reason: bad };
    }
  }
  return { ok: true };
}

function shouldTrustWithoutPlaylistProbe(
  sourceId: string,
  ctx?: SourceOrderContext,
): boolean {
  // CastleTV HLS probes false-negative outside IndiaA; manual pick works fine.
  // Only skip probes on Indian titles where we solo-first this source.
  return sourceId === "castletv" && isIndianTitle(ctx?.meta);
}

/** Pick the first stream variant that looks playable. */
export async function validateRunOutput(
  output: RunOutput,
  ctx?: SourceOrderContext,
): Promise<
  | { ok: true; stream: Stream }
  | { ok: false; reason: string; sourceId: string }
> {
  const strictProxyPlaylist =
    ctx != null && hasProvenZeroHit(output.sourceId, ctx);

  const streams = output.streams?.length
    ? output.streams
    : output.stream
      ? [output.stream]
      : [];
  if (!streams.length) {
    return { ok: false, reason: "no streams", sourceId: output.sourceId };
  }

  if (shouldTrustWithoutPlaylistProbe(output.sourceId, ctx)) {
    const stream = orderStreamsForPlayback(streams)[0];
    if (stream) return { ok: true, stream };
  }

  const reasons: string[] = [];
  for (const stream of orderStreamsForPlayback(streams)) {
    const result = await validateStream(stream, { strictProxyPlaylist });
    if (result.ok) return { ok: true, stream };
    reasons.push(result.reason);
  }

  return {
    ok: false,
    reason: reasons[0] ?? "stream validation failed",
    sourceId: output.sourceId,
  };
}
