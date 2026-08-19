/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  anilistPageUrl,
  malPageUrl,
} from "@/backend/metadata/anilistExternal";

describe("anilist external urls", () => {
  it("builds anime and manga pages", () => {
    expect(anilistPageUrl("ANIME", 21)).toBe("https://anilist.co/anime/21");
    expect(anilistPageUrl("MANGA", 30002)).toBe(
      "https://anilist.co/manga/30002",
    );
    expect(malPageUrl("ANIME", 21)).toBe("https://myanimelist.net/anime/21");
    expect(malPageUrl("MANGA", 2)).toBe("https://myanimelist.net/manga/2");
  });
});
