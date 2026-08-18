import {
  makeProviders,
  makeStandardFetcher,
  targets,
} from "@p-stream/providers";

import { isExtensionActiveCached } from "@/backend/extension/messaging";
import {
  makeExtensionWithProxyFallbackFetcher,
  makeLoadBalancedSimpleProxyFetcher,
  setupM3U8Proxy,
} from "@/backend/providers/fetchers";

// Initialize M3U8 proxy on module load
setupM3U8Proxy();

function isDesktopApp(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      (window.__PSTREAM_DESKTOP__ || window.__KSTREAM_DESKTOP_IPC__),
  );
}

/** Wake cold Vercel edge functions before the first scrape/play request. */
let proxyWarmStarted = false;
function warmSameOriginProxies() {
  if (proxyWarmStarted || typeof window === "undefined") return;
  proxyWarmStarted = true;
  const origin = window.location.origin;
  // Fire-and-forget OPTIONS / tiny GETs — ignore failures.
  void fetch(`${origin}/api/proxy?destination=${encodeURIComponent("https://example.com")}`, {
    method: "GET",
    cache: "no-store",
  }).catch(() => undefined);
  void fetch(`${origin}/api/m3u8-proxy?url=${encodeURIComponent("https://example.com")}`, {
    method: "OPTIONS",
  }).catch(() => undefined);
}

export function getProviders() {
  // Desktop app has extension built in and can play MKV; use NATIVE target.
  if (isDesktopApp()) {
    return makeProviders({
      fetcher: makeStandardFetcher(fetch),
      proxiedFetcher: makeExtensionWithProxyFallbackFetcher(),
      target: targets.NATIVE,
      consistentIpForRequests: true,
    });
  }

  if (isExtensionActiveCached()) {
    return makeProviders({
      fetcher: makeStandardFetcher(fetch),
      proxiedFetcher: makeExtensionWithProxyFallbackFetcher(),
      target: targets.BROWSER_EXTENSION,
      consistentIpForRequests: true,
    });
  }

  setupM3U8Proxy();
  warmSameOriginProxies();

  return makeProviders({
    fetcher: makeStandardFetcher(fetch),
    proxiedFetcher: makeLoadBalancedSimpleProxyFetcher(),
    target: targets.BROWSER,
  });
}

export function getAllProviders() {
  return makeProviders({
    fetcher: makeStandardFetcher(fetch),
    target: targets.BROWSER_EXTENSION,
    consistentIpForRequests: true,
  });
}
