/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { plainMangaDescription } from "@/backend/manga/plainMangaDescription";

describe("plainMangaDescription", () => {
  it("drops trailing MangaDex credit blocks", () => {
    expect(
      plainMangaDescription(
        "Banished to an inescapable S-class dungeon...? __ **Character Designer:** [Tomo](https://mangadex.org/author/645c60f7-aaaa-bbbb-cccc)",
      ),
    ).toBe("Banished to an inescapable S-class dungeon...?");
  });

  it("strips markdown links and bold markers from the synopsis", () => {
    expect(
      plainMangaDescription(
        "A hunter named [Jinwoo](https://example.com) faces **death** every day.",
      ),
    ).toBe("A hunter named Jinwoo faces death every day.");
  });

  it("keeps only the part before a horizontal rule", () => {
    expect(
      plainMangaDescription(
        "The story begins here.\n\n---\n\n**Author(s) and Artist(s):** [Someone](https://x.test)",
      ),
    ).toBe("The story begins here.");
  });
});
