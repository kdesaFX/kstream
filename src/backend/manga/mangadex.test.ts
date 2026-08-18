/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  chapterBadge,
  coverUrl,
  pickMangaTitle,
  proxiedMangaUrl,
  requestNeverLanded,
  selectChapterLanguage,
} from "@/backend/manga/mangadex";

describe("pickMangaTitle", () => {
  it("prefers the English alt title over the romanised primary", () => {
    expect(
      pickMangaTitle({
        title: { "ja-ro": "Sono Bisque Doll wa Koi o Suru" },
        altTitles: [
          { "ja-ro": "Sono Bisque Doll ha Koi wo Suru" },
          { en: "My Dress-Up Darling" },
        ],
      }),
    ).toBe("My Dress-Up Darling");
  });

  it("works for non-Japanese originals too", () => {
    expect(
      pickMangaTitle({
        title: { "ko-ro": "Na Honjaman Level-Up" },
        altTitles: [{ en: "Solo Leveling" }, { "ja-ro": "Ore Dake Level Up" }],
      }),
    ).toBe("Solo Leveling");
  });

  it("uses the primary title's own English entry when there is one", () => {
    expect(
      pickMangaTitle({
        title: { en: "Berserk" },
        altTitles: [{ ja: "ベルセルク" }],
      }),
    ).toBe("Berserk");
  });

  it("falls back to the romaji when no English name exists", () => {
    expect(
      pickMangaTitle({
        title: { "ja-ro": "Kaoru Hana wa Rin to Saku" },
        altTitles: [{ ja: "薫る花は凛と咲く" }],
      }),
    ).toBe("Kaoru Hana wa Rin to Saku");
  });
});

describe("chapterBadge", () => {
  it("keeps the chapter number and drops the chapter title", () => {
    expect(chapterBadge("Ch. 12 — A Long Winded Title")).toBe("Ch. 12");
    expect(chapterBadge("Chapter 7")).toBe("Ch. 7");
    expect(chapterBadge("Ch. 104.5 — Extra")).toBe("Ch. 104.5");
  });

  it("shortens titled chapters that carry no number", () => {
    expect(chapterBadge("Oneshot")).toBe("Oneshot");
    expect(chapterBadge("A Very Long Oneshot Name")).toBe("A Very Long…");
  });
});

describe("coverUrl", () => {
  it("routes covers through the same-origin cached cover endpoint", () => {
    expect(coverUrl("manga-id", "cover.jpg")).toBe(
      "/api/manga-cover?source=mangadex&id=manga-id&file=cover.jpg&size=256",
    );
    expect(coverUrl("manga-id")).toBeUndefined();
  });
});

describe("selectChapterLanguage", () => {
  it("uses the preferred language when the title has it", () => {
    expect(selectChapterLanguage(["ru", "en", "tr"], "tr")).toBe("tr");
  });

  it("falls back to English and then the first available translation", () => {
    expect(selectChapterLanguage(["ru", "en", "tr"], "fr")).toBe("en");
    expect(selectChapterLanguage(["ru", "tr"], "fr")).toBe("ru");
  });
});

describe("proxiedMangaUrl", () => {
  it("wraps the whole url so MangaDex's own query survives", () => {
    const url =
      "https://api.mangadex.org/manga?limit=24&order%5Brating%5D=desc&includes%5B%5D=cover_art";
    const proxied = proxiedMangaUrl(url, ["https://kdesa.stream/api/proxy"]);
    expect(proxied).toBe(
      `https://kdesa.stream/api/proxy?destination=${encodeURIComponent(url)}`,
    );
    // The inner params must not leak out as params of the proxy itself.
    expect(proxied!.split("?").length).toBe(2);
  });

  it("keeps the route intact: a trailing slash lands on the SPA, not the function", () => {
    expect(
      proxiedMangaUrl("https://api.mangadex.org/manga", [
        "https://kdesa.stream/api/proxy",
      ]),
    ).not.toContain("/api/proxy/?");
  });

  it("appends to a proxy that already carries a query", () => {
    const proxied = proxiedMangaUrl("https://api.mangadex.org/manga", [
      "https://worker.dev/?key=abc",
    ]);
    expect(proxied).toBe(
      `https://worker.dev/?key=abc&destination=${encodeURIComponent("https://api.mangadex.org/manga")}`,
    );
  });

  it("gives up when no proxy is configured", () => {
    expect(proxiedMangaUrl("https://api.mangadex.org/manga", [])).toBe(
      undefined,
    );
  });
});

describe("requestNeverLanded", () => {
  it("treats a missing response as a blocked or failed request", () => {
    expect(requestNeverLanded(new Error("Failed to fetch"))).toBe(true);
  });

  it("leaves real http errors alone so they keep surfacing", () => {
    const httpError = Object.assign(new Error("429"), {
      response: { status: 429 },
    });
    expect(requestNeverLanded(httpError)).toBe(false);
  });

  it("ignores non-errors", () => {
    expect(requestNeverLanded(null)).toBe(false);
    expect(requestNeverLanded("nope")).toBe(false);
  });
});
