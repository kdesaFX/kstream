/**
 * Some sources answer with a stream that is not the title we asked for — 1Embed
 * and 7Movies both hand back an unrelated 20 minute video for the 12 minute
 * anime episode `tmdb-86836 S1E1`, for instance. Nothing in the stream says
 * which title it is, but its length does: a video that is nowhere near the
 * runtime TMDB reports is the wrong video.
 */

export interface RuntimeExpectation {
  minutes: number;
  /** `exact` is this episode's/movie's own runtime; `average` is a show-wide guess. */
  confidence: "exact" | "average";
}

export interface RuntimeMetaLike {
  type: "movie" | "show";
  /** Movie length in minutes. */
  runtime?: number | null;
  /** Typical episode length in minutes, for shows. */
  episodeRuntime?: number | null;
  episode?: { runtime?: number | null };
}

/** Runtimes below this are too short for a ratio test to mean anything. */
const MIN_USABLE_MINUTES = 3;

/**
 * How far from the expected runtime a stream may land. Tolerances are wide
 * because legitimate variance is real: extended cuts, recaps, ad bumpers,
 * feature-length premieres. They only have to be tight enough to catch a
 * different title, which is normally off by a factor, not by minutes.
 */
const TOLERANCE = {
  exact: { low: 0.6, high: 1.5, slackMinutes: 6 },
  // A show-wide average is often wrong for premieres/finales, so allow double.
  average: { low: 0.4, high: 2.1, slackMinutes: 12 },
} as const;

export function expectedRuntime(
  meta: RuntimeMetaLike | null | undefined,
): RuntimeExpectation | null {
  if (!meta) return null;

  const usable = (value: number | null | undefined): number | null =>
    typeof value === "number" && Number.isFinite(value) && value >= MIN_USABLE_MINUTES
      ? value
      : null;

  if (meta.type === "movie") {
    const runtime = usable(meta.runtime);
    return runtime ? { minutes: runtime, confidence: "exact" } : null;
  }

  const episodeRuntime = usable(meta.episode?.runtime);
  if (episodeRuntime) return { minutes: episodeRuntime, confidence: "exact" };

  const average = usable(meta.episodeRuntime);
  return average ? { minutes: average, confidence: "average" } : null;
}

/** The window a stream's length may fall in and still be considered this title. */
export function allowedDurationRange(expectation: RuntimeExpectation): {
  minMinutes: number;
  maxMinutes: number;
} {
  const { low, high, slackMinutes } = TOLERANCE[expectation.confidence];
  return {
    minMinutes: Math.min(expectation.minutes * low, expectation.minutes - slackMinutes),
    maxMinutes: Math.max(expectation.minutes * high, expectation.minutes + slackMinutes),
  };
}

export type RuntimeVerdict = "ok" | "tooShort" | "tooLong";

/**
 * How a loaded stream's duration compares with the runtime the title should
 * have. Fails open to `ok`: an unknown runtime, a live/unbounded stream, or a
 * duration the player has not worked out yet is never called wrong.
 */
export function runtimeVerdict(
  meta: RuntimeMetaLike | null | undefined,
  durationSeconds: number | null | undefined,
): RuntimeVerdict {
  const expectation = expectedRuntime(meta);
  if (!expectation) return "ok";
  if (
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return "ok";
  }

  const minutes = durationSeconds / 60;
  if (minutes < 1) return "ok";

  const { minMinutes, maxMinutes } = allowedDurationRange(expectation);
  if (minutes > maxMinutes) return "tooLong";
  if (minutes < minMinutes) return "tooShort";
  return "ok";
}

/** True when a stream's duration says it cannot be the requested title. */
export function isWrongRuntime(
  meta: RuntimeMetaLike | null | undefined,
  durationSeconds: number | null | undefined,
): boolean {
  return runtimeVerdict(meta, durationSeconds) !== "ok";
}
