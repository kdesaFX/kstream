/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import type { MangaArt } from "@/backend/manga/anilistArt";
import type { MangaListItem } from "@/backend/manga/types";
import { pickFeaturedManga, shuffle } from "@/pages/discover/lib/featuredManga";

function manga(
  overrides: Partial<MangaListItem> & { id: string },
): MangaListItem {
  return {
    title: overrides.id,
    description: "A description",
    poster: `https://covers/${overrides.id}.jpg`,
    status: "ongoing",
    contentRating: "safe",
    tags: [],
    adult: false,
    readingDirection: "rtl",
    ...overrides,
  } as MangaListItem;
}

const banner: MangaArt = { anilistId: 1, banner: "https://art/banner.jpg" };
const noBanner: MangaArt = { anilistId: 2 };

describe("pickFeaturedManga", () => {
  it("uses only wide banners when enough are available", () => {
    const items = [
      manga({ id: "cover-a" }),
      manga({ id: "cover-b" }),
      manga({ id: "banner-a" }),
      manga({ id: "banner-b" }),
    ];
    const art = new Map([
      ["cover-a", noBanner],
      ["cover-b", noBanner],
      ["banner-a", banner],
      ["banner-b", { ...banner, banner: "https://art/banner-b.jpg" }],
    ]);

    const picked = pickFeaturedManga(items, art, 2);

    expect(picked.every((p) => p.wideArt)).toBe(true);
    expect(picked.map((p) => p.id)).toEqual(["banner-a", "banner-b"]);
  });

  it("puts titles with a wide banner ahead of cover-only ones", () => {
    const items = [manga({ id: "cover-only" }), manga({ id: "with-banner" })];
    const art = new Map([
      ["cover-only", noBanner],
      ["with-banner", banner],
    ]);

    const picked = pickFeaturedManga(items, art, 5);

    expect(picked.map((p) => p.id)).toEqual(["with-banner", "cover-only"]);
    expect(picked[0].artUrl).toBe("https://art/banner.jpg");
    expect(picked[0].wideArt).toBe(true);
    expect(picked[1].artUrl).toBe("https://covers/cover-only.jpg");
    expect(picked[1].wideArt).toBe(false);
  });

  it("drops titles with no description or art at all", () => {
    const items = [
      manga({ id: "no-description", description: undefined }),
      manga({ id: "blank-description", description: "   " }),
      manga({ id: "no-art", poster: undefined }),
      manga({ id: "keeper" }),
    ];

    const picked = pickFeaturedManga(items, new Map(), 5);

    expect(picked.map((p) => p.id)).toEqual(["keeper"]);
  });

  it("never returns more slides than asked for", () => {
    const items = ["a", "b", "c", "d"].map((id) => manga({ id }));

    expect(pickFeaturedManga(items, new Map(), 2)).toHaveLength(2);
  });

  it("carries rating, year and status through for the hero meta line", () => {
    const items = [
      manga({
        id: "one",
        rating: 8.42,
        year: 2019,
        status: "completed",
        lastChapter: "97",
      }),
    ];

    const [picked] = pickFeaturedManga(items, new Map(), 1);

    expect(picked).toMatchObject({
      rating: 8.42,
      year: 2019,
      status: "completed",
      lastChapter: "97",
    });
  });
});

describe("shuffle", () => {
  it("keeps every item, leaving the input untouched", () => {
    const items = [1, 2, 3, 4, 5];
    const random = () => 0.42;

    const result = shuffle(items, random);

    expect([...result].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5]);
  });
});
