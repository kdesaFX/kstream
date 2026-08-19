import slugify from "slugify";

import { mangaIdToUrlId } from "@/backend/manga/ids";

import { conf } from "@/setup/config";
import { useLanguageStore } from "@/stores/language";
import { usePreferencesStore } from "@/stores/preferences";
import { SimpleCache } from "@/utils/common/cache";
import { getTmdbLanguageCode } from "@/utils/locale/language";
import {
  MAX_LOGO_CANDIDATES,
  logoHasBakedBackground,
  rankLogos,
} from "@/utils/media/logoBackground";
import { MediaItem } from "@/utils/media/mediaTypes";
import { tmdbIncludeAdult, filterOutMatureMedia } from "@/utils/media/mature";
import { tmdbPosterSize, resolveCardArtworkUrl } from "@/utils/media/artwork";
import { getProxyUrls } from "@/utils/hosting/proxyUrls";

import { MWMediaMeta, MWMediaType, MWSeasonMeta } from "./types/mw";
import { getImdbEpisodes } from "./imdbMetadataProvider";
import {
  fetchValleyFallback,
  resolveValleyFallbackTarget,
} from "./valleyFallback";
import {
  ExternalIdMovieSearchResult,
  TMDBContentTypes,
  TMDBCredits,
  TMDBEpisode,
  TMDBEpisodeShort,
  TMDBMediaResult,
  TMDBMovieData,
  TMDBMovieSearchResult,
  TMDBPerson,
  TMDBPersonImages,
  TMDBPersonCombinedCredits,
  TMDBSearchResult,
  TMDBSeason,
  TMDBSeasonMetaResult,
  TMDBShowData,
  TMDBShowSearchResult,
  TMDBVideo,
  TMDBVideosResponse,
} from "./types/tmdb";
import { mwFetch } from "../helpers/fetch";

export function mediaTypeToTMDB(type: MWMediaType): TMDBContentTypes {
  if (type === MWMediaType.MOVIE) return TMDBContentTypes.MOVIE;
  if (type === MWMediaType.SERIES) return TMDBContentTypes.TV;
  throw new Error("unsupported type");
}

export function mediaItemTypeToMediaType(type: MediaItem["type"]): MWMediaType {
  if (type === "movie") return MWMediaType.MOVIE;
  if (type === "show") return MWMediaType.SERIES;
  throw new Error("unsupported type");
}

/** URL id for cards — manga uses MangaDex ids, everything else TMDB. */
export function mediaItemToId(media: MediaItem): string {
  if (media.type === "manga") {
    return mangaIdToUrlId(media.id, media.title);
  }
  return TMDBIdToUrlId(
    mediaItemTypeToMediaType(media.type),
    media.id,
    media.title,
  );
}

export function TMDBMediaToMediaType(type: TMDBContentTypes): MWMediaType {
  if (type === TMDBContentTypes.MOVIE) return MWMediaType.MOVIE;
  if (type === TMDBContentTypes.TV) return MWMediaType.SERIES;
  throw new Error("unsupported type");
}

export function TMDBMediaToMediaItemType(
  type: TMDBContentTypes,
): MediaItem["type"] {
  if (type === TMDBContentTypes.MOVIE) return "movie";
  if (type === TMDBContentTypes.TV) return "show";
  throw new Error("unsupported type");
}

export function formatTMDBEpisode(v: TMDBEpisodeShort): {
  id: string;
  number: number;
  title: string;
  air_date: string;
  still_path: string | null;
  overview: string;
  runtime?: number | null;
} {
  return {
    id: v.id.toString(),
    number: v.episode_number,
    title: v.title,
    air_date: v.air_date,
    still_path: v.still_path,
    overview: v.overview,
    runtime: v.runtime ?? null,
  };
}

export function formatTMDBMeta(
  media: TMDBMediaResult,
  season?: TMDBSeasonMetaResult,
): MWMediaMeta {
  const type = TMDBMediaToMediaType(media.object_type);
  let seasons: undefined | MWSeasonMeta[];
  if (type === MWMediaType.SERIES) {
    seasons = media.seasons
      ?.sort((a, b) => a.season_number - b.season_number)
      .map(
        (v): MWSeasonMeta => ({
          title: v.title,
          id: v.id.toString(),
          number: v.season_number,
        }),
      );
  }

  return {
    title: media.title,
    originalTitle: media.originalTitle,
    id: media.id.toString(),
    year: media.original_release_date?.getFullYear()?.toString(),
    releaseDate: media.original_release_date
      ? [
          media.original_release_date.getUTCFullYear(),
          String(media.original_release_date.getUTCMonth() + 1).padStart(
            2,
            "0",
          ),
          String(media.original_release_date.getUTCDate()).padStart(2, "0"),
        ].join("-")
      : undefined,
    poster: media.poster,
    type,
    overview: media.overview,
    runtime: media.runtime ?? null,
    episodeRuntime: media.episodeRuntime ?? null,
    seasons: seasons as any,
    seasonData: season
      ? {
          id: season.id.toString(),
          number: season.season_number,
          title: season.title,
          episodes: season.episodes
            .sort((a, b) => a.episode_number - b.episode_number)
            .map(formatTMDBEpisode),
        }
      : (undefined as any),
  };
}

export function formatTMDBMetaToMediaItem(media: TMDBMediaResult): MediaItem {
  const type = TMDBMediaToMediaItemType(media.object_type);

  return {
    title: media.title,
    id: media.id.toString(),
    year: media.original_release_date?.getFullYear() ?? 0,
    release_date: media.original_release_date,
    poster: media.poster,
    type,
    adult: media.adult === true,
  };
}

export function TMDBIdToUrlId(
  type: MWMediaType,
  tmdbId: string,
  title: string,
) {
  return [
    "tmdb",
    mediaTypeToTMDB(type),
    tmdbId,
    slugify(title, { lower: true, strict: true }),
  ].join("-");
}

export function TMDBMediaToId(media: MWMediaMeta): string {
  return TMDBIdToUrlId(media.type, media.id, media.title);
}

export function decodeTMDBId(
  paramId: string,
): { id: string; type: MWMediaType } | null {
  const [prefix, type, id] = paramId.split("-", 3);
  if (prefix !== "tmdb") return null;
  let mediaType;
  try {
    mediaType = TMDBMediaToMediaType(type as TMDBContentTypes);
  } catch {
    return null;
  }
  return {
    type: mediaType,
    id,
  };
}

const tmdbBaseUrl1 = "https://api.themoviedb.org/3/";
const tmdbBaseUrl2 = "https://api.tmdb.org/3/";

// v4 read tokens are JWTs (3 dot-separated base64 segments), v3 keys are short alphanumeric strings
function isV4Token(key: string): boolean {
  return key.split(".").length === 3;
}

// Cache for TMDB API responses
interface TMDBCacheKey {
  url: string;
  params: object;
  language: string;
}

const tmdbCache = new SimpleCache<TMDBCacheKey, any>();
tmdbCache.setCompare((a, b) => {
  return (
    a.url === b.url &&
    JSON.stringify(a.params) === JSON.stringify(b.params) &&
    a.language === b.language
  );
});
tmdbCache.initialize();

function abortOnTimeout(timeout: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeout);
  return controller.signal;
}


async function raceWithValleyFallback<T>(
  primary: Promise<T>,
  target: Parameters<typeof fetchValleyFallback>[0],
): Promise<T> {
  const primaryOutcome = primary.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );

  const timeout = new Promise<"timeout">((resolve) => {
    setTimeout(() => resolve("timeout"), 5000);
  });

  const first = await Promise.race([primaryOutcome, timeout]);
  if (first !== "timeout" && first.ok) {
    return first.value;
  }

  try {
    return await fetchValleyFallback<T>(target);
  } catch (valleyErr) {
    const outcome = await primaryOutcome;
    if (outcome.ok) return outcome.value;
    throw outcome.error;
  }
}

let proxyRotationIndex = 0;

function getNextProxy(proxyUrls: string[]): string | undefined {
  if (!proxyUrls.length) return undefined;
  const proxy = proxyUrls[proxyRotationIndex % proxyUrls.length];
  proxyRotationIndex += 1;
  return proxy;
}

// Caps how many TMDB requests are in flight at once - features like the
// personal recommendations feed fan out dozens of requests in one go,
// which otherwise trips TMDB's rate limit (429s).
const MAX_CONCURRENT_TMDB_REQUESTS = 6;
let activeTmdbRequests = 0;
const tmdbRequestQueue: (() => void)[] = [];

function acquireTmdbSlot(): Promise<void> {
  if (activeTmdbRequests < MAX_CONCURRENT_TMDB_REQUESTS) {
    activeTmdbRequests += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    tmdbRequestQueue.push(() => {
      activeTmdbRequests += 1;
      resolve();
    });
  });
}

function releaseTmdbSlot(): void {
  activeTmdbRequests -= 1;
  const next = tmdbRequestQueue.shift();
  if (next) next();
}

export async function get<T>(url: string, params?: object): Promise<T> {
  const proxyUrls = getProxyUrls();
  const proxy = getNextProxy(proxyUrls);
  const shouldProxyTmdb = usePreferencesStore.getState().proxyTmdb;
  const userLanguage = useLanguageStore.getState().language;
  const formattedLanguage = getTmdbLanguageCode(userLanguage);

  const apiKey = conf().TMDB_READ_API_KEY;
  if (!apiKey) throw new Error("TMDB API key not set");

  const tmdbHeaders: Record<string, string> = { accept: "application/json" };
  if (isV4Token(apiKey)) {
    tmdbHeaders.Authorization = `Bearer ${apiKey}`;
  }

  // Check cache first
  const cacheKey: TMDBCacheKey = {
    url,
    params: params || {},
    language: formattedLanguage,
  };

  const cachedResult = tmdbCache.get(cacheKey);
  if (cachedResult) {
    return cachedResult as T;
  }

  // directly writing parameters, otherwise it will start the first parameter in the proxied request as "&" instead of "?" because it doesnt understand its proxied
  const fullUrl = new URL(tmdbBaseUrl1 + url);
  const allParams = {
    ...params,
    language: formattedLanguage,
    ...(!isV4Token(apiKey) ? { api_key: apiKey } : {}),
  };

  if (allParams) {
    Object.entries(allParams).forEach(([key, value]) => {
      fullUrl.searchParams.append(key, String(value));
    });
  }

  let result: T;

  await acquireTmdbSlot();
  try {
    if (proxy && shouldProxyTmdb) {
      try {
        result = await mwFetch<T>(
          `/?destination=${encodeURIComponent(fullUrl.toString())}`,
          {
            headers: tmdbHeaders,
            baseURL: proxy,
            signal: abortOnTimeout(5000),
          },
        );
      } catch (err) {
        console.error(err);
        // Fall through to try direct connection
      }
    }

    if (!result!) {
      const primaryAttempt = (async (): Promise<T> => {
        try {
          return await mwFetch<T>(encodeURI(url), {
            headers: tmdbHeaders,
            baseURL: tmdbBaseUrl1,
            params: allParams,
            signal: abortOnTimeout(5000),
          });
        } catch (err) {
          return await mwFetch<T>(encodeURI(url), {
            headers: tmdbHeaders,
            baseURL: tmdbBaseUrl2,
            params: allParams,
            signal: abortOnTimeout(30000),
          });
        }
      })();

      const valleyTarget = resolveValleyFallbackTarget(url);
      result = valleyTarget
        ? await raceWithValleyFallback(primaryAttempt, valleyTarget)
        : await primaryAttempt;
    }
  } finally {
    releaseTmdbSlot();
  }

  // Cache the result for 1 hour (3600 seconds)
  tmdbCache.set(cacheKey, result, 3600);
  return result;
}

export async function multiSearch(
  query: string,
): Promise<(TMDBMovieSearchResult | TMDBShowSearchResult)[]> {
  const data = await get<TMDBSearchResult>("search/multi", {
    query,
    // Search always includes adult hits so the UI can gate them with an
    // 18+ overlay until the user opts in via settings.
    include_adult: true,
    page: 1,
  });
  // filter out results that aren't movies or shows
  const results = data.results.filter(
    (r) =>
      r.media_type === TMDBContentTypes.MOVIE ||
      r.media_type === TMDBContentTypes.TV,
  );
  return results;
}

export async function searchMovies(
  query: string,
): Promise<TMDBMovieSearchResult[]> {
  const data = await get<{
    results: TMDBMovieSearchResult[];
  }>("search/movie", {
    query,
    include_adult: true,
    page: 1,
  });
  return data.results.map((result) => ({
    ...result,
    media_type: TMDBContentTypes.MOVIE,
  }));
}

export async function searchTVShows(
  query: string,
): Promise<TMDBShowSearchResult[]> {
  const data = await get<{
    results: TMDBShowSearchResult[];
  }>("search/tv", {
    query,
    include_adult: true,
    page: 1,
  });
  return data.results.map((result) => ({
    ...result,
    media_type: TMDBContentTypes.TV,
  }));
}

export async function generateQuickSearchMediaUrl(
  query: string,
): Promise<string | undefined> {
  const data = await multiSearch(query);
  if (data.length === 0) return undefined;
  const result = data[0];
  const title =
    result.media_type === TMDBContentTypes.MOVIE ? result.title : result.name;

  return `/media/${TMDBIdToUrlId(
    TMDBMediaToMediaType(result.media_type),
    result.id.toString(),
    title,
  )}`;
}

// Conditional type which for inferring the return type based on the content type
type MediaDetailReturn<T extends TMDBContentTypes> =
  T extends TMDBContentTypes.MOVIE
    ? TMDBMovieData
    : T extends TMDBContentTypes.TV
      ? TMDBShowData
      : never;

export async function getEpisodeDetails(
  showId: string,
  seasonNumber: number,
  episodeNumber: number,
): Promise<{ vote_average: number } | null> {
  try {
    const data = await get<TMDBEpisode>(
      `/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}`,
    );
    return {
      vote_average:
        typeof data.vote_average === "number" ? data.vote_average : 0,
    };
  } catch {
    return null;
  }
}

export async function getSeasonDetails(
  id: string,
  season: number,
): Promise<
  Array<{
    id: number;
    name: string;
    episode_number: number;
    overview: string;
    still_path: string | null;
    air_date: string;
    season_number: number;
  }>
> {
  const seasonData = await get<TMDBSeason>(`/tv/${id}/season/${season}`);
  return seasonData.episodes.map((episode) => ({
    id: episode.id,
    name: episode.name,
    episode_number: episode.episode_number,
    overview: episode.overview,
    still_path: episode.still_path,
    air_date: episode.air_date,
    season_number: season,
  }));
}

export async function getMediaDetails<
  T extends TMDBContentTypes,
  TReturn = MediaDetailReturn<T>,
>(id: string, type: T, fetchEpisodes: boolean = true): Promise<TReturn> {
  if (type === TMDBContentTypes.MOVIE) {
    return get<TReturn>(`/movie/${id}`, {
      append_to_response: "external_ids,credits,release_dates",
    });
  }
  if (type === TMDBContentTypes.TV) {
    const showData = await get<TReturn>(`/tv/${id}`, {
      append_to_response: "external_ids,credits,content_ratings",
    });

    if (!fetchEpisodes) {
      return {
        ...showData,
        episodes: [],
      } as TReturn;
    }

    // Fetch episodes for each season
    const showDetails = showData as TMDBShowData;
    const allEpisodesBySeason = new Array(showDetails.seasons.length);
    const seasonsQueue = showDetails.seasons.map((season, index) => ({
      season,
      index,
    }));
    const concurrencyLimit = 5;

    const workers = Array.from(
      { length: Math.min(concurrencyLimit, seasonsQueue.length) },
      async () => {
        while (seasonsQueue.length > 0) {
          const item = seasonsQueue.shift();
          if (!item) break;
          const { season, index } = item;
          const seasonData = await get<TMDBSeason>(
            `/tv/${id}/season/${season.season_number}`,
          );
          allEpisodesBySeason[index] = seasonData.episodes.map((episode) => ({
            id: episode.id,
            name: episode.name,
            episode_number: episode.episode_number,
            overview: episode.overview,
            still_path: episode.still_path,
            air_date: episode.air_date,
            season_number: season.season_number,
          }));
        }
      },
    );

    await Promise.all(workers);
    const allEpisodes = allEpisodesBySeason.flat();

    return {
      ...showData,
      episodes: allEpisodes,
    } as TReturn;
  }
  throw new Error("Invalid media type");
}

export function getMediaBackdrop(
  backdropPath: string | null,
): string | undefined {
  const shouldProxyTmdb = usePreferencesStore.getState().proxyTmdb;
  // w1280 is sharp enough for full-bleed UI; original is often multi-MB.
  const imgUrl = `https://image.tmdb.org/t/p/w1280${backdropPath}`;
  const proxyUrl = getProxyUrls()[0];
  if (proxyUrl && shouldProxyTmdb) {
    return `${proxyUrl}/?destination=${imgUrl}`;
  }
  if (backdropPath) return imgUrl;
}

export function getMediaPoster(posterPath: string | null): string | undefined {
  if (!posterPath) return undefined;
  const quality =
    usePreferencesStore.getState().posterQuality ?? "standard";
  const imgUrl = `https://image.tmdb.org/t/p/${tmdbPosterSize(quality)}/${posterPath}`;
  return resolveCardArtworkUrl(imgUrl) ?? imgUrl;
}

/**
 * Fetches the poster URL for a movie or show from TMDB by ID.
 * Use this when importing from external sources (e.g. Trakt) that may not have poster URLs.
 */
export async function getPosterForMedia(
  tmdbId: string,
  type: "movie" | "show",
): Promise<string | undefined> {
  try {
    const tmdbType =
      type === "movie" ? TMDBContentTypes.MOVIE : TMDBContentTypes.TV;
    const details = await getMediaDetails(tmdbId, tmdbType, false);
    const posterPath =
      (details as TMDBMovieData | TMDBShowData).poster_path ?? null;
    return getMediaPoster(posterPath);
  } catch {
    return undefined;
  }
}

export async function getCollectionDetails(collectionId: number): Promise<any> {
  return get<any>(`/collection/${collectionId}`);
}

export interface TMDBCollectionSearchResult {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

/** Searches TMDB collections (franchises) by name. */
export async function searchCollections(
  query: string,
): Promise<TMDBCollectionSearchResult[]> {
  const data = await get<{ results: TMDBCollectionSearchResult[] }>(
    "search/collection",
    {
      query,
      include_adult: tmdbIncludeAdult(),
      page: 1,
    },
  );
  return data.results ?? [];
}

/** Returns a collection's films, shaped like movie search results. */
export async function getCollectionParts(
  collectionId: number,
): Promise<TMDBMovieSearchResult[]> {
  const data = await get<{ parts?: TMDBMovieSearchResult[] }>(
    `/collection/${collectionId}`,
  );
  return (data.parts ?? []).map((p) => ({
    ...p,
    media_type: TMDBContentTypes.MOVIE,
  }));
}

export async function getEpisodes(
  id: string,
  season: number,
): Promise<TMDBEpisodeShort[]> {
  const overrideEps = await getImdbEpisodes(id, season);
  if (overrideEps) return overrideEps;

  const data = await get<TMDBSeason>(`/tv/${id}/season/${season}`);
  return data.episodes.map((e) => ({
    id: e.id,
    episode_number: e.episode_number,
    title: e.name,
    air_date: e.air_date,
    still_path: e.still_path,
    overview: e.overview,
    runtime: e.runtime ?? null,
  }));
}

/**
 * Resolve TMDB season and episode IDs for a show. Use when external sources
 * (e.g. Trakt) only provide season/episode numbers.
 */
export async function getEpisodeIds(
  showTmdbId: string,
  seasonNumber: number,
  episodeNumber: number,
): Promise<{ seasonId: string; episodeId: string } | null> {
  try {
    const data = await get<TMDBSeason>(
      `/tv/${showTmdbId}/season/${seasonNumber}`,
    );
    const episode = data.episodes.find(
      (e) => e.episode_number === episodeNumber,
    );
    if (!episode) return null;
    return {
      seasonId: data.id.toString(),
      episodeId: episode.id.toString(),
    };
  } catch {
    return null;
  }
}

export async function getMovieFromExternalId(
  imdbId: string,
): Promise<string | undefined> {
  const data = await get<ExternalIdMovieSearchResult>(`/find/${imdbId}`, {
    external_source: "imdb_id",
  });

  const movie = data.movie_results[0];
  if (!movie) return undefined;

  return movie.id.toString();
}

export function formatTMDBSearchResult(
  result: TMDBMovieSearchResult | TMDBShowSearchResult,
  mediatype: TMDBContentTypes,
): TMDBMediaResult {
  const type = TMDBMediaToMediaType(mediatype);
  if (type === MWMediaType.SERIES) {
    const show = result as TMDBShowSearchResult;
    return {
      title: show.name,
      originalTitle: show.original_name,
      poster: getMediaPoster(show.poster_path),
      id: show.id,
      original_release_date: new Date(show.first_air_date),
      object_type: mediatype,
      adult: show.adult === true,
    };
  }

  const movie = result as TMDBMovieSearchResult;

  return {
    title: movie.title,
    originalTitle: movie.original_title,
    poster: getMediaPoster(movie.poster_path),
    id: movie.id,
    original_release_date: new Date(movie.release_date),
    object_type: mediatype,
    adult: movie.adult === true,
  };
}

/**
 * Fetches the clear logo for a movie or show from TMDB images endpoint.
 */
export async function getMediaLogo(
  id: string,
  type: TMDBContentTypes,
  language?: string,
): Promise<string | undefined> {
  const userLanguage = language || useLanguageStore.getState().language;
  const formattedLanguage = getTmdbLanguageCode(userLanguage);
  const url =
    type === TMDBContentTypes.MOVIE
      ? `/movie/${id}/images`
      : `/tv/${id}/images`;
  try {
    const data = await get<any>(url, {
      include_image_language: `${formattedLanguage},en,null`,
    });
    const candidates = rankLogos(data.logos ?? [], formattedLanguage).slice(
      0,
      MAX_LOGO_CANDIDATES,
    );
    for (const logo of candidates) {
      const logoUrl = `https://image.tmdb.org/t/p/original${logo.file_path}`;
      // eslint-disable-next-line no-await-in-loop
      if (!(await logoHasBakedBackground(logoUrl))) return logoUrl;
    }
    // Every candidate is a solid rectangle - callers show the title instead.
    return undefined;
  } catch (err) {
    console.error("Failed to fetch TMDB logo:", err);
    return undefined;
  }
}

export async function getMediaCredits(
  id: string,
  type: TMDBContentTypes,
): Promise<TMDBCredits> {
  const endpoint = type === TMDBContentTypes.MOVIE ? "movie" : "tv";
  return get<TMDBCredits>(`/${endpoint}/${id}/credits`);
}

export async function getMediaVideos(
  id: string,
  type: TMDBContentTypes,
): Promise<TMDBVideo[]> {
  const endpoint = type === TMDBContentTypes.MOVIE ? "movie" : "tv";
  const data = await get<TMDBVideosResponse>(`/${endpoint}/${id}/videos`);
  return data.results.filter(
    (video) =>
      video.site === "YouTube" &&
      (video.type === "Trailer" || video.type === "Teaser"),
  );
}

/**
 * Fetches recommended media from TMDB recommendations endpoint.
 * Returns media that users commonly watch together based on ratings and popularity.
 */
export async function getRelatedMedia(
  id: string,
  type: TMDBContentTypes,
  limit: number = 10,
): Promise<TMDBMovieSearchResult[] | TMDBShowSearchResult[]> {
  const endpoint = type === TMDBContentTypes.MOVIE ? "movie" : "tv";
  const data = await get<{
    results: TMDBMovieSearchResult[] | TMDBShowSearchResult[];
  }>(`/${endpoint}/${id}/recommendations`);

  const results = filterOutMatureMedia(
    (data.results ?? []) as Array<
      TMDBMovieSearchResult | TMDBShowSearchResult
    >,
  );
  return results.slice(0, limit) as
    | TMDBMovieSearchResult[]
    | TMDBShowSearchResult[];
}

// How many popularity-sorted pages deep genre-filtered results are allowed
// to range over when no specific page is requested.
const GENRE_DISCOVER_POOL_PAGES = 10;

/**
 * Fetches popular, well-voted media matching the given genres. Pass `page`
 * for a specific page, or omit it for a random page from within the pool
 * (shuffled before slicing, same reasoning as getAllTimeBestMovies/Shows).
 */
export async function getMediaByGenres(
  genreIds: number[],
  type: TMDBContentTypes,
  limit: number = 12,
  page: number | undefined = undefined,
): Promise<TMDBMovieSearchResult[] | TMDBShowSearchResult[]> {
  const targetPage =
    page ?? Math.floor(Math.random() * GENRE_DISCOVER_POOL_PAGES) + 1;
  const endpoint = type === TMDBContentTypes.MOVIE ? "movie" : "tv";
  const data = await get<{
    results: TMDBMovieSearchResult[] | TMDBShowSearchResult[];
  }>(`/discover/${endpoint}`, {
    page: targetPage,
    with_genres: genreIds.join(","),
    sort_by: "popularity.desc",
    "vote_count.gte": 200,
    include_adult: tmdbIncludeAdult(),
  });

  // discover results lack media_type; stamp it back on.
  const mediaType =
    type === TMDBContentTypes.MOVIE ? TMDBContentTypes.MOVIE : TMDBContentTypes.TV;
  return shuffleResults<TMDBMovieSearchResult | TMDBShowSearchResult>(
    data.results ?? [],
  )
    .slice(0, limit)
    .map((r) => ({
      ...r,
      media_type: mediaType,
    })) as TMDBMovieSearchResult[] | TMDBShowSearchResult[];
}

/** Fetches the current trending/most-popular-this-week movies (for taste onboarding). */
export async function getPopularMovies(
  limit: number = 15,
  page: number = 1,
): Promise<TMDBMovieSearchResult[]> {
  const data = await get<{ results: TMDBMovieSearchResult[] }>(
    "/movie/popular",
    { page },
  );
  return (data.results ?? []).slice(0, limit).map((r) => ({
    ...r,
    media_type: TMDBContentTypes.MOVIE,
  }));
}

/** Fetches the current trending/most-popular-this-week TV shows (for taste onboarding). */
export async function getPopularShows(
  limit: number = 15,
  page: number = 1,
): Promise<TMDBShowSearchResult[]> {
  const data = await get<{ results: TMDBShowSearchResult[] }>(
    "/tv/popular",
    { page },
  );
  return (data.results ?? []).slice(0, limit).map((r) => ({
    ...r,
    media_type: TMDBContentTypes.TV,
  }));
}

// Well-known-media pool tuning: sorted by popularity (not rating) so
// mainstream staples rank first, with a vote-count/vote-average floor as a
// quality gate. Widening the page range widens how far into the "everyone's
// at least heard of this" tail the pool reaches — more page depth surfaces
// more niche-but-known titles without the floor ever letting through
// something obscure or poorly received.
const WELL_KNOWN_MOVIE_VOTE_COUNT = 300;
const WELL_KNOWN_MOVIE_VOTE_AVERAGE = 6.0;
const WELL_KNOWN_MOVIE_POOL_PAGES = 50; // ~1000 movies (20/page)
const WELL_KNOWN_SHOW_VOTE_COUNT = 150;
const WELL_KNOWN_SHOW_VOTE_AVERAGE = 6.0;
const WELL_KNOWN_SHOW_POOL_PAGES = 20; // ~400 shows (20/page)

// Picking a random page alone isn't enough entropy: TMDB returns each page
// pre-sorted by popularity, so always taking the first `limit` results from
// that page means the same page's top few titles keep winning. Shuffling
// the page itself before slicing means every item on the fetched page has
// an equal shot, not just whichever happened to rank highest within it.
function shuffleResults<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** Pick `count` distinct random page numbers in 1..maxPage. */
function pickRandomPages(count: number, maxPage: number): number[] {
  const pages = new Set<number>();
  const capped = Math.min(count, maxPage);
  while (pages.size < capped) {
    pages.add(Math.floor(Math.random() * maxPage) + 1);
  }
  return [...pages];
}

/**
 * Fetches from a wide-but-curated pool of well-known movies (for taste
 * onboarding and the "random movie" picker). Uses /discover with a
 * popularity sort and a quality floor rather than /movie/top_rated, since
 * top_rated is dominated by obscure titles with a handful of 10/10 votes.
 * Pass `page` for a specific page, or omit it to pull enough random pages
 * from within the pool to satisfy `limit` (TMDB returns 20 per page).
 */
export async function getAllTimeBestMovies(
  limit: number = 15,
  page: number | undefined = undefined,
): Promise<TMDBMovieSearchResult[]> {
  const mapItem = (r: TMDBMovieSearchResult): TMDBMovieSearchResult => ({
    ...r,
    media_type: TMDBContentTypes.MOVIE,
  });

  const fetchPage = async (targetPage: number) => {
    const data = await get<{ results: TMDBMovieSearchResult[] }>(
      "/discover/movie",
      {
        page: targetPage,
        sort_by: "popularity.desc",
        "vote_count.gte": WELL_KNOWN_MOVIE_VOTE_COUNT,
        "vote_average.gte": WELL_KNOWN_MOVIE_VOTE_AVERAGE,
        include_adult: tmdbIncludeAdult(),
      },
    );
    return data.results ?? [];
  };

  if (page !== undefined) {
    return shuffleResults(await fetchPage(page))
      .slice(0, limit)
      .map(mapItem);
  }

  // One discover page is only ~20 titles — pull several random pages when
  // callers ask for a fuller carousel pool (after genre/dedupe thinning).
  const pagesNeeded = Math.max(1, Math.ceil(limit / 20));
  const pages = pickRandomPages(pagesNeeded, WELL_KNOWN_MOVIE_POOL_PAGES);
  const batches = await Promise.all(pages.map(fetchPage));
  const seen = new Set<number>();
  const merged: TMDBMovieSearchResult[] = [];
  for (const batch of batches) {
    for (const item of batch) {
      if (item?.id == null || seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }
  return shuffleResults(merged).slice(0, limit).map(mapItem);
}

/** Same as getAllTimeBestMovies, for TV shows. */
export async function getAllTimeBestShows(
  limit: number = 15,
  page: number | undefined = undefined,
): Promise<TMDBShowSearchResult[]> {
  const mapItem = (r: TMDBShowSearchResult): TMDBShowSearchResult => ({
    ...r,
    media_type: TMDBContentTypes.TV,
  });

  const fetchPage = async (targetPage: number) => {
    const data = await get<{ results: TMDBShowSearchResult[] }>(
      "/discover/tv",
      {
        page: targetPage,
        sort_by: "popularity.desc",
        "vote_count.gte": WELL_KNOWN_SHOW_VOTE_COUNT,
        "vote_average.gte": WELL_KNOWN_SHOW_VOTE_AVERAGE,
        include_adult: tmdbIncludeAdult(),
      },
    );
    return data.results ?? [];
  };

  if (page !== undefined) {
    return shuffleResults(await fetchPage(page))
      .slice(0, limit)
      .map(mapItem);
  }

  const pagesNeeded = Math.max(1, Math.ceil(limit / 20));
  const pages = pickRandomPages(pagesNeeded, WELL_KNOWN_SHOW_POOL_PAGES);
  const batches = await Promise.all(pages.map(fetchPage));
  const seen = new Set<number>();
  const merged: TMDBShowSearchResult[] = [];
  for (const batch of batches) {
    for (const item of batch) {
      if (item?.id == null || seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }
  return shuffleResults(merged).slice(0, limit).map(mapItem);
}

/** Fetches popular media from any of the given production companies. */
export async function getMediaByCompanies(
  companyIds: number[],
  type: TMDBContentTypes,
  limit: number = 12,
): Promise<TMDBMovieSearchResult[] | TMDBShowSearchResult[]> {
  const endpoint = type === TMDBContentTypes.MOVIE ? "movie" : "tv";
  const data = await get<{
    results: TMDBMovieSearchResult[] | TMDBShowSearchResult[];
  }>(`/discover/${endpoint}`, {
    with_companies: companyIds.join("|"),
    sort_by: "popularity.desc",
    "vote_count.gte": 200,
    include_adult: tmdbIncludeAdult(),
  });
  return data.results.slice(0, limit).map((r) => ({
    ...r,
    media_type: type,
  })) as TMDBMovieSearchResult[] | TMDBShowSearchResult[];
}

export async function getPersonDetails(id: string): Promise<TMDBPerson> {
  return get<TMDBPerson>(`/person/${id}`);
}

export async function getPersonImages(id: string): Promise<TMDBPersonImages> {
  return get<TMDBPersonImages>(`/person/${id}/images`);
}

export async function getPersonCombinedCredits(
  id: string,
): Promise<TMDBPersonCombinedCredits> {
  return get<TMDBPersonCombinedCredits>(`/person/${id}/combined_credits`);
}

export function getPersonProfileImage(
  profilePath: string | null,
): string | undefined {
  const shouldProxyTmdb = usePreferencesStore.getState().proxyTmdb;
  const imgUrl = `https://image.tmdb.org/t/p/w185/${profilePath}`;

  if (shouldProxyTmdb) {
    const proxyUrls = getProxyUrls();
    const proxy = getNextProxy(proxyUrls);
    if (proxy) {
      return `${proxy}/?destination=${imgUrl}`;
    }
  }

  if (profilePath) return imgUrl;
}
