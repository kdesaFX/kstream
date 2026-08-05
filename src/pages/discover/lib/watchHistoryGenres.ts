import { getMediaDetails } from "@/backend/metadata/tmdb";
import { TMDBContentTypes } from "@/backend/metadata/types/tmdb";
import { useWatchHistoryStore } from "@/stores/watchHistory";

const genreFetchCache = new Map<string, Promise<number[]>>();

/**
 * Fetches TMDB genre ids for a title (show-level for series). Soft-fails to [].
 */
export async function fetchGenreIdsForMedia(
  tmdbId: string,
  type: "movie" | "show",
): Promise<number[]> {
  const cacheKey = `${type}:${tmdbId}`;
  const cached = genreFetchCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const details = await getMediaDetails(
        tmdbId,
        type === "show" ? TMDBContentTypes.TV : TMDBContentTypes.MOVIE,
        false,
      );
      const genres = (details as { genres?: { id: number }[] }).genres;
      return genres?.map((g) => g.id) ?? [];
    } catch {
      return [];
    }
  })();

  genreFetchCache.set(cacheKey, promise);
  return promise;
}

/**
 * Ensures a watch-history entry has genreIds; writes back to the store on success.
 */
export async function hydrateHistoryItemGenres(
  historyKey: string,
  tmdbId: string,
  type: "movie" | "show",
): Promise<number[]> {
  const item = useWatchHistoryStore.getState().items[historyKey];
  if (item?.genreIds && item.genreIds.length > 0) return item.genreIds;

  const genreIds = await fetchGenreIdsForMedia(tmdbId, type);
  if (genreIds.length > 0) {
    useWatchHistoryStore.getState().setItemGenres(historyKey, genreIds);
  }
  return genreIds;
}

/**
 * Backfill genres for completed history items missing them (bounded concurrency).
 */
export async function hydrateMissingCompletedGenres(
  limit = 20,
): Promise<void> {
  const items = useWatchHistoryStore.getState().items;
  const missing = Object.entries(items)
    .filter(
      ([, item]) =>
        item.completed && (!item.genreIds || item.genreIds.length === 0),
    )
    .slice(0, limit);

  await Promise.all(
    missing.map(([key, item]) => {
      const tmdbId = key.includes("-") ? key.split("-")[0]! : key;
      return hydrateHistoryItemGenres(key, tmdbId, item.type);
    }),
  );
}
