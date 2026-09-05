import { fetchFeaturedManga } from "@/pages/discover/lib/featuredManga";
import type { FeaturedMangaItem } from "@/pages/discover/lib/featuredManga";
import {
  getHistorySources,
  hasFeaturedAlgorithmSignal,
} from "@/pages/discover/hooks/usePersonalRecommendations";
import {
  type ProgressSource,
  type RatingSource,
  fetchPersonalRecommendations,
} from "@/pages/discover/lib/personalRecommendations";
import { hydrateMissingCompletedGenres } from "@/pages/discover/lib/watchHistoryGenres";
import {
  get,
  getAllTimeBestMovies,
  getAllTimeBestShows,
} from "@/backend/metadata/tmdb";
import {
  getDiscoverContent,
  isTraktEnabled,
} from "@/backend/metadata/traktApi";
import { Movie, TVShow } from "@/pages/discover/common";
import type { MangaStatus } from "@/backend/manga/types";
import { useProgressStore } from "@/stores/progress";
import { progressMediaIsHighPercentage } from "@/stores/progress/utils";
import { usePreferencesStore } from "@/stores/preferences";
import { useRatingsStore } from "@/stores/ratings";
import { useWatchHistoryStore } from "@/stores/watchHistory";
import { shouldAllowMatureTitles } from "@/utils/media/mature";
import { resolveCardArtworkUrl, tmdbBackdropSize } from "@/utils/media/artwork";
import { pickFastLogoUrl } from "@/utils/media/logoBackground";

export type FeaturedHeroCategory = "movies" | "tvshows" | "manga";

export interface FeaturedMedia extends Partial<Omit<Movie & TVShow, "id">> {
  /** TMDB numeric id, or a MangaDex UUID for manga. */
  id: number | string;
  backdrop_path?: string;
  overview: string;
  title?: string;
  name?: string;
  type: "movie" | "show" | "manga";
  vote_average?: number;
  vote_count?: number;
  number_of_seasons?: number;
  imdb_rating?: number;
  imdb_votes?: number;
  external_ids?: {
    imdb_id?: string;
  };
  /** Absolute art URL for sources without TMDB backdrops (manga). */
  artUrl?: string;
  /** False when the art is a portrait cover rather than a wide banner. */
  wideArt?: boolean;
  /** Pre-resolved clear logo (manga anime adaptations). */
  logoUrl?: string;
  /** MangaDex rating, 0-10. */
  mangaRating?: number;
  mangaStatus?: MangaStatus;
  mangaLastChapter?: string;
  year?: number;
}

export const FEATURED_SLIDE_QUANTITY = 12;
const FEATURED_RECENT_KEY = "kstream::featured-recent-ids";
const FEATURED_RECENT_MAX = 48;

function shuffleList<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function readRecentFeaturedIds(): number[] {
  try {
    const raw = localStorage.getItem(FEATURED_RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);
  } catch {
    return [];
  }
}

function writeRecentFeaturedIds(ids: number[]) {
  try {
    const unique: number[] = [];
    const seen = new Set<number>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      unique.push(id);
      if (unique.length >= FEATURED_RECENT_MAX) break;
    }
    localStorage.setItem(FEATURED_RECENT_KEY, JSON.stringify(unique));
  } catch {
    // ignore quota / private mode
  }
}

/** Prefer titles the user hasn't seen in the hero lately; fill with the rest. */
export function pickAvoidingRecent(ids: number[], count: number): number[] {
  const recent = new Set(readRecentFeaturedIds());
  const shuffled = shuffleList(ids);
  const fresh = shuffled.filter((id) => !recent.has(id));
  const reused = shuffled.filter((id) => recent.has(id));
  const picked = [...fresh, ...reused].slice(0, count);
  writeRecentFeaturedIds([...picked, ...readRecentFeaturedIds()]);
  return picked;
}

function isFeatureWorthy(item: {
  backdrop_path?: string | null;
  overview?: string | null;
}) {
  return Boolean(item?.backdrop_path && item?.overview?.trim());
}

export function mangaToFeatured(item: FeaturedMangaItem): FeaturedMedia {
  return {
    id: item.id,
    title: item.title,
    overview: item.overview,
    type: "manga",
    artUrl: item.artUrl,
    wideArt: item.wideArt,
    logoUrl: item.logoUrl,
    mangaRating: item.rating,
    mangaStatus: item.status,
    mangaLastChapter: item.lastChapter,
    year: item.year,
  };
}

export function featuredBackdropUrl(item: FeaturedMedia): string | undefined {
  if (item.type === "manga") {
    return resolveCardArtworkUrl(item.artUrl) ?? undefined;
  }
  if (!item.backdrop_path) return undefined;
  const quality =
    usePreferencesStore.getState().backdropQuality ?? "high";
  return `https://image.tmdb.org/t/p/${tmdbBackdropSize(quality)}${item.backdrop_path}`;
}

export async function preloadFeaturedBackdrop(
  item: FeaturedMedia | undefined,
): Promise<void> {
  if (!item || typeof Image === "undefined") return;
  const url = featuredBackdropUrl(item);
  if (!url) return;
  await new Promise<void>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    img.src = url;
    if (typeof img.decode === "function") {
      void img.decode().then(done).catch(done);
    }
  });
}

export interface FetchFeaturedHeroOptions {
  category: FeaturedHeroCategory;
  language: string;
  /** Skip personalization (boot gate often races ahead of auth restore). */
  includePersonalization?: boolean;
  slideQuantity?: number;
}

/**
 * Shared featured-hero fetch used by boot warmup and FeaturedCarousel.
 */
export async function fetchFeaturedHeroMedia(
  options: FetchFeaturedHeroOptions,
): Promise<FeaturedMedia[]> {
  const {
    category,
    language,
    includePersonalization = true,
    slideQuantity = FEATURED_SLIDE_QUANTITY,
  } = options;

  if (category === "manga") {
    const mangaItems = await fetchFeaturedManga(slideQuantity);
    return mangaItems.map(mangaToFeatured);
  }

  if (category !== "movies" && category !== "tvshows") {
    return [];
  }

  const mediaKind = category === "movies" ? "movie" : "tv";
  const mediaType = category === "movies" ? "movie" : "show";
  const isTVShow = category === "tvshows";

  const fetchDetailsForIds = async (ids: number[]) => {
    const details = await Promise.all(
      ids.map((id) =>
        get<any>(`/${mediaKind}/${id}`, {
          language,
          append_to_response: "external_ids,images",
          include_image_language: `${language},en,null`,
        }).catch(() => null),
      ),
    );
    return details
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter(isFeatureWorthy)
      .filter((item) => shouldAllowMatureTitles() || item.adult !== true)
      .map((item) => ({
        ...item,
        type: mediaType as "movie" | "show",
        adult: item.adult === true,
        // Prefetch logo URL with the detail payload so the hero never flashes
        // plain title text while a second /images round-trip + canvas probe runs.
        logoUrl:
          pickFastLogoUrl(item.images?.logos ?? [], language, "w300") ??
          undefined,
      }));
  };

  const fetchTmdbPoolIds = async (limit: number) => {
    const pool =
      category === "movies"
        ? await getAllTimeBestMovies(limit)
        : await getAllTimeBestShows(limit);
    return pool.map((item) => item.id).filter((id) => Number.isFinite(id));
  };

  let candidateIds: number[] = [];
  let personalSeedCount = 0;

  if (includePersonalization && hasFeaturedAlgorithmSignal(isTVShow)) {
    try {
      await hydrateMissingCompletedGenres(15);
      const history = getHistorySources(useWatchHistoryStore.getState().items);
      const progressItems = useProgressStore.getState().items;
      const progress: ProgressSource[] = Object.entries(progressItems)
        .filter(([, item]) => progressMediaIsHighPercentage(item))
        .map(([tmdbId, item]) => ({
          tmdbId,
          type: item.type,
          updatedAt: item.updatedAt,
        }));
      const ratingItems = useRatingsStore.getState().ratings;
      const ratings: RatingSource[] = Object.entries(ratingItems).map(
        ([tmdbId, item]) => ({
          tmdbId,
          type: item.type,
          rating: item.rating,
          genreIds: item.genreIds,
          ratedAt: item.ratedAt,
        }),
      );
      const preferences = useRatingsStore.getState().preferences;
      const excludeIds = new Set<string>();
      for (const key of Object.keys(useWatchHistoryStore.getState().items)) {
        excludeIds.add(key.includes("-") ? key.split("-")[0]! : key);
      }
      for (const id of Object.keys(progressItems)) excludeIds.add(id);

      const personal = await fetchPersonalRecommendations(
        isTVShow,
        history,
        progress,
        excludeIds,
        ratings,
        preferences,
      );
      candidateIds = personal
        .map((item) => Number(item.id))
        .filter((id) => Number.isFinite(id) && id > 0);
      personalSeedCount = candidateIds.length;
    } catch (personalError) {
      console.error("Featured carousel personalization failed:", personalError);
    }
  }

  try {
    if (!isTraktEnabled()) throw new Error("TRAKT_DISABLED");
    const discoverData = await getDiscoverContent();
    const traktIds =
      category === "movies"
        ? discoverData.movie_tmdb_ids || []
        : discoverData.tv_tmdb_ids || [];
    const seen = new Set(candidateIds);
    for (const id of traktIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      candidateIds.push(id);
    }
  } catch (traktError) {
    if (
      !(traktError instanceof Error) ||
      traktError.message !== "TRAKT_DISABLED"
    ) {
      console.error("Error fetching from Trakt discover:", traktError);
    }
  }

  if (candidateIds.length < slideQuantity * 3) {
    const tmdbIds = await fetchTmdbPoolIds(60);
    const seen = new Set(candidateIds);
    for (const id of tmdbIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      candidateIds.push(id);
    }
  }

  const personalPool = candidateIds.slice(0, personalSeedCount);
  const discoverPool = candidateIds.slice(personalSeedCount);
  const primaryPool = personalPool.length > 0 ? personalPool : discoverPool;
  const backupPool = personalPool.length > 0 ? discoverPool : [];

  const pickedIds = pickAvoidingRecent(
    primaryPool,
    Math.min(slideQuantity, primaryPool.length),
  );
  let mediaItems = await fetchDetailsForIds(pickedIds);

  if (mediaItems.length < slideQuantity && backupPool.length > 0) {
    const have = new Set(mediaItems.map((item) => item.id));
    const more = pickAvoidingRecent(
      backupPool.filter((id) => !have.has(id)),
      slideQuantity,
    );
    const extras = await fetchDetailsForIds(more);
    mediaItems = [...mediaItems, ...extras];
  }

  if (mediaItems.length < slideQuantity) {
    const extraIds = await fetchTmdbPoolIds(40);
    const have = new Set(mediaItems.map((item) => item.id));
    const more = pickAvoidingRecent(
      extraIds.filter((id) => !have.has(id)),
      slideQuantity,
    );
    const extras = await fetchDetailsForIds(more);
    mediaItems = [...mediaItems, ...extras];
  }

  const unique: FeaturedMedia[] = [];
  const seenMedia = new Set<number>();
  for (const item of mediaItems) {
    const id = Number(item.id);
    if (!Number.isFinite(id) || seenMedia.has(id)) continue;
    seenMedia.add(id);
    unique.push(item as FeaturedMedia);
    if (unique.length >= slideQuantity) break;
  }
  return unique;
}
