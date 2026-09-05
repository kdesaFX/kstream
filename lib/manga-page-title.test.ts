/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  pagesBelongToTitle,
  pagesMatchChapter,
  pagesValidForManga,
} from "./manga-page-title";

describe("manga-page-title", () => {
  it("rejects Horimiya pages when reading Jujutsu Kaisen", () => {
    expect(
      pagesBelongToTitle(
        ["https://hot.planeptune.us/manga/Horimiya/0017-001.png"],
        "Jujutsu Kaisen",
      ),
    ).toBe(false);
  });

  it("rejects proxied Horimiya URLs that hide /manga/ in destination=", () => {
    const raw = "https://official.lowee.us/manga/Horimiya/0017-001.png";
    const proxied = `/api/proxy?destination=${encodeURIComponent(raw)}`;
    expect(pagesBelongToTitle([proxied], "Jujutsu Kaisen")).toBe(false);
    expect(pagesBelongToTitle([raw], "Jujutsu Kaisen")).toBe(false);
  });

  it("accepts matching series folder", () => {
    expect(
      pagesBelongToTitle(
        ["https://hot.planeptune.us/manga/Jujutsu-Kaisen/0002-001.png"],
        "Jujutsu Kaisen",
      ),
    ).toBe(true);
  });

  it("rejects mixed series lists even when the first page matches", () => {
    expect(
      pagesBelongToTitle(
        [
          "https://hot.planeptune.us/manga/Jujutsu-Kaisen/0030-001.png",
          "https://hot.planeptune.us/manga/D.Gray-man/0029-001.png",
        ],
        "Jujutsu Kaisen",
      ),
    ).toBe(false);
  });

  it("rejects wrong chapter prefixes for the requested chapter", () => {
    expect(
      pagesMatchChapter(
        [
          "https://hot.planeptune.us/manga/Jujutsu-Kaisen/0030-001.png",
          "https://hot.planeptune.us/manga/Jujutsu-Kaisen/0030-002.png",
        ],
        "13",
      ),
    ).toBe(false);
    expect(
      pagesMatchChapter(
        [
          "https://hot.planeptune.us/manga/Jujutsu-Kaisen/0013-001.png",
          "https://hot.planeptune.us/manga/Jujutsu-Kaisen/0013-002.png",
        ],
        "13",
      ),
    ).toBe(true);
  });

  it("pagesValidForManga requires both series and chapter", () => {
    expect(
      pagesValidForManga(
        [
          "https://hot.planeptune.us/manga/Jujutsu-Kaisen/0030-001.png",
          "https://hot.planeptune.us/manga/D.Gray-man/0029-001.png",
        ],
        "Jujutsu Kaisen",
        [],
        "13",
      ),
    ).toBe(false);
    expect(
      pagesValidForManga(
        ["https://hot.planeptune.us/manga/Jujutsu-Kaisen/0013-001.png"],
        "Jujutsu Kaisen",
        [],
        "13",
      ),
    ).toBe(true);
  });

  it("accepts MangaDex hash URLs without a series folder", () => {
    expect(
      pagesBelongToTitle(
        ["https://uploads.mangadex.org/data/abc123/1-a.jpg"],
        "Jujutsu Kaisen",
      ),
    ).toBe(true);
    expect(
      pagesMatchChapter(
        ["https://uploads.mangadex.org/data/abc123/1-a.jpg"],
        "13",
      ),
    ).toBe(true);
  });
});
