/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import type { ProgressMediaItem } from "@/stores/progress";
import {
  progressHasMeaningfulWatch,
  progressIsNotStarted,
  shouldShowInWatchHistory,
  shouldShowProgress,
} from "@/stores/progress/utils";

function movie(watched: number, duration = 2 * 60 * 60): ProgressMediaItem {
  return {
    title: "Movie",
    type: "movie",
    updatedAt: 0,
    seasons: {},
    episodes: {},
    progress: { watched, duration },
  };
}

describe("progress visibility", () => {
  it("shows a movie after one minute in Continue Watching and Watch History", () => {
    const item = movie(60);

    expect(progressIsNotStarted(2 * 60 * 60, 60)).toBe(false);
    expect(shouldShowProgress(item).show).toBe(true);
    expect(shouldShowInWatchHistory(item)).toBe(true);
  });

  it("still ignores a brief accidental play", () => {
    const item = movie(20);

    expect(shouldShowProgress(item).show).toBe(false);
    expect(shouldShowInWatchHistory(item)).toBe(false);
  });

  it("keeps the recommendation threshold at three minutes", () => {
    expect(progressHasMeaningfulWatch(movie(179))).toBe(false);
    expect(progressHasMeaningfulWatch(movie(180))).toBe(true);
  });
});
