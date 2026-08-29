import type { MangaArt } from "@/backend/manga/anilistArt";
import { listAniListManga } from "@/backend/manga/anilistDiscover";
import { listManga } from "@/backend/manga/mangadex";
import { resolveMangaAnimeAdaptations } from "@/backend/manga/mangaLogo";
import type { MangaListItem, MangaStatus } from "@/backend/manga/types";
import { normalizeMangaTitle } from "@/backend/manga/weebcentral";

export interface FeaturedMangaItem {
  id: string;
  title: string;
  overview: string;
  /** Wide art when AniList/TMDB has a banner, cover art otherwise. */
  artUrl: string;
  /** False when the art is a portrait cover being stretched across the hero. */
  wideArt: boolean;
  /** Anime clear logo when TMDB has one for the adaptation. */
  logoUrl?: string;
  /** Rating on a 0-10 scale. */
  rating?: number;
  year?: number;
  status: MangaStatus;
  lastChapter?: string;
  adult: boolean;
}

/** Titles pulled before art / id narrowing. */
const POOL_SIZE = 24;

export function shuffle<T>(
  items: T[],
  random: () => number = Math.random,
): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function toFeatured(
  item: MangaListItem,
  art: MangaArt | undefined,
): FeaturedMangaItem | null {
  const overview = item.description?.trim();
  const image = art?.banner ?? item.poster;
  if (!overview || !image) return null;
  return {
    id: item.id,
    title: item.title,
    overview,
    artUrl: image,
    wideArt: Boolean(art?.banner),
    rating: item.rating,
    year: item.year,
    status: item.status,
    lastChapter: item.lastChapter,
    adult: item.adult,
  };
}

/**
 * Wide AniList banners make the best hero slides. Cover-only titles are a
 * fallback when there aren't enough banners in the pool.
 */
export function pickFeaturedManga(
  items: MangaListItem[],
  art: Map<string, MangaArt>,
  count: number,
): FeaturedMangaItem[] {
  const banners: FeaturedMangaItem[] = [];
  const covers: FeaturedMangaItem[] = [];
  for (const item of items) {
    const featured = toFeatured(item, art.get(item.title));
    if (!featured) continue;
    (featured.wideArt ? banners : covers).push(featured);
  }
  if (banners.length >= count) return banners.slice(0, count);
  return [...banners, ...covers].slice(0, count);
}

/**
 * Prefer the anime adaptation's TMDB backdrop / logo when one exists — those
 * usually read better on the hero than MangaDex covers or AniList banners.
 */
export async function applyAnimeAdaptationArt(
  items: FeaturedMangaItem[],
): Promise<FeaturedMangaItem[]> {
  if (items.length === 0) return items;
  const adaptations = await resolveMangaAnimeAdaptations(
    items.map((item) => item.title),
  );
  return items.map((item) => {
    const anime = adaptations.get(item.title);
    if (!anime) return item;
    // Only swap in anime art when it improves the hero (wide backdrop). A
    // portrait poster must not replace an AniList banner — that left covers
    // stranded on a black field.
    if (anime.backdropUrl) {
      return {
        ...item,
        artUrl: anime.backdropUrl,
        wideArt: true,
        logoUrl: anime.logoUrl ?? item.logoUrl,
      };
    }
    return {
      ...item,
      logoUrl: anime.logoUrl ?? item.logoUrl,
    };
  });
}

function indexByTitle(pool: MangaListItem[]): Map<string, MangaListItem> {
  const byTitle = new Map<string, MangaListItem>();
  for (const item of pool) {
    const primary = normalizeMangaTitle(item.title);
    if (primary && !byTitle.has(primary)) byTitle.set(primary, item);
    for (const alt of item.alternateTitles ?? []) {
      const key = normalizeMangaTitle(alt);
      if (key && !byTitle.has(key)) byTitle.set(key, item);
    }
  }
  return byTitle;
}

/**
 * Featured manga: AniList for banners/covers + one MangaDex popular list for
 * readable ids. Never per-title MD/WC search — that froze the whole homepage
 * hero when the manga tab was selected.
 */
export async function fetchFeaturedManga(
  count: number,
): Promise<FeaturedMangaItem[]> {
  const [anilist, mdPool] = await Promise.all([
    listAniListManga({ kind: "popular", limit: POOL_SIZE }),
    listManga({
      order: "followedCount",
      limit: 48,
      includeStats: false,
    }).catch(() => [] as MangaListItem[]),
  ]);

  const art = new Map<string, MangaArt>();
  for (const hit of anilist) {
    if (!hit.banner && !hit.cover) continue;
    art.set(hit.title, {
      anilistId: hit.anilistId,
      banner: hit.banner,
      score:
        typeof hit.rating === "number"
          ? Math.round(hit.rating * 10)
          : undefined,
    });
  }

  const byTitle = indexByTitle(mdPool);
  const candidateItems: MangaListItem[] = [];
  for (const hit of anilist) {
    const keys = [hit.title, ...hit.alternateTitles].map(normalizeMangaTitle);
    let md: MangaListItem | undefined;
    for (const key of keys) {
      md = byTitle.get(key);
      if (md) break;
    }
    if (!md) continue;
    const merged: MangaListItem = {
      ...md,
      poster: hit.cover || md.poster,
      description: hit.description || md.description,
      rating: hit.rating ?? md.rating,
      year: hit.year ?? md.year,
      status: hit.status !== "unknown" ? hit.status : md.status,
    };
    if (!merged.description?.trim() || !merged.poster) continue;
    candidateItems.push(merged);
  }

  const candidates = shuffle(candidateItems);
  if (candidates.length === 0) {
    // Last resort: MangaDex popular alone (512 covers, may lack banners).
    const picked = pickFeaturedManga(
      mdPool.filter((item) => item.description?.trim() && item.poster),
      art,
      count,
    );
    return applyAnimeAdaptationArt(picked).catch(() => picked);
  }

  const picked = pickFeaturedManga(candidates, art, count);
  // Logos are nice-to-have — don't block the hero if TMDB is slow.
  const withLogos = applyAnimeAdaptationArt(picked);
  const timeout = new Promise<FeaturedMangaItem[]>((resolve) => {
    const timer =
      typeof window !== "undefined" ? window.setTimeout : setTimeout;
    timer(() => resolve(picked), 2500);
  });
  return Promise.race([withLogos.catch(() => picked), timeout]);
}
