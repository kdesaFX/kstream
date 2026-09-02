/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  LogoAlphaSource,
  hasBakedBackground,
  isAlwaysOpaqueFormat,
  pickFastLogoUrl,
  probeUrlFor,
  rankLogos,
} from "@/utils/media/logoBackground";

function alphaGrid(
  width: number,
  height: number,
  alpha: (x: number, y: number) => number,
): LogoAlphaSource {
  return { width, height, alphaAt: alpha };
}

describe("hasBakedBackground", () => {
  it("flags a logo flattened onto a solid rectangle", () => {
    expect(hasBakedBackground(alphaGrid(271, 224, () => 255))).toBe(true);
  });

  it("passes a logo cropped tight to transparent edges", () => {
    // Artwork in the middle, fully transparent border.
    const inner = (x: number, y: number) =>
      x > 20 && x < 250 && y > 20 && y < 200 ? 255 : 0;
    expect(hasBakedBackground(alphaGrid(271, 224, inner))).toBe(false);
  });

  it("tolerates artwork bleeding into one edge", () => {
    // A wordmark touching the left edge only - still not a baked background.
    const bleed = (x: number, _y: number) => (x === 0 ? 255 : 0);
    expect(hasBakedBackground(alphaGrid(271, 224, bleed))).toBe(false);
  });

  it("ignores images too small to sample", () => {
    expect(hasBakedBackground(alphaGrid(1, 1, () => 255))).toBe(false);
  });
});

describe("isAlwaysOpaqueFormat", () => {
  it("treats jpeg as opaque and alpha formats as not", () => {
    expect(isAlwaysOpaqueFormat("/abc.jpg")).toBe(true);
    expect(isAlwaysOpaqueFormat("/abc.jpeg")).toBe(true);
    expect(isAlwaysOpaqueFormat("/abc.png")).toBe(false);
    expect(isAlwaysOpaqueFormat("/abc.svg")).toBe(false);
  });
});

describe("probeUrlFor", () => {
  it("downgrades the original rendition to a cheap one", () => {
    expect(probeUrlFor("https://image.tmdb.org/t/p/original/abc.png")).toBe(
      "https://image.tmdb.org/t/p/w300/abc.png",
    );
  });

  it("downgrades w500 logos used for display", () => {
    expect(probeUrlFor("https://image.tmdb.org/t/p/w500/abc.png")).toBe(
      "https://image.tmdb.org/t/p/w300/abc.png",
    );
  });

  it("leaves unfamiliar urls alone", () => {
    expect(probeUrlFor("https://example.com/logo.png")).toBe(
      "https://example.com/logo.png",
    );
  });
});

describe("pickFastLogoUrl", () => {
  it("skips jpeg and returns the first transparent candidate", () => {
    expect(
      pickFastLogoUrl(
        [
          { file_path: "/baked.jpg", iso_639_1: "en" },
          { file_path: "/clear.png", iso_639_1: "en" },
        ],
        "en",
        "w500",
      ),
    ).toBe("https://image.tmdb.org/t/p/w500/clear.png");
  });
});

describe("rankLogos", () => {
  it("prefers the user's language, then english, then unlabelled", () => {
    const ranked = rankLogos(
      [
        { file_path: "/any.png", iso_639_1: "ja" },
        { file_path: "/none.png", iso_639_1: null },
        { file_path: "/en.png", iso_639_1: "en" },
        { file_path: "/fr.png", iso_639_1: "fr" },
      ],
      "fr",
    );
    expect(ranked.map((l) => l.file_path)).toEqual([
      "/fr.png",
      "/en.png",
      "/none.png",
      "/any.png",
    ]);
  });

  it("prefers transparency-capable formats within a language", () => {
    const ranked = rankLogos(
      [
        { file_path: "/flat.jpg", iso_639_1: "en", vote_average: 10 },
        { file_path: "/raster.png", iso_639_1: "en", vote_average: 1 },
        { file_path: "/vector.svg", iso_639_1: "en", vote_average: 0 },
      ],
      "en",
    );
    expect(ranked.map((l) => l.file_path)).toEqual([
      "/vector.svg",
      "/raster.png",
      "/flat.jpg",
    ]);
  });

  it("breaks format ties with TMDB votes and drops pathless entries", () => {
    const ranked = rankLogos(
      [
        { file_path: null, iso_639_1: "en" },
        { file_path: "/low.png", iso_639_1: "en", vote_average: 2 },
        { file_path: "/high.png", iso_639_1: "en", vote_average: 8 },
      ],
      "en",
    );
    expect(ranked.map((l) => l.file_path)).toEqual(["/high.png", "/low.png"]);
  });
});
