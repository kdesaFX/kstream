import { isWeebCentralId } from "@/backend/manga/ids";
import {
  chapterPageUrls,
  getChapterAtHome,
  getMangaDetails as getMangaDexDetails,
  searchManga as searchMangaDex,
} from "@/backend/manga/mangadex";
import type {
  MangaChapter,
  MangaChapterGroup,
  MangaDetails,
  MangaListItem,
} from "@/backend/manga/types";
import {
  findWeebCentralChapters,
  getWeebCentralChapterPages,
  getWeebCentralDetails,
  normalizeMangaTitle,
  searchWeebCentral,
} from "@/backend/manga/weebcentral";

function asSingleGroup(chapters: MangaChapter[]): MangaChapterGroup[] {
  return [{ volume: "none", chapters }];
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
  if (details.chapters.length > 0) return details;

  const chapters = await findWeebCentralChapters(details.title).catch(
    () => null,
  );
  if (!chapters?.length) return details;
  return {
    ...details,
    chapters,
    chapterGroups: asSingleGroup(chapters),
    lastChapter: details.lastChapter ?? chapters.at(-1)?.chapter ?? undefined,
  };
}

export async function getChapterPages(chapterId: string): Promise<string[]> {
  if (isWeebCentralId(chapterId)) {
    return getWeebCentralChapterPages(chapterId);
  }
  const atHome = await getChapterAtHome(chapterId);
  const full = chapterPageUrls(atHome, "data");
  return full.length > 0 ? full : chapterPageUrls(atHome, "data-saver");
}
