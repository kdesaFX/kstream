import { resolveMirrorChapters } from "../lib/manga-chapters-server";
import { handleOptions, jsonResponse } from "../lib/proxy-shared";

export const config = { runtime: "edge" };

const CACHE_SECONDS = 300;

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return handleOptions();

  try {
    const url = new URL(request.url);
    const title = url.searchParams.get("title")?.trim();
    if (!title) {
      return jsonResponse({ error: "Missing title" }, 400);
    }

    const language = url.searchParams.get("language")?.trim() || "en";
    const altsRaw = url.searchParams.get("alts")?.trim() ?? "";
    const alternateTitles = altsRaw
      ? altsRaw.split(/[\n|]/).map((part) => part.trim()).filter(Boolean)
      : [];

    const result = await resolveMirrorChapters(title, alternateTitles, language);
    return jsonResponse(
      result,
      result.chapters.length > 0 ? 200 : 404,
      result.chapters.length > 0
        ? {
            "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
          }
        : {},
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Mirror chapter resolve failed";
    return jsonResponse({ error: message }, 500);
  }
}
