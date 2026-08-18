/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { pickGenreTagIds } from "@/backend/manga/mangaTags";
import { mangaProgressHasMeaningfulRead } from "@/stores/mangaProgress/utils";

describe("mangaProgressHasMeaningfulRead", () => {
  const base = {
    title: "Test",
    chapterId: "c1",
    chapterLabel: "Ch. 1",
    updatedAt: Date.now(),
  };

  it("requires several pages on short chapters", () => {
    expect(
      mangaProgressHasMeaningfulRead({
        ...base,
        page: 2,
        totalPages: 20,
      }),
    ).toBe(false);
    expect(
      mangaProgressHasMeaningfulRead({
        ...base,
        page: 5,
        totalPages: 20,
      }),
    ).toBe(true);
  });

  it("counts near-finished chapters", () => {
    expect(
      mangaProgressHasMeaningfulRead({
        ...base,
        page: 19,
        totalPages: 20,
      }),
    ).toBe(true);
  });
});

describe("pickGenreTagIds", () => {
  it("prefers named genre tags", () => {
    const ids = pickGenreTagIds([
      { id: "fmt", name: "Official Colored" },
      { id: "act", name: "Action" },
      { id: "rom", name: "Romance" },
    ]);
    expect(ids).toEqual(["act", "rom"]);
  });
});
