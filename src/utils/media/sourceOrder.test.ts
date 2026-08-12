/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  getMediaBucket,
  orderSourceIdsForPlayback,
} from "@/utils/media/sourceOrder";
import type { SourceScoreMatrix } from "@/utils/media/sourcePerformance.generated";

const matrix: SourceScoreMatrix = {
  updatedAt: "test",
  animeOnly: ["tqq", "myanime"],
  scores: {
    tqq: { browser: { anime: 100 }, extension: { anime: 100 } },
    myanime: { browser: { anime: 10 }, extension: { anime: 10 } },
    vidrock: {
      browser: { movie: 90, show: 80, anime: 70 },
      extension: { movie: 95, show: 85, anime: 75 },
    },
    reyna: {
      browser: { movie: 10, show: 90, anime: 20 },
      extension: { movie: 10, show: 90, anime: 20 },
    },
    fsonline: {
      browser: { movie: 70, show: 70, anime: 60 },
      extension: { movie: 70, show: 70, anime: 60 },
    },
    oneembed: {
      browser: { movie: 95, show: 95, anime: 100 },
      extension: { movie: 95, show: 90, anime: 90 },
    },
  },
};

const animeMeta = {
  genreIds: [16],
  originalLanguage: "ja",
  originCountry: ["JP"],
};

const westernMeta = {
  genreIds: [28],
  originalLanguage: "en",
  originCountry: ["US"],
};

describe("orderSourceIdsForPlayback", () => {
  it("puts TQQ first on anime and hides it on western movies", () => {
    const ids = ["reyna", "vidrock", "tqq", "fsonline"];
    const animeOrder = orderSourceIdsForPlayback(
      ids,
      { env: "browser", mediaType: "movie", meta: animeMeta },
      matrix,
    );
    expect(animeOrder[0]).toBe("tqq");

    const movieOrder = orderSourceIdsForPlayback(
      ids,
      { env: "browser", mediaType: "movie", meta: westernMeta },
      matrix,
    );
    expect(movieOrder).not.toContain("tqq");
    expect(movieOrder[0]).toBe("vidrock");
  });

  it("ranks Reyna above Granite on shows when show score is higher", () => {
    const ids = ["vidrock", "reyna", "fsonline"];
    const showOrder = orderSourceIdsForPlayback(
      ids,
      { env: "browser", mediaType: "show", meta: westernMeta },
      matrix,
    );
    expect(showOrder[0]).toBe("reyna");
  });

  it("detects anime bucket", () => {
    expect(getMediaBucket("movie", animeMeta)).toBe("anime");
    expect(getMediaBucket("show", westernMeta)).toBe("show");
    expect(getMediaBucket("movie", westernMeta)).toBe("movie");
  });

  it("on anime, ranks by anime hit rate and only lets specialists win ties", () => {
    const ids = ["myanime", "fsonline", "oneembed", "tqq", "reyna"];
    const animeOrder = orderSourceIdsForPlayback(
      ids,
      { env: "browser", mediaType: "movie", meta: animeMeta },
      matrix,
    );
    // TQQ and 1Embed both 100 — specialist wins the tie.
    expect(animeOrder.slice(0, 2)).toEqual(["tqq", "oneembed"]);
    // Weak anime-only source does not jump ahead of stronger generals.
    expect(animeOrder.indexOf("fsonline")).toBeLessThan(
      animeOrder.indexOf("myanime"),
    );
    expect(animeOrder.indexOf("fsonline")).toBeLessThan(
      animeOrder.indexOf("reyna"),
    );
  });
});
