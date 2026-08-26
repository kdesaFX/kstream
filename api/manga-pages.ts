import {
  fetchChapterPagesById,
  isComickChapterId,
  isMangaDexChapterId,
  isWeebCentralChapterId,
} from "../lib/manga-pages-server";
import { handleOptions, jsonResponse } from "../lib/proxy-shared";

export const config = { runtime: "edge" };

const CACHE_SECONDS = 600;

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return handleOptions();

  try {
    const url = new URL(request.url);
    const chapterId = url.searchParams.get("chapterId")?.trim();
    if (!chapterId) {
      return jsonResponse({ error: "Missing chapterId" }, 400);
    }

    if (
      !isComickChapterId(chapterId) &&
      !isWeebCentralChapterId(chapterId) &&
      !isMangaDexChapterId(chapterId)
    ) {
      return jsonResponse({ error: "Invalid chapterId" }, 400);
    }

    const pages = await fetchChapterPagesById(chapterId);
    return jsonResponse(
      { pages },
      pages.length > 0 ? 200 : 404,
      pages.length > 0
        ? {
            "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
          }
        : {},
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Manga pages fetch failed";
    return jsonResponse({ error: message }, 500);
  }
}
