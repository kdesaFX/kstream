import {
  ProgressEpisodeItem,
  ProgressItem,
  ProgressMediaItem,
  ProgressSeasonItem,
} from "@/stores/progress";

export interface ShowProgressResult {
  episode?: ProgressEpisodeItem;
  season?: ProgressSeasonItem;
  progress: ProgressItem;
  show: boolean;
}

const defaultProgress = {
  duration: 0,
  watched: 0,
};

/**
 * Treat as finished for Continue Watching + algorithm history.
 * People often bail during credits, so we accept ~80% OR (for titles
 * longer than 10 minutes) within 5 minutes of the end.
 */
export function progressIsCompleted(
  duration: number,
  watched: number,
): boolean {
  if (duration <= 0 || watched <= 0) return false;
  if (watched / duration >= 0.8) return true;
  // Avoid marking short clips complete just because remaining < 5 min
  if (duration > 60 * 10 && duration - watched <= 60 * 5) return true;
  return false;
}

/**
 * Seconds of playback before a title appears in Continue Watching /
 * Watch History. Caps via a small fraction so short episodes aren't
 * blocked for nearly their whole runtime.
 */
export const MIN_WATCH_SECONDS = 90;

/** Fraction of runtime for recommendation / "Because You Watched" signal. */
export const MIN_RECOMMENDATION_FRACTION = 0.15;

export function progressIsNotStarted(
  duration: number,
  watched: number,
): boolean {
  // Ignore brief opens / accidental plays — don't put them in Continue
  // Watching. (Previously a 35% gate hid almost everything.)
  if (duration <= 0 || watched <= 0) return true;
  const threshold = Math.min(
    MIN_WATCH_SECONDS,
    Math.max(20, duration * 0.05),
  );
  return watched < threshold;
}

function progressIsMeaningfulForRecommendations(
  duration: number,
  watched: number,
): boolean {
  if (duration <= 0 || watched <= 0) return false;
  if (progressIsCompleted(duration, watched)) return true;
  if (watched / duration >= MIN_RECOMMENDATION_FRACTION) return true;
  // Long titles: ~3 minutes is enough signal even under 15%.
  return watched >= MIN_WATCH_SECONDS * 2;
}

/**
 * True once the user has watched enough of this title (or any episode)
 * for it to count as real signal for recommendations.
 */
export function progressHasMeaningfulWatch(item: ProgressMediaItem): boolean {
  if (item.type !== "show") {
    return progressIsMeaningfulForRecommendations(
      item.progress?.duration ?? 0,
      item.progress?.watched ?? 0,
    );
  }

  return Object.values(item.episodes).some((epi) =>
    progressIsMeaningfulForRecommendations(
      epi.progress.duration,
      epi.progress.watched,
    ),
  );
}

function progressIsAcceptableRange(duration: number, watched: number): boolean {
  // not started enough yet, not acceptable
  if (progressIsNotStarted(duration, watched)) return false;

  // is already at the end, not acceptable
  if (progressIsCompleted(duration, watched)) return false;

  // satisfied all constraints
  return true;
}

function isFirstEpisodeOfShow(
  item: ProgressMediaItem,
  episode: ProgressEpisodeItem,
): boolean {
  const seasonId = episode.seasonId;
  const season = item.seasons[seasonId];
  return season.number === 1 && episode.number === 1;
}

export function getProgressPercentage(
  watched: number,
  duration: number,
): number {
  // Handle edge cases to prevent infinity or invalid percentages
  if (!duration || duration <= 0) return 0;
  if (!watched || watched < 0) return 0;

  // Cap percentage at 100% to prevent >100% values
  const percentage = Math.min((watched / duration) * 100, 100);
  return percentage;
}

export function shouldShowProgress(
  item: ProgressMediaItem,
): ShowProgressResult {
  // non shows just hide or show depending on acceptable ranges
  if (item.type !== "show") {
    return {
      show: progressIsAcceptableRange(
        item.progress?.duration ?? 0,
        item.progress?.watched ?? 0,
      ),
      progress: item.progress ?? defaultProgress,
    };
  }

  // shows only hide an item if its too early in episode, it still shows if its near the end.
  // Otherwise you would lose episode progress
  const ep = Object.values(item.episodes)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter(
      (epi) =>
        !progressIsNotStarted(epi.progress.duration, epi.progress.watched) ||
        !isFirstEpisodeOfShow(item, epi),
    )[0];

  const season = item.seasons[ep?.seasonId];
  if (!ep || !season)
    return {
      show: false,
      progress: defaultProgress,
    };
  return {
    season,
    episode: ep,
    show: true,
    progress: ep.progress,
  };
}

/**
 * Watch History includes in-progress AND finished titles (Continue Watching
 * intentionally drops completed items).
 */
export function shouldShowInWatchHistory(item: ProgressMediaItem): boolean {
  if (item.type !== "show") {
    return !progressIsNotStarted(
      item.progress?.duration ?? 0,
      item.progress?.watched ?? 0,
    );
  }

  return Object.values(item.episodes).some(
    (epi) =>
      !progressIsNotStarted(epi.progress.duration, epi.progress.watched),
  );
}
