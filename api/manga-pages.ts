import {
  fetchChapterPagesById,
  fetchWeebCentralChapterPages,
  isComickChapterId,
  isMangaDexChapterId,
  isWeebCentralChapterId,
} from "../lib/manga-pages-server";
import { resolveMirrorChapters } from "../lib/manga-chapters-server";
import { handleOptions, jsonResponse } from "../lib/proxy-shared";

export const config = { runtime: "edge" };

const CACHE_SECONDS = 600;

async function pagesViaWeebCentralTitle(
  title: string,
  alternateTitles: string[],
  chapterNum: string,
): Promise<string[]> {
  const wanted = chapterNum.trim();
  if (!wanted || !title.trim()) return [];
  const { chapters } = await resolveMirrorChapters(
    title,
    alternateTitles,
    "en",
  );
  const wc = chapters.filter((ch) => ch.source === "weebcentral");
  if (wc.length === 0) return [];
  const wantedNum = parseFloat(wanted);
  const match =
    wc.find((ch) => ch.chapter?.trim() === wanted) ??
    (Number.isFinite(wantedNum)
      ? wc.find((ch) => parseFloat(ch.chapter ?? "") === wantedNum)
      : undefined);
  if (!match) return [];
  return fetchWeebCentralChapterPages(match.id);
}

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

    let pages = await fetchChapterPagesById(chapterId);

    // Comick chapter detail is often CF-blocked; fall back to WeebCentral by
    // chapter number when the client passes title metadata.
    if (pages.length === 0) {
      const title = url.searchParams.get("title")?.trim();
      const chapter = url.searchParams.get("chapter")?.trim();
      const alts = (url.searchParams.get("alts") ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (title && chapter) {
        pages = await pagesViaWeebCentralTitle(title, alts, chapter);
      }
    }

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
