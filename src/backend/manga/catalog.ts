import { isWeebCentralId } from "@/backend/manga/ids";
import {
  chapterPageUrls,
  getChapterAtHome,
  getMangaDetails as getMangaDexDetails,
  proxiedChapterPageUrls,
  searchManga as searchMangaDex,
} from "@/backend/manga/mangadex";
import type {
  MangaChapter,
  MangaChapterGroup,
  MangaDetails,
  MangaListItem,
} from "@/backend/manga/types";
import {
  resolveWeebCentralChapters,
  getWeebCentralChapterPages,
  getWeebCentralDetails,
  normalizeMangaTitle,
  searchWeebCentral,
} from "@/backend/manga/weebcentral";

function asSingleGroup(chapters: MangaChapter[]): MangaChapterGroup[] {
  return [{ volume: "none", chapters }];
}

function chapterNumber(ch: MangaChapter | undefined): number | null {
  if (!ch?.chapter) return null;
  const n = parseFloat(ch.chapter);
  return Number.isFinite(n) ? n : null;
}

/**
 * MangaDex often only hosts later chapters (licensed gaps). When WeebCentral
 * has an earlier start or a fuller list, prefer it so "Read" opens at ch. 1.
 */
async function enrichWithWeebCentralChapters(
  details: MangaDetails,
): Promise<MangaDetails> {
  const wcChapters = await resolveWeebCentralChapters(
    details.title,
    details.alternateTitles ?? [],
  ).catch(() => null);
  if (!wcChapters?.length) return details;

  if (details.chapters.length === 0) {
    return {
      ...details,
      chapters: wcChapters,
      chapterGroups: asSingleGroup(wcChapters),
      lastChapter: wcChapters.at(-1)?.chapter ?? details.lastChapter,
    };
  }

  const mdFirst = chapterNumber(details.chapters[0]);
  const wcFirst = chapterNumber(wcChapters[0]);
  if (
    mdFirst != null &&
    wcFirst != null &&
    (wcFirst < mdFirst || mdFirst > 1)
  ) {
    return {
      ...details,
      chapters: wcChapters,
      chapterGroups: asSingleGroup(wcChapters),
      lastChapter: wcChapters.at(-1)?.chapter ?? details.lastChapter,
    };
  }

  if (wcChapters.length > details.chapters.length * 2) {
    return {
      ...details,
      chapters: wcChapters,
      chapterGroups: asSingleGroup(wcChapters),
      lastChapter: wcChapters.at(-1)?.chapter ?? details.lastChapter,
    };
  }

  return details;
}

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

  const details = await getMangaDexDetails(mangaId, preferredLanguage);
  return enrichWithWeebCentralChapters(details);
}

export async function getChapterPages(
  chapterId: string,
  fallback?: {
    title?: string;
    alternateTitles?: string[];
    chapter?: string | null;
  },
): Promise<string[]> {
  const pages = await loadPagesForId(chapterId);
  if (pages.length > 0) return pages;
  if (!fallback?.title) return [];

  const wcChapters = await resolveWeebCentralChapters(
    fallback.title,
    fallback.alternateTitles ?? [],
  ).catch(() => null);
  if (!wcChapters?.length) return [];
  const wanted = fallback.chapter?.trim();
  const match =
    (wanted
      ? wcChapters.find((ch) => ch.chapter === wanted)
      : undefined) ?? wcChapters[0];
  if (!match || match.id === chapterId) return [];
  return loadPagesForId(match.id);
}

async function loadPagesForId(chapterId: string): Promise<string[]> {
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
