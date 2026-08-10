import {
  assertSafeDestination,
  afterResponseHeaders,
  buildUpstreamHeaders,
  handleOptions,
  jsonResponse,
} from "../lib/proxy-shared";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return handleOptions();

  try {
    const url = new URL(request.url);
    const destination = url.searchParams.get("destination");
    if (!destination) {
      return jsonResponse({ error: "Missing destination query parameter" }, 400);
    }

    const target = assertSafeDestination(destination);
    const upstreamHeaders = buildUpstreamHeaders(request.headers);

    const init: RequestInit & { duplex?: string } = {
      method: request.method,
      headers: upstreamHeaders,
      redirect: "follow",
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
      init.duplex = "half";
    }

    const upstream = await fetch(target.href, init);
    const headers = afterResponseHeaders(
      upstream.headers,
      upstream.url || target.href,
    );

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proxy request failed";
    return jsonResponse({ error: message }, 400);
  }
}
