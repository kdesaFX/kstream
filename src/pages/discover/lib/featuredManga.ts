import type { MangaArt } from "@/backend/manga/anilistArt";
import { fetchMangaArt } from "@/backend/manga/anilistArt";
import { listManga } from "@/backend/manga/mangadex";
import { resolveMangaAnimeAdaptations } from "@/backend/manga/mangaLogo";
import type { MangaListItem, MangaStatus } from "@/backend/manga/types";

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
  /** MangaDex rating, 0-10. */
  rating?: number;
  year?: number;
  status: MangaStatus;
  lastChapter?: string;
  adult: boolean;
}

/** Titles pulled from MangaDex before art lookup narrows them down. */
const POOL_SIZE = 48;
/** How many of those get an AniList lookup (batched — two requests at 20 each). */
const LOOKUP_SIZE = 48;

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
    return {
      ...item,
      artUrl: anime.backdropUrl ?? anime.posterUrl ?? item.artUrl,
      wideArt: Boolean(anime.backdropUrl) || item.wideArt,
      logoUrl: anime.logoUrl ?? item.logoUrl,
    };
  });
}

export async function fetchFeaturedManga(
  count: number,
): Promise<FeaturedMangaItem[]> {
  const pool = await listManga({ order: "followedCount", limit: POOL_SIZE });
  // Shuffled so the hero isn't the same handful of titles on every visit.
  const candidates = shuffle(
    pool.filter((item) => item.description?.trim() && item.poster),
  ).slice(0, LOOKUP_SIZE);
  if (candidates.length === 0) return [];
  const art = await fetchMangaArt(candidates.map((item) => item.title));
  const picked = pickFeaturedManga(candidates, art, count);
  return applyAnimeAdaptationArt(picked);
}
