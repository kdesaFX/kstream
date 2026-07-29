/* eslint-disable import/no-extraneous-dependencies */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  readRecommendationsCache,
  writeRecommendationsCache,
} from "./recommendationsCache";

describe("recommendationsCache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns fresh data when signature matches", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    writeRecommendationsCache("movie", "sig-1", [
      {
        id: 42,
        title: "Example",
        poster_path: "/poster.jpg",
        backdrop_path: "/backdrop.jpg",
        overview: "summary",
        vote_average: 7.8,
        vote_count: 1200,
        type: "movie",
      },
    ]);

    const result = readRecommendationsCache("movie", "sig-1");

    expect(result.freshness).toBe("fresh");
    expect(result.media).toHaveLength(1);
    expect(result.media[0]?.id).toBe(42);

    nowSpy.mockRestore();
  });

  it("returns miss when signature differs", () => {
    writeRecommendationsCache("show", "sig-a", []);

    const result = readRecommendationsCache("show", "sig-b");

    expect(result.freshness).toBe("miss");
    expect(result.media).toEqual([]);
  });
});
