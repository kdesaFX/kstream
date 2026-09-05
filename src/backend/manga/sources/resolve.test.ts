/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { mergeChapterLists } from "@/backend/manga/sources/merge";
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

function stub(chapter: string): MangaChapter {
  return { ...ch(chapter), pages: 0 };
}

function wc(chapter: string): MangaChapter {
  return {
    id: `wc-${chapter}`,
    volume: null,
    chapter,
    title: null,
    pages: 0,
    translatedLanguage: "en",
    source: "weebcentral",
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

describe("WC spine over full MangaDex list", () => {
  it("uses WeebCentral as primary when the mirror catalog is larger", () => {
    const mdChapters = [stub("1"), stub("2"), ch("3")];
    const wcChapters = Array.from({ length: 10 }, (_, i) =>
      wc(String(i + 1)),
    );
    // Mirror larger → drop hollow MD stubs; keep page-bearing MD as fallback.
    const mdForMerge = mdChapters.filter((c) => (c.pages ?? 0) > 0);
    const merged = mergeChapterLists([
      { source: "weebcentral", chapters: wcChapters },
      { source: "mangadex", chapters: mdForMerge },
    ]);
    expect(merged.chapters).toHaveLength(10);
    expect(merged.chapters.every((c) => c.source === "weebcentral")).toBe(true);
    expect(merged.fallbacks.get("wc-3")).toEqual(["md-3"]);
  });
});
