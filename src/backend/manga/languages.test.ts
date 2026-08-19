/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  mangaLanguageLabel,
  sortMangaLanguages,
} from "@/backend/manga/languages";

describe("manga language labels", () => {
  it("names common MangaDex codes in English", () => {
    expect(mangaLanguageLabel("en")).toBe("English");
    expect(mangaLanguageLabel("es-la")).toBe("Spanish (LatAm)");
    expect(mangaLanguageLabel("pt-br")).toBe("Portuguese (Brazil)");
  });

  it("puts English first", () => {
    expect(sortMangaLanguages(["es", "en", "ja", "en"])).toEqual([
      "en",
      "ja",
      "es",
    ]);
  });
});
