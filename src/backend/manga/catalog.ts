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
  getWeebCentralPagesForChapterNumber,
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
  preferredLanguage?: string,
  onPartial?: (details: MangaDetails) => void,
): Promise<MangaDetails> {
  const language = preferredLanguage || "en";
  if (isWeebCentralId(mangaId)) return getWeebCentralDetails(mangaId);

  // Return MangaDex chapters as soon as they're ready; fill WC/Comick gaps after.
  const base = await getMangaDexDetails(mangaId, language);
  onPartial?.(base);

  const resolved = await resolveReadableChapters(base, language);
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
  force?: boolean,
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

    const pages = await loadPagesForId(
      id,
      {
        title: fallback?.title,
        alternateTitles: fallback?.alternateTitles,
        chapter: fallback?.chapter,
      },
      force,
    );
    if (
      pages.length > 0 &&
      pagesBelongToTitle(pages, fallback?.title, fallback?.alternateTitles ?? [])
    ) {
      return pages;
    }
  }

  if (fallback?.title && fallback.chapter?.trim()) {
    const wcPages = await getWeebCentralPagesForChapterNumber(
      fallback.title,
      fallback.alternateTitles ?? [],
      fallback.chapter.trim(),
    );
    if (
      wcPages.length > 0 &&
      pagesBelongToTitle(
        wcPages,
        fallback.title,
        fallback.alternateTitles ?? [],
      )
    ) {
      return wcPages;
    }
  }

  return [];
}

const PAGE_LIST_TTL_MS = 10 * 60 * 1000;
const pageListCache = new Map<string, { at: number; pages: string[] }>();

async function loadPagesForId(
  chapterId: string,
  fallback?: {
    title?: string;
    alternateTitles?: string[];
    chapter?: string | null;
  },
  force?: boolean,
): Promise<string[]> {
  if (!force) {
    const cached = pageListCache.get(chapterId);
    if (cached && Date.now() - cached.at < PAGE_LIST_TTL_MS) {
      return cached.pages;
    }
  } else {
    pageListCache.delete(chapterId);
  }

  let pages: string[] = [];
  if (isComickChapterId(chapterId)) {
    pages = await getComickChapterPages(chapterId, fallback);
  } else if (isWeebCentralId(chapterId)) {
    pages = await getWeebCentralChapterPages(chapterId);
  } else {
    try {
      const atHome = await getChapterAtHome(chapterId, force);
      const full = chapterPageUrls(atHome, "data");
      const urls =
        full.length > 0 ? full : chapterPageUrls(atHome, "data-saver");
      pages = proxiedChapterPageUrls(urls);
    } catch {
      pages = [];
    }
  }

  if (pages.length > 0) {
    pageListCache.set(chapterId, { at: Date.now(), pages });
  }
  return pages;
}

/** Warm chapter page URL list and kick off the first few image downloads. */
export function prefetchChapterPages(
  chapterId: string,
  fallback?: {
    mangaId?: string;
    language?: string;
    title?: string;
    alternateTitles?: string[];
    chapter?: string | null;
  },
  imageCount = 3,
): void {
  void getChapterPages(chapterId, fallback)
    .then((urls) => {
      if (typeof window === "undefined") return;
      for (const url of urls.slice(0, imageCount)) {
        const img = new Image();
        img.decoding = "async";
        img.src = url;
      }
    })
    .catch(() => {
      // Prefetch is best-effort
    });
}
