import { getProxyUrls, proxiedDestinationUrl, resolveProxyUrl } from "@/utils/hosting/proxyUrls";

const STORAGE_KEY = "__kstream:mangaProxy";
const PROXY_ATTEMPT_MS = 4500;
const DIRECT_ATTEMPT_MS = 15000;

/** Hosts that never work as direct browser fetches on the deployed site. */
const PROXY_ONLY_HOSTS = new Set([
  "weebcentral.com",
  "api.comick.dev",
  "mangasee123.com",
  "mangasee123.net",
]);

function hostKey(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url;
  }
}

function readRememberedProxy(destinationUrl: string): string | undefined {
  if (typeof sessionStorage === "undefined") return undefined;
  try {
    const data = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}") as Record<
      string,
      string
    >;
    return data[hostKey(destinationUrl)];
  } catch {
    return undefined;
  }
}

export function rememberGoodProxy(destinationUrl: string, proxiedUrl: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const data = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}") as Record<
      string,
      string
    >;
    data[hostKey(destinationUrl)] = proxiedUrl;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/** Proxy-first URL list with last-good hop remembered per upstream host. */
export function buildMangaProxyCandidates(destinationUrl: string): string[] {
  const out: string[] = [];
  const add = (value?: string) => {
    if (value && !out.includes(value)) out.push(value);
  };

  add(readRememberedProxy(destinationUrl));
  if (typeof window !== "undefined") {
    add(proxiedDestinationUrl(destinationUrl, [resolveProxyUrl("/api/proxy")]));
  }
  for (const proxy of getProxyUrls()) {
    add(proxiedDestinationUrl(destinationUrl, [proxy]));
  }
  const host = hostKey(destinationUrl);
  if (!PROXY_ONLY_HOSTS.has(host)) {
    add(destinationUrl);
  }
  return out;
}

function attemptTimeoutMs(target: string): number {
  return target.includes("destination=") ? PROXY_ATTEMPT_MS : DIRECT_ATTEMPT_MS;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timer =
        typeof window !== "undefined" ? window.setTimeout : setTimeout;
      timer(() => reject(new Error("Manga proxy attempt timed out")), ms);
    }),
  ]);
}

export async function fetchViaMangaProxies<T>(
  destinationUrl: string,
  fetcher: (target: string) => Promise<T>,
  isValid?: (result: T) => boolean,
): Promise<T> {
  const candidates = buildMangaProxyCandidates(destinationUrl);
  let lastError: unknown;

  // Race all proxy hops — first valid response wins (avoids 8s × N sequential waits).
  const raced = await Promise.allSettled(
    candidates.map(async (target) => {
      const result = await withTimeout(
        fetcher(target),
        attemptTimeoutMs(target),
      );
      if (isValid && !isValid(result)) {
        throw new Error("Invalid proxied response");
      }
      return { target, result };
    }),
  );

  for (const entry of raced) {
    if (entry.status !== "fulfilled") {
      lastError = entry.reason;
      continue;
    }
    const { target, result } = entry.value;
    if (target !== destinationUrl) rememberGoodProxy(destinationUrl, target);
    return result;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Manga proxied request failed");
}
