import { Stream } from "@p-stream/providers";

import { isExtensionActiveCached } from "@/backend/extension/messaging";
import {
  createM3U8ProxyUrl,
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
 */
export function shouldUseSameOriginStreamProxy(): boolean {
  if (isDesktopApp()) return false;
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
  if (!shouldUseSameOriginStreamProxy()) return playlist;
  if (isUrlAlreadyProxied(playlist)) return playlist;

  // Mobile: always proxy HLS (CDN CORS / referer locks).
  // Browser without extension: proxy when the stream needs headers.
  if (!isMobileBrowser() && Object.keys(headers).length === 0) {
    return playlist;
  }

  return createM3U8ProxyUrl(playlist, headers, { requireProxy: true });
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
        url: entry[1].url,
      };
    });
    return {
      type: "file",
      qualities,
      headers: out.stream.headers,
      preferredHeaders: out.stream.preferredHeaders,
      audioLanguage: out.stream.audioLanguage,
      audioLabel: out.stream.audioLabel,
    };
  }
  throw new Error("unrecognized type");
}
