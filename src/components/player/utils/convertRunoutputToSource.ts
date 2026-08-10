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

/**
 * Browser (no extension) cannot set Referer/Origin on HLS requests, and many
 * CDNs also lack CORS. Route those playlists through the same-origin m3u8 proxy.
 */
function maybeProxyHlsPlaylist(
  playlist: string,
  headers: Record<string, string>,
): string {
  if (isExtensionActiveCached()) return playlist;
  if (isUrlAlreadyProxied(playlist)) return playlist;
  if (Object.keys(headers).length === 0) return playlist;
  return createM3U8ProxyUrl(playlist, headers);
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
      // extension / casting paths that still need the raw values.
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
