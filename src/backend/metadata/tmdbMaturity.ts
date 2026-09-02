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

type RatingLookup = {
  rating: string | null;
  mature: boolean;
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

export function pickUsTvContentRating(
  results: ContentRatingsResponse["results"] | undefined,
): string | null {
  const rating = results?.find((row) => row.iso_3166_1 === "US")?.rating?.trim();
  return rating || null;
}

export function pickUsMovieCertification(
  results: ReleaseDatesResponse["results"] | undefined,
): string | null {
  const us = results?.find((row) => row.iso_3166_1 === "US");
  if (!us?.release_dates?.length) return null;
  for (const entry of us.release_dates) {
    const certification = entry.certification?.trim();
    if (certification) return certification;
  }
  return null;
}

const tvLookupCache = new Map<number, RatingLookup>();
const movieLookupCache = new Map<number, RatingLookup>();

async function lookupTvRating(id: number): Promise<RatingLookup> {
  const cached = tvLookupCache.get(id);
  if (cached) return cached;

  try {
    const res = await get<ContentRatingsResponse>(`/tv/${id}/content_ratings`);
    const results = res.results ?? [];
    const lookup: RatingLookup = {
      rating: pickUsTvContentRating(results),
      mature:
        results.some((row) =>
          isMatureTvContentRating(row.iso_3166_1, row.rating),
        ) ?? false,
    };
    tvLookupCache.set(id, lookup);
    return lookup;
  } catch {
    const lookup = { rating: null, mature: false };
    tvLookupCache.set(id, lookup);
    return lookup;
  }
}

async function lookupMovieRating(id: number): Promise<RatingLookup> {
  const cached = movieLookupCache.get(id);
  if (cached) return cached;

  try {
    const res = await get<ReleaseDatesResponse>(`/movie/${id}/release_dates`);
    const results = res.results ?? [];
    const lookup: RatingLookup = {
      rating: pickUsMovieCertification(results),
      mature:
        results.some((region) =>
          region.release_dates?.some((entry) =>
            isMatureMovieCertification(region.iso_3166_1, entry.certification),
          ),
        ) ?? false,
    };
    movieLookupCache.set(id, lookup);
    return lookup;
  } catch {
    const lookup = { rating: null, mature: false };
    movieLookupCache.set(id, lookup);
    return lookup;
  }
}

async function tvIsMature(id: number): Promise<boolean> {
  return (await lookupTvRating(id)).mature;
}

async function movieIsMature(id: number): Promise<boolean> {
  return (await lookupMovieRating(id)).mature;
}

export async function getUsContentRating(
  id: number,
  type: "movie" | "show",
): Promise<string | null> {
  const lookup =
    type === "show" ? await lookupTvRating(id) : await lookupMovieRating(id);
  return lookup.rating;
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
