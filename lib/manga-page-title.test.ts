/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { pagesBelongToTitle } from "./manga-page-title";

describe("manga-page-title", () => {
  it("rejects Horimiya pages when reading Jujutsu Kaisen", () => {
    expect(
      pagesBelongToTitle(
        ["https://hot.planeptune.us/manga/Horimiya/0017-001.png"],
        "Jujutsu Kaisen",
      ),
    ).toBe(false);
  });

  it("accepts matching series folder", () => {
    expect(
      pagesBelongToTitle(
        ["https://hot.planeptune.us/manga/Jujutsu-Kaisen/0002-001.png"],
        "Jujutsu Kaisen",
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
  });
});
