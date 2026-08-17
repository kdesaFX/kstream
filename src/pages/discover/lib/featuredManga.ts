import type { MangaArt } from "@/backend/manga/anilistArt";
import { fetchMangaArt } from "@/backend/manga/anilistArt";
import { listManga } from "@/backend/manga/mangadex";
import type { MangaListItem, MangaStatus } from "@/backend/manga/types";

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
}

/** Titles pulled from MangaDex before art lookup narrows them down. */
const POOL_SIZE = 48;
/** How many of those get an AniList lookup (batched, so this is 2 requests). */
const LOOKUP_SIZE = 24;

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
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
 * A portrait cover stretched across a full-bleed hero looks bad, so titles with
 * a real banner come first and covers only fill leftover slots.
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
  return pickFeaturedManga(candidates, art, count);
}
