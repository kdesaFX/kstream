import { get } from "@/backend/metadata/tmdb";
import {
  TMDBContentTypes,
  TMDBMovieSearchResult,
  TMDBShowSearchResult,
} from "@/backend/metadata/types/tmdb";
import type { MediaItem } from "@/utils/media/mediaTypes";

type ContentRatingsResponse = {
  results: Array<{ iso_3166_1: string; rating: string }>;
};

type ReleaseDatesResponse = {
  results: Array<{
    iso_3166_1: string;
    release_dates: Array<{ certification: string }>;
  }>;
};

const MATURE_TV_US = new Set(["TV-MA"]);
/** GB 18, AU R18+, etc. */
const MATURE_CERT_INTL = new Set(["18", "R18", "R18+"]);
const MATURE_MOVIE_US = new Set(["NC-17"]);

export function isMatureTvContentRating(
  iso: string,
  rating: string,
): boolean {
  if (iso === "US") return MATURE_TV_US.has(rating);
  return MATURE_CERT_INTL.has(rating);
}

export function isMatureMovieCertification(
  iso: string,
  certification: string,
): boolean {
  if (!certification) return false;
  if (iso === "US") return MATURE_MOVIE_US.has(certification);
  return MATURE_CERT_INTL.has(certification);
}

const tvMatureCache = new Map<number, boolean>();
const movieMatureCache = new Map<number, boolean>();

async function tvIsMature(id: number): Promise<boolean> {
  const cached = tvMatureCache.get(id);
  if (cached !== undefined) return cached;
  try {
    const res = await get<ContentRatingsResponse>(`/tv/${id}/content_ratings`);
    const mature =
      res.results?.some((row) =>
        isMatureTvContentRating(row.iso_3166_1, row.rating),
      ) ?? false;
    tvMatureCache.set(id, mature);
    return mature;
  } catch {
    tvMatureCache.set(id, false);
    return false;
  }
}

async function movieIsMature(id: number): Promise<boolean> {
  const cached = movieMatureCache.get(id);
  if (cached !== undefined) return cached;
  try {
    const res = await get<ReleaseDatesResponse>(`/movie/${id}/release_dates`);
    const mature =
      res.results?.some((region) =>
        region.release_dates?.some((entry) =>
          isMatureMovieCertification(region.iso_3166_1, entry.certification),
        ),
      ) ?? false;
    movieMatureCache.set(id, mature);
    return mature;
  } catch {
    movieMatureCache.set(id, false);
    return false;
  }
}

/** TMDB search often leaves `adult: false` on TV-MA titles — look up ratings. */
export async function enrichSearchResultsMaturity(
  raw: (TMDBMovieSearchResult | TMDBShowSearchResult)[],
  items: MediaItem[],
): Promise<void> {
  await Promise.all(
    raw.map(async (entry, index) => {
      const item = items[index];
      if (!item || item.adult) return;

      let mature = entry.adult === true;
      if (!mature && entry.media_type === TMDBContentTypes.TV) {
        mature = await tvIsMature(entry.id);
      } else if (!mature && entry.media_type === TMDBContentTypes.MOVIE) {
        mature = await movieIsMature(entry.id);
      }
      if (mature) item.adult = true;
    }),
  );
}

export async function enrichMediaItemMaturity(
  item: MediaItem,
  type: TMDBContentTypes,
): Promise<void> {
  if (item.adult) return;
  const id = Number(item.id);
  if (!Number.isFinite(id)) return;
  if (type === TMDBContentTypes.TV) {
    if (await tvIsMature(id)) item.adult = true;
  } else if (type === TMDBContentTypes.MOVIE) {
    if (await movieIsMature(id)) item.adult = true;
  }
}
