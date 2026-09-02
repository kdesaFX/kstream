/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  isPlayerRoute,
  shouldUseBrowsePerformance,
} from "@/utils/performance/browseOnly";

describe("browseOnly performance scope", () => {
  it("detects player routes", () => {
    expect(isPlayerRoute("/media/tmdb-movie-35")).toBe(true);
    expect(isPlayerRoute("/")).toBe(false);
    expect(isPlayerRoute("/discover")).toBe(false);
  });

  it("skips browse perf tweaks on the player", () => {
    expect(
      shouldUseBrowsePerformance("/media/tmdb-movie-35", true),
    ).toBe(false);
    expect(shouldUseBrowsePerformance("/discover", true)).toBe(true);
    expect(shouldUseBrowsePerformance("/discover", false)).toBe(false);
  });
});
