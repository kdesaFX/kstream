/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { decodeMangaId, mangaIdToUrlId } from "@/backend/manga/ids";

describe("manga ids", () => {
  it("round-trips a MangaDex UUID through the URL form", () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const encoded = mangaIdToUrlId(id, "One Piece!");
    expect(encoded.startsWith("mangadex-")).toBe(true);
    expect(decodeMangaId(encoded)).toEqual({
      id,
      slug: "one-piece",
    });
  });

  it("rejects non-manga prefixes", () => {
    expect(decodeMangaId("tmdb-movie-123-foo")).toBeNull();
  });
});
