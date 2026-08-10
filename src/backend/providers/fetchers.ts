import {
  Fetcher,
  makeSimpleProxyFetcher,
  setM3U8ProxyUrl,
} from "@p-stream/providers";

import { sendExtensionRequest } from "@/backend/extension/messaging";
import { getApiToken, setApiToken } from "@/backend/helpers/providerApi";
import { getM3U8ProxyUrls, getProxyUrls } from "@/utils/hosting/proxyUrls";

import { convertBodyToObject, getBodyTypeFromBody } from "../extension/request";

function makeLoadbalancedList(getter: () => string[]) {
  let listIndex = -1;
  return () => {
    const fetchers = getter();
    if (fetchers.length === 0) return "";
    if (listIndex === -1 || listIndex >= fetchers.length) {
      listIndex = Math.floor(Math.random() * fetchers.length);
    }
    const proxyUrl = fetchers[listIndex];
    listIndex = (listIndex + 1) % fetchers.length;
    return proxyUrl;
  };
}

export const getLoadbalancedProxyUrl = makeLoadbalancedList(getProxyUrls);

function getEnabledM3U8ProxyUrls() {
  const allM3U8ProxyUrls = getM3U8ProxyUrls();
  const enabledProxies = localStorage.getItem("m3u8-proxy-enabled");

  if (!enabledProxies) {
    return allM3U8ProxyUrls;
  }

  try {
    const enabled = JSON.parse(enabledProxies);
    const filtered = allM3U8ProxyUrls.filter(
      (_url, index) => enabled[index.toString()] !== false,
    );
    // Stale localStorage can disable every entry — fall back so playback works.
    return filtered.length > 0 ? filtered : allM3U8ProxyUrls;
  } catch {
    return allM3U8ProxyUrls;
  }
}

export const getLoadbalancedM3U8ProxyUrl = makeLoadbalancedList(
  getEnabledM3U8ProxyUrls,
);

/** In-memory cookie jar keyed by destination hostname for proxied scrapes. */
const proxyCookieJar = new Map<string, Map<string, string>>();

function destinationHostFromProxyRequest(input: RequestInfo | URL): string | null {
  try {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const dest = new URL(raw).searchParams.get("destination");
    if (!dest) return null;
    return new URL(dest).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function parseSetCookieHeader(raw: string): Array<{ name: string; value: string }> {
  // Multiple cookies may be comma-joined; split carefully on comma before a new name=
  const parts = raw.split(/,(?=\s*[^;=]+=)/);
  const out: Array<{ name: string; value: string }> = [];
  for (const part of parts) {
    const nv = part.split(";")[0]?.trim();
    if (!nv) continue;
    const eq = nv.indexOf("=");
    if (eq <= 0) continue;
    out.push({ name: nv.slice(0, eq), value: nv.slice(eq + 1) });
  }
  return out;
}

function storeCookiesFromResponse(host: string, response: Response) {
  const raw =
    response.headers.get("X-Set-Cookie") ||
    response.headers.get("x-set-cookie");
  if (!raw) return;
  let jar = proxyCookieJar.get(host);
  if (!jar) {
    jar = new Map();
    proxyCookieJar.set(host, jar);
  }
  for (const { name, value } of parseSetCookieHeader(raw)) {
    jar.set(name, value);
  }
}

function cookieHeaderForHost(host: string): string | null {
  const jar = proxyCookieJar.get(host);
  if (!jar || jar.size === 0) return null;
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function fetchButWithApiTokens(
  input: RequestInfo | URL,
  init?: RequestInit | undefined,
): Promise<Response> {
  const apiToken = await getApiToken();
  const headers = new Headers(init?.headers);
  if (apiToken) headers.set("X-Token", apiToken);

  const host = destinationHostFromProxyRequest(input);
  if (host) {
    const cookie = cookieHeaderForHost(host);
    if (cookie && !headers.has("X-Cookie")) {
      headers.set("X-Cookie", cookie);
    }
  }

  const response = await fetch(
    input,
    init
      ? {
          ...init,
          headers,
        }
      : undefined,
  );
  const newApiToken = response.headers.get("X-Token");
  if (newApiToken) setApiToken(newApiToken);

  if (host) storeCookiesFromResponse(host, response);

  return response;
}

export function setupM3U8Proxy() {
  const proxyUrl = getLoadbalancedM3U8ProxyUrl();
  if (proxyUrl) {
    setM3U8ProxyUrl(proxyUrl);
  }
}

export function makeLoadBalancedSimpleProxyFetcher() {
  const fetcher: Fetcher = async (a, b) => {
    const proxyUrl = getLoadbalancedProxyUrl();
    if (!proxyUrl) {
      throw new Error(
        "No CORS proxy configured. Set VITE_CORS_PROXY_URL, or use the browser extension / desktop app.",
      );
    }
    const currentFetcher = makeSimpleProxyFetcher(
      proxyUrl,
      fetchButWithApiTokens,
    );
    return currentFetcher(a, b);
  };
  return fetcher;
}

function makeFinalHeaders(
  readHeaders: string[],
  headers: Record<string, string>,
): Headers {
  const lowercasedHeaders = readHeaders.map((v) => v.toLowerCase());
  return new Headers(
    Object.entries(headers).filter((entry) =>
      lowercasedHeaders.includes(entry[0].toLowerCase()),
    ),
  );
}

export function makeExtensionFetcher() {
  const fetcher: Fetcher = async (url, ops) => {
    const result = await sendExtensionRequest<any>({
      url,
      ...ops,
      body: convertBodyToObject(ops.body),
      bodyType: getBodyTypeFromBody(ops.body),
    });
    if (!result?.success) throw new Error(`extension error: ${result?.error}`);
    const res = result.response;
    return {
      body: res.body,
      finalUrl: res.finalUrl,
      statusCode: res.statusCode,
      headers: makeFinalHeaders(ops.readHeaders, res.headers),
    };
  };
  return fetcher;
}
