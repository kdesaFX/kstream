/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { createPlaybackRetryBudget } from "./playbackRetryBudget";

describe("playbackRetryBudget", () => {
  it("exhausts repeated recovery attempts for the same media", () => {
    const budget = createPlaybackRetryBudget();
    budget.setMedia("movie-767");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(budget.isExhausted(3)).toBe(false);
      budget.recordAttempt();

      // A successful scrape can return another unplayable stream. Re-setting
      // the same media must not restore its automatic retry budget.
      budget.setMedia("movie-767");
    }

    expect(budget.getAttemptCount()).toBe(3);
    expect(budget.isExhausted(3)).toBe(true);
  });

  it("starts a fresh budget when the media changes", () => {
    const budget = createPlaybackRetryBudget();
    budget.setMedia("movie-767");
    budget.recordAttempt();

    budget.setMedia("movie-768");

    expect(budget.getAttemptCount()).toBe(0);
    expect(budget.isExhausted(1)).toBe(false);
  });
});
