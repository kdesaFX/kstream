import type { MangaArt } from "@/backend/manga/anilistArt";
import { fetchMangaArt } from "@/backend/manga/anilistArt";
import { listManga } from "@/backend/manga/mangadex";
import type { MangaListItem, MangaStatus } from "@/backend/manga/types";
import {
  getMediaBackdrop,
  searchTVShows,
} from "@/backend/metadata/tmdb";
import type { TMDBShowSearchResult } from "@/backend/metadata/types/tmdb";

export interface FeaturedMangaItem {
  id: string;
  title: string;
  overview: string;
  /** Wide art when AniList has a banner, cover art otherwise. */
  artUrl: string;
  /** False when the art is a portrait cover being stretched across the hero. */
  wideArt: boolean;
  /** MangaDex rating, 0-10. */
  rating?: number;
  year?: number;
  status: MangaStatus;
  lastChapter?: string;
  adult: boolean;
  animeTitle?: string;
  animeYear?: number;
  animeTmdbId?: number;
}

/** Titles pulled from MangaDex before art lookup narrows them down. */
const POOL_SIZE = 48;
/** How many of those get an AniList lookup (batched — two requests at 20 each). */
const LOOKUP_SIZE = 48;
const animeTmdbCache = new Map<string, TMDBShowSearchResult | null>();

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
  const image = art?.animeBanner ?? art?.banner ?? item.poster;
  if (!overview || !image) return null;
  return {
    id: item.id,
    title: item.title,
    overview,
    artUrl: image,
    wideArt: Boolean(art?.animeBanner ?? art?.banner),
    rating: item.rating,
    year: item.year,
    status: item.status,
    lastChapter: item.lastChapter,
    adult: item.adult,
    animeTitle: art?.animeTitle,
    animeYear: art?.animeYear,
  };
}

function normalizedTitle(title: string): string {
  return title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function pickAnimeTmdbMatch(
  results: TMDBShowSearchResult[],
  animeTitle: string,
  animeYear?: number,
): TMDBShowSearchResult | undefined {
  const wanted = normalizedTitle(animeTitle);
  const exact = results.filter(
    (result) =>
      normalizedTitle(result.name) === wanted ||
      normalizedTitle(result.original_name) === wanted,
  );
  if (exact.length === 0) return undefined;
  if (!animeYear) return exact[0];
  return [...exact].sort((a, b) => {
    const yearA = Number(a.first_air_date?.slice(0, 4)) || 0;
    const yearB = Number(b.first_air_date?.slice(0, 4)) || 0;
    return Math.abs(yearA - animeYear) - Math.abs(yearB - animeYear);
  })[0];
}

async function addAnimePresentation(
  item: FeaturedMangaItem,
): Promise<FeaturedMangaItem> {
  if (!item.animeTitle) return item;
  const key = `${normalizedTitle(item.animeTitle)}:${item.animeYear ?? ""}`;
  if (!animeTmdbCache.has(key)) {
    try {
      const results = await searchTVShows(item.animeTitle);
      animeTmdbCache.set(
        key,
        pickAnimeTmdbMatch(results, item.animeTitle, item.animeYear) ?? null,
      );
    } catch {
      animeTmdbCache.set(key, null);
    }
  }
  const match = animeTmdbCache.get(key);
  if (!match) return item;
  return {
    ...item,
    animeTmdbId: match.id,
    artUrl: getMediaBackdrop(match.backdrop_path) ?? item.artUrl,
    wideArt: Boolean(match.backdrop_path) || item.wideArt,
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
  return Promise.all(picked.map(addAnimePresentation));
}
