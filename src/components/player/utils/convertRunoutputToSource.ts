import { Stream } from "@p-stream/providers";

import { isExtensionActiveCached } from "@/backend/extension/messaging";
import {
  createM3U8ProxyUrl,
  createMP4ProxyUrl,
  isUrlAlreadyProxied,
} from "@/components/player/utils/proxy";
import {
  SourceFileStream,
  SourceQuality,
  SourceSliceSource,
} from "@/stores/player/utils/qualities";

const allowedQualitiesMap: Record<SourceQuality, SourceQuality> = {
  "4k": "4k",
  "1080": "1080",
  "480": "480",
  "360": "360",
  "720": "720",
  unknown: "unknown",
};
const allowedQualities = Object.keys(allowedQualitiesMap);
const allowedFileTypes = ["mp4"];

function isAllowedQuality(inp: string): inp is SourceQuality {
  return allowedQualities.includes(inp);
}

function mergeStreamHeaders(stream: Stream): Record<string, string> {
  return {
    ...(stream.preferredHeaders || {}),
    ...(stream.headers || {}),
  };
}

function isDesktopApp(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      (window.__PSTREAM_DESKTOP__ || window.__KSTREAM_DESKTOP_IPC__),
  );
}

/** Phones/tablets — no usable header-injecting extension. */
function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  // iPadOS desktop-UA mode
  return ua.includes("Mac") && "ontouchend" in document;
}

/**
 * Same-origin Vercel m3u8/CORS proxy:
 * - Desktop app: never (native/extension is faster)
 * - Desktop browser + enabled extension: never
 * - Desktop browser without extension: yes
 * - Mobile: always
 *
 * Reyna/Orbit is an exception: segment CDN only allows CORS from goated.cx,
 * so without a same-origin rewrite the browser cannot read fragments from
 * kdesa.stream even when Referer is injected. Always proxy those playlists
 * on the web; desktop still uses prepareStream headerDomains.
 */
function isReynaOrbitPlaylist(playlist: string): boolean {
  try {
    const host = new URL(playlist).hostname.toLowerCase();
    return (
      host.includes("reallyfast") ||
      host.includes("cutekitten") ||
      host.includes("goated.cx")
    );
  } catch {
    return false;
  }
}

/**
 * Nova's edge workers 403 any origin except novahd.cc, and its segments are
 * spread across many dynamic nova-edge-*.workers.dev hosts the extension can't
 * enumerate. Always route through the same-origin m3u8 proxy so every nested
 * URL is rewritten with the novahd headers.
 */
function isNovaEdgePlaylist(playlist: string): boolean {
  try {
    const host = new URL(playlist).hostname.toLowerCase();
    return host.includes("nova-edge") && host.endsWith("workers.dev");
  } catch {
    return false;
  }
}

function requiresSameOriginProxy(playlist: string): boolean {
  return isReynaOrbitPlaylist(playlist) || isNovaEdgePlaylist(playlist);
}

export function shouldUseSameOriginStreamProxy(playlist?: string): boolean {
  if (isDesktopApp()) return false;
  if (playlist && requiresSameOriginProxy(playlist)) return true;
  if (isMobileBrowser()) return true;
  return !isExtensionActiveCached();
}

/**
 * Route HLS through /api/m3u8-proxy when the environment can't set Referer/Origin.
 */
function maybeProxyHlsPlaylist(
  playlist: string,
  headers: Record<string, string>,
): string {
  if (!shouldUseSameOriginStreamProxy(playlist)) return playlist;
  if (isUrlAlreadyProxied(playlist)) return playlist;

  // Mobile / Reyna: always proxy HLS (CDN CORS / referer locks).
  // Browser without extension: proxy when the stream needs headers.
  if (
    !isMobileBrowser() &&
    !requiresSameOriginProxy(playlist) &&
    Object.keys(headers).length === 0
  ) {
    return playlist;
  }

  return createM3U8ProxyUrl(playlist, headers, { requireProxy: true });
}

function shouldProxyFileUrls(headers: Record<string, string>): boolean {
  if (Object.keys(headers).length === 0) return false;
  if (isMobileBrowser()) return true;
  // VidLink MP4 CDNs reject bare origins; desktop header rules miss them often.
  if (isDesktopApp()) return true;
  if (!isExtensionActiveCached()) return true;
  return false;
}

function maybeProxyFileUrl(
  url: string,
  headers: Record<string, string>,
): string {
  if (!shouldProxyFileUrls(headers)) return url;
  if (isUrlAlreadyProxied(url)) return url;
  return createMP4ProxyUrl(url, headers);
}

export function convertRunoutputToSource(out: {
  stream: Stream;
}): SourceSliceSource {
  if (out.stream.type === "hls") {
    const headers = mergeStreamHeaders(out.stream);
    const url = maybeProxyHlsPlaylist(out.stream.playlist, headers);
    const proxied = url !== out.stream.playlist;

    return {
      type: "hls",
      url,
      // Headers are applied by the m3u8 proxy when proxied; keep them for
      // extension / desktop paths that still need the raw values.
      headers: proxied ? undefined : out.stream.headers,
      preferredHeaders: proxied ? undefined : out.stream.preferredHeaders,
      audioLanguage: out.stream.audioLanguage,
      audioLabel: out.stream.audioLabel,
    };
  }
  if (out.stream.type === "file") {
    const headers = mergeStreamHeaders(out.stream);
    const proxiedAny = shouldProxyFileUrls(headers);
    const qualities: Partial<Record<SourceQuality, SourceFileStream>> = {};
    Object.entries(out.stream.qualities).forEach((entry) => {
      if (!isAllowedQuality(entry[0])) {
        console.warn(`unrecognized quality: ${entry[0]}`);
        return;
      }
      if (!allowedFileTypes.includes(entry[1].type)) {
        console.warn(`unrecognized file type: ${entry[1].type}`);
        return;
      }
      qualities[entry[0]] = {
        type: entry[1].type,
        url: maybeProxyFileUrl(entry[1].url, headers),
      };
    });
    return {
      type: "file",
      qualities,
      headers: proxiedAny ? undefined : out.stream.headers,
      preferredHeaders: proxiedAny ? undefined : out.stream.preferredHeaders,
      audioLanguage: out.stream.audioLanguage,
      audioLabel: out.stream.audioLabel,
    };
  }
  throw new Error("unrecognized type");
}
