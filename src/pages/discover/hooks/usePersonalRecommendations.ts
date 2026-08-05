import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { DiscoverMedia } from "@/pages/discover/types/discover";
import { useBookmarkStore } from "@/stores/bookmarks";
import { useProgressStore } from "@/stores/progress";
import {
  AlgorithmPreferences,
  RatedMediaItem,
  useRatingsStore,
} from "@/stores/ratings";
import { useWatchHistoryStore } from "@/stores/watchHistory";

import {
  type HistorySource,
  type ProgressSource,
  type RatingSource,
  fetchPersonalRecommendations,
} from "../lib/personalRecommendations";
import {
  readRecommendationsCache,
  writeRecommendationsCache,
} from "../lib/recommendationsCache";
import { hydrateMissingCompletedGenres } from "../lib/watchHistoryGenres";
import type { WatchHistoryItem } from "@/stores/watchHistory";

const recommendationsInFlight = new Map<string, Promise<DiscoverMedia[]>>();

export interface UsePersonalRecommendationsOptions {
  isTVShow: boolean;
  enabled?: boolean;
}

/**
 * Cheap, non-fetching check for whether there's enough signal (of the given
 * type) for personalized recommendations to produce anything — mirrors the
 * `hasAnySource` gate inside usePersonalRecommendations' fetch, so callers
 * that need to decide "should I even offer a For You view" (e.g. picking a
 * default tab) get the same answer the hook itself would, without needing to
 * actually fetch. A rating alone isn't enough: someone who rated a batch of
 * things "meh"/"didn't like it" during testing has no positive signal and
 * would otherwise silently fall through to trending, looking unchanged.
 *
 * Bookmarks count only as "you have some taste signal" for tab visibility —
 * they do not feed the algorithm itself.
 */
export function useHasRecommendationSignal(isTVShow: boolean): boolean {
  const watchHistoryItems = useWatchHistoryStore((s) => s.items);
  const progressItems = useProgressStore((s) => s.items);
  const hasBookmark = useBookmarkStore((s) =>
    Object.values(s.bookmarks).some(
      (item) => item.type === (isTVShow ? "show" : "movie"),
    ),
  );
  const ratingItems = useRatingsStore((s) => s.ratings);
  const preferences = useRatingsStore((s) => s.preferences);

  const wantedType = isTVShow ? "show" : "movie";
  const hasHistory = Object.values(watchHistoryItems).some(
    (item) => item.type === wantedType,
  );
  const hasProgress = Object.values(progressItems).some(
    (item) => item.type === wantedType,
  );
  const hasPositiveRating = Object.values(ratingItems).some(
    (r) => r.rating === "liked" || r.rating === "loved",
  );
  const hasPrefs =
    preferences.favoriteGenres.length > 0 ||
    preferences.moods.length > 0 ||
    preferences.franchises.length > 0;

  return (
    hasHistory || hasProgress || hasBookmark || hasPositiveRating || hasPrefs
  );
}

export interface UsePersonalRecommendationsReturn {
  media: DiscoverMedia[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  sectionTitle: string;
  hasRecommendations: boolean;
  // True once the hook has resolved at least one fetch attempt (through any
  // exit path — success, error, or "no source"). isLoading starts false, so
  // callers that need to distinguish "hasn't started yet" from "genuinely
  // has nothing" should gate on this instead — otherwise the empty initial
  // `media: []` looks identical to a real empty result before the first
  // fetch even begins.
  hasSettled: boolean;
}

function getHistorySources(
  items: Record<string, WatchHistoryItem>,
): HistorySource[] {
  const byKey: Map<string, HistorySource> = new Map();

  for (const [key, item] of Object.entries(items)) {
    const isEpisode = key.includes("-");
    const tmdbId = isEpisode ? key.split("-")[0]! : key;
    const existing = byKey.get(tmdbId);
    const watchedAt = item.watchedAt;

    if (!existing) {
      byKey.set(tmdbId, {
        tmdbId,
        type: item.type,
        watchedAt,
        completed: item.completed,
        genreIds: item.genreIds,
      });
      continue;
    }

    // Prefer any completed show/movie entry; among equals, take most recent.
    // Carry over genreIds if the preferred entry lacks them.
    const takeThis =
      (item.completed && !existing.completed) ||
      (item.completed === existing.completed &&
        watchedAt > existing.watchedAt);

    if (takeThis) {
      byKey.set(tmdbId, {
        tmdbId,
        type: item.type,
        watchedAt,
        completed: item.completed,
        genreIds:
          item.genreIds && item.genreIds.length > 0
            ? item.genreIds
            : existing.genreIds,
      });
    } else if (
      (!existing.genreIds || existing.genreIds.length === 0) &&
      item.genreIds &&
      item.genreIds.length > 0
    ) {
      existing.genreIds = item.genreIds;
    }
  }

  return Array.from(byKey.values()).sort((a, b) => b.watchedAt - a.watchedAt);
}

// Compact fingerprint of everything the algorithm reacts to, so the cache
// invalidates itself the moment a rating, watch, or preference changes.
// Bookmarks are omitted — saving must not recompute For You.
function buildSignature(
  ratingItems: Record<string, RatedMediaItem>,
  preferences: AlgorithmPreferences,
  watchHistoryItems: Record<string, unknown>,
  progressItems: Record<string, unknown>,
): string {
  const ratingsKey = Object.entries(ratingItems)
    .map(([id, r]) => `${id}:${r.rating}`)
    .sort()
    .join(",");
  const historyKey = Object.keys(watchHistoryItems).sort().join(",");
  const progressKey = Object.keys(progressItems).sort().join(",");
  return [ratingsKey, historyKey, progressKey, JSON.stringify(preferences)].join(
    "|",
  );
}

export function usePersonalRecommendations({
  isTVShow,
  enabled = true,
}: UsePersonalRecommendationsOptions): UsePersonalRecommendationsReturn {
  const { t } = useTranslation();
  const [media, setMedia] = useState<DiscoverMedia[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSettled, setHasSettled] = useState(false);
  const mediaLengthRef = useRef(0);
  mediaLengthRef.current = media.length;

  const watchHistoryItems = useWatchHistoryStore((s) => s.items);
  const progressItems = useProgressStore((s) => s.items);
  const ratingItems = useRatingsStore((s) => s.ratings);
  const preferences = useRatingsStore((s) => s.preferences);

  // Exclude watched/in-progress only — never bookmarks.
  const buildExcludeSet = useCallback(() => {
    const exclude = new Set<string>();
    for (const key of Object.keys(watchHistoryItems)) {
      if (key.includes("-")) exclude.add(key.split("-")[0]!);
      else exclude.add(key);
    }
    for (const id of Object.keys(progressItems)) exclude.add(id);
    return exclude;
  }, [watchHistoryItems, progressItems]);

  const fetch = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? false;
    // Snapshot only — bookmarks are not a reactive dependency, so saving
    // never retriggers this fetch or reshapes on-screen rows.
    const bookmarks = useBookmarkStore.getState().bookmarks;

    const history: HistorySource[] = getHistorySources(watchHistoryItems);
    const progress: ProgressSource[] = Object.entries(progressItems).map(
      ([tmdbId, item]) => ({ tmdbId, type: item.type }),
    );
    const bookmarkList = Object.entries(bookmarks).map(([tmdbId, item]) => ({
      tmdbId,
      type: item.type,
      title: item.title,
      year: item.year,
      poster: item.poster,
    }));

    const ratings: RatingSource[] = Object.entries(ratingItems).map(
      ([tmdbId, item]) => ({
        tmdbId,
        type: item.type,
        rating: item.rating,
        genreIds: item.genreIds,
        ratedAt: item.ratedAt,
      }),
    );

    const wantedType = isTVShow ? "show" : "movie";
    const hasAnySource =
      history.some((h) => h.type === wantedType) ||
      progress.some((p) => p.type === wantedType) ||
      bookmarkList.some((b) => b.type === wantedType) ||
      // Ratings of either type count; the taste profile is cross-type.
      ratings.some((r) => r.rating === "liked" || r.rating === "loved") ||
      preferences.favoriteGenres.length > 0 ||
      preferences.moods.length > 0 ||
      preferences.franchises.length > 0;

    if (!hasAnySource) {
      setMedia([]);
      setError(null);
      setHasSettled(true);
      return;
    }

    const cacheKey = wantedType;
    const signature = buildSignature(
      ratingItems,
      preferences,
      watchHistoryItems,
      progressItems,
    );

    if (!background) {
      const cached = readRecommendationsCache(cacheKey, signature);
      if (cached.freshness !== "miss") {
        setMedia(cached.media);
        setError(null);
        setIsLoading(false);
        setHasSettled(true);
        // Cache is usable but aging - refresh it quietly, no skeleton flash.
        if (cached.freshness === "stale") fetch({ background: true });
        return;
      }
    }

    // Never flash skeletons when we already have rows on screen.
    const quiet = background || mediaLengthRef.current > 0;
    if (!quiet) setIsLoading(true);
    setError(null);

    try {
      // Backfill genres on older completed watches so taste can use them.
      await hydrateMissingCompletedGenres(15);
      const historyAfterHydrate: HistorySource[] =
        getHistorySources(useWatchHistoryStore.getState().items);

      const excludeIds = buildExcludeSet();
      const inFlightKey = `${cacheKey}:${signature}`;
      const activeRequest = recommendationsInFlight.get(inFlightKey);

      const results = await (activeRequest ??
        (() => {
          const request = fetchPersonalRecommendations(
            isTVShow,
            historyAfterHydrate,
            progress,
            bookmarkList,
            excludeIds,
            ratings,
            preferences,
          ).finally(() => {
            recommendationsInFlight.delete(inFlightKey);
          });

          recommendationsInFlight.set(inFlightKey, request);
          return request;
        })());

      setMedia(results);
      writeRecommendationsCache(cacheKey, signature, results);
    } catch (err) {
      if (!quiet) {
        setError((err as Error).message);
        setMedia([]);
      }
    } finally {
      if (!quiet) {
        setIsLoading(false);
      }
      setHasSettled(true);
    }
  }, [
    isTVShow,
    watchHistoryItems,
    progressItems,
    ratingItems,
    preferences,
    buildExcludeSet,
  ]);

  useEffect(() => {
    if (enabled) fetch();
  }, [enabled, fetch]);

  const historyCount = getHistorySources(watchHistoryItems).filter(
    (h) => h.type === (isTVShow ? "show" : "movie"),
  ).length;
  const progressCount = Object.values(progressItems).filter(
    (p) => p.type === (isTVShow ? "show" : "movie"),
  ).length;
  const likedCount = Object.values(ratingItems).filter(
    (r) => r.rating === "liked" || r.rating === "loved",
  ).length;
  const hasRecommendations =
    historyCount > 0 || progressCount > 0 || likedCount > 0;

  const sectionTitle = t("discover.carousel.title.forYou");

  return {
    media,
    isLoading,
    error,
    refetch: fetch,
    sectionTitle,
    hasRecommendations,
    hasSettled,
  };
}
