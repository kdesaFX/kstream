import type { MangaArt } from "@/backend/manga/anilistArt";
import { listAniListManga } from "@/backend/manga/anilistDiscover";
import { listDiscoverManga } from "@/backend/manga/discoverCatalog";
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

/**
 * Featured manga from AniList (banners + HD covers in one request), then
 * MangaDex ids via the shared discover catalog. Skips the old MD→AniList
 * title-search waterfall that made the manga hero lag movies/TV.
 */
export async function fetchFeaturedManga(
  count: number,
): Promise<FeaturedMangaItem[]> {
  // Discover catalog caches AniList internally — fetch it first so the resolve
  // pass reuses the same page instead of double-hitting GraphQL.
  const anilist = await listAniListManga({ kind: "popular", limit: POOL_SIZE });
  const resolved = await listDiscoverManga({ kind: "popular", limit: POOL_SIZE });

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

  const byTitle = new Map(
    resolved.map((item) => [item.title, item] as const),
  );
  // Prefer AniList order / art, but only titles we can actually open.
  const candidates = shuffle(
    anilist
      .map((hit) => {
        const item = byTitle.get(hit.title);
        if (!item) return null;
        return {
          ...item,
          poster: hit.cover || item.poster,
          description: hit.description || item.description,
        } satisfies MangaListItem;
      })
      .filter((item): item is MangaListItem => Boolean(item))
      .filter((item) => item.description?.trim() && item.poster),
  );

  if (candidates.length === 0) {
    // Fallback: resolved list alone (covers may be MangaDex 512).
    const picked = pickFeaturedManga(resolved, art, count);
    return applyAnimeAdaptationArt(picked);
  }

  const picked = pickFeaturedManga(candidates, art, count);
  return applyAnimeAdaptationArt(picked);
}
