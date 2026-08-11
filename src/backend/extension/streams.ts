import { Stream } from "@p-stream/providers";

import { RULE_IDS, setDomainRule } from "@/backend/extension/messaging";

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return null;
  }
}

function extractDomainsFromStream(stream: Stream): string[] {
  const domains = new Set<string>();

  const extras = (stream as Stream & { headerDomains?: string[] }).headerDomains;
  if (Array.isArray(extras)) {
    for (const host of extras) {
      if (typeof host === "string" && host.trim()) domains.add(host.trim());
    }
  }

  if (stream.type === "hls") {
    const host = extractDomain(stream.playlist);
    if (host) domains.add(host);
    // Reyna/Orbit: playlist on reallyfast, segments on cutekitten — both need headers.
    if (host?.includes("reallyfast")) {
      domains.add("a.cutekitten.workers.dev");
      domains.add("cdn.reallyfast.xyz");
      domains.add("proxy.reallyfast.xyz");
    }
  } else if (stream.type === "file") {
    for (const q of Object.values(stream.qualities)) {
      const host = extractDomain(q.url);
      if (host) domains.add(host);
    }
  }

  return [...domains];
}

function buildHeadersFromStream(stream: Stream): Record<string, string> {
  const headers: Record<string, string> = {};
  Object.entries(stream.headers ?? {}).forEach((entry) => {
    headers[entry[0]] = entry[1];
  });
  Object.entries(stream.preferredHeaders ?? {}).forEach((entry) => {
    headers[entry[0]] = entry[1];
  });
  return headers;
}

export async function prepareStream(stream: Stream) {
  await setDomainRule({
    ruleId: RULE_IDS.PREPARE_STREAM,
    targetDomains: extractDomainsFromStream(stream),
    requestHeaders: buildHeadersFromStream(stream),
  });
}
