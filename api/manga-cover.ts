import { DEFAULT_UA } from "../lib/proxy-shared";

const MANGADEX_COVER_CDN = "https://uploads.mangadex.org";
const WEEBCENTRAL_COVER_CDN = "https://temp.compsci88.com";
const COVER_CACHE_SECONDS = 60 * 60 * 24 * 365;

export const config = { runtime: "edge" };

function validId(value: string | null): value is string {
  return Boolean(value && /^[a-zA-Z0-9-]+$/.test(value));
}

export function mangaCoverDestination(requestUrl: string): URL {
  const request = new URL(requestUrl);
  const source = request.searchParams.get("source");

  if (source === "weebcentral-page") {
    const rawUrl = request.searchParams.get("url");
    if (!rawUrl) throw new Error("Invalid page URL");
    let pageUrl: URL;
    try {
      pageUrl = new URL(rawUrl);
    } catch {
      throw new Error("Invalid page URL");
    }
    if (
      pageUrl.protocol !== "https:" ||
      pageUrl.hostname !== "hot.planeptune.us" ||
      !pageUrl.pathname.startsWith("/manga/") ||
      !/\.(png|jpe?g|webp|gif)$/i.test(pageUrl.pathname)
    ) {
      throw new Error("Invalid page URL");
    }
    return pageUrl;
  }

  const id = request.searchParams.get("id");
  if (!validId(id)) throw new Error("Invalid manga id");

  if (source === "weebcentral") {
    return new URL(`/cover/normal/${id}.webp`, WEEBCENTRAL_COVER_CDN);
  }

  if (source === "mangadex") {
    const file = request.searchParams.get("file");
    const size = request.searchParams.get("size") ?? "256";
    if (!file || !/^[a-zA-Z0-9._-]+$/.test(file)) {
      throw new Error("Invalid cover filename");
    }
    if (size !== "256" && size !== "512") {
      throw new Error("Invalid cover size");
    }
    return new URL(
      `/covers/${id}/${encodeURIComponent(file)}.${size}.jpg`,
      MANGADEX_COVER_CDN,
    );
  }

  throw new Error("Invalid manga source");
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
      },
    });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const destination = mangaCoverDestination(request.url);
    const upstreamHeaders = new Headers({
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    });
    if (destination.hostname === "uploads.mangadex.org") {
      upstreamHeaders.set("Referer", "https://mangadex.org/");
      upstreamHeaders.set("User-Agent", DEFAULT_UA);
    }
    const upstream = await fetch(destination, {
      method: request.method,
      headers: upstreamHeaders,
    });

    const headers = new Headers({
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": upstream.ok
        ? `public, max-age=86400, s-maxage=${COVER_CACHE_SECONDS}, immutable`
        : "no-store",
      "CDN-Cache-Control": upstream.ok
        ? `public, max-age=${COVER_CACHE_SECONDS}, immutable`
        : "no-store",
      "Cloudflare-CDN-Cache-Control": upstream.ok
        ? `public, max-age=${COVER_CACHE_SECONDS}, immutable`
        : "no-store",
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    const etag = upstream.headers.get("etag");
    if (etag) headers.set("ETag", etag);

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (error) {
    console.error("Manga cover proxy failed", error);
    const status =
      error instanceof Error && error.message.startsWith("Invalid") ? 400 : 502;
    return errorResponse("Unable to load manga cover", status);
  }
}
