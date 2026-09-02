import { describe, expect, it } from "vitest";

import { formatVoteAverage } from "./discoverMediaItem";

describe("formatVoteAverage", () => {
  it("returns undefined for missing or invalid values", () => {
    expect(formatVoteAverage(undefined)).toBeUndefined();
    expect(formatVoteAverage(null)).toBeUndefined();
    expect(formatVoteAverage(0)).toBeUndefined();
    expect(formatVoteAverage(-1)).toBeUndefined();
    expect(formatVoteAverage(Number.NaN)).toBeUndefined();
  });

  it("keeps positive TMDB scores", () => {
    expect(formatVoteAverage(7.8)).toBe(7.8);
    expect(formatVoteAverage(0.1)).toBe(0.1);
  });
});
