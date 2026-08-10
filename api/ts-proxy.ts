import {
  assertSafeDestination,
  afterResponseHeaders,
  buildUpstreamHeaders,
  handleOptions,
  jsonResponse,
} from "../lib/proxy-shared";

export const config = { runtime: "edge" };

function parseClientHeaders(raw: string | null): Headers {
  const out = new Headers();
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v) out.set(k, v);
    }
  } catch {
    // ignore
  }
  return out;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return handleOptions();

  try {
    const reqUrl = new URL(request.url);
    const targetRaw = reqUrl.searchParams.get("url");
    if (!targetRaw) {
      return jsonResponse({ error: "Missing url query parameter" }, 400);
    }

    const target = assertSafeDestination(targetRaw);
    const clientHeaders = parseClientHeaders(reqUrl.searchParams.get("headers"));

    const upstreamHeaders = buildUpstreamHeaders(request.headers);
    for (const [k, v] of clientHeaders.entries()) {
      upstreamHeaders.set(k, v);
    }

    const upstream = await fetch(target.href, {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
    });

    const headers = afterResponseHeaders(
      upstream.headers,
      upstream.url || target.href,
    );
    headers.set("Cache-Control", "public, max-age=3600");

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "TS proxy failed";
    return jsonResponse({ error: message }, 400);
  }
}
