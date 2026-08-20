/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { mergeChapterLists } from "@/backend/manga/sources/merge";
import type { MangaChapter } from "@/backend/manga/types";

function ch(
  id: string,
  chapter: string,
  source: MangaChapter["source"],
): MangaChapter {
  return {
    id,
    volume: null,
    chapter,
    title: null,
    pages: 0,
    translatedLanguage: "en",
    source,
  };
}

describe("mergeChapterLists", () => {
  it("prefers MangaDex over Comick for the same chapter number", () => {
    const merged = mergeChapterLists([
      { source: "mangadex", chapters: [ch("md-114", "114", "mangadex")] },
      {
        source: "comick",
        chapters: [ch("comick-a", "1", "comick"), ch("comick-b", "114", "comick")],
      },
    ]);
    expect(merged.chapters.map((c) => c.chapter)).toEqual(["1", "114"]);
    expect(merged.chapters.find((c) => c.chapter === "114")?.id).toBe("md-114");
    expect(merged.fallbacks.get("md-114")).toEqual(["comick-b"]);
  });

  it("fills early chapters from Comick when MangaDex starts late", () => {
    const merged = mergeChapterLists([
      { source: "mangadex", chapters: [ch("md-21", "21", "mangadex")] },
      {
        source: "comick",
        chapters: [ch("comick-1", "1", "comick"), ch("comick-21", "21", "comick")],
      },
    ]);
    expect(merged.chapters.map((c) => c.chapter)).toEqual(["1", "21"]);
    expect(merged.chapters[0]?.source).toBe("comick");
    expect(merged.chapters[1]?.source).toBe("mangadex");
  });
});

describe("comick ids", () => {
  it("round-trips prefixed chapter ids", async () => {
    const { comickChapterId, comickChapterHid, isComickChapterId } =
      await import("@/backend/manga/sources/comick");
    expect(comickChapterId("lNoKj")).toBe("comick-lNoKj");
    expect(isComickChapterId("comick-lNoKj")).toBe(true);
    expect(comickChapterHid("comick-lNoKj")).toBe("lNoKj");
  });
});
