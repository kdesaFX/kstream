import { getLoadbalancedM3U8ProxyUrl } from "@/backend/providers/fetchers";
import { getM3U8ProxyUrls } from "@/utils/hosting/proxyUrls";

/**
 * Creates a proxied M3U8 URL for HLS streams using a random proxy from config
 * @param url - The original M3U8 URL to proxy
 * @param headers - Headers to include with the request
 * @returns The proxied M3U8 URL
 */
export function createM3U8ProxyUrl(
  url: string,
  headers: Record<string, string> = {},
  options: { requireProxy?: boolean } = {},
): string {
  const proxyBaseUrl = getLoadbalancedM3U8ProxyUrl();

  if (!proxyBaseUrl) {
    if (options.requireProxy || Object.keys(headers).length > 0) {
      throw new Error(
        "No M3U8 proxy configured. Set VITE_M3U8_PROXY_URL (e.g. /api) for browser playback without the extension.",
      );
    }
    console.warn("No M3U8 proxy URLs available in configuration");
    return url;
  }

  const encodedUrl = encodeURIComponent(url);
  const encodedHeaders = encodeURIComponent(JSON.stringify(headers));
  return `${proxyBaseUrl}/m3u8-proxy?url=${encodedUrl}${
    Object.keys(headers).length > 0 ? `&headers=${encodedHeaders}` : ""
  }&browser=1`;
}

/**
 * TODO: Creates a proxied MP4 URL for MP4 streams
 * @param url - The original MP4 URL to proxy
 * @param headers - Headers to include with the request
 * @returns The proxied MP4 URL
 */
export function createMP4ProxyUrl(
  url: string,
  _headers: Record<string, string> = {},
): string {
  // TODO: Implement MP4 proxy for protected streams
  // This would need a separate MP4 proxy service that can handle headers
  // For now, return the original URL
  console.warn("MP4 proxy not yet implemented - using original URL");
  return url;
}

export type UnwrappedMediaUrl = {
  url: string;
  /** Headers embedded in a proxy query string (if any). */
  headers: Record<string, string>;
};

function parseHeaderParam(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Unwrap a same-origin / external m3u8 or destination proxy URL so external
 * downloaders (yt-dlp, N_m3u8DL-RE, ffmpeg, GUI HLS tools) get the upstream
 * playlist / file URL instead of our `/api/m3u8-proxy?...` wrapper.
 */
export function unwrapProxiedMediaUrl(
  input: string,
  base = typeof window !== "undefined" ? window.location.origin : "https://localhost",
): UnwrappedMediaUrl {
  if (!input) return { url: input, headers: {} };

  try {
    const parsed = new URL(input, base);
    const target =
      parsed.searchParams.get("url") ??
      parsed.searchParams.get("destination");

    const looksLikeMediaProxy =
      parsed.pathname.includes("m3u8-proxy") ||
      /m3u8-proxy\.m3u8/i.test(parsed.pathname) ||
      input.includes("/m3u8-proxy?") ||
      (parsed.searchParams.has("destination") &&
        /\/proxy\/?$/i.test(parsed.pathname));

    if (target && looksLikeMediaProxy) {
      return {
        url: target,
        headers: parseHeaderParam(parsed.searchParams.get("headers")),
      };
    }
  } catch {
    // Fall through to the raw input.
  }

  return { url: input, headers: {} };
}

/**
 * Build a ready-to-paste yt-dlp command for an HLS / file URL.
 */
export function buildYtDlpCommand(
  url: string,
  headers: Record<string, string> = {},
): string {
  const parts = ["yt-dlp"];
  for (const [key, value] of Object.entries(headers)) {
    parts.push(`--add-header ${JSON.stringify(`${key}:${value}`)}`);
  }
  parts.push(JSON.stringify(url));
  parts.push("-o", JSON.stringify("%(title)s.%(ext)s"));
  return parts.join(" ");
}

/**
 * Build a ready-to-paste N_m3u8DL-RE command for an HLS playlist.
 */
export function buildNm3u8Command(
  url: string,
  headers: Record<string, string> = {},
): string {
  const parts = ["N_m3u8DL-RE", JSON.stringify(url)];
  for (const [key, value] of Object.entries(headers)) {
    parts.push("--header", JSON.stringify(`${key}: ${value}`));
  }
  return parts.join(" ");
}

/** Public GUI HLS downloader used by Stream Link. */
export const HLS_DOWNLOADER_URL = "https://hlsdownloader.thetuhin.com/";

export function buildHlsDownloaderUrl(playlistUrl: string): string {
  return `${HLS_DOWNLOADER_URL}?url=${encodeURIComponent(playlistUrl)}`;
}

/**
 * Checks if a URL is already using one of the configured M3U8 proxy services
 * @param url - The URL to check
 * @returns True if the URL is already proxied, false otherwise
 */
export function isUrlAlreadyProxied(url: string): boolean {
  // Same-origin / Airplay-style proxy
  if (url.includes("/m3u8-proxy?url=")) {
    return true;
  }

  // External signed proxies (Reyna Valenox / midnightexpress, etc.)
  if (
    url.includes("/m3u8-proxy.m3u8?url=") ||
    url.includes("m3u8-proxy.m3u8?") ||
    /midnightexpress\.workers\.dev/i.test(url)
  ) {
    return true;
  }

  // Check if URL contains the destination pattern (Chromecast format)
  if (url.includes("/?destination=")) {
    return true;
  }

  // Also check if URL starts with any of the configured proxy URLs
  const proxyUrls = getM3U8ProxyUrls();
  return proxyUrls.some((proxyUrl) => url.startsWith(proxyUrl));
}
