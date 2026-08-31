/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  getMediaBucket,
  orderSourceIdsForPlayback,
  prioritizeConfiguredSources,
} from "@/utils/media/sourceOrder";
import type { SourceScoreMatrix } from "@/utils/media/sourcePerformance.generated";

const matrix: SourceScoreMatrix = {
  updatedAt: "test",
  animeOnly: ["tqq", "myanime", "anidap"],
  scores: {
    tqq: { browser: { anime: 100 }, extension: { anime: 100 } },
    myanime: { browser: { anime: 10 }, extension: { anime: 10 } },
    anidap: { browser: { anime: 90 }, extension: { anime: 90 } },
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
    const ids = ["reyna", "vidrock", "tqq", "anidap", "fsonline"];
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
    expect(movieOrder).not.toContain("anidap");
    expect(movieOrder[0]).toBe("vidrock");
  });

  it("ranks Reyna above Mai Sakurajima on shows when show score is higher", () => {
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

  it("prefers a slightly lower hit rate when scrape+load is much faster", () => {
    const speedMatrix: SourceScoreMatrix = {
      updatedAt: "test",
      animeOnly: [],
      scores: {
        slowreliable: {
          browser: { movie: { hit: 95, hitMs: 8000, score: 120 } },
        },
        fasthit: {
          browser: { movie: { hit: 85, hitMs: 900, score: 480 } },
        },
        vidrock: {
          browser: { movie: { hit: 90, hitMs: 3000, score: 220 } },
        },
      },
    };
    const order = orderSourceIdsForPlayback(
      ["slowreliable", "vidrock", "fasthit"],
      { env: "browser", mediaType: "movie", meta: westernMeta },
      speedMatrix,
    );
    expect(order[0]).toBe("fasthit");
    expect(order.indexOf("vidrock")).toBeLessThan(order.indexOf("slowreliable"));
  });

  it("gives one unbenchmarked source a slot in the initial parallel race", () => {
    const scoredIds = ["oneembed", "reyna", "fsonline", "vidrock"];
    const scoredOrder = orderSourceIdsForPlayback(
      scoredIds,
      { env: "browser", mediaType: "movie", meta: westernMeta },
      matrix,
    );
    const order = orderSourceIdsForPlayback(
      [...scoredIds, "nova"],
      { env: "browser", mediaType: "movie", meta: westernMeta },
      matrix,
    );

    expect(order).toEqual([
      ...scoredOrder.slice(0, 3),
      "nova",
      ...scoredOrder.slice(3),
    ]);
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

  it("still ranks TQQ first when anime meta only has Animation + JP country", () => {
    const ids = ["reyna", "oneembed", "tqq", "fsonline"];
    const order = orderSourceIdsForPlayback(
      ids,
      {
        env: "browser",
        mediaType: "movie",
        meta: {
          genreIds: [16, 878],
          originalLanguage: "ja",
          originCountry: ["JP"],
        },
      },
      matrix,
    );
    expect(order[0]).toBe("tqq");
  });
});

describe("prioritizeConfiguredSources", () => {
  it("puts debrid first when token is configured", () => {
    const ids = ["vidlink", "fsonline", "debrid", "cornclick"];
    expect(
      prioritizeConfiguredSources(ids, { hasDebridToken: true }),
    ).toEqual(["debrid", "vidlink", "fsonline", "cornclick"]);
  });

  it("removes debrid without token", () => {
    const ids = ["vidlink", "debrid", "fsonline"];
    expect(
      prioritizeConfiguredSources(ids, { hasDebridToken: false }),
    ).toEqual(["vidlink", "fsonline"]);
  });
});
