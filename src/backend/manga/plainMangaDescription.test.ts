/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  decodeDescriptionEntities,
  plainMangaDescription,
} from "@/backend/manga/plainMangaDescription";

describe("decodeDescriptionEntities", () => {
  it("decodes curly quotes and common named entities", () => {
    expect(
      decodeDescriptionEntities('screams &ldquo;AVERAGE,&rdquo; from his'),
    ).toBe('screams “AVERAGE,” from his');
  });
});

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

  it("decodes leftover HTML entities in the plot", () => {
    expect(
      plainMangaDescription(
        'everything about a young man named Saitama screams &ldquo;AVERAGE,&rdquo; from his lifeless expression',
      ),
    ).toBe(
      'everything about a young man named Saitama screams “AVERAGE,” from his lifeless expression',
    );
  });

  it("drops (Source: …) and Notes: tails from AniList-style blurbs", () => {
    expect(
      plainMangaDescription(
        "Denji's life of poverty is changed forever when he merges with his pet chainsaw dog, Pochita! (Source: MANGA Plus) Notes: - Nominated for the 2020 Manga Taisho Award. - Winner of the 2021 Kono Manga ga Sugoi",
      ),
    ).toBe(
      "Denji's life of poverty is changed forever when he merges with his pet chainsaw dog, Pochita!",
    );
  });

  it("drops Notes: even without a Source line", () => {
    expect(
      plainMangaDescription(
        "The story begins. Notes: Award winner 2021.",
      ),
    ).toBe("The story begins.");
  });
});
