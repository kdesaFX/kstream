import { sortMangaLanguages } from "@/backend/manga/languages";
import {
  getComickAlternateHids,
  resolveComickChapters,
} from "@/backend/manga/sources/comick";
import {
  asSingleGroup,
  mergeChapterLists,
} from "@/backend/manga/sources/merge";
import type {
  MangaChapter,
  MangaChapterGroup,
  MangaDetails,
} from "@/backend/manga/types";
import { fetchMirrorChaptersFromServer } from "@/backend/manga/sources/serverResolve";
import { resolveWeebCentralChapters } from "@/backend/manga/weebcentral";

const fallbackCache = new Map<string, Map<string, string[]>>();
const RESOLVE_TTL_MS = 5 * 60 * 1000;
const resolveCache = new Map<
  string,
  { at: number; chapters: MangaChapter[]; groups: MangaChapterGroup[] }
>();

function cacheKey(mangaId: string, language: string) {
  return `${mangaId}:${language}`;
}

export function getChapterFallbackIds(
  mangaId: string,
  language: string,
  chapterId: string,
): string[] {
  return fallbackCache.get(cacheKey(mangaId, language))?.get(chapterId) ?? [];
}

/**
 * MangaDex often keeps only a handful of English chapters for licensed titles
 * (Komi: 288 / 500 / 500.5). Anything this thin needs mirror fill.
 */
export function isSparseMangaDexList(
  chapters: MangaChapter[],
  lastChapter?: string | null,
): boolean {
  if (chapters.length === 0) return true;
  if (chapters.length <= 8) return true;
  const last = parseFloat(String(lastChapter ?? "").trim());
  if (Number.isFinite(last) && last >= 20 && chapters.length < last * 0.2) {
    return true;
  }
  return false;
}

/**
 * Fill gaps from WeebCentral and Comick. For English (or sparse non-EN MD
 * feeds), a larger mirror catalog becomes the spine; MangaDex rows with pages
 * remain as fallbacks. Stores alternate ids for page-load retry.
 *
 * Licensed MangaDex stubs (tiny EN feed) always pull mirrors — even if the UI
 * language preference isn't English — otherwise titles like Komi show 3 chapters.
 */
export async function resolveReadableChapters(
  details: MangaDetails,
  language: string,
): Promise<Pick<MangaDetails, "chapters" | "chapterGroups" | "availableLanguages">> {
  const key = cacheKey(details.id, language);
  const cached = resolveCache.get(key);
  if (cached && Date.now() - cached.at < RESOLVE_TTL_MS) {
    return {
      chapters: cached.chapters,
      chapterGroups: cached.groups,
      availableLanguages: languagesFromChapters(
        details,
        cached.chapters,
        language,
      ),
    };
  }

  const mdChapters = details.chapters.map((ch) => ({
    ...ch,
    source: ch.source ?? ("mangadex" as const),
  }));

  const sparse = isSparseMangaDexList(mdChapters, details.lastChapter);
  const shouldMirror = language === "en" || sparse;

  if (!shouldMirror) {
    const groups =
      details.chapterGroups.length > 0
        ? details.chapterGroups
        : asSingleGroup(mdChapters);
    resolveCache.set(key, { at: Date.now(), chapters: mdChapters, groups });
    fallbackCache.set(key, new Map());
    return {
      chapters: mdChapters,
      chapterGroups: groups,
      availableLanguages: languagesFromChapters(details, mdChapters, language),
    };
  }

  const alternateTitles = details.alternateTitles ?? [];
  const serverMirror = await fetchMirrorChaptersFromServer(
    details.title,
    alternateTitles,
    language,
  );

  let wcChapters: MangaChapter[] | null = null;
  let ckChapters: MangaChapter[] | null = null;

  if (serverMirror?.chapters.length) {
    wcChapters = serverMirror.chapters.filter(
      (ch) => ch.source === "weebcentral",
    );
    ckChapters = serverMirror.chapters.filter((ch) => ch.source === "comick");
    if (wcChapters.length === 0) wcChapters = null;
    if (ckChapters.length === 0) ckChapters = null;
  }

  if (!wcChapters && !ckChapters) {
    [wcChapters, ckChapters] = await Promise.all([
      resolveWeebCentralChapters(details.title, alternateTitles).catch(
        () => null,
      ),
      resolveComickChapters(details.title, alternateTitles).catch(() => null),
    ]);
  }

  // EN (and sparse non-EN): if WC/Comick has a fuller list, use that as the
  // spine and keep only page-bearing MangaDex rows as merge fallbacks.
  const mirrorLarger =
    (wcChapters?.length ?? 0) > mdChapters.length ||
    (ckChapters?.length ?? 0) > mdChapters.length;
  const preferMirrorSpine = mirrorLarger && (language === "en" || sparse);
  const mdForMerge = preferMirrorSpine
    ? mdChapters.filter((ch) => (ch.pages ?? 0) > 0)
    : mdChapters;

  // WeebCentral first — Comick EN HIDs are often image-less stubs.
  const merged = mergeChapterLists([
    ...(wcChapters?.length
      ? [{ source: "weebcentral" as const, chapters: wcChapters }]
      : []),
    ...(ckChapters?.length
      ? [{ source: "comick" as const, chapters: ckChapters }]
      : []),
    { source: "mangadex", chapters: mdForMerge },
  ]);

  const groups = asSingleGroup(merged.chapters);
  resolveCache.set(key, {
    at: Date.now(),
    chapters: merged.chapters,
    groups,
  });
  fallbackCache.set(key, merged.fallbacks);
  enrichComickAlternates(merged.chapters, merged.fallbacks);

  return {
    chapters: merged.chapters,
    chapterGroups: groups,
    availableLanguages: languagesFromChapters(
      details,
      merged.chapters,
      language,
    ),
  };
}

function enrichComickAlternates(
  chapters: MangaChapter[],
  fallbacks: Map<string, string[]>,
) {
  for (const ch of chapters) {
    if (ch.source !== "comick" || !ch.id.startsWith("comick-")) continue;
    const hid = ch.id.slice("comick-".length);
    const alts = getComickAlternateHids(hid).map((alt) => `comick-${alt}`);
    if (alts.length === 0) continue;
    const existing = fallbacks.get(ch.id) ?? [];
    fallbacks.set(ch.id, [
      ...existing,
      ...alts.filter((id) => !existing.includes(id)),
    ]);
  }
}

function languagesFromChapters(
  _details: MangaDetails,
  chapters: MangaChapter[],
  activeLanguage: string,
): string[] {
  const out = new Set<string>();
  // Only languages that actually have chapter rows — MangaDex's
  // availableTranslatedLanguages includes external/licensed stubs.
  for (const ch of chapters) {
    if (ch.translatedLanguage) out.add(ch.translatedLanguage);
  }
  if (activeLanguage) out.add(activeLanguage);
  return sortMangaLanguages([...out]);
}
