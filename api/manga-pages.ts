import {
  fetchChapterPagesById,
  fetchMangaDexChapterPages,
  fetchWeebCentralChapterPages,
  isComickChapterId,
  isMangaDexChapterId,
  isWeebCentralChapterId,
} from "../lib/manga-pages-server";
import { resolveMirrorChapters } from "../lib/manga-chapters-server";
import { pagesValidForManga } from "../lib/manga-page-title";
import { handleOptions, jsonResponse } from "../lib/proxy-shared";

export const config = { runtime: "edge" };

const CACHE_SECONDS = 600;

function acceptPages(
  pages: string[],
  title: string | undefined,
  alts: string[],
  chapter?: string | null,
): string[] {
  if (!pages.length) return [];
  if (!title || pagesValidForManga(pages, title, alts, chapter)) return pages;
  return [];
}

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
  const pages = await fetchWeebCentralChapterPages(match.id);
  return acceptPages(pages, title, alternateTitles, wanted);
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

    const title = url.searchParams.get("title")?.trim();
    const chapter = url.searchParams.get("chapter")?.trim();
    const alts = (url.searchParams.get("alts") ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    let pages: string[] = [];

    // Prefer WC/Comick chapter ids; for MangaDex uuids try WC by title first
    // so we don't burn guest at-home when the client still has an MD id.
    if (isComickChapterId(chapterId) || isWeebCentralChapterId(chapterId)) {
      pages = acceptPages(
        await fetchChapterPagesById(chapterId),
        title,
        alts,
        chapter,
      );
      if (pages.length === 0 && title && chapter) {
        pages = await pagesViaWeebCentralTitle(title, alts, chapter);
      }
    } else {
      if (title && chapter) {
        pages = await pagesViaWeebCentralTitle(title, alts, chapter);
      }
      if (pages.length === 0) {
        pages = acceptPages(
          await fetchMangaDexChapterPages(chapterId),
          title,
          alts,
          chapter,
        );
      }
    }

    return jsonResponse(
      { pages },
      pages.length > 0 ? 200 : 404,
      pages.length > 0
        ? {
            "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
          }
        : {
            // Don't cache empty/rejected responses (wrong-series WC hits).
            "Cache-Control": "no-store",
          },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Manga pages fetch failed";
    return jsonResponse({ error: message }, 500);
  }
}
