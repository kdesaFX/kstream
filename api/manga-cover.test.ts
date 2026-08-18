/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { mangaCoverDestination } from "./manga-cover";

describe("mangaCoverDestination", () => {
  it("builds a fixed MangaDex CDN URL", () => {
    const destination = mangaCoverDestination(
      "https://example.com/api/manga-cover?source=mangadex&id=abc-123&file=cover.jpg&size=256",
    );

    expect(destination.href).toBe(
      "https://uploads.mangadex.org/covers/abc-123/cover.jpg.256.jpg",
    );
  });

  it("builds a fixed WeebCentral CDN URL", () => {
    const destination = mangaCoverDestination(
      "https://example.com/api/manga-cover?source=weebcentral&id=01J76XYCPSY3C4BNPBRY8JMCBE",
    );

    expect(destination.href).toBe(
      "https://temp.compsci88.com/cover/normal/01J76XYCPSY3C4BNPBRY8JMCBE.webp",
    );
  });

  it("rejects arbitrary sources and unsafe inputs", () => {
    expect(() =>
      mangaCoverDestination(
        "https://example.com/api/manga-cover?source=https://blocked.example&id=abc",
      ),
    ).toThrow("Invalid manga source");
    expect(() =>
      mangaCoverDestination(
        "https://example.com/api/manga-cover?source=mangadex&id=abc&file=../secret&size=256",
      ),
    ).toThrow("Invalid cover filename");
  });
});
