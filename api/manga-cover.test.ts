/* eslint-disable import/no-extraneous-dependencies */
import { afterEach, describe, expect, it, vi } from "vitest";

import handler, { mangaCoverDestination } from "./manga-cover";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("sends MangaDex the browser headers it requires", async () => {
    const upstreamFetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        return new Response("image", {
          headers: { "Content-Type": "image/jpeg" },
        });
      },
    );
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await handler(
      new Request(
        "https://example.com/api/manga-cover?source=mangadex&id=abc-123&file=cover.jpg&size=256",
      ),
    );

    expect(response.status).toBe(200);
    const init = upstreamFetch.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Referer")).toBe("https://mangadex.org/");
    expect(headers.get("User-Agent")).toContain("Mozilla/5.0");
  });
});
