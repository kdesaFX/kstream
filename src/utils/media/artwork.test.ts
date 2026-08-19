/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { rewriteTmdbPosterUrl, tmdbPosterSize } from "@/utils/media/artwork";

describe("artwork urls", () => {
  it("uses w185 for low quality posters", () => {
    expect(tmdbPosterSize("low")).toBe("w185");
    expect(
      rewriteTmdbPosterUrl("https://image.tmdb.org/t/p/w342/abc.jpg", "low"),
    ).toBe("https://image.tmdb.org/t/p/w185/abc.jpg");
  });

  it("leaves standard posters alone", () => {
    const url = "https://image.tmdb.org/t/p/w342/abc.jpg";
    expect(rewriteTmdbPosterUrl(url, "standard")).toBe(url);
  });
});
