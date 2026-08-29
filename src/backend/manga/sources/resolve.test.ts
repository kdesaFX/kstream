/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { isSparseMangaDexList } from "@/backend/manga/sources/resolve";
import type { MangaChapter } from "@/backend/manga/types";

function ch(chapter: string): MangaChapter {
  return {
    id: `md-${chapter}`,
    volume: null,
    chapter,
    title: null,
    pages: 10,
    translatedLanguage: "en",
    source: "mangadex",
  };
}

describe("isSparseMangaDexList", () => {
  it("treats Komi-style licensed leftovers as sparse", () => {
    expect(
      isSparseMangaDexList([ch("288"), ch("500"), ch("500.5")], "500"),
    ).toBe(true);
  });

  it("does not flag a normal catalog", () => {
    const chapters = Array.from({ length: 120 }, (_, i) => ch(String(i + 1)));
    expect(isSparseMangaDexList(chapters, "120")).toBe(false);
  });
});
