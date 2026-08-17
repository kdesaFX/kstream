/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  chapterBadge,
  proxiedMangaUrl,
  requestNeverLanded,
} from "@/backend/manga/mangadex";

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

describe("proxiedMangaUrl", () => {
  it("wraps the whole url so MangaDex's own query survives", () => {
    const url =
      "https://api.mangadex.org/manga?limit=24&order%5Brating%5D=desc&includes%5B%5D=cover_art";
    const proxied = proxiedMangaUrl(url, ["https://kdesa.stream/api/proxy"]);
    expect(proxied).toBe(
      `https://kdesa.stream/api/proxy/?destination=${encodeURIComponent(url)}`,
    );
    // The inner params must not leak out as params of the proxy itself.
    expect(proxied!.split("?").length).toBe(2);
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
