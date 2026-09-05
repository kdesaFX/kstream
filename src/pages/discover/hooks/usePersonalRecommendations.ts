import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { DiscoverMedia } from "@/pages/discover/types/discover";
import { useProgressStore } from "@/stores/progress";
import {
  AlgorithmPreferences,
  RatedMediaItem,
  useRatingsStore,
} from "@/stores/ratings";
import { useWatchHistoryStore } from "@/stores/watchHistory";
import { progressMediaIsHighPercentage } from "@/stores/progress/utils";

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

function sameDiscoverIds(a: DiscoverMedia[], b: DiscoverMedia[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i]!.id) !== String(b[i]!.id)) return false;
  }
  return true;
}

export interface UsePersonalRecommendationsOptions {
  isTVShow: boolean;
  enabled?: boolean;
}

/**
 * Cheap, non-fetching check for whether there's enough signal for
 * personalized recommendations — mirrors the `hasAnySource` gate inside
 * usePersonalRecommendations' fetch. History/progress/ratings of either
 * media type count (taste is cross-type). A rating alone isn't enough if
 * every rating is "meh"/"didn't like it" — needs a positive like/love,
 * prefs, or watch signal.
 *
 * Bookmarks are not a signal — saving only adds to Saved Titles.
 */
export function useHasRecommendationSignal(_isTVShow: boolean): boolean {
  const watchHistoryItems = useWatchHistoryStore((s) => s.items);
  const progressItems = useProgressStore((s) => s.items);
  const ratingItems = useRatingsStore((s) => s.ratings);
  const preferences = useRatingsStore((s) => s.preferences);

  const hasHistory = Object.keys(watchHistoryItems).length > 0;
  const hasProgress = Object.keys(progressItems).length > 0;
  const hasPositiveRating = Object.values(ratingItems).some(
    (r) => r.rating === "liked" || r.rating === "loved",
  );
  const hasPrefs =
    preferences.favoriteGenres.length > 0 ||
    preferences.moods.length > 0 ||
    preferences.franchises.length > 0;

  return hasHistory || hasProgress || hasPositiveRating || hasPrefs;
}

/**
 * Whether the featured hero should use personal recommendations.
 * Requires a real algorithm (wizard prefs / likes) or high-% watches —
 * casual opens with a few minutes watched stay on the default discover pool.
 */
export function hasFeaturedAlgorithmSignal(_isTVShow: boolean): boolean {
  const preferences = useRatingsStore.getState().preferences;
  const ratingItems = useRatingsStore.getState().ratings;
  const watchHistoryItems = useWatchHistoryStore.getState().items;
  const progressItems = useProgressStore.getState().items;

  if (preferences.completedOnboarding) return true;
  if (
    preferences.favoriteGenres.length > 0 ||
    preferences.moods.length > 0 ||
    preferences.franchises.length > 0
  ) {
    return true;
  }
  if (
    Object.values(ratingItems).some(
      (r) => r.rating === "liked" || r.rating === "loved",
    )
  ) {
    return true;
  }
  // Completed / high-% watches of either type personalize both carousels.
  if (Object.values(watchHistoryItems).some((item) => item.completed)) {
    return true;
  }
  if (
    Object.values(progressItems).some((item) =>
      progressMediaIsHighPercentage(item),
    )
  ) {
    return true;
  }

  return false;
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

export function getHistorySources(
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

// Compact fingerprint of everything the algorithm reacts to.
// Bookmarks are omitted — saving must not recompute For You.
function buildSignature(
  ratingItems: Record<string, RatedMediaItem>,
  preferences: AlgorithmPreferences,
  watchHistoryItems: Record<string, unknown>,
  progressItems: Record<string, { updatedAt?: number }>,
): string {
  const ratingsKey = Object.entries(ratingItems)
    .map(([id, r]) => `${id}:${r.rating}`)
    .sort()
    .join(",");
  const historyKey = Object.keys(watchHistoryItems).sort().join(",");
  // Include updatedAt so finishing a watch / returning home re-seeds related.
  const progressKey = Object.entries(progressItems)
    .map(([id, item]) => `${id}:${item.updatedAt ?? 0}`)
    .sort()
    .join(",");
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

    const history: HistorySource[] = getHistorySources(watchHistoryItems);
    const progress: ProgressSource[] = Object.entries(progressItems).map(
      ([tmdbId, item]) => ({
        tmdbId,
        type: item.type,
        updatedAt: item.updatedAt,
      }),
    );

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
    // History/progress/ratings of either type unlock For You — taste is cross-type.
    const hasAnySource =
      history.length > 0 ||
      progress.length > 0 ||
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
        setMedia((prev) =>
          sameDiscoverIds(prev, cached.media) ? prev : cached.media,
        );
        setError(null);
        setIsLoading(false);
        setHasSettled(true);
        // Cache is usable but aging - refresh it quietly, no skeleton flash.
        if (cached.freshness === "stale") void fetch({ background: true });
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
            excludeIds,
            ratings,
            preferences,
          ).finally(() => {
            recommendationsInFlight.delete(inFlightKey);
          });

          recommendationsInFlight.set(inFlightKey, request);
          return request;
        })());

      // Same ids → keep previous array so discover carousels don't thrash.
      setMedia((prev) => (sameDiscoverIds(prev, results) ? prev : results));
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

  // Compact fingerprint of inputs — avoid re-fetching when only object
  // identity changes (e.g. genre backfill rewriting the same history keys).
  const tasteSignature = buildSignature(
    ratingItems,
    preferences,
    watchHistoryItems,
    progressItems,
  );

  useEffect(() => {
    if (enabled) fetch();
    // fetch closes over the latest store slices; signature is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, isTVShow, tasteSignature]);

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

  return useMemo(
    () => ({
      media,
      isLoading,
      error,
      refetch: fetch,
      sectionTitle,
      hasRecommendations,
      hasSettled,
    }),
    [
      media,
      isLoading,
      error,
      fetch,
      sectionTitle,
      hasRecommendations,
      hasSettled,
    ],
  );
}
