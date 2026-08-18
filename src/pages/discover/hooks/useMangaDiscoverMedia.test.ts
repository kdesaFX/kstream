/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { MANGA_DISCOVER_GENRES } from "@/backend/manga/mangaTags";
import { mangaDiscoverQuery } from "@/pages/discover/hooks/useMangaDiscoverMedia";

describe("mangaDiscoverQuery", () => {
  it("keeps broad carousel ordering on the All category", () => {
    expect(mangaDiscoverQuery("popular")).toEqual({
      order: "followedCount",
      includedTags: undefined,
    });
    expect(mangaDiscoverQuery("latest")).toEqual({
      order: "latestUploadedChapter",
      includedTags: undefined,
    });
  });

  it("applies the selected manga genre to every broad carousel", () => {
    const action = MANGA_DISCOVER_GENRES.find(
      (genre) => genre.name === "Action",
    );

    expect(mangaDiscoverQuery("topRated", action?.id)).toEqual({
      order: "rating",
      includedTags: [action?.id],
    });
    expect(mangaDiscoverQuery("recentlyAdded", action?.id)).toEqual({
      order: "createdAt",
      includedTags: [action?.id],
    });
  });

  it("offers unique MangaDex genre categories", () => {
    expect(MANGA_DISCOVER_GENRES.length).toBeGreaterThan(5);
    expect(new Set(MANGA_DISCOVER_GENRES.map((genre) => genre.id)).size).toBe(
      MANGA_DISCOVER_GENRES.length,
    );
  });
});
