/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  anilistGenreForKind,
  anilistHitToListItem,
  anilistSortForKind,
} from "@/backend/manga/anilistDiscover";

describe("anilistDiscover helpers", () => {
  it("maps carousel kinds to AniList sorts", () => {
    expect(anilistSortForKind("popular")).toBe("POPULARITY_DESC");
    expect(anilistSortForKind("topRated")).toBe("SCORE_DESC");
    expect(anilistSortForKind("latest")).toBe("UPDATED_AT_DESC");
    expect(anilistSortForKind("recentlyAdded")).toBe("START_DATE_DESC");
    expect(anilistSortForKind("action")).toBe("POPULARITY_DESC");
  });

  it("maps genre kinds to AniList genre labels", () => {
    expect(anilistGenreForKind("popular")).toBeUndefined();
    expect(anilistGenreForKind("action")).toBe("Action");
    expect(anilistGenreForKind("sliceOfLife")).toBe("Slice of Life");
  });

  it("keeps AniList cover when converting to a list item", () => {
    const item = anilistHitToListItem(
      {
        anilistId: 1,
        title: "Berserk",
        alternateTitles: ["ベルセルク"],
        cover: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/x1.jpg",
        rating: 9.2,
        year: 1989,
        status: "hiatus",
        adult: false,
        genres: ["Action", "Fantasy"],
      },
      "11111111-1111-1111-1111-111111111111",
    );

    expect(item.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(item.poster).toContain("anilist.co");
    expect(item.rating).toBe(9.2);
    expect(item.tags.map((t) => t.name)).toEqual(["Action", "Fantasy"]);
  });
});
