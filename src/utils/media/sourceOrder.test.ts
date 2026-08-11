/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  getMediaBucket,
  orderSourceIdsForPlayback,
} from "@/utils/media/sourceOrder";
import type { SourceScoreMatrix } from "@/utils/media/sourcePerformance.generated";

const matrix: SourceScoreMatrix = {
  updatedAt: "test",
  animeOnly: ["tqq"],
  scores: {
    tqq: { browser: { anime: 100 }, extension: { anime: 100 } },
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
});
