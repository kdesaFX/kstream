/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  proxiedMangaCoverUrl,
  weebCentralCoverUrl,
  weebCentralPageUrl,
} from "@/backend/manga/covers";

describe("proxiedMangaCoverUrl", () => {
  it("upgrades saved MangaDex cover URLs to the same-origin proxy", () => {
    expect(
      proxiedMangaCoverUrl(
        "https://uploads.mangadex.org/covers/manga-id/cover.jpg.256.jpg",
      ),
    ).toBe(
      "/api/manga-cover?source=mangadex&id=manga-id&file=cover.jpg&size=256",
    );
  });

  it("upgrades saved WeebCentral cover URLs to the same-origin proxy", () => {
    expect(
      proxiedMangaCoverUrl(
        "https://temp.compsci88.com/cover/normal/01J76XYCPSY3C4BNPBRY8JMCBE.webp",
      ),
    ).toBe(weebCentralCoverUrl("01J76XYCPSY3C4BNPBRY8JMCBE"));
  });

  it("leaves unrelated and already-proxied URLs unchanged", () => {
    expect(proxiedMangaCoverUrl("/api/manga-cover?source=mangadex")).toBe(
      "/api/manga-cover?source=mangadex",
    );
    expect(proxiedMangaCoverUrl("https://images.example.com/cover.jpg")).toBe(
      "https://images.example.com/cover.jpg",
    );
  });

  it("routes WeebCentral pages through the cached same-origin endpoint", () => {
    expect(
      weebCentralPageUrl(
        "https://hot.planeptune.us/manga/Onepunch-Man/0001-001.png",
      ),
    ).toBe(
      "/api/manga-cover?source=weebcentral-page&url=https%3A%2F%2Fhot.planeptune.us%2Fmanga%2FOnepunch-Man%2F0001-001.png",
    );
  });
});
