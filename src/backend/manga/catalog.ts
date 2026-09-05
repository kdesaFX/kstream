import { isWeebCentralId } from "@/backend/manga/ids";
import { mangaMark, mangaMeasure } from "@/backend/manga/mangaTiming";
import {
  clearPersistedPageCache,
  readPersistedPageCache,
  writePersistedPageCache,
} from "@/backend/manga/pageCache";
import {
  racePageSourcesPool,
  type PageSourceTask,
} from "@/backend/manga/pageSourcePool";
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
  pagesValidForManga,
  searchWeebCentral,
} from "@/backend/manga/weebcentral";
import { chapterPrefixFromPageUrl } from "../../../lib/manga-page-title";

const detailsInFlight = new Map<string, Promise<MangaDetails>>();

/**
 * Weeb Central first so search picks land on WC ids when possible; MangaDex
 * fills titles WC doesn't have (still useful as metadata spine).
 */
export async function searchManga(
  title: string,
  limit = 24,
): Promise<MangaListItem[]> {
  const [md, wc] = await Promise.all([
    searchMangaDex(title, limit).catch(() => [] as MangaListItem[]),
    searchWeebCentral(title, Math.min(limit, 16)).catch(
      () => [] as MangaListItem[],
    ),
  ]);
  const seen = new Set(wc.map((item) => normalizeMangaTitle(item.title)));
  const extra = md.filter((item) => !seen.has(normalizeMangaTitle(item.title)));
  return [...wc, ...extra].slice(0, limit);
}

export async function getMangaDetails(
  mangaId: string,
  preferredLanguage?: string,
  onPartial?: (details: MangaDetails) => void,
): Promise<MangaDetails> {
  const language = preferredLanguage || "en";
  const key = `${mangaId}:${language}`;
  const existing = detailsInFlight.get(key);
  if (existing) {
    if (onPartial) void existing.then(onPartial).catch(() => undefined);
    return existing;
  }

  const promise = (async () => {
    if (isWeebCentralId(mangaId)) return getWeebCentralDetails(mangaId);

    mangaMark("details-md-start");
    const base = await getMangaDexDetails(mangaId, language);
    mangaMark("details-md-end");
    mangaMeasure("details-md", "details-md-start", "details-md-end");
    onPartial?.(base);

    mangaMark("details-resolve-start");
    const resolved = await resolveReadableChapters(base, language);
    mangaMark("details-resolve-end");
    mangaMeasure("details-resolve", "details-resolve-start", "details-resolve-end");
    return { ...base, ...resolved };
  })();

  detailsInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    detailsInFlight.delete(key);
  }
}

export type ChapterPageFallback = {
  mangaId?: string;
  language?: string;
  title?: string;
  alternateTitles?: string[];
  chapter?: string | null;
  /** Licensed MangaDex stub — skip slow at-home attempt. */
  mangadexStub?: boolean;
};

async function fetchPagesViaApi(
  chapterId: string,
  fallback?: ChapterPageFallback,
): Promise<string[] | null> {
  if (typeof fetch === "undefined") return null;
  try {
    const params = new URLSearchParams({ chapterId });
    if (fallback?.title) params.set("title", fallback.title);
    if (fallback?.chapter?.trim()) params.set("chapter", fallback.chapter.trim());
    if (fallback?.alternateTitles?.length) {
      params.set("alts", fallback.alternateTitles.slice(0, 16).join("\n"));
    }
    // Bust CDN entries cached before mixed-series / chapter-prefix checks.
    params.set("v", "7");
    const res = await fetch(`/api/manga/pages?${params.toString()}`, {
      signal: AbortSignal.timeout(28000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { pages?: string[] };
    const pages = data.pages?.length ? data.pages : null;
    if (!pages) return null;
    // API historically skipped title checks — reject foreign series here.
    // Do not gate on fallback.chapter: it can be stale while clicking Next, and
    // the chapterId response is already the pages for that id.
    if (
      fallback?.title &&
      !pagesValidForManga(
        pages,
        fallback.title,
        fallback.alternateTitles ?? [],
        null,
      )
    ) {
      return null;
    }
    return pages;
  } catch {
    return null;
  }
}

const PAGE_LIST_TTL_MS = 10 * 60 * 1000;
const pageListCache = new Map<
  string,
  { at: number; pages: string[]; chapter?: string | null }
>();

function inferChapterFromPages(pages: string[]): string | null {
  const prefixes = pages
    .map(chapterPrefixFromPageUrl)
    .filter((n): n is number => n != null);
  if (prefixes.length === 0) return null;
  const first = prefixes[0];
  return prefixes.every((n) => n === first) ? String(first) : null;
}

function cachePages(
  chapterId: string,
  pages: string[],
  chapter?: string | null,
): void {
  const inferred = inferChapterFromPages(pages);
  const storedChapter = inferred ?? chapter?.trim() ?? null;
  pageListCache.set(chapterId, {
    at: Date.now(),
    pages,
    chapter: storedChapter,
  });
  writePersistedPageCache(chapterId, pages, storedChapter);
}

/** Drop memory + session page lists for a chapter (or all, if omitted). */
export function clearChapterPagesCache(chapterId?: string): void {
  if (!chapterId) {
    pageListCache.clear();
    return;
  }
  pageListCache.delete(chapterId);
  clearPersistedPageCache(chapterId);
}

export async function getChapterPages(
  chapterId: string,
  fallback?: ChapterPageFallback,
  force?: boolean,
): Promise<string[]> {
  mangaMark("pages-start");
  const wantedChapter = fallback?.chapter?.trim() || null;
  const primaryIsMirror =
    isWeebCentralId(chapterId) || isComickChapterId(chapterId);
  const cacheChapterGate = primaryIsMirror ? null : wantedChapter;

  if (!force) {
    const persisted = primaryIsMirror
      ? readPersistedPageCache(chapterId)
      : readPersistedPageCache(chapterId, wantedChapter);
    if (persisted?.length) {
      const title = fallback?.title;
      const alts = fallback?.alternateTitles ?? [];
      const inferred = inferChapterFromPages(persisted);
      // When the caller knows the chapter for THIS id (from the chapter list),
      // reject cached art that belongs to a different number (Next-button poison).
      const chapterMismatch =
        primaryIsMirror &&
        wantedChapter &&
        inferred &&
        inferred !== wantedChapter;
      if (
        !chapterMismatch &&
        pagesValidForManga(persisted, title, alts, cacheChapterGate)
      ) {
        pageListCache.set(chapterId, {
          at: Date.now(),
          pages: persisted,
          chapter: inferred ?? wantedChapter,
        });
        mangaMark("pages-end");
        mangaMeasure("pages", "pages-start", "pages-end");
        return persisted;
      }
      clearPersistedPageCache(chapterId);
      pageListCache.delete(chapterId);
    }
    const cached = pageListCache.get(chapterId);
    if (cached && Date.now() - cached.at < PAGE_LIST_TTL_MS) {
      const title = fallback?.title;
      const alts = fallback?.alternateTitles ?? [];
      const inferred = inferChapterFromPages(cached.pages);
      const chapterMismatch =
        primaryIsMirror &&
        wantedChapter &&
        inferred &&
        inferred !== wantedChapter;
      if (
        !chapterMismatch &&
        pagesValidForManga(cached.pages, title, alts, cacheChapterGate)
      ) {
        mangaMark("pages-end");
        mangaMeasure("pages", "pages-start", "pages-end");
        return cached.pages;
      }
      pageListCache.delete(chapterId);
    }
  } else {
    pageListCache.delete(chapterId);
  }

  const pageContext = {
    title: fallback?.title,
    alternateTitles: fallback?.alternateTitles,
    chapter: fallback?.chapter,
  };
  const stub = fallback?.mangadexStub === true;

  const altIds: string[] = [];
  if (fallback?.mangaId && fallback.language) {
    for (const alt of getChapterFallbackIds(
      fallback.mangaId,
      fallback.language,
      chapterId,
    )) {
      if (alt !== chapterId && !altIds.includes(alt)) altIds.push(alt);
    }
  }

  const isMirrorChapterId = (id: string) =>
    isWeebCentralId(id) || isComickChapterId(id);

  // WC / Comick first — avoid burning MangaDex guest at-home when a mirror
  // id is already selected or available as a fallback.
  const mirrorIds: string[] = [];
  const mangadexIds: string[] = [];
  const pushId = (id: string) => {
    if (isMirrorChapterId(id)) {
      if (!mirrorIds.includes(id)) mirrorIds.push(id);
    } else if (!mangadexIds.includes(id)) {
      mangadexIds.push(id);
    }
  };
  pushId(chapterId);
  for (const alt of altIds) pushId(alt);

  // Race only id-based sources. Looking up by chapter number in parallel used to
  // win with a stale fallback.chapter (e.g. "30") and cachePages(ch19Id, 0030…).
  const tasks: PageSourceTask[] = [];
  for (const id of mirrorIds) {
    tasks.push(() => fetchPagesViaApi(id, fallback));
    tasks.push(() => tryLoadPagesForId(id, pageContext, force));
  }
  if (!stub) {
    for (const id of mangadexIds) {
      tasks.push(() => fetchPagesViaApi(id, fallback));
      tasks.push(() => tryLoadPagesForId(id, pageContext, force));
    }
  }

  let hit = await racePageSourcesPool(tasks);

  // By chapter number only for non-mirror ids (e.g. MangaDex stubs). Never for
  // WC/Comick — a stale fallback.chapter was rejecting the real id pages or
  // caching the wrong chapter under this id as the user hit Next.
  if (
    !hit?.length &&
    !primaryIsMirror &&
    fallback?.title &&
    fallback.chapter?.trim()
  ) {
    const title = fallback.title;
    const alts = fallback.alternateTitles ?? [];
    const chapterNum = fallback.chapter.trim();
    const pages = await getWeebCentralPagesForChapterNumber(
      title,
      alts,
      chapterNum,
    );
    if (pages.length > 0 && pagesValidForManga(pages, title, alts, chapterNum)) {
      hit = pages;
    }
  }

  if (hit?.length) {
    const title = fallback?.title;
    const alts = fallback?.alternateTitles ?? [];
    // Mirror ids: trust the id fetch; only enforce title / mixed-series checks.
    // Chapter-number match is required for by-number / MD fallback results.
    const chapterGate = primaryIsMirror ? null : wantedChapter;
    if (!pagesValidForManga(hit, title, alts, chapterGate)) {
      mangaMark("pages-end");
      mangaMeasure("pages", "pages-start", "pages-end");
      return [];
    }
    cachePages(chapterId, hit, wantedChapter);
    mangaMark("pages-end");
    mangaMeasure("pages", "pages-start", "pages-end");
    return hit;
  }

  mangaMark("pages-end");
  mangaMeasure("pages", "pages-start", "pages-end");
  return [];
}

async function tryLoadPagesForId(
  chapterId: string,
  fallback?: {
    title?: string;
    alternateTitles?: string[];
    chapter?: string | null;
  },
  force?: boolean,
): Promise<string[] | null> {
  const pages = await loadPagesForId(chapterId, fallback, force);
  if (pages.length === 0) return null;
  // Id fetch: enforce series match only. Chapter hint can be stale while
  // clicking Next; the HTML for this id is source of truth.
  if (
    !pagesValidForManga(
      pages,
      fallback?.title,
      fallback?.alternateTitles ?? [],
      null,
    )
  ) {
    return null;
  }
  return pages;
}

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
      if (
        pagesValidForManga(
          cached.pages,
          fallback?.title,
          fallback?.alternateTitles ?? [],
          null,
        )
      ) {
        return cached.pages;
      }
      pageListCache.delete(chapterId);
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

  if (
    pages.length > 0 &&
    pagesValidForManga(
      pages,
      fallback?.title,
      fallback?.alternateTitles ?? [],
      null,
    )
  ) {
    pageListCache.set(chapterId, {
      at: Date.now(),
      pages,
      chapter: inferChapterFromPages(pages),
    });
  }
  return pages;
}

/** Warm chapter page URL list and kick off the first few image downloads. */
export function prefetchChapterPages(
  chapterId: string,
  fallback?: ChapterPageFallback,
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
