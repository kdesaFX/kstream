import { list } from "subsrt-ts";

import { proxiedFetch } from "@/backend/helpers/fetch";
import { convertSubtitlesToSrt } from "@/components/player/utils/captions";
import {
  TTMLCue,
  isTTML,
  parseTTML,
  ttmlCuesToSrt,
} from "@/components/player/utils/ttml";
import { CaptionListItem } from "@/stores/player/slices/source";
import { SimpleCache } from "@/utils/common/cache";

import {
  isExtensionActiveCached,
  sendExtensionRequest,
} from "../extension/messaging";

export const subtitleTypeList = list().map((type) => `.${type}`);
const downloadCache = new SimpleCache<string, string>();
downloadCache.setCompare((a, b) => a === b);
const expirySeconds = 24 * 60 * 60;

const PROXY_HEADER_MAP: Record<string, string> = {
  cookie: "X-Cookie",
  referer: "X-Referer",
  origin: "X-Origin",
  "user-agent": "X-User-Agent",
};

function mapHeadersForProxy(
  headers?: Record<string, string>,
): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => {
      const mapped = PROXY_HEADER_MAP[key.toLowerCase()];
      return [mapped ?? key, value];
    }),
  );
}

async function fetchCaptionRaw(caption: CaptionListItem): Promise<string> {
  let data: string | undefined;
  if (caption.needsProxy) {
    if (isExtensionActiveCached()) {
      const extensionResponse = await sendExtensionRequest({
        url: caption.url,
        method: "GET",
        headers: caption.headers,
      });
      if (
        !extensionResponse?.success ||
        typeof extensionResponse.response.body !== "string"
      ) {
        throw new Error("failed to get caption data from extension");
      }

      data = extensionResponse.response.body;
    } else {
      data = await proxiedFetch<string>(caption.url, {
        responseType: "text",
        headers: {
          "Accept-Charset": "utf-8",
          ...mapHeadersForProxy(caption.headers),
        },
      });
    }
  } else {
    const response = await fetch(caption.url);
    const contentType = response.headers.get("content-type") || "";
    const charset =
      contentType.split("charset=")[1]?.trim().toLowerCase() || "utf-8";

    // Get the raw bytes
    const buffer = await response.arrayBuffer();
    // Decode using the detected charset, defaulting to UTF-8
    const decoder = new TextDecoder(charset);
    data = decoder.decode(buffer);
  }
  if (!data) throw new Error("failed to get caption data");
  return data;
}

/**
 * Always returns SRT
 */
export async function downloadCaption(
  caption: CaptionListItem,
): Promise<string> {
  const cached = downloadCache.get(caption.url);
  if (cached) return cached;

  const data = await fetchCaptionRaw(caption);
  const output = convertSubtitlesToSrt(data);
  downloadCache.set(caption.url, output, expirySeconds);
  return output;
}


export async function downloadCaptionSmart(
  caption: CaptionListItem,
): Promise<{ srtData: string; ttmlCues?: TTMLCue[] }> {
  const data = await fetchCaptionRaw(caption);
  if (isTTML(data)) {
    const ttmlCues = parseTTML(data);
    if (ttmlCues.length > 0) {
      return { srtData: ttmlCuesToSrt(ttmlCues), ttmlCues };
    }
  }
  const cached = downloadCache.get(caption.url);
  const srtData = cached ?? convertSubtitlesToSrt(data);
  if (!cached) downloadCache.set(caption.url, srtData, expirySeconds);
  return { srtData };
}

/**
 * Downloads the WebVTT content. No different than a simple
 * get request with a cache.
 */
export async function downloadWebVTT(url: string): Promise<string> {
  const cached = downloadCache.get(url);
  if (cached) return cached;

  const data = await fetch(url).then((v) => v.text());
  return data;
}
