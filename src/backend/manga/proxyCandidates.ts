import { getProxyUrls, proxiedDestinationUrl, resolveProxyUrl } from "@/utils/hosting/proxyUrls";

const STORAGE_KEY = "__kstream:mangaProxy";
const PROXY_ATTEMPT_MS = 8000;
const DIRECT_ATTEMPT_MS = 20000;

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
  add(destinationUrl);
  return out;
}

function attemptTimeoutMs(target: string): number {
  return target.includes("destination=") ? PROXY_ATTEMPT_MS : DIRECT_ATTEMPT_MS;
}

export async function fetchViaMangaProxies<T>(
  destinationUrl: string,
  fetcher: (target: string) => Promise<T>,
  isValid?: (result: T) => boolean,
): Promise<T> {
  let lastError: unknown;
  for (const target of buildMangaProxyCandidates(destinationUrl)) {
    try {
      const result = await Promise.race([
        fetcher(target),
        new Promise<never>((_, reject) => {
          window.setTimeout(
            () => reject(new Error("Manga proxy attempt timed out")),
            attemptTimeoutMs(target),
          );
        }),
      ]);
      if (isValid && !isValid(result)) continue;
      if (target !== destinationUrl) rememberGoodProxy(destinationUrl, target);
      return result;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Manga proxied request failed");
}
