/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import type { MangaChapter } from "@/backend/manga/types";

function chapterNumber(ch: MangaChapter | undefined): number | null {
  if (!ch?.chapter) return null;
  const n = parseFloat(ch.chapter);
  return Number.isFinite(n) ? n : null;
}

/** Mirror of catalog.ts merge rule for unit tests. */
function shouldPreferWeebCentral(
  mdChapters: MangaChapter[],
  wcChapters: MangaChapter[],
): boolean {
  if (wcChapters.length === 0) return false;
  if (mdChapters.length === 0) return true;
  const mdFirst = chapterNumber(mdChapters[0]);
  const wcFirst = chapterNumber(wcChapters[0]);
  if (mdFirst != null && wcFirst != null && (wcFirst < mdFirst || mdFirst > 1)) {
    return true;
  }
  return wcChapters.length > mdChapters.length * 2;
}

describe("WeebCentral chapter merge heuristic", () => {
  it("prefers WC when MangaDex starts at chapter 21", () => {
    const md = [{ id: "a", chapter: "21" }] as MangaChapter[];
    const wc = [{ id: "b", chapter: "1" }] as MangaChapter[];
    expect(shouldPreferWeebCentral(md, wc)).toBe(true);
  });

  it("keeps MangaDex when both start at chapter 1", () => {
    const md = [{ id: "a", chapter: "1" }] as MangaChapter[];
    const wc = [{ id: "b", chapter: "1" }] as MangaChapter[];
    expect(shouldPreferWeebCentral(md, wc)).toBe(false);
  });
});

describe("proxiedChapterPageUrls", () => {
  it("wraps URLs through the local proxy in browser", async () => {
    const { proxiedChapterPageUrls } = await import("@/backend/manga/mangadex");
    const url = "https://cmdxd98sb0x3yprd.mangadex.network/data/x/y.png";
    const proxied = proxiedChapterPageUrls([url]);
    expect(proxied[0]).toContain("/api/proxy");
    expect(proxied[0]).toContain(encodeURIComponent(url));
  });
});
