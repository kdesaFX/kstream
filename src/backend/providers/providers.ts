import {
  makeProviders,
  makeStandardFetcher,
  targets,
} from "@p-stream/providers";

import { isExtensionActiveCached } from "@/backend/extension/messaging";
import {
  makeExtensionFetcher,
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

/**
 * Wake cold same-origin edge proxies before the first scrape.
 * Mobile always goes through these; a cold wake is a common cause of
 * intermittent "no sources found" right after reopening the site.
 */
let proxyWarmPromise: Promise<void> | null = null;

function pingSameOriginProxies(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const origin = window.location.origin;
  return Promise.allSettled([
    fetch(
      `${origin}/api/proxy?destination=${encodeURIComponent("https://example.com")}`,
      { method: "GET", cache: "no-store" },
    ),
    fetch(
      `${origin}/api/m3u8-proxy?url=${encodeURIComponent("https://example.com")}`,
      { method: "OPTIONS" },
    ),
  ]).then(() => undefined);
}

/** Fire-and-forget warm (boot / getProviders). Safe to call many times. */
export function warmSameOriginProxies(): void {
  if (typeof window === "undefined") return;
  if (!proxyWarmPromise) {
    proxyWarmPromise = pingSameOriginProxies().catch(() => undefined);
  }
}

/**
 * Await a proxy warm with a short budget so scrapes don't race a cold edge.
 * Never throws; times out after `budgetMs`. Pass `force` to ping again
 * (e.g. before an automatic scrape retry).
 */
export async function ensureSameOriginProxiesWarm(
  budgetMs = 2500,
  force = false,
): Promise<void> {
  if (typeof window === "undefined") return;
  if (force || !proxyWarmPromise) {
    proxyWarmPromise = pingSameOriginProxies().catch(() => undefined);
  }
  await Promise.race([
    proxyWarmPromise,
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, budgetMs);
    }),
  ]);
}

export function getProviders() {
  // Desktop app has extension built in and can play MKV; use NATIVE target.
  if (isDesktopApp()) {
    return makeProviders({
      fetcher: makeStandardFetcher(fetch),
      proxiedFetcher: makeExtensionFetcher(),
      target: targets.NATIVE,
      consistentIpForRequests: true,
    });
  }

  if (isExtensionActiveCached()) {
    return makeProviders({
      fetcher: makeStandardFetcher(fetch),
      proxiedFetcher: makeExtensionFetcher(),
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
