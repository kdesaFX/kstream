import { isWeebCentralId } from "@/backend/manga/ids";
import {
  getChapterFallbackIds,
  resolveReadableChapters,
} from "@/backend/manga/sources/resolve";
import {
  getComickChapterPages,
  isComickChapterId,
} from "@/backend/manga/sources/comick";
import {
  chapterPageUrls,
  getChapterAtHome,
  getMangaDetails as getMangaDexDetails,
  proxiedChapterPageUrls,
  searchManga as searchMangaDex,
} from "@/backend/manga/mangadex";
import type { MangaDetails, MangaListItem } from "@/backend/manga/types";
import {
  getWeebCentralChapterPages,
  getWeebCentralDetails,
  normalizeMangaTitle,
  pagesBelongToTitle,
  searchWeebCentral,
} from "@/backend/manga/weebcentral";

/**
 * MangaDex first; WeebCentral fills titles it doesn't have, and supplies
 * chapters when MangaDex is only allowed to point at official sites.
 */
export async function searchManga(
  title: string,
  limit = 24,
): Promise<MangaListItem[]> {
  const [md, wc] = await Promise.all([
    searchMangaDex(title, limit).catch(() => [] as MangaListItem[]),
    searchWeebCentral(title, 16).catch(() => [] as MangaListItem[]),
  ]);
  const seen = new Set(md.map((item) => normalizeMangaTitle(item.title)));
  const extra = wc.filter((item) => !seen.has(normalizeMangaTitle(item.title)));
  return [...md, ...extra];
}

export async function getMangaDetails(
  mangaId: string,
  preferredLanguage = "en",
): Promise<MangaDetails> {
  if (isWeebCentralId(mangaId)) return getWeebCentralDetails(mangaId);

  const base = await getMangaDexDetails(mangaId, preferredLanguage);
  const resolved = await resolveReadableChapters(base, preferredLanguage);
  return { ...base, ...resolved };
}

export async function getChapterPages(
  chapterId: string,
  fallback?: {
    mangaId?: string;
    language?: string;
    title?: string;
    alternateTitles?: string[];
    chapter?: string | null;
  },
): Promise<string[]> {
  const tried = new Set<string>();
  const queue = [chapterId];

  if (fallback?.mangaId && fallback.language) {
    for (const alt of getChapterFallbackIds(
      fallback.mangaId,
      fallback.language,
      chapterId,
    )) {
      if (!queue.includes(alt)) queue.push(alt);
    }
  }

  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || tried.has(id)) continue;
    tried.add(id);

    const pages = await loadPagesForId(id, {
      title: fallback?.title,
      alternateTitles: fallback?.alternateTitles,
      chapter: fallback?.chapter,
    });
    if (
      pages.length > 0 &&
      pagesBelongToTitle(pages, fallback?.title, fallback?.alternateTitles ?? [])
    ) {
      return pages;
    }
  }

  return [];
}

async function loadPagesForId(
  chapterId: string,
  fallback?: {
    title?: string;
    alternateTitles?: string[];
    chapter?: string | null;
  },
): Promise<string[]> {
  if (isComickChapterId(chapterId)) {
    return getComickChapterPages(chapterId, fallback);
  }
  if (isWeebCentralId(chapterId)) {
    return getWeebCentralChapterPages(chapterId);
  }
  try {
    const atHome = await getChapterAtHome(chapterId);
    const full = chapterPageUrls(atHome, "data");
    const urls =
      full.length > 0 ? full : chapterPageUrls(atHome, "data-saver");
    return proxiedChapterPageUrls(urls);
  } catch {
    return [];
  }
}
