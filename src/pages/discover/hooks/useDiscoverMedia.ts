import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  get,
  getAllTimeBestMovies,
  getAllTimeBestShows,
} from "@/backend/metadata/tmdb";
import {
  PROVIDER_TO_TRAKT_MAP,
  getAppleMovieReleases,
  getAppleTVReleases,
  getDisneyMovies,
  getDisneyTVShows,
  getHBOMovies,
  getHBOTVShows,
  getHuluMovies,
  getHuluTVShows,
  getLatest4KReleases,
  getLatestReleases,
  getLatestTVReleases,
  getNetflixMovies,
  getNetflixTVShows,
  getParamountMovies,
  getParamountTVShows,
  getPrimeMovies,
  getPrimeTVShows,
  getTop10Movies,
  isTraktEnabled,
} from "@/backend/metadata/traktApi";
import { paginateResults } from "@/backend/metadata/traktFunctions";
import type { TraktListResponse } from "@/backend/metadata/types/trakt";
import { MOVIE_PROVIDERS, TV_PROVIDERS } from "@/pages/discover/types/discover";
import type {
  DiscoverContentType,
  DiscoverMedia,
  Genre,
  MediaType,
  Provider,
  UseDiscoverMediaProps,
  UseDiscoverMediaReturn,
} from "@/pages/discover/types/discover";
import { useLanguageStore } from "@/stores/language";
import { usePreferencesStore } from "@/stores/preferences";
import { getTmdbLanguageCode } from "@/utils/locale/language";
import {
  detectUserLanguage,
  detectUserRegion,
} from "@/utils/locale/userRegion";
import {
  filterOutMatureMedia,
  tmdbIncludeAdult,
} from "@/utils/media/mature";

const DISCOVER_OPTIONS_LIMIT = 50;
const TMDB_CACHE_TTL_MS = 15 * 60 * 1000;

const discoverOptionsCache = new Map<string, Genre[]>();
const discoverOptionsInFlight = new Map<string, Promise<Genre[]>>();

const tmdbResponseCache = new Map<string, { builtAt: number; data: any }>();
const tmdbInFlight = new Map<string, Promise<any>>();

function serializeParams(params: Record<string, unknown>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}:${String(params[key])}`)
    .join("|");
}

function buildTmdbCacheKey(
  endpoint: string,
  params: Record<string, unknown>,
): string {
  return `${endpoint}?${serializeParams(params)}`;
}

async function fetchTmdbCached(
  endpoint: string,
  params: Record<string, unknown>,
): Promise<any> {
  const key = buildTmdbCacheKey(endpoint, params);
  const now = Date.now();
  const cached = tmdbResponseCache.get(key);

  if (cached && now - cached.builtAt < TMDB_CACHE_TTL_MS) {
    return cached.data;
  }

  const pending = tmdbInFlight.get(key);
  if (pending) return pending;

  const request = get<any>(endpoint, params)
    .then((data) => {
      tmdbResponseCache.set(key, { builtAt: Date.now(), data });
      return data;
    })
    .finally(() => {
      tmdbInFlight.delete(key);
    });

  tmdbInFlight.set(key, request);
  return request;
}

// Re-export types for backward compatibility
export type {
  DiscoverContentType,
  DiscoverMedia,
  Genre,
  MediaType,
  Provider,
  UseDiscoverMediaProps,
  UseDiscoverMediaReturn,
};

// Re-export constants for backward compatibility
export { MOVIE_PROVIDERS, TV_PROVIDERS };

// Marks a Trakt call skipped because Trakt is disabled for this deployment,
// so callers can fall back to TMDB without logging it as a real failure.
class TraktDisabledError extends Error {
  constructor() {
    super("Trakt is disabled for this deployment");
  }
}

function normalizeGenreIds(item: any): number[] {
  if (Array.isArray(item.genre_ids) && item.genre_ids.length > 0) {
    return item.genre_ids;
  }
  if (Array.isArray(item.genres)) {
    return item.genres
      .map((g: { id?: number }) => g?.id)
      .filter((id: number | undefined): id is number => typeof id === "number");
  }
  return [];
}

function filterResultsByGenre(
  results: DiscoverMedia[],
  genreId: string | null | undefined,
): DiscoverMedia[] {
  if (!genreId) return results;
  const genreNum = Number(genreId);
  if (!Number.isFinite(genreNum)) return results;
  return results.filter((item) => {
    const ids = normalizeGenreIds(item);
    return ids.includes(genreNum);
  });
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Hide unreleased / future titles from discover carousels.
 * Items with no date are kept (some Trakt rows); year-only stubs are dropped.
 */
function filterReleasedDiscoverMedia(
  results: DiscoverMedia[],
  today: string = todayIsoDate(),
): DiscoverMedia[] {
  return results.filter((item) => {
    if (item.id == null) return false;
    const date = item.release_date || item.first_air_date || "";
    if (!date) return true;
    if (date.length < 10) return false;
    return date <= today;
  });
}

function recentReleaseDateParams(
  mediaType: MediaType,
  today: string,
  monthsBack: number,
): Record<string, string> {
  const from = new Date();
  from.setMonth(from.getMonth() - monthsBack);
  const fromStr = from.toISOString().slice(0, 10);
  return mediaType === "movie"
    ? {
        "primary_release_date.gte": fromStr,
        "primary_release_date.lte": today,
      }
    : {
        "first_air_date.gte": fromStr,
        "first_air_date.lte": today,
      };
}

/**
 * Enough items for a full carousel after unreleased-filter + cross-row
 * dedupe. 28/3 looked cheap but later rows collapsed to ~6 posters.
 */
const CAROUSEL_POOL_SIZE = 80;
const CAROUSEL_MAX_PAGES = 5;

export function useDiscoverOptions(mediaType: MediaType) {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userLanguage = useLanguageStore((s) => s.language);
  const formattedLanguage = getTmdbLanguageCode(userLanguage);

  const providers = mediaType === "movie" ? MOVIE_PROVIDERS : TV_PROVIDERS;

  useEffect(() => {
    let cancelled = false;

    const fetchGenres = async () => {
      const cacheKey = `${mediaType}:${formattedLanguage}`;
      const cached = discoverOptionsCache.get(cacheKey);
      if (cached) {
        setGenres(cached);
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        let pending = discoverOptionsInFlight.get(cacheKey);
        if (!pending) {
          pending = get<any>(`/genre/${mediaType}/list`, {
            language: formattedLanguage,
          }).then((data) => data.genres.slice(0, DISCOVER_OPTIONS_LIMIT));
          discoverOptionsInFlight.set(cacheKey, pending);
        }

        const nextGenres = await pending;
        discoverOptionsCache.set(cacheKey, nextGenres);

        if (!cancelled) {
          setGenres(nextGenres);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(`Error fetching ${mediaType} genres:`, err);
          setError((err as Error).message);
        }
      } finally {
        discoverOptionsInFlight.delete(`${mediaType}:${formattedLanguage}`);
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchGenres();

    return () => {
      cancelled = true;
    };
  }, [mediaType, formattedLanguage]);

  return {
    genres,
    providers,
    isLoading,
    error,
  };
}

export function useDiscoverMedia({
  contentType,
  mediaType,
  id,
  fallbackType,
  page = 1,
  genreName,
  providerName,
  mediaTitle,
  isCarouselView = false,
  enabled = true,
  genreId = null,
}: UseDiscoverMediaProps): UseDiscoverMediaReturn {
  const [media, setMedia] = useState<DiscoverMedia[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [sectionTitle, setSectionTitle] = useState<string>("");
  const [actualContentType, setActualContentType] =
    useState<DiscoverContentType>(contentType);

  const { t } = useTranslation();
  const userLanguage = useLanguageStore((s) => s.language);
  const formattedLanguage = getTmdbLanguageCode(userLanguage);
  const enableMatureTitles = usePreferencesStore((s) => s.enableMatureTitles);

  const fetchTMDBMedia = useCallback(
    async (endpoint: string, params: Record<string, any> = {}) => {
      try {
        // Discover endpoints accept with_genres; list endpoints get filtered after.
        const isDiscover = endpoint.includes("/discover/");
        if (genreId && isDiscover && !params.with_genres) {
          params.with_genres = genreId;
        }
        if (params.include_adult === undefined) {
          params.include_adult = tmdbIncludeAdult();
        }

        const region = detectUserRegion();
        const mapResults = (items: any[]) =>
          filterOutMatureMedia(
            items.map((item: any) => ({
              ...item,
              type: mediaType === "movie" ? "movie" : "show",
              adult: item.adult === true,
            })),
          );

        // Non-carousel: single requested page (view-more / detail grids).
        if (!isCarouselView) {
          const data = await fetchTmdbCached(endpoint, {
            language: formattedLanguage,
            region,
            ...params,
            page: page.toString(),
          });

          let results = data.results ?? [];
          if (genreId && !isDiscover) {
            const genreNum = Number(genreId);
            results = results.filter(
              (item: any) =>
                Array.isArray(item.genre_ids) &&
                item.genre_ids.includes(genreNum),
            );
          }

          return {
            results: mapResults(results),
            hasMore: page < data.total_pages,
          };
        }

        // Carousel: keep paging until we have a full pool. Earlier rows
        // claim titles via dedupe, and genre chips client-filter list
        // endpoints — a single page of 20 often shrinks to 2–4 posters.
        const accumulated: any[] = [];
        const seen = new Set<number>();
        let totalPages = 1;

        for (
          let p = 1;
          p <= CAROUSEL_MAX_PAGES && accumulated.length < CAROUSEL_POOL_SIZE;
          p += 1
        ) {
          const data = await fetchTmdbCached(endpoint, {
            language: formattedLanguage,
            region,
            ...params,
            page: String(p),
          });
          totalPages = data.total_pages ?? 1;

          let batch = data.results ?? [];
          if (genreId && !isDiscover) {
            const genreNum = Number(genreId);
            batch = batch.filter(
              (item: any) =>
                Array.isArray(item.genre_ids) &&
                item.genre_ids.includes(genreNum),
            );
          }

          for (const item of batch) {
            if (item?.id == null || seen.has(item.id)) continue;
            seen.add(item.id);
            accumulated.push(item);
            if (accumulated.length >= CAROUSEL_POOL_SIZE) break;
          }

          if (p >= totalPages) break;
        }

        return {
          results: mapResults(accumulated.slice(0, CAROUSEL_POOL_SIZE)),
          hasMore: false,
        };
      } catch (err) {
        console.error("Error fetching TMDB media:", err);
        throw err;
      }
    },
    [formattedLanguage, page, mediaType, isCarouselView, genreId, enableMatureTitles],
  );

  const fetchTraktMedia = useCallback(
    async (traktFunction: () => Promise<TraktListResponse>) => {
      // Trakt is off for this deployment - go straight to the TMDB
      // fallback instead of making (and then discarding) a call.
      if (!isTraktEnabled()) {
        throw new TraktDisabledError();
      }
      // Optimize Mid/Low proxies TMDB — Trakt → N detail GETs saturates the
      // proxy and every carousel hides empty. Prefer TMDB list endpoints.
      if (usePreferencesStore.getState().proxyTmdb) {
        throw new TraktDisabledError();
      }

      try {
        // Create a timeout promise
        const timeoutPromise = new Promise<TraktListResponse>((_, reject) => {
          setTimeout(() => reject(new Error("Trakt request timed out")), 3000);
        });

        // Race between the Trakt request and timeout
        const response = await Promise.race([traktFunction(), timeoutPromise]);

        // Check if response is null
        if (!response) {
          throw new Error("Trakt API returned null response");
        }

        // Paginate the results — carousels need a surplus so genre filter
        // and cross-row dedupe don't leave a half-empty strip.
        const pageSize = isCarouselView ? CAROUSEL_POOL_SIZE : 100;
        const { tmdb_ids: tmdbIds, hasMore: hasMoreResults } = paginateResults(
          response,
          page,
          pageSize,
          mediaType === "movie" ? "movie" : mediaType === "tv" ? "tv" : "both",
        );

        // For carousel views, fetch details for the full pool (not just 20).
        const idsToFetch = isCarouselView
          ? tmdbIds.slice(0, CAROUSEL_POOL_SIZE)
          : tmdbIds;

        // Fetch details for each TMDB ID
        const mediaPromises = idsToFetch.map(async (tmdbId: number) => {
          const endpoint = `/${mediaType}/${tmdbId}`;
          try {
            const data = await fetchTmdbCached(endpoint, {
              language: formattedLanguage,
            });
            return {
              ...data,
              genre_ids: normalizeGenreIds(data),
              type: mediaType === "movie" ? "movie" : "show",
            };
          } catch (err) {
            console.error(`Error fetching details for TMDB ID ${tmdbId}:`, err);
            return null; // Return null for failed items
          }
        });

        // Use Promise.allSettled to handle failed requests gracefully
        const settledResults = await Promise.allSettled(mediaPromises);

        // Filter out failed requests and nulls
        let results = settledResults
          .filter(
            (result): result is PromiseFulfilledResult<any> =>
              result.status === "fulfilled" && result.value !== null,
          )
          .map((result) => result.value);

        results = filterResultsByGenre(results, genreId);

        return {
          results,
          hasMore: hasMoreResults,
        };
      } catch (err) {
        if (!(err instanceof TraktDisabledError)) {
          console.error("Error fetching Trakt media:", err);
        }
        throw err;
      }
    },
    [mediaType, formattedLanguage, page, isCarouselView, genreId],
  );

  // Get Trakt function for provider
  const getTraktProviderFunction = useCallback(
    (providerId: string) => {
      // Create the key based on provider ID and media type
      const key = mediaType === "tv" ? `${providerId}tv` : providerId;
      const trakt =
        PROVIDER_TO_TRAKT_MAP[key as keyof typeof PROVIDER_TO_TRAKT_MAP];

      if (!trakt) return null;

      // Map trakt endpoint to corresponding function
      switch (trakt) {
        case "appletv":
          return getAppleTVReleases;
        case "applemovie":
          return getAppleMovieReleases;
        case "netflixmovies":
          return getNetflixMovies;
        case "netflixtv":
          return getNetflixTVShows;
        case "primemovies":
          return getPrimeMovies;
        case "primetv":
          return getPrimeTVShows;
        case "hulumovies":
          return getHuluMovies;
        case "hulutv":
          return getHuluTVShows;
        case "disneymovies":
          return getDisneyMovies;
        case "disneytv":
          return getDisneyTVShows;
        case "hbomovies":
          return getHBOMovies;
        case "hbotv":
          return getHBOTVShows;
        case "paramountmovies":
          return getParamountMovies;
        case "paramounttv":
          return getParamountTVShows;
        default:
          return null;
      }
    },
    [mediaType],
  );

  const fetchMedia = useCallback(async () => {
    // Skip fetching recommendations if no ID is provided
    if (contentType === "recommendations" && !id) {
      setIsLoading(false);
      setMedia([]);
      setHasMore(false);
      setSectionTitle("");
      return;
    }

    setIsLoading(true);
    setError(null);

    const attemptFetch = async (type: DiscoverContentType) => {
      let data;
      let traktProviderFunction;

      // Map content types to their endpoints and handling logic
      switch (type) {
        case "popular":
          data = await fetchTMDBMedia(`/discover/${mediaType}`, {
            sort_by: "popularity.desc",
            with_original_language: detectUserLanguage(),
            "vote_count.gte": 50,
          });
          setSectionTitle(t("discover.carousel.title.popular"));
          break;

        // "Popular This Week" — TMDB trending/week (distinct from /movie/popular
        // and discover popularity, which heavily overlap and used to leave this
        // row with almost nothing after cross-carousel dedupe).
        case "popularThisWeek":
          {
            const today = todayIsoDate();
            if (genreId) {
              // Trending/week ∩ genre is often tiny after dedupe. Use discover
              // with a fresh-release window so the row can fill uniquely.
              data = await fetchTMDBMedia(`/discover/${mediaType}`, {
                sort_by: "popularity.desc",
                ...recentReleaseDateParams(mediaType, today, 6),
                "vote_count.gte": 10,
                include_adult: tmdbIncludeAdult(),
              });
            } else {
              // TMDB trending includes hyped unreleased titles — filter those out.
              data = await fetchTMDBMedia(
                mediaType === "movie"
                  ? "/trending/movie/week"
                  : "/trending/tv/week",
              );
            }
            data = {
              ...data,
              results: filterReleasedDiscoverMedia(data.results, today),
            };
            // Pad if hype filtering emptied the row.
            if (isCarouselView && data.results.length < CAROUSEL_POOL_SIZE) {
              const fill = await fetchTMDBMedia(`/discover/${mediaType}`, {
                sort_by: "popularity.desc",
                ...recentReleaseDateParams(mediaType, today, 6),
                "vote_count.gte": 10,
                include_adult: tmdbIncludeAdult(),
              });
              const seen = new Set(
                data.results
                  .map((item) => item.id)
                  .filter((mediaId): mediaId is number => mediaId != null),
              );
              const merged = [...data.results];
              for (const item of filterReleasedDiscoverMedia(
                fill.results,
                today,
              )) {
                if (item.id == null || seen.has(item.id)) continue;
                seen.add(item.id);
                merged.push(item);
                if (merged.length >= CAROUSEL_POOL_SIZE) break;
              }
              data = { ...data, results: merged };
            }
          }
          setSectionTitle(t("discover.carousel.title.popularThisWeek"));
          break;

        // A random page from the well-known/quality-filtered pool,
        // reshuffled — see getAllTimeBestMovies/Shows. Bypasses
        // fetchTMDBMedia since carousel views force page 1 there, which
        // would defeat the randomization.
        case "randomPopular": {
          // Over-fetch so genre filter still leaves a full row.
          if (genreId) {
            // Random deep pages (not page 1–N popularity) so this isn't a
            // shuffled clone of "Most Popular" under the same genre.
            const pagesNeeded = Math.max(1, Math.ceil(CAROUSEL_POOL_SIZE / 20));
            const maxPage = mediaType === "movie" ? 40 : 20;
            const pageSet = new Set<number>();
            while (pageSet.size < pagesNeeded) {
              pageSet.add(Math.floor(Math.random() * maxPage) + 1);
            }
            const batches = await Promise.all(
              [...pageSet].map((p) =>
                fetchTmdbCached(`/discover/${mediaType}`, {
                  language: formattedLanguage,
                  region: detectUserRegion(),
                  page: String(p),
                  sort_by: "popularity.desc",
                  "vote_count.gte": mediaType === "movie" ? 300 : 150,
                  "vote_average.gte": 6,
                  include_adult: tmdbIncludeAdult(),
                  with_genres: genreId,
                }),
              ),
            );
            const seen = new Set<number>();
            const merged: DiscoverMedia[] = [];
            for (const batch of batches) {
              for (const item of batch.results ?? []) {
                if (item?.id == null || seen.has(item.id)) continue;
                seen.add(item.id);
                merged.push({
                  ...item,
                  type: mediaType === "movie" ? "movie" : "show",
                });
              }
            }
            // Fisher–Yates shuffle
            for (let i = merged.length - 1; i > 0; i -= 1) {
              const j = Math.floor(Math.random() * (i + 1));
              [merged[i], merged[j]] = [merged[j]!, merged[i]!];
            }
            data = {
              results: merged.slice(0, CAROUSEL_POOL_SIZE),
              hasMore: true,
            };
          } else {
            const randomItems =
              mediaType === "movie"
                ? await getAllTimeBestMovies(CAROUSEL_POOL_SIZE)
                : await getAllTimeBestShows(CAROUSEL_POOL_SIZE);
            const mapped = randomItems.map((item) => ({
              ...item,
              type: mediaType === "movie" ? "movie" : "show",
            }));
            data = {
              results: mapped as DiscoverMedia[],
              hasMore: true,
            };
          }
          setSectionTitle(t("discover.carousel.title.randomPopular"));
          break;
        }

        case "topRated":
          data = await fetchTMDBMedia(`/discover/${mediaType}`, {
            sort_by: "vote_average.desc",
            with_original_language: detectUserLanguage(),
            "vote_count.gte": 500,
          });
          setSectionTitle(t("discover.carousel.title.topRated"));
          break;

        case "onTheAir":
          if (mediaType === "tv") {
            if (genreId) {
              const today = new Date().toISOString().slice(0, 10);
              const from = new Date();
              from.setMonth(from.getMonth() - 24);
              data = await fetchTMDBMedia("/discover/tv", {
                sort_by: "popularity.desc",
                "first_air_date.gte": from.toISOString().slice(0, 10),
                "first_air_date.lte": today,
                "vote_count.gte": 10,
                include_adult: tmdbIncludeAdult(),
              });
              data = {
                ...data,
                results: data.results.filter((item: DiscoverMedia) =>
                  Boolean(item.poster_path),
                ),
              };
            } else {
              data = await fetchTMDBMedia("/tv/on_the_air");
            }
            setSectionTitle(t("discover.carousel.title.onTheAir"));
          } else {
            throw new Error("onTheAir is only available for TV shows");
          }
          break;

        case "nowPlaying":
          if (mediaType === "movie") {
            const today = new Date().toISOString().slice(0, 10);
            if (genreId) {
              // Genre × true now_playing is often only a handful of titles.
              // Use recent theatrical releases in that genre (already out,
              // date-bounded) so the row can fill without unreleased junk.
              const from = new Date();
              from.setMonth(from.getMonth() - 24);
              data = await fetchTMDBMedia("/discover/movie", {
                with_release_type: "2|3",
                "primary_release_date.gte": from.toISOString().slice(0, 10),
                "primary_release_date.lte": today,
                sort_by: "popularity.desc",
                "vote_count.gte": 20,
                include_adult: tmdbIncludeAdult(),
              });
              setSectionTitle(t("discover.carousel.title.recentReleases"));
            } else {
              data = await fetchTMDBMedia("/movie/now_playing");
              setSectionTitle(t("discover.carousel.title.inCinemas"));
            }
            data = {
              ...data,
              results: data.results.filter((item: DiscoverMedia) => {
                if (!item.poster_path) return false;
                const released = item.release_date || "";
                return released.length >= 10 && released <= today;
              }),
            };
          } else {
            throw new Error("nowPlaying is only available for movies");
          }
          break;

        case "top10":
          data = await fetchTraktMedia(getTop10Movies);
          setSectionTitle(t("discover.carousel.title.top10"));
          break;

        case "latest":
          data = await fetchTraktMedia(getLatestReleases);
          setSectionTitle(t("discover.carousel.title.latestReleases"));
          break;

        case "latest4k":
          data = await fetchTraktMedia(getLatest4KReleases);
          setSectionTitle(t("discover.carousel.title.4kReleases"));
          break;

        case "latesttv":
          data = await fetchTraktMedia(getLatestTVReleases);
          setSectionTitle(t("discover.carousel.title.latestTVReleases"));
          break;

        case "genre":
          if (!id) throw new Error("Genre ID is required");

          // Use TMDB for genres (Trakt genre endpoints removed)
          data = await fetchTMDBMedia(`/discover/${mediaType}`, {
            with_genres: id,
          });
          setSectionTitle(
            mediaType === "movie"
              ? t("discover.carousel.title.movies", { category: genreName })
              : t("discover.carousel.title.tvshows", { category: genreName }),
          );
          break;

        case "provider":
          if (!id) throw new Error("Provider ID is required");

          // Try to use Trakt provider endpoint if available
          traktProviderFunction = getTraktProviderFunction(id);
          if (traktProviderFunction) {
            try {
              data = await fetchTraktMedia(traktProviderFunction);
              setSectionTitle(
                mediaType === "movie"
                  ? t("discover.carousel.title.moviesOn", {
                      provider: providerName,
                    })
                  : t("discover.carousel.title.tvshowsOn", {
                      provider: providerName,
                    }),
              );
            } catch (traktErr) {
              if (!(traktErr instanceof TraktDisabledError)) {
                console.error(
                  "Trakt provider fetch failed, falling back to TMDB:",
                  traktErr,
                );
              }
              // Fall back to TMDB
              data = await fetchTMDBMedia(`/discover/${mediaType}`, {
                with_watch_providers: id,
                watch_region: detectUserRegion(),
              });
              setSectionTitle(
                mediaType === "movie"
                  ? t("discover.carousel.title.moviesOn", {
                      provider: providerName,
                    })
                  : t("discover.carousel.title.tvshowsOn", {
                      provider: providerName,
                    }),
              );
            }
          } else {
            // Use TMDB if no Trakt endpoint exists for this provider
            data = await fetchTMDBMedia(`/discover/${mediaType}`, {
              with_watch_providers: id,
              watch_region: detectUserRegion(),
            });
            setSectionTitle(
              mediaType === "movie"
                ? t("discover.carousel.title.moviesOn", {
                    provider: providerName,
                  })
                : t("discover.carousel.title.tvshowsOn", {
                    provider: providerName,
                  }),
            );
          }
          break;

        case "recommendations":
          if (!id) throw new Error("Media ID is required for recommendations");
          data = await fetchTMDBMedia(`/${mediaType}/${id}/recommendations`);
          setSectionTitle(
            t("discover.carousel.title.recommended", { title: mediaTitle }),
          );
          break;

        default:
          throw new Error(`Unsupported content type: ${type}`);
      }

      return data;
    };

    const ensureFullGenreCarousel = async (
      data: {
        results: DiscoverMedia[];
        hasMore: boolean;
      },
      fetchedType: DiscoverContentType,
    ) => {
      // Never pad trending with unbounded future junk. nowPlaying under a
      // genre already uses a date-bounded recent-theatrical query — may widen.
      const noDiscoverPad = new Set<DiscoverContentType>([
        "latesttv",
        "latest4k",
      ]);
      if (
        !isCarouselView ||
        !genreId ||
        noDiscoverPad.has(fetchedType) ||
        data.results.length >= CAROUSEL_POOL_SIZE
      ) {
        return data;
      }

      const today = todayIsoDate();
      const fillParams: Record<string, any> =
        fetchedType === "nowPlaying"
          ? (() => {
              const from = new Date();
              from.setMonth(from.getMonth() - 48);
              return {
                with_release_type: "2|3",
                "primary_release_date.gte": from.toISOString().slice(0, 10),
                "primary_release_date.lte": today,
                sort_by: "popularity.desc",
                "vote_count.gte": 20,
                include_adult: tmdbIncludeAdult(),
              };
            })()
          : {
              sort_by: "popularity.desc",
              include_adult: tmdbIncludeAdult(),
              "vote_count.gte": 20,
              ...recentReleaseDateParams(mediaType, today, 24),
            };

      const fill = await fetchTMDBMedia(`/discover/${mediaType}`, fillParams);
      const seen = new Set<number>();
      for (const item of data.results) {
        if (item?.id != null) seen.add(item.id);
      }
      const merged = [...data.results];
      for (const item of filterReleasedDiscoverMedia(fill.results, today)) {
        if (item?.id == null || seen.has(item.id)) continue;
        if (!item.poster_path) continue;
        seen.add(item.id);
        merged.push(item);
        if (merged.length >= CAROUSEL_POOL_SIZE) break;
      }
      return { ...data, results: merged };
    };

    try {
      const data = await ensureFullGenreCarousel(
        await attemptFetch(contentType),
        contentType,
      );
      setMedia((prevMedia) => {
        const valid = filterOutMatureMedia(
          filterReleasedDiscoverMedia(
            data.results.filter((item: DiscoverMedia) => item.id != null),
          ),
        );
        return page === 1 ? valid : [...prevMedia, ...valid];
      });
      setHasMore(data.hasMore);
    } catch (err) {
      const traktDisabled = err instanceof TraktDisabledError;
      if (!traktDisabled) {
        console.error("Error fetching media:", err);
      }
      setError((err as Error).message);

      // Try fallback content type if available
      if (fallbackType && fallbackType !== contentType) {
        try {
          const fallbackData = await ensureFullGenreCarousel(
            await attemptFetch(fallbackType),
            fallbackType,
          );
          setActualContentType(fallbackType); // Set actual content type to fallback
          setMedia((prevMedia) => {
            const valid = filterOutMatureMedia(
              filterReleasedDiscoverMedia(
                fallbackData.results.filter(
                  (item: DiscoverMedia) => item.id != null,
                ),
              ),
            );
            return page === 1 ? valid : [...prevMedia, ...valid];
          });
          setHasMore(fallbackData.hasMore);
          setError(null); // Clear error if fallback succeeds
        } catch (fallbackErr) {
          console.error("Error fetching fallback media:", fallbackErr);
          setError((fallbackErr as Error).message);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    contentType,
    mediaType,
    id,
    fallbackType,
    genreName,
    providerName,
    mediaTitle,
    genreId,
    isCarouselView,
    formattedLanguage,
    fetchTMDBMedia,
    fetchTraktMedia,
    t,
    page,
    getTraktProviderFunction,
    enableMatureTitles,
  ]);

  useEffect(() => {
    // Keep resets in an effect to avoid state updates during render.
    setMedia([]);
    setActualContentType(contentType);
  }, [contentType, id, mediaType, genreId, enableMatureTitles]);

  useEffect(() => {
    if (enabled) {
      fetchMedia();
    }
  }, [enabled, fetchMedia, page]);

  return {
    media,
    isLoading,
    error,
    hasMore,
    refetch: fetchMedia,
    sectionTitle,
    actualContentType,
  };
}
